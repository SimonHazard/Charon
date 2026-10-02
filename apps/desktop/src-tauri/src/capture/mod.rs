mod coordinator;
mod error;
pub mod formatting;
pub mod gesture;
mod model;
pub mod platform;
pub mod shortcut;

pub use coordinator::{
    CaptureCoordinator, PlatformCapturePort, ShortcutPort, DEFAULT_CAPTURE_SHORTCUT,
};
pub use error::{CaptureError, CaptureIpcError};
pub use model::{
    CapabilityState, CaptureAction, CaptureCapabilities, CaptureComposerRequest,
    CapturePermissionKind, CaptureStatusEvent, CaptureTrigger, CaptureWarning, CapturedSelection,
    PlatformKind, ShortcutOrigin,
};
