// Generated from Rust by `bun run bindings:generate`. Do not edit.

export type CopyPreset = 'plain' | 'bulleted' | 'numbered' | 'task-list' | 'sectioned';

export type ComposeNote = {
  id: string;
  sectionName: string;
  body: string;
  /**
   * Zero-based order in the ephemeral Selection.
   */
  selectionOrder: number;
};

export type ComposeOptions = { previewCharacterLimit: number };

export type ComposeRequest = {
  notes: Array<ComposeNote>;
  preset: CopyPreset;
  options: ComposeOptions;
};

export type ComposedClipboard = {
  markdown: string;
  noteCount: number;
  omittedEmptyCount: number;
  preview: string;
};

export type ClipboardIpcError = { code: string; messageKey: string };
