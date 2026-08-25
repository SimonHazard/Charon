import type {
  NoteDto,
  WorkspaceChangedEvent,
  WorkspaceCommand,
  WorkspaceCommandResult,
  WorkspaceSnapshot,
} from '@/bindings/workspace';
import type { WorkspaceClient } from '@/lib/ipc/workspace-client';

export function note(overrides: Partial<NoteDto> & Pick<NoteDto, 'id' | 'body'>): NoteDto {
  return {
    id: overrides.id,
    body: overrides.body,
    status: overrides.status ?? 'open',
    createdAt: overrides.createdAt ?? '2026-08-05T10:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-08-05T10:00:00.000Z',
    completedAt: overrides.completedAt ?? null,
    tags: overrides.tags ?? [],
    attachments: overrides.attachments ?? [],
  };
}

export function snapshot(notes: NoteDto[] = []): WorkspaceSnapshot {
  return {
    schemaVersion: 2,
    workspaceId: '00000000-0000-4000-8000-000000000001',
    revision: 1,
    notes,
    legacyArchiveCreated: false,
  };
}

export function workspaceClient(
  initial: WorkspaceSnapshot,
  onCommand?: (command: WorkspaceCommand) => void | Promise<void>,
): WorkspaceClient & { emit(event: WorkspaceChangedEvent): void } {
  let current = initial;
  let listener: ((event: WorkspaceChangedEvent) => void) | undefined;
  return {
    snapshot: async () => current,
    subscribe: async (nextListener) => {
      listener = nextListener;
      return () => {
        if (listener === nextListener) listener = undefined;
      };
    },
    emit: (event) => listener?.(event),
    execute: async (command): Promise<WorkspaceCommandResult> => {
      await onCommand?.(command);
      const nextRevision = current.revision + 1;
      let notes = current.notes;
      switch (command.type) {
        case 'createNote':
          notes = [note({ id: `created-${nextRevision}`, body: command.body }), ...notes];
          break;
        case 'updateNote':
          notes = notes.map((item) =>
            item.id === command.noteId ? { ...item, body: command.body } : item,
          );
          break;
        case 'setNoteTags':
          notes = notes.map((item) =>
            item.id === command.noteId ? { ...item, tags: command.tags } : item,
          );
          break;
        case 'setNoteStatus':
          notes = notes.map((item) =>
            command.noteId === item.id ? { ...item, status: command.status } : item,
          );
          break;
        case 'deleteNote':
          notes = notes.filter((item) => command.noteId !== item.id);
          break;
        case 'importNoteAttachments':
        case 'deleteNoteAttachments':
          break;
      }
      current = { ...current, revision: nextRevision, notes };
      return { snapshot: current, transactionId: `transaction-${nextRevision}` };
    },
  };
}
