mod coordinator;
mod error;
pub mod gesture;
mod model;
pub mod platform;
mod window;

pub use coordinator::{
    CaptureCoordinator, CaptureWindowPort, PlatformCapturePort, ShortcutPort,
    DEFAULT_CAPTURE_SHORTCUT,
};
pub use error::{CaptureError, CaptureIpcError};
pub use model::{
    CapabilityState, CaptureCapabilities, CaptureRequest, CaptureTrigger, PlatformKind,
};
pub(crate) use window::TauriCaptureWindow;
