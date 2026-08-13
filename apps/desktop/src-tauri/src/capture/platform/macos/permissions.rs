use crate::capture::CapturePermissionKind;
use core_foundation::base::TCFType;
use core_foundation::boolean::CFBoolean;
use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
use core_foundation::string::CFString;

#[link(name = "ApplicationServices", kind = "framework")]
unsafe extern "C" {
    fn AXIsProcessTrusted() -> u8;
    fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> u8;
}

#[link(name = "CoreGraphics", kind = "framework")]
unsafe extern "C" {
    fn CGPreflightListenEventAccess() -> bool;
    fn CGRequestListenEventAccess() -> bool;
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
            // SAFETY: the public Core Graphics request API delegates the consent
            // flow to TCC. Capability state is re-preflighted after the call.
            let _ = unsafe { CGRequestListenEventAccess() };
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
