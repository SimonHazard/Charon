use crate::capture::{CapabilityState, CaptureError, PlatformCapturePort, PlatformKind};

pub struct WindowsCaptureAdapter;

impl PlatformCapturePort for WindowsCaptureAdapter {
    fn platform(&self) -> PlatformKind {
        PlatformKind::Windows
    }

    fn double_shift_state(&self) -> CapabilityState {
        CapabilityState::Unsupported
    }

    fn selected_text_state(&self) -> CapabilityState {
        CapabilityState::Unsupported
    }

    fn start(&mut self) -> Result<(), CaptureError> {
        Err(CaptureError::ListenerUnavailable)
    }

    fn request_permission(&mut self) -> Result<bool, CaptureError> {
        Ok(false)
    }

    fn selected_text(&mut self) -> Result<Option<String>, CaptureError> {
        Err(CaptureError::SelectionUnsupported)
    }

    fn reset_gesture(&mut self) {}

    fn shutdown(&mut self) {}
}
