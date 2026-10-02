use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum CapabilityState {
    Available,
    Experimental,
    Denied,
    Unsupported,
    Error,
}

impl CapabilityState {
    pub fn usable(self) -> bool {
        matches!(self, Self::Available | Self::Experimental)
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum PlatformKind {
    Macos,
    LinuxX11,
    LinuxWayland,
    Windows,
    Unknown,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum CapturePermissionKind {
    InputMonitoring,
    Accessibility,
}

/// Where the active reveal-and-focus-composer accelerator comes from (ADR 0025).
#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum ShortcutOrigin {
    /// The platform default; the user never chose another one.
    Default,
    /// The user's chosen accelerator, registered and stored.
    Custom,
    /// A stored choice failed validation or registration at launch, so the
    /// default is active instead.
    DefaultAfterFailure,
    /// The Wayland portal assigns the trigger; Charon cannot change it.
    Desktop,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CaptureCapabilities {
    pub platform: PlatformKind,
    pub standard_shortcut: CapabilityState,
    pub input_monitoring: CapabilityState,
    pub accessibility: CapabilityState,
    pub double_shift: CapabilityState,
    pub selected_text: CapabilityState,
    pub active_shortcut: String,
    /// The platform default that Reset restores.
    pub default_shortcut: String,
    pub shortcut_origin: ShortcutOrigin,
    /// Whether Preferences may offer to change the accelerator.
    pub shortcut_configurable: bool,
    /// Whether the opt-in formatted capture exists here (ADR 0026):
    /// `experimental` on macOS, `unsupported` elsewhere.
    pub rich_capture: CapabilityState,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CaptureTrigger {
    StandardShortcut,
    DoubleShiftCapture,
    InApp,
}

#[derive(Clone, Eq, PartialEq)]
pub enum CaptureAction {
    CreateNote {
        body: String,
        warning: Option<CaptureWarning>,
    },
    FocusComposer {
        request_id: u32,
    },
    ShowWarning {
        warning: CaptureWarning,
    },
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CaptureWarning {
    ClipboardNotRestored,
}

impl CaptureWarning {
    pub const fn message_key(self) -> &'static str {
        match self {
            Self::ClipboardNotRestored => "capture_warning_clipboard_not_restored",
        }
    }
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct CapturedSelection {
    pub body: Option<String>,
    pub warning: Option<CaptureWarning>,
}

impl CapturedSelection {
    pub fn from_body(body: String) -> Self {
        Self {
            body: Some(body),
            warning: None,
        }
    }
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CaptureComposerRequest {
    pub request_id: u32,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CaptureStatusEvent {
    pub message_key: String,
    /// The random id of the Note a successful capture created; never content.
    pub note_id: Option<String>,
}
