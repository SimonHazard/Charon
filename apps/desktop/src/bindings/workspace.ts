// Generated from Rust by `bun run bindings:generate`. Do not edit.

export type NoteStatus = 'open' | 'done';

export type SectionDto = {
  id: string;
  name: string;
  sortKey: number;
  createdAt: string;
  updatedAt: string;
};

export type NoteDto = {
  id: string;
  sectionId: string;
  body: string;
  status: NoteStatus;
  sortKey: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  trashedAt: string | null;
};

export type WorkspaceSnapshot = {
  schemaVersion: number;
  workspaceId: string;
  revision: number;
  sections: Array<SectionDto>;
  notes: Array<NoteDto>;
};

export type WorkspaceHealthIssueKind =
  | 'missing_note'
  | 'invalid_note'
  | 'invalid_manifest'
  | 'import_candidate'
  | 'recovery_required';

export type WorkspaceHealthIssue = {
  kind: WorkspaceHealthIssueKind;
  resourceId: string | null;
  messageKey: string;
};

export type WorkspaceHealth = { isHealthy: boolean; issues: Array<WorkspaceHealthIssue> };

export type WorkspaceChangedEvent = { revision: number; snapshot: WorkspaceSnapshot };

export type WorkspaceCommand =
  | { type: 'createSection'; expectedRevision: number; name: string; sortKey: number }
  | { type: 'renameSection'; expectedRevision: number; sectionId: string; name: string }
  | { type: 'reorderSection'; expectedRevision: number; sectionId: string; sortKey: number }
  | { type: 'deleteSection'; expectedRevision: number; sectionId: string }
  | {
      type: 'createNote';
      expectedRevision: number;
      sectionId: string;
      body: string;
      sortKey: number;
    }
  | { type: 'updateNote'; expectedRevision: number; noteId: string; body: string }
  | {
      type: 'moveNote';
      expectedRevision: number;
      noteId: string;
      sectionId: string;
      sortKey: number;
    }
  | { type: 'reorderNote'; expectedRevision: number; noteId: string; sortKey: number }
  | { type: 'setNoteStatus'; expectedRevision: number; noteId: string; status: NoteStatus }
  | { type: 'trashNote'; expectedRevision: number; noteId: string }
  | { type: 'restoreNote'; expectedRevision: number; noteId: string }
  | { type: 'permanentlyDeleteNote'; expectedRevision: number; noteId: string }
  | {
      type: 'mergeNotes';
      expectedRevision: number;
      noteIds: Array<string>;
      destinationSectionId: string;
      sortKey: number;
    }
  | { type: 'batchSetStatus'; expectedRevision: number; noteIds: Array<string>; status: NoteStatus }
  | { type: 'batchTrash'; expectedRevision: number; noteIds: Array<string> }
  | { type: 'batchRestore'; expectedRevision: number; noteIds: Array<string> }
  | {
      type: 'batchMove';
      expectedRevision: number;
      noteIds: Array<string>;
      destinationSectionId: string;
    }
  | { type: 'undo'; expectedRevision: number; transactionId: string };

export type WorkspaceCommandResult = {
  snapshot: WorkspaceSnapshot;
  transactionId: string;
  undoToken: string | null;
};

export type WorkspaceIpcError = {
  code: string;
  messageKey: string;
  expectedRevision: number | null;
  actualRevision: number | null;
  recoveryLocation: string | null;
};
