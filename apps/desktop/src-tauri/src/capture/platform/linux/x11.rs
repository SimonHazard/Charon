use super::atspi;
use crate::capture::{
    gesture::{DoubleShiftGesture, GestureEvent, ShiftKey},
    platform::{
        bounded::{MAX_SELECTION_BYTES, SELECTION_TIMEOUT},
        DoubleShiftCallback,
    },
    CaptureError,
};
use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, AtomicU32, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use x11rb::{
    connection::Connection,
    protocol::{
        xinput::{ConnectionExt as _, EventMask as XiMask, KeyEventFlags, XIEventMask},
        xproto::*,
        Event,
    },
    rust_connection::RustConnection,
    COPY_DEPTH_FROM_PARENT, CURRENT_TIME, NONE,
};

pub fn local_display() -> bool {
    std::env::var("DISPLAY").is_ok_and(|value| value.starts_with(':') || value.starts_with("unix:"))
}
fn connect() -> Option<(RustConnection, usize)> {
    if !local_display() {
        return None;
    }
    x11rb::connect(None).ok()
}
fn atom(conn: &RustConnection, name: &[u8]) -> Option<Atom> {
    Some(conn.intern_atom(false, name).ok()?.reply().ok()?.atom)
}
fn focus(conn: &RustConnection) -> Option<Window> {
    let window = conn.get_input_focus().ok()?.reply().ok()?.focus;
    (window > 1).then_some(window)
}

pub fn listen(
    gesture: Arc<Mutex<DoubleShiftGesture>>,
    source: Arc<AtomicU32>,
    callback: DoubleShiftCallback,
) -> Result<Arc<AtomicBool>, CaptureError> {
    let live = Arc::new(AtomicBool::new(true));
    let running = live.clone();
    let (tx, rx) = mpsc::sync_channel(1);
    thread::Builder::new()
        .name("charon-x11-shift".into())
        .spawn(move || {
            let result = (|| -> Option<()> {
                let (conn, screen) = connect()?;
                conn.xinput_xi_query_version(2, 0).ok()?.reply().ok()?;
                conn.xinput_xi_select_events(
                    conn.setup().roots[screen].root,
                    &[XiMask {
                        deviceid: 1,
                        mask: vec![XIEventMask::RAW_KEY_PRESS | XIEventMask::RAW_KEY_RELEASE],
                    }],
                )
                .ok()?
                .check()
                .ok()?;
                let devices = conn.xinput_xi_query_device(0u16).ok()?.reply().ok()?;
                let synthetic: HashSet<u16> = devices
                    .infos
                    .iter()
                    .filter(|device| {
                        String::from_utf8_lossy(&device.name)
                            .to_ascii_uppercase()
                            .contains("XTEST")
                    })
                    .map(|device| device.deviceid)
                    .collect();
                let setup = conn.setup();
                let first = setup.min_keycode;
                let count = setup.max_keycode - first + 1;
                let mut mapping = conn.get_keyboard_mapping(first, count).ok()?.reply().ok()?;
                let mut held = conn.query_keymap().ok()?.reply().ok()?.keys;
                let mut previous_focus = focus(&conn);
                tx.send(true).ok()?;
                while running.load(Ordering::Acquire) {
                    let Some(event) = conn.poll_for_event().ok()? else {
                        thread::sleep(Duration::from_millis(8));
                        continue;
                    };
                    let (event, down) = match event {
                        Event::XinputRawKeyPress(event) => (event, true),
                        Event::XinputRawKeyRelease(event) => (event, false),
                        Event::MappingNotify(_) | Event::XinputHierarchy(_) => {
                            mapping = conn.get_keyboard_mapping(first, count).ok()?.reply().ok()?;
                            held = conn.query_keymap().ok()?.reply().ok()?.keys;
                            gesture.lock().ok()?.reset();
                            continue;
                        }
                        _ => continue,
                    };
                    let current_focus = focus(&conn);
                    let mut machine = gesture.lock().ok()?;
                    if current_focus != previous_focus || synthetic.contains(&event.sourceid) {
                        machine.reset();
                        previous_focus = current_focus;
                        if synthetic.contains(&event.sourceid) {
                            continue;
                        }
                    }
                    let code = u8::try_from(event.detail).ok()?;
                    let index = usize::from(code / 8);
                    let bit = 1 << (code % 8);
                    let repeat =
                        held[index] & bit != 0 || event.flags.contains(KeyEventFlags::KEY_REPEAT);
                    if down {
                        held[index] |= bit;
                    } else {
                        held[index] &= !bit;
                    }
                    let symbol = |key: u8| -> u32 {
                        if key < first {
                            return 0;
                        }
                        mapping
                            .keysyms
                            .get(
                                usize::from(key - first) * usize::from(mapping.keysyms_per_keycode),
                            )
                            .copied()
                            .unwrap_or(0)
                    };
                    let modifiers = (first..=setup.max_keycode).any(|key| {
                        held[usize::from(key / 8)] & (1 << (key % 8)) != 0
                            && matches!(symbol(key), 0xffe3..=0xffee | 0xfe03)
                    });
                    let shift = match symbol(code) {
                        0xffe1 => Some(ShiftKey::Left),
                        0xffe2 => Some(ShiftKey::Right),
                        _ => None,
                    };
                    let normalized = match (shift, down) {
                        (Some(key), true) => GestureEvent::ShiftDown {
                            key,
                            is_repeat: repeat,
                            command_held: modifiers,
                        },
                        (Some(key), false) => GestureEvent::ShiftUp {
                            key,
                            command_held: modifiers,
                        },
                        _ => GestureEvent::OtherKey,
                    };
                    let intent = machine.handle(normalized, u64::from(event.time));
                    drop(machine);
                    if let (Some(intent), Some(window)) = (intent, current_focus) {
                        source.store(window, Ordering::Release);
                        callback(intent);
                    }
                }
                Some(())
            })();
            let _ = result;
            running.store(false, Ordering::Release);
            let _ = tx.try_send(false);
        })
        .map_err(|_| CaptureError::ListenerUnavailable)?;
    if rx.recv_timeout(Duration::from_secs(2)) == Ok(true) {
        Ok(live)
    } else {
        live.store(false, Ordering::Release);
        Err(CaptureError::ListenerUnavailable)
    }
}

fn window_pid(conn: &RustConnection, mut window: Window) -> Option<u32> {
    let pid_atom = atom(conn, b"_NET_WM_PID")?;
    for _ in 0..32 {
        let reply = conn
            .get_property(false, window, pid_atom, AtomEnum::CARDINAL, 0, 1)
            .ok()?
            .reply()
            .ok()?;
        if let Some(pid) = reply.value32().and_then(|mut values| values.next()) {
            return Some(pid);
        }
        let tree = conn.query_tree(window).ok()?.reply().ok()?;
        if tree.parent == NONE || tree.parent == window {
            break;
        }
        window = tree.parent;
    }
    None
}

pub fn selection(source: Window, accessible: Option<atspi::Focused>) -> Option<String> {
    let started = Instant::now();
    let (conn, screen) = connect()?;
    if focus(&conn) != Some(source) {
        return None;
    }
    let source_pid = window_pid(&conn, source)?;
    if let Some(accessible) = accessible {
        match accessible.read(source_pid) {
            atspi::Selection::Protected => return None,
            atspi::Selection::Text(text) => {
                return (focus(&conn) == Some(source) && started.elapsed() < SELECTION_TIMEOUT)
                    .then_some(text)
            }
            atspi::Selection::Unavailable => {}
        }
    }
    if started.elapsed() >= SELECTION_TIMEOUT {
        return None;
    }
    let primary = AtomEnum::PRIMARY.into();
    let owner = conn.get_selection_owner(primary).ok()?.reply().ok()?.owner;
    // PRIMARY can outlive source focus. Never copy another application's stale selection.
    if owner == NONE || window_pid(&conn, owner) != Some(source_pid) {
        return None;
    }
    let target = atom(&conn, b"UTF8_STRING")?;
    let property = atom(&conn, b"CHARON_SELECTION")?;
    let window = conn.generate_id().ok()?;
    conn.create_window(
        COPY_DEPTH_FROM_PARENT,
        window,
        conn.setup().roots[screen].root,
        0,
        0,
        1,
        1,
        0,
        WindowClass::INPUT_OUTPUT,
        0,
        &CreateWindowAux::new(),
    )
    .ok()?
    .check()
    .ok()?;
    // The requestor is never mapped. Dropping the connection destroys it on every exit.
    conn.convert_selection(window, primary, target, property, CURRENT_TIME)
        .ok()?;
    conn.flush().ok()?;
    while started.elapsed() < SELECTION_TIMEOUT {
        if let Some(Event::SelectionNotify(event)) = conn.poll_for_event().ok()? {
            if event.requestor != window || event.selection != primary || event.target != target {
                continue;
            }
            if event.property != property {
                return None;
            }
            let reply = conn
                .get_property(
                    true,
                    window,
                    property,
                    target,
                    0,
                    (MAX_SELECTION_BYTES / 4) as u32,
                )
                .ok()?
                .reply()
                .ok()?;
            // Reject INCR, truncated transfers, and unexpected formats instead of reading unbounded data.
            if reply.type_ != target || reply.format != 8 || reply.bytes_after != 0 {
                return None;
            }
            if focus(&conn) != Some(source)
                || conn.get_selection_owner(primary).ok()?.reply().ok()?.owner != owner
                || started.elapsed() >= SELECTION_TIMEOUT
            {
                return None;
            }
            return String::from_utf8(reply.value).ok();
        }
        thread::sleep(Duration::from_millis(5));
    }
    None
}

#[cfg(test)]
#[path = "x11_tests.rs"]
mod tests;
