// Generated from Rust by `bun run bindings:generate`. Do not edit.

export type CapabilityState = 'available' | 'experimental' | 'denied' | 'unsupported' | 'error';

export type PlatformKind = 'macos' | 'linuxX11' | 'linuxWayland' | 'windows' | 'unknown';

export type CapturePermissionKind = 'inputMonitoring' | 'accessibility';

export type CaptureCapabilities = {
  platform: PlatformKind;
  standardShortcut: CapabilityState;
  inputMonitoring: CapabilityState;
  accessibility: CapabilityState;
  doubleShift: CapabilityState;
  selectedText: CapabilityState;
  activeShortcut: string;
};

export type CaptureComposerRequest = { requestId: number };

export type CaptureStatusEvent = { messageKey: string };

export type CaptureIpcError = { code: string; messageKey: string };
