use crate::capture::{
    CapabilityState, CaptureError, CapturePermissionKind, PlatformCapturePort, PlatformKind,
};

pub struct WindowsCaptureAdapter;

impl PlatformCapturePort for WindowsCaptureAdapter {
    fn platform(&self) -> PlatformKind {
        PlatformKind::Windows
    }

    fn input_monitoring_state(&self) -> CapabilityState {
        CapabilityState::Unsupported
    }

    fn accessibility_state(&self) -> CapabilityState {
        CapabilityState::Unsupported
    }

    fn start(&mut self) -> Result<(), CaptureError> {
        Err(CaptureError::ListenerUnavailable)
    }

    fn request_permission(
        &mut self,
        _permission: CapturePermissionKind,
    ) -> Result<(), CaptureError> {
        Ok(())
    }

    fn selected_text(&mut self) -> Result<Option<String>, CaptureError> {
        Err(CaptureError::SelectionUnsupported)
    }

    fn reset_gesture(&mut self) {}

    fn shutdown(&mut self) {}
}
