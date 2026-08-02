use std::ffi::c_void;
use std::ptr;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use core_foundation::base::{CFType, CFTypeID, CFTypeRef, TCFType};
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
use core_foundation::runloop::{kCFRunLoopDefaultMode, CFRunLoop};
use core_foundation::string::{CFString, CFStringRef};
use core_graphics::event::{
    CGEvent, CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
    CGEventType, CallbackResult, EventField,
};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

use crate::capture::gesture::{DoubleShiftGesture, GestureEvent, ShiftKey};
use crate::capture::platform::DoubleShiftCallback;
use crate::capture::{
    CapabilityState, CaptureError, CapturePermissionKind, PlatformCapturePort, PlatformKind,
};

type AXUIElementRef = *const c_void;
type AXError = i32;
const AX_ERROR_SUCCESS: AXError = 0;
const LEFT_COMMAND_KEYCODE: i64 = 55;
const RIGHT_COMMAND_KEYCODE: i64 = 54;
const LEFT_SHIFT_KEYCODE: i64 = 56;
const RIGHT_SHIFT_KEYCODE: i64 = 60;
const MAX_ACCESSIBILITY_ANCESTORS: usize = 32;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> u8;
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> u8;
    fn AXUIElementCreateSystemWide() -> AXUIElementRef;
    fn AXUIElementGetTypeID() -> CFTypeID;
    fn AXUIElementCopyElementAtPosition(
        application: AXUIElementRef,
        x: f32,
        y: f32,
        element: *mut AXUIElementRef,
    ) -> AXError;
    fn AXUIElementCopyAttributeValue(
        element: AXUIElementRef,
        attribute: CFStringRef,
        value: *mut CFTypeRef,
    ) -> AXError;
    fn AXUIElementCopyParameterizedAttributeValue(
        element: AXUIElementRef,
        parameterized_attribute: CFStringRef,
        parameter: CFTypeRef,
        result: *mut CFTypeRef,
    ) -> AXError;
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightListenEventAccess() -> bool;
    fn CGRequestListenEventAccess() -> bool;
}

pub struct MacosCaptureAdapter {
    callback: DoubleShiftCallback,
    gesture: Arc<Mutex<DoubleShiftGesture>>,
    listener: Option<MacosListener>,
}

impl MacosCaptureAdapter {
    pub fn new(callback: DoubleShiftCallback) -> Self {
        Self {
            callback,
            gesture: Arc::new(Mutex::new(DoubleShiftGesture::default())),
            listener: None,
        }
    }

    fn trusted() -> bool {
        // SAFETY: AXIsProcessTrusted has no arguments and returns a Boolean.
        unsafe { AXIsProcessTrusted() != 0 }
    }

    fn can_listen_to_input() -> bool {
        // SAFETY: CGPreflightListenEventAccess has no arguments and only reads TCC state.
        unsafe { CGPreflightListenEventAccess() }
    }
}

impl PlatformCapturePort for MacosCaptureAdapter {
    fn platform(&self) -> PlatformKind {
        PlatformKind::Macos
    }

    fn input_monitoring_state(&self) -> CapabilityState {
        if Self::can_listen_to_input() {
            CapabilityState::Available
        } else {
            CapabilityState::Denied
        }
    }

    fn accessibility_state(&self) -> CapabilityState {
        if Self::trusted() {
            CapabilityState::Available
        } else {
            CapabilityState::Denied
        }
    }

    fn start(&mut self) -> Result<(), CaptureError> {
        if self.listener.is_some() {
            return Ok(());
        }
        if !Self::can_listen_to_input() {
            return Err(CaptureError::PermissionDenied);
        }
        self.listener = Some(MacosListener::start(
            Arc::clone(&self.gesture),
            Arc::clone(&self.callback),
        )?);
        Ok(())
    }

    fn request_permission(
        &mut self,
        permission: CapturePermissionKind,
    ) -> Result<(), CaptureError> {
        match permission {
            CapturePermissionKind::InputMonitoring => {
                // SAFETY: the public request API has no arguments and delegates consent to TCC.
                let _ = unsafe { CGRequestListenEventAccess() };
            }
            CapturePermissionKind::Accessibility => {
                let prompt_key = CFString::new("AXTrustedCheckOptionPrompt");
                let prompt = CFBoolean::true_value();
                let options = CFDictionary::from_CFType_pairs(&[(prompt_key, prompt)]);
                // Prompting is asynchronous; focus refresh rechecks after System Settings.
                let _ = unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) };
            }
        }
        Ok(())
    }

    fn selected_text(&mut self) -> Result<Option<String>, CaptureError> {
        if !Self::trusted() {
            return Err(CaptureError::PermissionDenied);
        }
        copy_selected_text()
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

fn copy_selected_text() -> Result<Option<String>, CaptureError> {
    // SAFETY: AXUIElement create/copy rules are balanced by CFType wrappers.
    unsafe {
        let system = AXUIElementCreateSystemWide();
        if system.is_null() {
            return Err(CaptureError::SelectionFailed);
        }
        let system = CFType::wrap_under_create_rule(system.cast_mut());
        let source = SystemAxSelectionSource;
        let application = source
            .attribute(&system, "AXFocusedApplication")
            .filter(|application| source.is_element(application));
        let pointed = copy_element_at_pointer(&system);
        Ok(acquire_selected_text(
            &source,
            &system,
            application.as_ref(),
            pointed.as_ref(),
        ))
    }
}

trait AxSelectionSource {
    type Value: Clone + PartialEq;

    fn is_element(&self, value: &Self::Value) -> bool;
    fn attribute(&self, element: &Self::Value, name: &str) -> Option<Self::Value>;
    fn parameterized_attribute(
        &self,
        element: &Self::Value,
        name: &str,
        parameter: &Self::Value,
    ) -> Option<Self::Value>;
    fn string(&self, value: &Self::Value) -> Option<String>;
}

struct SystemAxSelectionSource;

impl AxSelectionSource for SystemAxSelectionSource {
    type Value = CFType;

    fn is_element(&self, value: &Self::Value) -> bool {
        // SAFETY: both calls only inspect stable Core Foundation type identifiers.
        value.type_of() == unsafe { AXUIElementGetTypeID() }
    }

    fn attribute(&self, element: &Self::Value, name: &str) -> Option<Self::Value> {
        // SAFETY: the wrapper keeps the element alive and balances successful Copy results.
        unsafe { copy_attribute(element, name) }
    }

    fn parameterized_attribute(
        &self,
        element: &Self::Value,
        name: &str,
        parameter: &Self::Value,
    ) -> Option<Self::Value> {
        // SAFETY: the wrapper keeps both inputs alive and balances successful Copy results.
        unsafe { copy_parameterized_attribute(element, name, parameter) }
    }

    fn string(&self, value: &Self::Value) -> Option<String> {
        value.downcast::<CFString>().map(|value| value.to_string())
    }
}

fn acquire_selected_text<S: AxSelectionSource>(
    source: &S,
    system: &S::Value,
    application: Option<&S::Value>,
    pointed: Option<&S::Value>,
) -> Option<String> {
    let candidates = selection_candidates(source, system, application, pointed);
    for candidate in candidates {
        if let Some(selected) = selected_text_for_candidate(source, &candidate) {
            return Some(selected);
        }
    }
    None
}

fn selection_candidates<S: AxSelectionSource>(
    source: &S,
    system: &S::Value,
    application: Option<&S::Value>,
    pointed: Option<&S::Value>,
) -> Vec<S::Value> {
    let application = application
        .cloned()
        .or_else(|| element_attribute(source, system, "AXFocusedApplication"));
    let focused = match application.as_ref() {
        Some(application) => element_attribute(source, application, "AXFocusedUIElement"),
        None => element_attribute(source, system, "AXFocusedUIElement"),
    };
    let mut candidates = Vec::with_capacity(MAX_ACCESSIBILITY_ANCESTORS * 2 + 2);

    if let Some(focused) = focused {
        append_ancestor_chain(source, &mut candidates, focused);
    }
    if let Some(pointed) = pointed.filter(|value| source.is_element(value)) {
        append_ancestor_chain(source, &mut candidates, pointed.clone());
    }

    let focused_window = match application.as_ref() {
        Some(application) => element_attribute(source, application, "AXFocusedWindow"),
        None => element_attribute(source, system, "AXFocusedWindow"),
    };
    if let Some(window) = focused_window {
        push_unique(&mut candidates, window);
    }
    if let Some(application) = application {
        push_unique(&mut candidates, application);
    }

    candidates
}

fn append_ancestor_chain<S: AxSelectionSource>(
    source: &S,
    candidates: &mut Vec<S::Value>,
    mut current: S::Value,
) {
    for _ in 0..MAX_ACCESSIBILITY_ANCESTORS {
        if !push_unique(candidates, current.clone()) {
            break;
        }
        let Some(parent) = element_attribute(source, &current, "AXParent") else {
            break;
        };
        current = parent;
    }
}

fn element_attribute<S: AxSelectionSource>(
    source: &S,
    element: &S::Value,
    name: &str,
) -> Option<S::Value> {
    source
        .attribute(element, name)
        .filter(|value| source.is_element(value))
}

fn push_unique<T: PartialEq>(values: &mut Vec<T>, candidate: T) -> bool {
    if values.iter().any(|value| value == &candidate) {
        return false;
    }
    values.push(candidate);
    true
}

fn selected_text_for_candidate<S: AxSelectionSource>(
    source: &S,
    candidate: &S::Value,
) -> Option<String> {
    if let Some(selected) = source
        .attribute(candidate, "AXSelectedText")
        .as_ref()
        .and_then(|value| source.string(value))
        .filter(|value| !value.trim().is_empty())
    {
        return Some(selected);
    }

    for (range_attribute, string_attribute) in [
        ("AXSelectedTextRange", "AXStringForRange"),
        ("AXSelectedTextMarkerRange", "AXStringForTextMarkerRange"),
    ] {
        let Some(range) = source.attribute(candidate, range_attribute) else {
            continue;
        };
        if let Some(selected) = source
            .parameterized_attribute(candidate, string_attribute, &range)
            .as_ref()
            .and_then(|value| source.string(value))
            .filter(|value| !value.trim().is_empty())
        {
            return Some(selected);
        }
    }

    None
}

fn copy_element_at_pointer(system: &CFType) -> Option<CFType> {
    let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState).ok()?;
    let location = CGEvent::new(source).ok()?.location();
    let mut element: AXUIElementRef = ptr::null();
    // SAFETY: the system element remains alive and a successful Copy result is retained.
    if unsafe {
        AXUIElementCopyElementAtPosition(
            system.as_CFTypeRef(),
            location.x as f32,
            location.y as f32,
            &mut element,
        )
    } != AX_ERROR_SUCCESS
        || element.is_null()
    {
        return None;
    }
    // SAFETY: a successful Copy call returns a retained AXUIElement reference.
    Some(unsafe { CFType::wrap_under_create_rule(element.cast_mut()) })
}

unsafe fn copy_attribute(element: &CFType, name: &str) -> Option<CFType> {
    let attribute = CFString::new(name);
    let mut value: CFTypeRef = ptr::null();
    // SAFETY: the element and attribute remain alive for the duration of the copy call.
    if unsafe {
        AXUIElementCopyAttributeValue(
            element.as_CFTypeRef(),
            attribute.as_concrete_TypeRef(),
            &mut value,
        )
    } != AX_ERROR_SUCCESS
        || value.is_null()
    {
        return None;
    }
    // SAFETY: a successful Copy call returns a retained Core Foundation value.
    Some(unsafe { CFType::wrap_under_create_rule(value) })
}

unsafe fn copy_parameterized_attribute(
    element: &CFType,
    name: &str,
    parameter: &CFType,
) -> Option<CFType> {
    let attribute = CFString::new(name);
    let mut value: CFTypeRef = ptr::null();
    // SAFETY: the element, attribute, and parameter remain alive for the copy call.
    if unsafe {
        AXUIElementCopyParameterizedAttributeValue(
            element.as_CFTypeRef(),
            attribute.as_concrete_TypeRef(),
            parameter.as_CFTypeRef(),
            &mut value,
        )
    } != AX_ERROR_SUCCESS
        || value.is_null()
    {
        return None;
    }
    // SAFETY: a successful Copy call returns a retained Core Foundation value.
    Some(unsafe { CFType::wrap_under_create_rule(value) })
}

#[cfg(test)]
mod tests {
    use super::{
        acquire_selected_text, selection_candidates, transition_native_held, AxSelectionSource,
        ShiftKey, MAX_ACCESSIBILITY_ANCESTORS,
    };
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::sync::Mutex;

    #[derive(Default)]
    struct FakeAxSelectionSource {
        attributes: HashMap<(String, String), String>,
        parameterized: HashMap<(String, String, String), String>,
        strings: HashMap<String, String>,
        non_elements: Vec<String>,
        attribute_calls: RefCell<Vec<(String, String)>>,
    }

    impl FakeAxSelectionSource {
        fn attribute(mut self, element: &str, name: &str, value: &str) -> Self {
            self.attributes
                .insert((element.to_owned(), name.to_owned()), value.to_owned());
            self
        }

        fn parameterized(
            mut self,
            element: &str,
            name: &str,
            parameter: &str,
            value: &str,
        ) -> Self {
            self.parameterized.insert(
                (element.to_owned(), name.to_owned(), parameter.to_owned()),
                value.to_owned(),
            );
            self
        }

        fn string(mut self, value: &str, text: &str) -> Self {
            self.strings.insert(value.to_owned(), text.to_owned());
            self
        }

        fn non_element(mut self, value: &str) -> Self {
            self.non_elements.push(value.to_owned());
            self
        }
    }

    impl AxSelectionSource for FakeAxSelectionSource {
        type Value = String;

        fn is_element(&self, value: &Self::Value) -> bool {
            !self.non_elements.contains(value)
        }

        fn attribute(&self, element: &Self::Value, name: &str) -> Option<Self::Value> {
            self.attribute_calls
                .borrow_mut()
                .push((element.clone(), name.to_owned()));
            self.attributes
                .get(&(element.clone(), name.to_owned()))
                .cloned()
        }

        fn parameterized_attribute(
            &self,
            element: &Self::Value,
            name: &str,
            parameter: &Self::Value,
        ) -> Option<Self::Value> {
            self.parameterized
                .get(&(element.clone(), name.to_owned(), parameter.clone()))
                .cloned()
        }

        fn string(&self, value: &Self::Value) -> Option<String> {
            self.strings.get(value).cloned()
        }
    }

    fn source_with_focused_element() -> FakeAxSelectionSource {
        FakeAxSelectionSource::default()
            .attribute("system", "AXFocusedApplication", "application")
            .attribute("application", "AXFocusedUIElement", "focused")
    }

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

    #[test]
    fn selection_ladder_returns_exact_direct_text_first() {
        let source = source_with_focused_element()
            .attribute("focused", "AXSelectedText", "direct")
            .string("direct", "  selected text\n");

        assert_eq!(
            acquire_selected_text(&source, &"system".to_owned(), None, None),
            Some("  selected text\n".to_owned())
        );
    }

    #[test]
    fn selection_ladder_falls_back_to_standard_range() {
        let source = source_with_focused_element()
            .attribute("focused", "AXSelectedTextRange", "range")
            .parameterized("focused", "AXStringForRange", "range", "standard")
            .string("standard", "standard selection");

        assert_eq!(
            acquire_selected_text(&source, &"system".to_owned(), None, None),
            Some("standard selection".to_owned())
        );
    }

    #[test]
    fn selection_ladder_falls_back_to_web_text_marker_range() {
        let source = source_with_focused_element()
            .attribute("focused", "AXSelectedTextMarkerRange", "marker-range")
            .parameterized(
                "focused",
                "AXStringForTextMarkerRange",
                "marker-range",
                "web",
            )
            .string("web", "web selection");

        assert_eq!(
            acquire_selected_text(&source, &"system".to_owned(), None, None),
            Some("web selection".to_owned())
        );
    }

    #[test]
    fn selection_ladder_checks_accessible_ancestors() {
        let source = source_with_focused_element()
            .attribute("focused", "AXParent", "web-area")
            .attribute("web-area", "AXSelectedTextMarkerRange", "marker-range")
            .parameterized(
                "web-area",
                "AXStringForTextMarkerRange",
                "marker-range",
                "web",
            )
            .string("web", "ancestor selection");

        assert_eq!(
            acquire_selected_text(&source, &"system".to_owned(), None, None),
            Some("ancestor selection".to_owned())
        );
    }

    #[test]
    fn selection_ladder_checks_the_pointer_chain_after_keyboard_focus() {
        let source = source_with_focused_element()
            .attribute("pointed-static-text", "AXParent", "pointed-web-area")
            .attribute(
                "pointed-web-area",
                "AXSelectedTextMarkerRange",
                "marker-range",
            )
            .parameterized(
                "pointed-web-area",
                "AXStringForTextMarkerRange",
                "marker-range",
                "web",
            )
            .string("web", "pointer selection");
        let pointed = "pointed-static-text".to_owned();

        assert_eq!(
            acquire_selected_text(&source, &"system".to_owned(), None, Some(&pointed)),
            Some("pointer selection".to_owned())
        );
    }

    #[test]
    fn selection_ladder_checks_the_focused_window() {
        let source = source_with_focused_element()
            .attribute("application", "AXFocusedWindow", "window")
            .attribute("window", "AXSelectedText", "window-text")
            .string("window-text", "window selection");

        assert_eq!(
            acquire_selected_text(&source, &"system".to_owned(), None, None),
            Some("window selection".to_owned())
        );
    }

    #[test]
    fn selection_ladder_checks_the_focused_application() {
        let source = source_with_focused_element()
            .attribute("application", "AXSelectedText", "application-text")
            .string("application-text", "application selection");

        assert_eq!(
            acquire_selected_text(&source, &"system".to_owned(), None, None),
            Some("application selection".to_owned())
        );
    }

    #[test]
    fn selection_ladder_skips_whitespace_wrong_types_and_ax_errors() {
        let source = source_with_focused_element()
            .attribute("focused", "AXSelectedText", "whitespace")
            .string("whitespace", " \n\t")
            .attribute("focused", "AXSelectedTextRange", "wrong-type")
            .parameterized("focused", "AXStringForRange", "wrong-type", "not-a-string")
            .attribute("focused", "AXSelectedTextMarkerRange", "marker-range")
            .parameterized(
                "focused",
                "AXStringForTextMarkerRange",
                "marker-range",
                "valid",
            )
            .string("valid", "valid selection");

        assert_eq!(
            acquire_selected_text(&source, &"system".to_owned(), None, None),
            Some("valid selection".to_owned())
        );
    }

    #[test]
    fn selection_candidates_stop_on_an_accessibility_cycle() {
        let source = source_with_focused_element()
            .attribute("focused", "AXParent", "parent")
            .attribute("parent", "AXParent", "focused");

        let candidates = selection_candidates(&source, &"system".to_owned(), None, None);

        assert_eq!(candidates, vec!["focused", "parent", "application"]);
    }

    #[test]
    fn selection_candidates_ignore_wrong_core_foundation_types() {
        let source = FakeAxSelectionSource::default()
            .attribute("system", "AXFocusedApplication", "not-an-application")
            .attribute("system", "AXFocusedUIElement", "not-an-element")
            .attribute("system", "AXFocusedWindow", "not-a-window")
            .non_element("not-an-application")
            .non_element("not-an-element")
            .non_element("not-a-window");

        assert!(selection_candidates(&source, &"system".to_owned(), None, None).is_empty());
        assert!(source.attribute_calls.borrow().iter().all(|(element, _)| {
            element != "not-an-application"
                && element != "not-an-element"
                && element != "not-a-window"
        }));
    }

    #[test]
    fn selection_candidates_reuse_the_captured_foreground_application() {
        let source = FakeAxSelectionSource::default()
            .attribute("system", "AXFocusedApplication", "later-application")
            .attribute("captured-application", "AXFocusedUIElement", "focused")
            .attribute("captured-application", "AXFocusedWindow", "window");
        let captured_application = "captured-application".to_owned();

        let candidates = selection_candidates(
            &source,
            &"system".to_owned(),
            Some(&captured_application),
            None,
        );

        assert_eq!(
            candidates,
            vec!["focused", "window", "captured-application"]
        );
        assert!(!source
            .attribute_calls
            .borrow()
            .contains(&("system".to_owned(), "AXFocusedApplication".to_owned(),)));
    }

    #[test]
    fn selection_candidates_bound_the_parent_chain() {
        let mut source =
            FakeAxSelectionSource::default().attribute("system", "AXFocusedUIElement", "element-0");
        for index in 0..MAX_ACCESSIBILITY_ANCESTORS + 5 {
            source = source.attribute(
                &format!("element-{index}"),
                "AXParent",
                &format!("element-{}", index + 1),
            );
        }

        let candidates = selection_candidates(&source, &"system".to_owned(), None, None);

        assert_eq!(candidates.len(), MAX_ACCESSIBILITY_ANCESTORS);
        assert_eq!(
            source
                .attribute_calls
                .borrow()
                .iter()
                .filter(|(_, name)| name == "AXParent")
                .count(),
            MAX_ACCESSIBILITY_ANCESTORS
        );
    }

    #[test]
    fn selection_candidates_bound_and_deduplicate_both_origins() {
        let mut source =
            FakeAxSelectionSource::default().attribute("system", "AXFocusedUIElement", "focused-0");
        for index in 0..MAX_ACCESSIBILITY_ANCESTORS + 5 {
            source = source
                .attribute(
                    &format!("focused-{index}"),
                    "AXParent",
                    &format!("focused-{}", index + 1),
                )
                .attribute(
                    &format!("pointed-{index}"),
                    "AXParent",
                    &format!("pointed-{}", index + 1),
                );
        }
        let pointed = "pointed-0".to_owned();

        let candidates = selection_candidates(&source, &"system".to_owned(), None, Some(&pointed));

        assert_eq!(candidates.len(), MAX_ACCESSIBILITY_ANCESTORS * 2);
        assert_eq!(candidates.first().map(String::as_str), Some("focused-0"));
        assert_eq!(
            candidates
                .get(MAX_ACCESSIBILITY_ANCESTORS)
                .map(String::as_str),
            Some("pointed-0")
        );

        let duplicate = selection_candidates(
            &source,
            &"system".to_owned(),
            None,
            Some(&"focused-0".to_owned()),
        );
        assert_eq!(duplicate.len(), MAX_ACCESSIBILITY_ANCESTORS);
    }

    #[test]
    fn selection_ladder_returns_none_when_no_public_representation_has_text() {
        let source = source_with_focused_element();

        assert_eq!(
            acquire_selected_text(&source, &"system".to_owned(), None, None),
            None
        );
    }
}
