use std::ffi::c_void;
use std::ptr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use core_foundation::base::{CFType, CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
use core_foundation::runloop::{kCFRunLoopDefaultMode, CFRunLoop};
use core_foundation::string::{CFString, CFStringRef};
use core_graphics::event::{
    CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement, CGEventType,
    CallbackResult, EventField,
};

use crate::capture::gesture::{DoubleShiftGesture, GestureEvent, ShiftKey};
use crate::capture::platform::DoubleShiftCallback;
use crate::capture::{CapabilityState, CaptureError, PlatformCapturePort, PlatformKind};

type AXUIElementRef = *const c_void;
type AXError = i32;
const AX_ERROR_SUCCESS: AXError = 0;
const OS_STATUS_SUCCESS: i32 = 0;
const SET_FRONT_PROCESS_FRONT_WINDOW_ONLY: u32 = 1;
const LEFT_SHIFT_KEYCODE: i64 = 56;
const RIGHT_SHIFT_KEYCODE: i64 = 60;

#[derive(Clone, Copy)]
#[repr(C)]
struct ProcessSerialNumber {
    high: u32,
    low: u32,
}

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> u8;
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> u8;
    fn AXUIElementCreateSystemWide() -> AXUIElementRef;
    fn AXUIElementCopyAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> AXError;
    fn GetFrontProcess(process: *mut ProcessSerialNumber) -> i32;
    fn SetFrontProcessWithOptions(process: *const ProcessSerialNumber, options: u32) -> i32;
}

pub struct MacosCaptureAdapter {
    callback: DoubleShiftCallback,
    gesture: Arc<Mutex<DoubleShiftGesture>>,
    listener: Option<MacosListener>,
    previous_process: Option<ProcessSerialNumber>,
}

impl MacosCaptureAdapter {
    pub fn new(callback: DoubleShiftCallback) -> Self {
        Self {
            callback,
            gesture: Arc::new(Mutex::new(DoubleShiftGesture::default())),
            listener: None,
            previous_process: None,
        }
    }

    fn trusted() -> bool {
        // SAFETY: AXIsProcessTrusted has no arguments and returns a Boolean.
        unsafe { AXIsProcessTrusted() != 0 }
    }
}

impl PlatformCapturePort for MacosCaptureAdapter {
    fn platform(&self) -> PlatformKind {
        PlatformKind::Macos
    }

    fn double_shift_state(&self) -> CapabilityState {
        if Self::trusted() {
            CapabilityState::Available
        } else {
            CapabilityState::Denied
        }
    }

    fn selected_text_state(&self) -> CapabilityState {
        self.double_shift_state()
    }

    fn start(&mut self) -> Result<(), CaptureError> {
        if self.listener.is_some() {
            return Ok(());
        }
        if !Self::trusted() {
            return Err(CaptureError::PermissionDenied);
        }
        self.listener = Some(MacosListener::start(
            Arc::clone(&self.gesture),
            Arc::clone(&self.callback),
        )?);
        Ok(())
    }

    fn request_permission(&mut self) -> Result<bool, CaptureError> {
        let prompt_key = CFString::new("AXTrustedCheckOptionPrompt");
        let prompt = CFBoolean::true_value();
        let options = CFDictionary::from_CFType_pairs(&[(prompt_key, prompt)]);
        // Prompting is asynchronous; callers can retry after changing System Settings.
        let trusted = unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) != 0 };
        Ok(trusted)
    }

    fn selected_text(&mut self) -> Result<Option<String>, CaptureError> {
        if !Self::trusted() {
            return Err(CaptureError::PermissionDenied);
        }
        copy_selected_text()
    }

    fn remember_focus_owner(&mut self) {
        let mut process = ProcessSerialNumber { high: 0, low: 0 };
        // SAFETY: GetFrontProcess initializes the provided fixed-layout value.
        if unsafe { GetFrontProcess(&mut process) } == OS_STATUS_SUCCESS {
            self.previous_process = Some(process);
        }
    }

    fn restore_focus_owner(&mut self) {
        let Some(process) = self.previous_process.take() else {
            return;
        };
        // SAFETY: the serial number was returned by GetFrontProcess for this capture.
        let _ =
            unsafe { SetFrontProcessWithOptions(&process, SET_FRONT_PROCESS_FRONT_WINDOW_ONLY) };
    }

    fn reset_gesture(&mut self) {
        if let Ok(mut gesture) = self.gesture.lock() {
            gesture.reset();
        }
    }

    fn shutdown(&mut self) {
        if let Some(mut listener) = self.listener.take() {
            listener.stop();
        }
        self.reset_gesture();
    }
}

struct MacosListener {
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl MacosListener {
    fn start(
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
                                let key = match keycode {
                                    LEFT_SHIFT_KEYCODE => Some(ShiftKey::Left),
                                    RIGHT_SHIFT_KEYCODE => Some(ShiftKey::Right),
                                    _ => None,
                                };
                                key.map(|key| {
                                    let is_held = toggle_native_held(&native_held, key);
                                    if is_held {
                                        GestureEvent::ShiftUp { key }
                                    } else {
                                        GestureEvent::ShiftDown {
                                            key,
                                            is_repeat: false,
                                        }
                                    }
                                })
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
                            let triggered = gesture
                                .lock()
                                .is_ok_and(|mut machine| machine.handle(normalized, timestamp));
                            if triggered {
                                callback();
                            }
                        }
                        CallbackResult::Keep
                    },
                    || {
                        let _ = ready_tx.send(Ok(()));
                        while !thread_stop.load(Ordering::Acquire) {
                            // SAFETY: the event source is installed in the current thread's run loop.
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

    fn stop(&mut self) {
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

// A flags-changed event identifies the physical modifier but not whether that
// modifier was pressed or released while the other Shift key remains held.
fn toggle_native_held(held: &Mutex<u8>, key: ShiftKey) -> bool {
    let Ok(mut held) = held.lock() else {
        return false;
    };
    let bit = match key {
        ShiftKey::Left => 1,
        ShiftKey::Right => 2,
    };
    let was_held = *held & bit != 0;
    if was_held {
        *held &= !bit;
    } else {
        *held |= bit;
    }
    was_held
}

fn copy_selected_text() -> Result<Option<String>, CaptureError> {
    // SAFETY: AXUIElement create/copy rules are balanced by CFType wrappers.
    unsafe {
        let system = AXUIElementCreateSystemWide();
        if system.is_null() {
            return Err(CaptureError::SelectionFailed);
        }
        let system = CFType::wrap_under_create_rule(system.cast_mut());
        let focused_attribute = CFString::new("AXFocusedUIElement");

        let mut focused: CFTypeRef = ptr::null();
        if AXUIElementCopyAttributeValue(
            system.as_CFTypeRef(),
            focused_attribute.as_concrete_TypeRef(),
            &mut focused,
        ) != AX_ERROR_SUCCESS
            || focused.is_null()
        {
            return Ok(None);
        }
        let focused = CFType::wrap_under_create_rule(focused);
        let selected_text_attribute = CFString::new("AXSelectedText");

        let mut selected: CFTypeRef = ptr::null();
        if AXUIElementCopyAttributeValue(
            focused.as_CFTypeRef(),
            selected_text_attribute.as_concrete_TypeRef(),
            &mut selected,
        ) != AX_ERROR_SUCCESS
            || selected.is_null()
        {
            return Ok(None);
        }
        let selected = CFType::wrap_under_create_rule(selected);
        Ok(selected
            .downcast::<CFString>()
            .map(|value| value.to_string()))
    }
}
