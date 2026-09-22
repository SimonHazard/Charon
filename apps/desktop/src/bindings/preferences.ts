// Generated from Rust by `bun run bindings:generate`. Do not edit.

export type InstallKind = 'appimage' | 'deb' | 'rpm' | 'nsis' | 'msi' | 'macos' | 'unknown';

export type PreferencesSnapshot = {
  schemaVersion: number;
  workspaceName: string | null;
  hasRememberedWorkspace: boolean;
  installKind: InstallKind;
};

export type PreferencesIpcError = { code: string; messageKey: string };
