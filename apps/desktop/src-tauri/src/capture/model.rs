use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum CapabilityState {
    Available,
    Denied,
    Unsupported,
    Error,
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

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CaptureCapabilities {
    pub platform: PlatformKind,
    pub standard_shortcut: CapabilityState,
    pub double_shift: CapabilityState,
    pub selected_text: CapabilityState,
    pub active_shortcut: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub enum CaptureTrigger {
    StandardShortcut,
    DoubleShift,
    InApp,
}

#[derive(Clone, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct CaptureRequest {
    pub request_id: u32,
    pub trigger: CaptureTrigger,
    pub prefill: String,
    pub capabilities: CaptureCapabilities,
}
