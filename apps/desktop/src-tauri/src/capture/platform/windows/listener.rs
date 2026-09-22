use crate::capture::{
    gesture::{DoubleShiftGesture, GestureEvent, ShiftKey},
    platform::DoubleShiftCallback,
    CaptureError,
};
use std::{
    cell::RefCell,
    sync::{
        atomic::{AtomicBool, AtomicUsize, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};
use windows::Win32::{
    Foundation::{LPARAM, LRESULT, WPARAM},
    System::{LibraryLoader::GetModuleHandleW, Threading::GetCurrentThreadId},
    UI::{
        Input::KeyboardAndMouse::{
            GetAsyncKeyState, VK_CONTROL, VK_LSHIFT, VK_LWIN, VK_MENU, VK_RSHIFT, VK_RWIN,
        },
        WindowsAndMessaging::*,
    },
};

struct Context {
    gesture: Arc<Mutex<DoubleShiftGesture>>,
    source: Arc<AtomicUsize>,
    callback: DoubleShiftCallback,
    foreground: usize,
    shifts: [bool; 2],
}
thread_local! { static CONTEXT: RefCell<Option<Context>> = const { RefCell::new(None) }; }

// All input is passed through, including injected input and recognized gestures.
unsafe extern "system" fn hook(code: i32, w: WPARAM, l: LPARAM) -> LRESULT {
    if code >= 0 {
        let event = unsafe { &*(l.0 as *const KBDLLHOOKSTRUCT) };
        CONTEXT.with(|slot| {
            let Ok(mut slot) = slot.try_borrow_mut() else {
                return;
            };
            let Some(context) = slot.as_mut() else {
                return;
            };
            let Ok(mut gesture) = context.gesture.try_lock() else {
                return;
            };
            let foreground = unsafe { GetForegroundWindow() }.0 as usize;
            if foreground != context.foreground || event.flags.contains(LLKHF_INJECTED) {
                gesture.reset();
                context.shifts = [false; 2];
                context.foreground = foreground;
                if event.flags.contains(LLKHF_INJECTED) {
                    return;
                }
            }
            let down = matches!(w.0 as u32, WM_KEYDOWN | WM_SYSKEYDOWN);
            let modifiers = [VK_CONTROL, VK_MENU, VK_LWIN, VK_RWIN]
                .iter()
                .any(|key| unsafe { GetAsyncKeyState(i32::from(key.0)) } < 0);
            let key = if event.vkCode == u32::from(VK_LSHIFT.0) {
                Some((ShiftKey::Left, 0))
            } else if event.vkCode == u32::from(VK_RSHIFT.0) {
                Some((ShiftKey::Right, 1))
            } else {
                None
            };
            let normalized = if let Some((key, index)) = key {
                let repeat = context.shifts[index];
                context.shifts[index] = down;
                if down {
                    GestureEvent::ShiftDown {
                        key,
                        is_repeat: repeat,
                        command_held: modifiers,
                    }
                } else {
                    GestureEvent::ShiftUp {
                        key,
                        command_held: modifiers,
                    }
                }
            } else {
                GestureEvent::OtherKey
            };
            let intent = gesture.handle(normalized, u64::from(event.time));
            drop(gesture);
            if let Some(intent) = intent {
                context.source.store(foreground, Ordering::Release);
                (context.callback)(intent);
            }
        });
    }
    unsafe { CallNextHookEx(None, code, w, l) }
}

pub struct Listener {
    id: u32,
    running: Arc<AtomicBool>,
    thread: Option<thread::JoinHandle<()>>,
}
impl Listener {
    pub fn start(
        gesture: Arc<Mutex<DoubleShiftGesture>>,
        source: Arc<AtomicUsize>,
        callback: DoubleShiftCallback,
    ) -> Result<Self, CaptureError> {
        let (tx, rx) = mpsc::sync_channel(1);
        let running = Arc::new(AtomicBool::new(true));
        let live = running.clone();
        let thread = thread::Builder::new()
            .name("charon-shift-hook".into())
            .spawn(move || unsafe {
                let mut message = MSG::default();
                let _ = PeekMessageW(&mut message, None, 0, 0, PM_NOREMOVE);
                CONTEXT.with(|slot| {
                    *slot.borrow_mut() = Some(Context {
                        gesture,
                        source,
                        callback,
                        foreground: GetForegroundWindow().0 as usize,
                        shifts: [false; 2],
                    })
                });
                let module = GetModuleHandleW(None).ok().map(Into::into);
                let hook_handle = SetWindowsHookExW(WH_KEYBOARD_LL, Some(hook), module, 0);
                match hook_handle {
                    Ok(handle) => {
                        if tx.send(Some(GetCurrentThreadId())).is_ok() {
                            while live.load(Ordering::Acquire)
                                && GetMessageW(&mut message, None, 0, 0).0 > 0
                            {
                                let _ = TranslateMessage(&message);
                                DispatchMessageW(&message);
                            }
                        }
                        let _ = UnhookWindowsHookEx(handle);
                    }
                    Err(_) => {
                        let _ = tx.send(None);
                    }
                }
                CONTEXT.with(|slot| slot.borrow_mut().take());
                live.store(false, Ordering::Release);
            })
            .map_err(|_| CaptureError::ListenerUnavailable)?;
        match rx.recv_timeout(Duration::from_secs(2)) {
            Ok(Some(id)) => Ok(Self {
                id,
                running,
                thread: Some(thread),
            }),
            _ => {
                running.store(false, Ordering::Release);
                Err(CaptureError::ListenerUnavailable)
            }
        }
    }
    pub fn alive(&self) -> bool {
        self.running.load(Ordering::Acquire)
    }
}
impl Drop for Listener {
    fn drop(&mut self) {
        self.running.store(false, Ordering::Release);
        unsafe {
            let _ = PostThreadMessageW(self.id, WM_QUIT, WPARAM(0), LPARAM(0));
        }
        if let Some(thread) = self.thread.take() {
            // Never hold up application shutdown on a platform message loop.
            if thread.is_finished() {
                let _ = thread.join();
            }
        }
    }
}
