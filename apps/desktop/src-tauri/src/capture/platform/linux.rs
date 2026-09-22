mod atspi;
pub(crate) mod portal;
mod x11;

use super::{bounded::SelectionGate, DoubleShiftCallback};
use crate::capture::{
    gesture::DoubleShiftGesture, CapabilityState, CaptureError, CapturePermissionKind,
    CapturedSelection, PlatformCapturePort, PlatformKind,
};
use std::sync::{
    atomic::{AtomicBool, AtomicU32, Ordering},
    Arc, Mutex,
};

pub(crate) fn is_wayland() -> bool {
    std::env::var_os("WAYLAND_DISPLAY").is_some()
        || std::env::var("XDG_SESSION_TYPE").is_ok_and(|value| value == "wayland")
}

pub(super) fn local_session_bus() -> bool {
    std::env::var("DBUS_SESSION_BUS_ADDRESS")
        .map(|address| address.split(';').all(|part| part.starts_with("unix:")))
        .unwrap_or(true)
}

pub struct LinuxCaptureAdapter {
    platform: PlatformKind,
    callback: DoubleShiftCallback,
    gesture: Arc<Mutex<DoubleShiftGesture>>,
    source: Arc<AtomicU32>,
    running: Option<Arc<AtomicBool>>,
    focus: atspi::FocusTracker,
    selection: SelectionGate,
}
impl LinuxCaptureAdapter {
    pub fn new(callback: DoubleShiftCallback) -> Self {
        let platform = if is_wayland() {
            PlatformKind::LinuxWayland
        } else if x11::local_display() {
            PlatformKind::LinuxX11
        } else {
            PlatformKind::Unknown
        };
        Self {
            platform,
            callback,
            gesture: Arc::default(),
            source: Arc::default(),
            running: None,
            focus: atspi::FocusTracker::default(),
            selection: SelectionGate::default(),
        }
    }
}
impl PlatformCapturePort for LinuxCaptureAdapter {
    fn platform(&self) -> PlatformKind {
        self.platform
    }
    fn input_monitoring_state(&self) -> CapabilityState {
        if self.platform != PlatformKind::LinuxX11 {
            CapabilityState::Unsupported
        } else if self
            .running
            .as_ref()
            .is_some_and(|live| !live.load(Ordering::Acquire))
        {
            CapabilityState::Error
        } else {
            CapabilityState::Experimental
        }
    }
    fn accessibility_state(&self) -> CapabilityState {
        if self.focus.available() {
            CapabilityState::Experimental
        } else {
            CapabilityState::Unsupported
        }
    }
    fn selected_text_state(&self) -> CapabilityState {
        self.input_monitoring_state()
    }
    fn start(&mut self) -> Result<(), CaptureError> {
        if self.platform != PlatformKind::LinuxX11 {
            return Err(CaptureError::ListenerUnavailable);
        }
        if self.running.is_none() {
            self.running = Some(x11::listen(
                self.gesture.clone(),
                self.source.clone(),
                self.callback.clone(),
            )?);
            self.focus.start();
        }
        Ok(())
    }
    fn request_permission(&mut self, _: CapturePermissionKind) -> Result<(), CaptureError> {
        Ok(())
    }
    fn selected_text(&mut self) -> Result<CapturedSelection, CaptureError> {
        let source = self.source.load(Ordering::Acquire);
        let focus = self.focus.snapshot();
        let body = self.selection.read(move || x11::selection(source, focus));
        Ok(CapturedSelection {
            body,
            warning: None,
        })
    }
    fn reset_gesture(&mut self) {
        if let Ok(mut gesture) = self.gesture.lock() {
            gesture.reset();
        }
    }
    fn shutdown(&mut self) {
        if let Some(live) = self.running.take() {
            live.store(false, Ordering::Release);
        }
        self.focus.stop();
        self.reset_gesture();
    }
}
