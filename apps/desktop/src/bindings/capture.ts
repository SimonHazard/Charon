// Generated from Rust by `bun run bindings:generate`. Do not edit.

export type CapabilityState = 'available' | 'experimental' | 'denied' | 'unsupported' | 'error';

export type PlatformKind = 'macos' | 'linuxX11' | 'linuxWayland' | 'windows' | 'unknown';

export type CapturePermissionKind = 'inputMonitoring' | 'accessibility';

export type ShortcutOrigin = 'default' | 'custom' | 'defaultAfterFailure' | 'desktop';

export type CaptureCapabilities = {
  platform: PlatformKind;
  standardShortcut: CapabilityState;
  inputMonitoring: CapabilityState;
  accessibility: CapabilityState;
  doubleShift: CapabilityState;
  selectedText: CapabilityState;
  activeShortcut: string;
  /**
   * The platform default that Reset restores.
   */
  defaultShortcut: string;
  shortcutOrigin: ShortcutOrigin;
  /**
   * Whether Preferences may offer to change the accelerator.
   */
  shortcutConfigurable: boolean;
  /**
   * Whether the opt-in formatted capture exists here (ADR 0026):
   * `experimental` on macOS, `unsupported` elsewhere.
   */
  richCapture: CapabilityState;
};

export type CaptureComposerRequest = { requestId: number };

export type CaptureStatusEvent = {
  messageKey: string;
  /**
   * The random id of the Note a successful capture created; never content.
   */
  noteId: string | null;
};

export type CaptureIpcError = { code: string; messageKey: string };
