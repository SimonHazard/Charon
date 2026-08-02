use crate::capture::{CapabilityState, CaptureError, PlatformCapturePort, PlatformKind};

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
