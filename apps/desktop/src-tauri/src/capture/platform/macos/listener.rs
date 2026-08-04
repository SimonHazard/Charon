use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use core_foundation::runloop::{kCFRunLoopDefaultMode, CFRunLoop};
use core_graphics::event::{
    CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
    CGEventType, CallbackResult, EventField,
};

use crate::capture::gesture::{DoubleShiftGesture, GestureEvent, ShiftKey};
use crate::capture::platform::DoubleShiftCallback;
use crate::capture::CaptureError;

const LEFT_COMMAND_KEYCODE: i64 = 55;
const RIGHT_COMMAND_KEYCODE: i64 = 54;
const LEFT_SHIFT_KEYCODE: i64 = 56;
const RIGHT_SHIFT_KEYCODE: i64 = 60;

pub(super) struct MacosListener {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl MacosListener {
    pub(super) fn start(
        gesture: Arc<Mutex<DoubleShiftGesture>>,
        callback: DoubleShiftCallback,
    ) -> Result<Self, CaptureError> {
        let stop = Arc::new(AtomicBool::new(false));
        let thread_stop = Arc::clone(&stop);
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let thread = thread::Builder::new()
            .name("charon-capture-listener".to_owned())
            .spawn(move || {
                let started_at = Instant::now();
                let native_held = Mutex::new(0_u8);
                let listener_result = CGEventTap::with_enabled(
                    CGEventTapLocation::Session,
                    CGEventTapPlacement::HeadInsertEventTap,
                    CGEventTapOptions::ListenOnly,
                    vec![
                        CGEventType::FlagsChanged,
                        CGEventType::KeyDown,
                        CGEventType::KeyUp,
                    ],
                    move |_proxy, event_type, event| {
                        let timestamp =
                            u64::try_from(started_at.elapsed().as_millis()).unwrap_or(u64::MAX);
                        let normalized = match event_type {
                            CGEventType::FlagsChanged => {
                                let keycode = event
                                    .get_integer_value_field(EventField::KEYBOARD_EVENT_KEYCODE);
                                let command_held =
                                    event.get_flags().contains(CGEventFlags::CGEventFlagCommand);
                                let shift_held =
                                    event.get_flags().contains(CGEventFlags::CGEventFlagShift);
                                let key = match keycode {
                                    LEFT_SHIFT_KEYCODE => Some(ShiftKey::Left),
                                    RIGHT_SHIFT_KEYCODE => Some(ShiftKey::Right),
                                    _ => None,
                                };
                                if let Some(key) = key {
                                    let is_release =
                                        transition_native_held(&native_held, key, shift_held);
                                    if is_release {
                                        Some(GestureEvent::ShiftUp { key, command_held })
                                    } else {
                                        Some(GestureEvent::ShiftDown {
                                            key,
                                            is_repeat: false,
                                            command_held,
                                        })
                                    }
                                } else if matches!(
                                    keycode,
                                    LEFT_COMMAND_KEYCODE | RIGHT_COMMAND_KEYCODE
                                ) {
                                    Some(GestureEvent::CommandChanged { held: command_held })
                                } else {
                                    Some(GestureEvent::OtherKey)
                                }
                            }
                            CGEventType::KeyDown | CGEventType::KeyUp => {
                                Some(GestureEvent::OtherKey)
                            }
                            CGEventType::TapDisabledByTimeout
                            | CGEventType::TapDisabledByUserInput => {
                                if let Ok(mut held) = native_held.lock() {
                                    *held = 0;
                                }
                                Some(GestureEvent::SecurityBoundary)
                            }
                            _ => None,
                        };
                        if let Some(normalized) = normalized {
                            let intent = gesture
                                .lock()
                                .ok()
                                .and_then(|mut machine| machine.handle(normalized, timestamp));
                            if let Some(intent) = intent {
                                callback(intent);
                            }
                        }
                        CallbackResult::Keep
                    },
                    || {
                        let _ = ready_tx.send(Ok(()));
                        while !thread_stop.load(Ordering::Acquire) {
                            // SAFETY: the event source is installed in this thread's run loop.
                            unsafe {
                                CFRunLoop::run_in_mode(
                                    kCFRunLoopDefaultMode,
                                    Duration::from_millis(50),
                                    true,
                                );
                            }
                        }
                    },
                );
                if listener_result.is_err() {
                    let _ = ready_tx.send(Err(CaptureError::ListenerUnavailable));
                }
            })
            .map_err(|_| CaptureError::ListenerUnavailable)?;

        match ready_rx.recv_timeout(Duration::from_secs(2)) {
            Ok(Ok(())) => Ok(Self {
                stop,
                thread: Some(thread),
            }),
            _ => {
                stop.store(true, Ordering::Release);
                let _ = thread.join();
                Err(CaptureError::ListenerUnavailable)
            }
        }
    }

    pub(super) fn stop(&mut self) {
        self.stop.store(true, Ordering::Release);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for MacosListener {
    fn drop(&mut self) {
        self.stop();
    }
}

fn transition_native_held(held: &Mutex<u8>, key: ShiftKey, aggregate_shift_held: bool) -> bool {
    let Ok(mut held) = held.lock() else {
        return false;
    };
    let bit = match key {
        ShiftKey::Left => 1,
        ShiftKey::Right => 2,
    };
    if !aggregate_shift_held {
        *held = 0;
        true
    } else if *held & bit != 0 {
        *held &= !bit;
        true
    } else {
        *held |= bit;
        false
    }
}

#[cfg(test)]
mod tests {
    use super::{transition_native_held, ShiftKey};
    use std::sync::Mutex;

    #[test]
    fn listener_starting_during_a_shift_hold_treats_the_first_event_as_release() {
        let held = Mutex::new(0);
        assert!(transition_native_held(&held, ShiftKey::Left, false));
        assert_eq!(*held.lock().expect("held state"), 0);
    }

    #[test]
    fn native_shift_tracking_handles_an_overlapping_left_right_chord() {
        let held = Mutex::new(0);
        assert!(!transition_native_held(&held, ShiftKey::Left, true));
        assert!(!transition_native_held(&held, ShiftKey::Right, true));
        assert!(transition_native_held(&held, ShiftKey::Left, true));
        assert!(transition_native_held(&held, ShiftKey::Right, false));
        assert_eq!(*held.lock().expect("held state"), 0);
    }
}
