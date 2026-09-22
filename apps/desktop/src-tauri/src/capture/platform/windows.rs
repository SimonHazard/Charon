mod listener;
mod selection;

use super::{bounded::SelectionGate, DoubleShiftCallback};
use crate::capture::{
    gesture::DoubleShiftGesture, CapabilityState, CaptureError, CapturePermissionKind,
    CapturedSelection, PlatformCapturePort, PlatformKind,
};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};

pub struct WindowsCaptureAdapter {
    callback: DoubleShiftCallback,
    gesture: Arc<Mutex<DoubleShiftGesture>>,
    source: Arc<AtomicUsize>,
    listener: Option<listener::Listener>,
    selection: SelectionGate,
}
impl WindowsCaptureAdapter {
    pub fn new(callback: DoubleShiftCallback) -> Self {
        Self {
            callback,
            gesture: Arc::default(),
            source: Arc::default(),
            listener: None,
            selection: SelectionGate::default(),
        }
    }
}
impl PlatformCapturePort for WindowsCaptureAdapter {
    fn platform(&self) -> PlatformKind {
        PlatformKind::Windows
    }
    fn input_monitoring_state(&self) -> CapabilityState {
        if self
            .listener
            .as_ref()
            .is_some_and(|listener| !listener.alive())
        {
            CapabilityState::Error
        } else {
            CapabilityState::Experimental
        }
    }
    fn accessibility_state(&self) -> CapabilityState {
        CapabilityState::Experimental
    }
    fn start(&mut self) -> Result<(), CaptureError> {
        if self.listener.is_none() {
            self.listener = Some(listener::Listener::start(
                self.gesture.clone(),
                self.source.clone(),
                self.callback.clone(),
            )?);
        }
        Ok(())
    }
    fn request_permission(&mut self, _: CapturePermissionKind) -> Result<(), CaptureError> {
        Ok(())
    }
    fn selected_text(&mut self) -> Result<CapturedSelection, CaptureError> {
        let source = self.source.load(Ordering::Acquire);
        let body = self.selection.read(move || selection::read(source));
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
        self.listener.take();
        self.reset_gesture();
    }
}
