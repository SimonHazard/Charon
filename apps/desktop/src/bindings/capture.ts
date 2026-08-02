// Generated from Rust by `bun run bindings:generate`. Do not edit.

export type CapabilityState = 'available' | 'denied' | 'unsupported' | 'error';

export type PlatformKind = 'macos' | 'linuxX11' | 'linuxWayland' | 'windows' | 'unknown';

export type CaptureCapabilities = {
  platform: PlatformKind;
  standardShortcut: CapabilityState;
  doubleShift: CapabilityState;
  selectedText: CapabilityState;
  activeShortcut: string;
};

export type CaptureTrigger = 'standardShortcut' | 'doubleShift' | 'inApp';

export type CaptureRequest = {
  requestId: number;
  trigger: CaptureTrigger;
  prefill: string;
  capabilities: CaptureCapabilities;
};

export type CaptureIpcError = { code: string; messageKey: string };
