use core_foundation::base::TCFType;
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
use core_foundation::string::CFString;
use std::ffi::c_int;

use crate::capture::CapturePermissionKind;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> u8;
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> u8;
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightListenEventAccess() -> bool;
}

const IOHID_REQUEST_TYPE_LISTEN_EVENT: c_int = 1;

#[link(name = "IOKit", kind = "framework")]
unsafe extern "C" {
    fn IOHIDRequestAccess(request_type: c_int) -> bool;
}

pub(super) fn accessibility_trusted() -> bool {
    // SAFETY: the public preflight API has no arguments and only reads TCC state.
    unsafe { AXIsProcessTrusted() != 0 }
}

pub(super) fn can_listen_to_input() -> bool {
    // SAFETY: the public preflight API has no arguments and only reads TCC state.
    unsafe { CGPreflightListenEventAccess() }
}

pub(super) fn request(permission: CapturePermissionKind) {
    match permission {
        CapturePermissionKind::InputMonitoring => {
            // SAFETY: the public IOKit request type `ListenEvent` delegates the
            // consent flow to TCC and reliably registers the app in the Input
            // Monitoring pane before the Core Graphics preflight is retried.
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
