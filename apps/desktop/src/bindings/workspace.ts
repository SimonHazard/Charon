// Generated from Rust by `bun run bindings:generate`. Do not edit.

export type NoteStatus = 'open' | 'done';

export type AttachmentDto = {
  id: string;
  fileName: string;
  relativePath: string;
  createdAt: string;
};

export type NoteDto = {
  id: string;
  body: string;
  status: NoteStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  tags: Array<string>;
  attachments: Array<AttachmentDto>;
};

export type WorkspaceSnapshot = {
  schemaVersion: number;
  workspaceId: string;
  revision: number;
  notes: Array<NoteDto>;
  legacyArchiveCreated: boolean;
};

export type WorkspaceHealthIssueKind =
  | 'missing_note'
  | 'missing_attachment'
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
  | { type: 'createNote'; expectedRevision: number; body: string }
  | { type: 'updateNote'; expectedRevision: number; noteId: string; body: string }
  | { type: 'setNoteTags'; expectedRevision: number; noteId: string; tags: Array<string> }
  | {
      type: 'importNoteAttachments';
      expectedRevision: number;
      noteId: string;
      sourcePaths: Array<string>;
    }
  | {
      type: 'deleteNoteAttachments';
      expectedRevision: number;
      noteId: string;
      attachmentIds: Array<string>;
    }
  | { type: 'setNoteStatus'; expectedRevision: number; noteIds: Array<string>; status: NoteStatus }
  | { type: 'deleteNotes'; expectedRevision: number; noteIds: Array<string> };

export type WorkspaceCommandResult = { snapshot: WorkspaceSnapshot; transactionId: string };

export type WorkspaceIpcError = {
  code: string;
  messageKey: string;
  expectedRevision: number | null;
  actualRevision: number | null;
  recoveryLocation: string | null;
};
