use super::{
    CapabilityState, CaptureCapabilities, CaptureError, CaptureRequest, CaptureTrigger,
    PlatformKind,
};

pub const DEFAULT_CAPTURE_SHORTCUT: &str = "CmdOrCtrl+Shift+Space";
const DUPLICATE_TRIGGER_WINDOW_MS: u64 = 100;

pub trait ShortcutPort: Send {
    fn register(&mut self, shortcut: &str) -> Result<(), CaptureError>;
    fn unregister(&mut self, shortcut: &str) -> Result<(), CaptureError>;
}

pub trait PlatformCapturePort: Send {
    fn platform(&self) -> PlatformKind;
    fn double_shift_state(&self) -> CapabilityState;
    fn selected_text_state(&self) -> CapabilityState;
    fn start(&mut self) -> Result<(), CaptureError>;
    fn request_permission(&mut self) -> Result<bool, CaptureError>;
    fn selected_text(&mut self) -> Result<Option<String>, CaptureError>;
    fn remember_focus_owner(&mut self) {}
    fn restore_focus_owner(&mut self) {}
    fn reset_gesture(&mut self);
    fn shutdown(&mut self);
}

pub trait CaptureWindowPort: Send {
    fn open(&mut self, request: &CaptureRequest) -> Result<(), CaptureError>;
    fn focus(&mut self) -> Result<(), CaptureError>;
    fn hide(&mut self) -> Result<(), CaptureError>;
    fn shutdown(&mut self);
}

pub struct CaptureCoordinator {
    shortcut: Box<dyn ShortcutPort>,
    platform: Box<dyn PlatformCapturePort>,
    window: Box<dyn CaptureWindowPort>,
    capabilities: CaptureCapabilities,
    initialized: bool,
    shutdown: bool,
    next_request_id: u32,
    last_trigger_at: Option<u64>,
}

impl CaptureCoordinator {
    pub fn new(
        shortcut: Box<dyn ShortcutPort>,
        platform: Box<dyn PlatformCapturePort>,
        window: Box<dyn CaptureWindowPort>,
    ) -> Self {
        let capabilities = CaptureCapabilities {
            platform: platform.platform(),
            standard_shortcut: CapabilityState::Unsupported,
            double_shift: platform.double_shift_state(),
            selected_text: platform.selected_text_state(),
            active_shortcut: DEFAULT_CAPTURE_SHORTCUT.to_owned(),
        };
        Self {
            shortcut,
            platform,
            window,
            capabilities,
            initialized: false,
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
        if self.capabilities.double_shift == CapabilityState::Available
            && self.platform.start().is_err()
        {
            self.capabilities.double_shift = CapabilityState::Error;
        }
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

    pub fn request_permission(&mut self) -> Result<CaptureCapabilities, CaptureError> {
        self.ensure_active()?;
        let granted = self.platform.request_permission()?;
        self.refresh_platform_states();
        if granted
            && self.capabilities.double_shift == CapabilityState::Available
            && self.platform.start().is_err()
        {
            self.capabilities.double_shift = CapabilityState::Error;
        }
        Ok(self.capabilities())
    }

    pub fn trigger(
        &mut self,
        trigger: CaptureTrigger,
        timestamp_ms: u64,
    ) -> Result<Option<CaptureRequest>, CaptureError> {
        self.ensure_active()?;
        if trigger == CaptureTrigger::StandardShortcut {
            self.platform.reset_gesture();
        }
        if self
            .last_trigger_at
            .is_some_and(|last| timestamp_ms.saturating_sub(last) <= DUPLICATE_TRIGGER_WINDOW_MS)
        {
            self.last_trigger_at = Some(timestamp_ms);
            self.window.focus()?;
            return Ok(None);
        }
        self.last_trigger_at = Some(timestamp_ms);
        self.platform.remember_focus_owner();

        let prefill = if self.capabilities.selected_text == CapabilityState::Available {
            match self.platform.selected_text() {
                Ok(Some(text)) => text,
                Ok(None) => String::new(),
                Err(CaptureError::PermissionDenied) => {
                    self.capabilities.selected_text = CapabilityState::Denied;
                    self.capabilities.double_shift = CapabilityState::Denied;
                    String::new()
                }
                Err(_) => {
                    self.capabilities.selected_text = CapabilityState::Error;
                    String::new()
                }
            }
        } else {
            String::new()
        };

        let request = CaptureRequest {
            request_id: self.next_request_id,
            trigger,
            prefill,
            capabilities: self.capabilities(),
        };
        self.next_request_id = self.next_request_id.wrapping_add(1).max(1);
        self.window.open(&request)?;
        Ok(Some(request))
    }

    pub fn hide(&mut self) -> Result<(), CaptureError> {
        self.ensure_active()?;
        self.window.hide()?;
        self.platform.restore_focus_owner();
        Ok(())
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
        self.window.shutdown();
        self.capabilities.standard_shortcut = CapabilityState::Unsupported;
    }

    fn refresh_platform_states(&mut self) {
        self.capabilities.double_shift = self.platform.double_shift_state();
        self.capabilities.selected_text = self.platform.selected_text_state();
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
