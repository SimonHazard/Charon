use std::ffi::c_void;
use std::ptr;

use core_foundation::base::{CFType, CFTypeID, CFTypeRef, TCFType};
use core_foundation::string::{CFString, CFStringRef};
use core_graphics::event::CGEvent;
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

use crate::capture::CaptureError;

type AXUIElementRef = *const c_void;
type AXError = i32;
const AX_ERROR_SUCCESS: AXError = 0;
const MAX_ACCESSIBILITY_ANCESTORS: usize = 32;
const AX_SECURE_TEXT_FIELD: &str = "AXSecureTextField";

#[derive(Debug, Eq, PartialEq)]
pub(super) enum AxSelection {
    Text(String),
    NoSelection,
    Secure,
}

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
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

pub(super) fn copy_selected_text() -> Result<AxSelection, CaptureError> {
    // SAFETY: AX create/copy ownership is balanced by CFType wrappers below.
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
) -> AxSelection {
    for candidate in selection_candidates(source, system, application, pointed) {
        if is_secure_candidate(source, &candidate) {
            return AxSelection::Secure;
        }
        if let Some(selected) = selected_text_for_candidate(source, &candidate) {
            return AxSelection::Text(selected);
        }
    }
    AxSelection::NoSelection
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

fn is_secure_candidate<S: AxSelectionSource>(source: &S, candidate: &S::Value) -> bool {
    ["AXRole", "AXSubrole"].into_iter().any(|attribute| {
        source
            .attribute(candidate, attribute)
            .as_ref()
            .and_then(|value| source.string(value))
            .is_some_and(|value| value == AX_SECURE_TEXT_FIELD)
    })
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
    // SAFETY: the element and attribute remain alive for the copy call.
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
        acquire_selected_text, selection_candidates, AxSelection, AxSelectionSource,
        MAX_ACCESSIBILITY_ANCESTORS,
    };
    use std::cell::RefCell;
    use std::collections::HashMap;

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

    fn acquire(source: &FakeAxSelectionSource, pointed: Option<&String>) -> AxSelection {
        acquire_selected_text(source, &"system".to_owned(), None, pointed)
    }

    #[test]
    fn selection_ladder_returns_exact_direct_text_first() {
        let source = source_with_focused_element()
            .attribute("focused", "AXSelectedText", "direct")
            .string("direct", "  selected text\n");
        assert_eq!(
            acquire(&source, None),
            AxSelection::Text("  selected text\n".to_owned())
        );
    }

    #[test]
    fn selection_ladder_falls_back_to_standard_range() {
        let source = source_with_focused_element()
            .attribute("focused", "AXSelectedTextRange", "range")
            .parameterized("focused", "AXStringForRange", "range", "standard")
            .string("standard", "standard selection");
        assert_eq!(
            acquire(&source, None),
            AxSelection::Text("standard selection".to_owned())
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
            acquire(&source, None),
            AxSelection::Text("web selection".to_owned())
        );
    }

    #[test]
    fn selection_ladder_checks_ancestors_pointer_window_and_application() {
        for (source, pointed, expected) in [
            (
                source_with_focused_element()
                    .attribute("focused", "AXParent", "parent")
                    .attribute("parent", "AXSelectedText", "text")
                    .string("text", "ancestor"),
                None,
                "ancestor",
            ),
            (
                source_with_focused_element()
                    .attribute("pointed", "AXSelectedText", "text")
                    .string("text", "pointer"),
                Some("pointed".to_owned()),
                "pointer",
            ),
            (
                source_with_focused_element()
                    .attribute("application", "AXFocusedWindow", "window")
                    .attribute("window", "AXSelectedText", "text")
                    .string("text", "window"),
                None,
                "window",
            ),
            (
                source_with_focused_element()
                    .attribute("application", "AXSelectedText", "text")
                    .string("text", "application"),
                None,
                "application",
            ),
        ] {
            assert_eq!(
                acquire(&source, pointed.as_ref()),
                AxSelection::Text(expected.to_owned())
            );
        }
    }

    #[test]
    fn selection_ladder_rejects_secure_role_or_subrole() {
        for attribute in ["AXRole", "AXSubrole"] {
            let source = source_with_focused_element()
                .attribute("focused", attribute, "secure")
                .string("secure", "AXSecureTextField")
                .attribute("focused", "AXSelectedText", "secret")
                .string("secret", "must not escape");
            assert_eq!(acquire(&source, None), AxSelection::Secure);
        }
    }

    #[test]
    fn selection_ladder_skips_whitespace_wrong_types_and_errors() {
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
            acquire(&source, None),
            AxSelection::Text("valid selection".to_owned())
        );
    }

    #[test]
    fn selection_candidates_stop_on_cycle_and_ignore_wrong_types() {
        let source = source_with_focused_element()
            .attribute("focused", "AXParent", "parent")
            .attribute("parent", "AXParent", "focused");
        assert_eq!(
            selection_candidates(&source, &"system".to_owned(), None, None),
            vec!["focused", "parent", "application"]
        );

        let wrong = FakeAxSelectionSource::default()
            .attribute("system", "AXFocusedApplication", "not-application")
            .attribute("system", "AXFocusedUIElement", "not-element")
            .attribute("system", "AXFocusedWindow", "not-window")
            .non_element("not-application")
            .non_element("not-element")
            .non_element("not-window");
        assert!(selection_candidates(&wrong, &"system".to_owned(), None, None).is_empty());
    }

    #[test]
    fn candidates_reuse_captured_application() {
        let source = FakeAxSelectionSource::default()
            .attribute("system", "AXFocusedApplication", "later-application")
            .attribute("captured-application", "AXFocusedUIElement", "focused")
            .attribute("captured-application", "AXFocusedWindow", "window");
        let application = "captured-application".to_owned();
        assert_eq!(
            selection_candidates(&source, &"system".to_owned(), Some(&application), None),
            vec!["focused", "window", "captured-application"]
        );
    }

    #[test]
    fn candidates_apply_exact_bound_and_deduplicate_origins() {
        let mut source =
            FakeAxSelectionSource::default().attribute("system", "AXFocusedUIElement", "focus-0");
        for index in 0..MAX_ACCESSIBILITY_ANCESTORS + 5 {
            source = source
                .attribute(
                    &format!("focus-{index}"),
                    "AXParent",
                    &format!("focus-{}", index + 1),
                )
                .attribute(
                    &format!("point-{index}"),
                    "AXParent",
                    &format!("point-{}", index + 1),
                );
        }
        let pointed = "point-0".to_owned();
        let candidates = selection_candidates(&source, &"system".to_owned(), None, Some(&pointed));
        assert_eq!(candidates.len(), MAX_ACCESSIBILITY_ANCESTORS * 2);
        assert_eq!(
            candidates
                .get(MAX_ACCESSIBILITY_ANCESTORS)
                .map(String::as_str),
            Some("point-0")
        );
        let duplicate = selection_candidates(
            &source,
            &"system".to_owned(),
            None,
            Some(&"focus-0".to_owned()),
        );
        assert_eq!(duplicate.len(), MAX_ACCESSIBILITY_ANCESTORS);
    }

    #[test]
    fn selection_ladder_returns_none_without_a_public_representation() {
        assert_eq!(
            acquire(&source_with_focused_element(), None),
            AxSelection::NoSelection
        );
    }
}
