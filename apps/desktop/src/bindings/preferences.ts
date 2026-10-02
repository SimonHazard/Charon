// Generated from Rust by `bun run bindings:generate`. Do not edit.

export type InstallKind = 'appimage' | 'deb' | 'rpm' | 'nsis' | 'msi' | 'macos' | 'unknown';

export type TrayAvailability = 'available' | 'unavailable';

export type PreferencesSnapshot = {
  schemaVersion: number;
  workspaceName: string | null;
  hasRememberedWorkspace: boolean;
  installKind: InstallKind;
  /**
   * The persisted background-mode choice.
   */
  backgroundMode: boolean;
  /**
   * Runtime only: whether this build can show the tray icon.
   */
  trayAvailability: TrayAvailability;
  /**
   * Runtime only: whether the tray icon exists, so closing hides Charon.
   */
  backgroundActive: boolean;
  /**
   * The persisted capture-notification choice (ADR 0024).
   */
  captureNotifications: boolean;
  /**
   * The persisted formatted-capture choice (ADR 0026).
   */
  richCapture: boolean;
};

export type NativeLabels = {
  trayOpen: string;
  trayQuit: string;
  trayTooltip: string;
  notificationTitle: string;
  notificationBody: string;
};

export type PreferencesIpcError = { code: string; messageKey: string };
