// Generated from Rust by `bun run bindings:generate`. Do not edit.

export type ComposeRequest = { expectedRevision: number; noteIds: Array<string> };

export type ComposedClipboard = {
  noteCount: number;
  tagCount: number;
  attachmentCount: number;
  byteCount: number;
};

export type ClipboardIpcError = { code: string; messageKey: string };
