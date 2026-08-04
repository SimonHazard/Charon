use super::{
    CapabilityState, CaptureAction, CaptureCapabilities, CaptureError, CapturePermissionKind,
    CaptureTrigger, CapturedSelection, PlatformKind,
};

pub const DEFAULT_CAPTURE_SHORTCUT: &str = "CmdOrCtrl+Shift+Space";
const DUPLICATE_TRIGGER_WINDOW_MS: u64 = 100;

pub trait ShortcutPort: Send {
    fn register(&mut self, shortcut: &str) -> Result<(), CaptureError>;
    fn unregister(&mut self, shortcut: &str) -> Result<(), CaptureError>;
}

pub trait PlatformCapturePort: Send {
    fn platform(&self) -> PlatformKind;
    fn input_monitoring_state(&self) -> CapabilityState;
    fn accessibility_state(&self) -> CapabilityState;
    fn start(&mut self) -> Result<(), CaptureError>;
    fn request_permission(&mut self, permission: CapturePermissionKind)
        -> Result<(), CaptureError>;
    fn selected_text(&mut self) -> Result<CapturedSelection, CaptureError>;
    fn reset_gesture(&mut self);
    fn shutdown(&mut self);
}

pub struct CaptureCoordinator {
    shortcut: Box<dyn ShortcutPort>,
    platform: Box<dyn PlatformCapturePort>,
    capabilities: CaptureCapabilities,
    initialized: bool,
    listener_started: bool,
    shutdown: bool,
    next_request_id: u32,
    last_trigger_at: Option<u64>,
}

impl CaptureCoordinator {
    pub fn new(shortcut: Box<dyn ShortcutPort>, platform: Box<dyn PlatformCapturePort>) -> Self {
        let capabilities = CaptureCapabilities {
            platform: platform.platform(),
            standard_shortcut: CapabilityState::Unsupported,
            input_monitoring: platform.input_monitoring_state(),
            accessibility: platform.accessibility_state(),
            double_shift: CapabilityState::Unsupported,
            selected_text: CapabilityState::Unsupported,
            active_shortcut: DEFAULT_CAPTURE_SHORTCUT.to_owned(),
        };
        Self {
            shortcut,
            platform,
            capabilities,
            initialized: false,
            listener_started: false,
            shutdown: false,
            next_request_id: 1,
            last_trigger_at: None,
        }
    }

    pub fn initialize(&mut self) {
        if self.initialized || self.shutdown {
            return;
        }
        self.initialized = true;
        self.capabilities.standard_shortcut =
            match self.shortcut.register(&self.capabilities.active_shortcut) {
                Ok(()) => CapabilityState::Available,
                Err(_) => CapabilityState::Error,
            };
        self.refresh_platform_states();
        self.start_listener_if_available();
    }

    pub fn capabilities(&self) -> CaptureCapabilities {
        self.capabilities.clone()
    }

    pub fn set_shortcut(&mut self, next: &str) -> Result<CaptureCapabilities, CaptureError> {
        self.ensure_active()?;
        let next = next.trim();
        if next.is_empty() || !next.contains('+') {
            return Err(CaptureError::InvalidShortcut);
        }
        if next == self.capabilities.active_shortcut {
            return Ok(self.capabilities());
        }

        let previous = self.capabilities.active_shortcut.clone();
        if self.capabilities.standard_shortcut == CapabilityState::Available {
            self.shortcut.unregister(&previous)?;
        }
        if let Err(error) = self.shortcut.register(next) {
            self.capabilities.standard_shortcut = match self.shortcut.register(&previous) {
                Ok(()) => CapabilityState::Available,
                Err(_) => CapabilityState::Error,
            };
            return Err(error);
        }

        self.capabilities.active_shortcut = next.to_owned();
        self.capabilities.standard_shortcut = CapabilityState::Available;
        self.platform.reset_gesture();
        Ok(self.capabilities())
    }

    pub fn refresh_capabilities(&mut self) -> Result<CaptureCapabilities, CaptureError> {
        self.ensure_active()?;
        self.refresh_platform_states();
        self.start_listener_if_available();
        Ok(self.capabilities())
    }

    pub fn request_permission(
        &mut self,
        permission: CapturePermissionKind,
    ) -> Result<CaptureCapabilities, CaptureError> {
        self.ensure_active()?;
        self.platform.request_permission(permission)?;
        self.refresh_platform_states();
        self.start_listener_if_available();
        Ok(self.capabilities())
    }

    pub fn trigger(
        &mut self,
        trigger: CaptureTrigger,
        timestamp_ms: u64,
    ) -> Result<Option<CaptureAction>, CaptureError> {
        self.ensure_active()?;
        if trigger == CaptureTrigger::StandardShortcut {
            self.platform.reset_gesture();
        }
        if matches!(
            trigger,
            CaptureTrigger::DoubleShiftCapture | CaptureTrigger::CommandDoubleShift
        ) && self.capabilities.double_shift != CapabilityState::Available
        {
            return Ok(None);
        }
        if self.last_trigger_at.is_some_and(|last| timestamp_ms < last) {
            self.last_trigger_at = None;
        }
        if self
            .last_trigger_at
            .is_some_and(|last| timestamp_ms.saturating_sub(last) <= DUPLICATE_TRIGGER_WINDOW_MS)
        {
            self.last_trigger_at = Some(timestamp_ms);
            return Ok(None);
        }
        self.last_trigger_at = Some(timestamp_ms);

        match trigger {
            CaptureTrigger::DoubleShiftCapture => self.capture_selection(),
            CaptureTrigger::StandardShortcut
            | CaptureTrigger::CommandDoubleShift
            | CaptureTrigger::InApp => Ok(Some(CaptureAction::OpenEditor {
                request_id: self.take_request_id(),
            })),
        }
    }

    pub fn shutdown(&mut self) {
        if self.shutdown {
            return;
        }
        self.shutdown = true;
        if self.capabilities.standard_shortcut == CapabilityState::Available {
            let _ = self.shortcut.unregister(&self.capabilities.active_shortcut);
        }
        self.platform.shutdown();
        self.capabilities.standard_shortcut = CapabilityState::Unsupported;
    }

    fn capture_selection(&mut self) -> Result<Option<CaptureAction>, CaptureError> {
        if self.capabilities.selected_text != CapabilityState::Available {
            return Ok(None);
        }
        match self.platform.selected_text() {
            Ok(CapturedSelection {
                body: Some(body),
                warning,
            }) if !body.trim().is_empty() => Ok(Some(CaptureAction::CreateNote { body, warning })),
            Ok(CapturedSelection {
                warning: Some(warning),
                ..
            }) => Ok(Some(CaptureAction::ShowWarning { warning })),
            Ok(_) => Ok(None),
            Err(CaptureError::PermissionDenied) => {
                self.capabilities.selected_text = CapabilityState::Denied;
                self.capabilities.accessibility = CapabilityState::Denied;
                Ok(None)
            }
            Err(_) => {
                self.capabilities.selected_text = CapabilityState::Error;
                Ok(None)
            }
        }
    }

    fn take_request_id(&mut self) -> u32 {
        let request_id = self.next_request_id;
        self.next_request_id = self.next_request_id.wrapping_add(1).max(1);
        request_id
    }

    fn refresh_platform_states(&mut self) {
        self.capabilities.input_monitoring = self.platform.input_monitoring_state();
        self.capabilities.accessibility = self.platform.accessibility_state();
        self.capabilities.double_shift = self.capabilities.input_monitoring;
        self.capabilities.selected_text = self.capabilities.accessibility;
    }

    fn start_listener_if_available(&mut self) {
        if self.listener_started || self.capabilities.double_shift != CapabilityState::Available {
            return;
        }
        match self.platform.start() {
            Ok(()) => self.listener_started = true,
            Err(_) => self.capabilities.double_shift = CapabilityState::Error,
        }
    }

    fn ensure_active(&self) -> Result<(), CaptureError> {
        if self.shutdown {
            Err(CaptureError::Shutdown)
        } else {
            Ok(())
        }
    }
}

impl Drop for CaptureCoordinator {
    fn drop(&mut self) {
        self.shutdown();
    }
}
