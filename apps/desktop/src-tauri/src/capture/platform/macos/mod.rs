mod accessibility;
mod listener;
mod pasteboard;
mod permissions;

use std::sync::{Arc, Mutex};

use crate::capture::gesture::DoubleShiftGesture;
use crate::capture::platform::DoubleShiftCallback;
use crate::capture::{
    CapabilityState, CaptureError, CapturePermissionKind, CapturedSelection, PlatformCapturePort,
    PlatformKind,
};

use self::accessibility::AxSelection;
use self::listener::MacosListener;

pub struct MacosCaptureAdapter {
    callback: DoubleShiftCallback,
    gesture: Arc<Mutex<DoubleShiftGesture>>,
    listener: Option<MacosListener>,
}

impl MacosCaptureAdapter {
    pub fn new(callback: DoubleShiftCallback) -> Self {
        Self {
            callback,
            gesture: Arc::new(Mutex::new(DoubleShiftGesture::default())),
            listener: None,
        }
    }
}

impl PlatformCapturePort for MacosCaptureAdapter {
    fn platform(&self) -> PlatformKind {
        PlatformKind::Macos
    }

    fn input_monitoring_state(&self) -> CapabilityState {
        if permissions::can_listen_to_input() {
            CapabilityState::Available
        } else {
            CapabilityState::Denied
        }
    }

    fn accessibility_state(&self) -> CapabilityState {
        if permissions::accessibility_trusted() {
            CapabilityState::Available
        } else {
            CapabilityState::Denied
        }
    }

    fn start(&mut self) -> Result<(), CaptureError> {
        if self.listener.is_some() {
            return Ok(());
        }
        if !permissions::can_listen_to_input() {
            return Err(CaptureError::PermissionDenied);
        }
        self.listener = Some(MacosListener::start(
            Arc::clone(&self.gesture),
            Arc::clone(&self.callback),
        )?);
        Ok(())
    }

    fn request_permission(
        &mut self,
        permission: CapturePermissionKind,
    ) -> Result<(), CaptureError> {
        permissions::request(permission);
        Ok(())
    }

    fn selected_text(&mut self) -> Result<CapturedSelection, CaptureError> {
        if !permissions::accessibility_trusted() {
            return Err(CaptureError::PermissionDenied);
        }

        let source_process = pasteboard::foreground_process_id();
        if source_process.is_some_and(|process| process == std::process::id() as i32) {
            return Ok(CapturedSelection::default());
        }

        acquire_hybrid(accessibility::copy_selected_text, || {
            source_process
                .map(pasteboard::capture_selection)
                .unwrap_or_default()
        })
    }

    fn reset_gesture(&mut self) {
        if let Ok(mut gesture) = self.gesture.lock() {
            gesture.reset();
        }
    }

    fn shutdown(&mut self) {
        if let Some(mut listener) = self.listener.take() {
            listener.stop();
        }
        self.reset_gesture();
    }
}

fn acquire_hybrid(
    direct: impl FnOnce() -> Result<AxSelection, CaptureError>,
    fallback: impl FnOnce() -> CapturedSelection,
) -> Result<CapturedSelection, CaptureError> {
    match direct()? {
        AxSelection::Text(body) => Ok(CapturedSelection::from_body(body)),
        AxSelection::Secure => Ok(CapturedSelection::default()),
        AxSelection::NoSelection => Ok(fallback()),
    }
}

#[cfg(test)]
mod tests {
    use super::{acquire_hybrid, AxSelection};
    use crate::capture::{CaptureError, CapturedSelection};
    use std::cell::Cell;

    #[test]
    fn hybrid_capture_is_ax_first_and_falls_back_only_for_no_selection() {
        for direct in [AxSelection::Text("direct".to_owned()), AxSelection::Secure] {
            let fallback_calls = Cell::new(0);
            let result = acquire_hybrid(
                || Ok(direct),
                || {
                    fallback_calls.set(fallback_calls.get() + 1);
                    CapturedSelection::from_body("fallback".to_owned())
                },
            )
            .expect("hybrid capture");
            assert_eq!(fallback_calls.get(), 0);
            assert_ne!(result.body.as_deref(), Some("fallback"));
        }

        let fallback_calls = Cell::new(0);
        let result = acquire_hybrid(
            || Ok(AxSelection::NoSelection),
            || {
                fallback_calls.set(fallback_calls.get() + 1);
                CapturedSelection::from_body("fallback".to_owned())
            },
        )
        .expect("fallback capture");
        assert_eq!(fallback_calls.get(), 1);
        assert_eq!(result.body.as_deref(), Some("fallback"));

        let fallback_calls = Cell::new(0);
        assert!(acquire_hybrid(
            || Err(CaptureError::SelectionFailed),
            || {
                fallback_calls.set(fallback_calls.get() + 1);
                CapturedSelection::default()
            },
        )
        .is_err());
        assert_eq!(fallback_calls.get(), 0);
    }
}
