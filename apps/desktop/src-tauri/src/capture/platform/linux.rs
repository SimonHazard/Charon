use crate::capture::{
    CapabilityState, CaptureError, CapturePermissionKind, PlatformCapturePort, PlatformKind,
};

pub struct LinuxCaptureAdapter {
    platform: PlatformKind,
}

impl LinuxCaptureAdapter {
    pub fn new() -> Self {
        let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some()
            || std::env::var("XDG_SESSION_TYPE").is_ok_and(|value| value == "wayland");
        Self {
            platform: if wayland {
                PlatformKind::LinuxWayland
            } else {
                PlatformKind::LinuxX11
            },
        }
    }
}

impl PlatformCapturePort for LinuxCaptureAdapter {
    fn platform(&self) -> PlatformKind {
        self.platform
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

    fn selected_text(&mut self) -> Result<crate::capture::CapturedSelection, CaptureError> {
        Err(CaptureError::SelectionUnsupported)
    }

    fn reset_gesture(&mut self) {}

    fn shutdown(&mut self) {}
}
