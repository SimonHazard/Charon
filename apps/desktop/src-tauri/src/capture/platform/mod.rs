use std::sync::Arc;

use super::{PlatformCapturePort, PlatformKind};
use crate::capture::gesture::CaptureGestureIntent;

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "windows")]
mod windows;

pub type DoubleShiftCallback = Arc<dyn Fn(CaptureGestureIntent) + Send + Sync + 'static>;

pub fn create(callback: DoubleShiftCallback) -> Box<dyn PlatformCapturePort> {
    #[cfg(target_os = "macos")]
    {
        Box::new(macos::MacosCaptureAdapter::new(callback))
    }
    #[cfg(target_os = "linux")]
    {
        let _ = callback;
        Box::new(linux::LinuxCaptureAdapter::new())
    }
    #[cfg(target_os = "windows")]
    {
        let _ = callback;
        Box::new(windows::WindowsCaptureAdapter)
    }
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        let _ = callback;
        Box::new(UnsupportedCaptureAdapter)
    }
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
struct UnsupportedCaptureAdapter;

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
impl PlatformCapturePort for UnsupportedCaptureAdapter {
    fn platform(&self) -> PlatformKind {
        PlatformKind::Unknown
    }
    fn input_monitoring_state(&self) -> super::CapabilityState {
        super::CapabilityState::Unsupported
    }
    fn accessibility_state(&self) -> super::CapabilityState {
        super::CapabilityState::Unsupported
    }
    fn start(&mut self) -> Result<(), super::CaptureError> {
        Err(super::CaptureError::ListenerUnavailable)
    }
    fn request_permission(
        &mut self,
        _permission: super::CapturePermissionKind,
    ) -> Result<(), super::CaptureError> {
        Ok(())
    }
    fn selected_text(&mut self) -> Result<super::CapturedSelection, super::CaptureError> {
        Err(super::CaptureError::SelectionUnsupported)
    }
    fn reset_gesture(&mut self) {}
    fn shutdown(&mut self) {}
}

#[allow(dead_code)]
fn _platform_kind_contract(kind: PlatformKind) -> PlatformKind {
    kind
}
