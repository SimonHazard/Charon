// Generated from Rust by `bun run bindings:generate`. Do not edit.

export type PreferencesSnapshot = {
  schemaVersion: number;
  workspaceName: string | null;
  hasRememberedWorkspace: boolean;
};

export type PreferencesIpcError = { code: string; messageKey: string };
