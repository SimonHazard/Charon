use crate::capture::{CaptureError, CapturePermissionKind};
use core_foundation::base::TCFType;
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
use core_foundation::string::CFString;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> u8;
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> u8;
}

type IOHIDRequestType = i32;
type IOHIDAccessType = i32;

const IOHID_REQUEST_TYPE_LISTEN_EVENT: IOHIDRequestType = 1;
const IOHID_ACCESS_TYPE_GRANTED: IOHIDAccessType = 0;
const INPUT_MONITORING_SETTINGS_URL: &str =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent";
const ACCESSIBILITY_SETTINGS_URL: &str =
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility";

#[link(name = "IOKit", kind = "framework")]
unsafe extern "C" {
    fn IOHIDCheckAccess(request_type: IOHIDRequestType) -> IOHIDAccessType;
    fn IOHIDRequestAccess(request_type: IOHIDRequestType) -> bool;
}

pub(super) fn accessibility_trusted() -> bool {
    // SAFETY: the public preflight API has no arguments and only reads TCC state.
    unsafe { AXIsProcessTrusted() != 0 }
}

pub(super) fn can_listen_to_input() -> bool {
    // SAFETY: the public IOKit preflight API only reads TCC state for the
    // supplied request type. Unlike CGPreflightListenEventAccess, this does
    // not conflate a separate Accessibility grant with Input Monitoring.
    input_monitoring_granted(unsafe { IOHIDCheckAccess(IOHID_REQUEST_TYPE_LISTEN_EVENT) })
}

pub(super) fn request(permission: CapturePermissionKind) {
    match permission {
        CapturePermissionKind::InputMonitoring => {
            // SAFETY: the public IOKit request API delegates the consent flow
            // to TCC and registers the app in Input Monitoring. Capability
            // state is re-preflighted after the call.
            let _ = unsafe { IOHIDRequestAccess(IOHID_REQUEST_TYPE_LISTEN_EVENT) };
        }
        CapturePermissionKind::Accessibility => {
            let prompt_key = CFString::new("AXTrustedCheckOptionPrompt");
            let prompt = CFBoolean::true_value();
            let options = CFDictionary::from_CFType_pairs(&[(prompt_key, prompt)]);
            // SAFETY: the dictionary uses the public prompt option and remains alive for the call.
            let _ = unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) };
        }
    }
}

pub(super) fn open_settings(permission: CapturePermissionKind) -> Result<(), CaptureError> {
    tauri_plugin_opener::open_url(settings_url(permission), None::<&str>)
        .map_err(|_| CaptureError::SettingsOpenFailed)
}

fn settings_url(permission: CapturePermissionKind) -> &'static str {
    match permission {
        CapturePermissionKind::InputMonitoring => INPUT_MONITORING_SETTINGS_URL,
        CapturePermissionKind::Accessibility => ACCESSIBILITY_SETTINGS_URL,
    }
}

fn input_monitoring_granted(access: IOHIDAccessType) -> bool {
    access == IOHID_ACCESS_TYPE_GRANTED
}

#[cfg(test)]
mod tests {
    use super::{
        input_monitoring_granted, settings_url, IOHIDRequestType, IOHID_ACCESS_TYPE_GRANTED,
        IOHID_REQUEST_TYPE_LISTEN_EVENT,
    };
    use crate::capture::CapturePermissionKind;

    #[test]
    fn input_monitoring_requires_the_explicit_hid_grant() {
        assert_eq!(IOHID_REQUEST_TYPE_LISTEN_EVENT, 1 as IOHIDRequestType);
        assert!(input_monitoring_granted(IOHID_ACCESS_TYPE_GRANTED));
        assert!(!input_monitoring_granted(1));
        assert!(!input_monitoring_granted(2));
    }

    #[test]
    fn permission_settings_target_the_matching_macos_panels() {
        assert_eq!(
            settings_url(CapturePermissionKind::InputMonitoring),
            "x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent"
        );
        assert_eq!(
            settings_url(CapturePermissionKind::Accessibility),
            "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility"
        );
    }
}
