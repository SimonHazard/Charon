import { isEditableTarget } from '@/app/commands/command-registry';
import type { ComposedClipboard, ComposeRequest, CopyPreset } from '@/bindings/clipboard';
import type { WorkspaceSnapshot } from '@/bindings/workspace';
import type { ClipboardClient } from '@/lib/ipc/clipboard-client';

export const COPY_PREVIEW_CHARACTER_LIMIT = 240;

export function buildComposeRequest(
  snapshot: WorkspaceSnapshot,
  orderedNoteIds: readonly string[],
  preset: CopyPreset,
): ComposeRequest {
  const notesById = new Map(snapshot.notes.map((note) => [note.id, note]));
  const sectionNames = new Map(snapshot.sections.map((section) => [section.id, section.name]));
  const notes = orderedNoteIds.map((id, selectionOrder) => {
    const note = notesById.get(id);
    const sectionName = note ? sectionNames.get(note.sectionId) : undefined;
    if (!note || !sectionName) {
      throw new Error('copy request references a missing Workspace value');
    }
    return {
      id: note.id,
      sectionName,
      body: note.body,
      selectionOrder,
    };
  });

  return {
    notes,
    preset,
    options: { previewCharacterLimit: COPY_PREVIEW_CHARACTER_LIMIT },
  };
}

export function copyNotes(
  client: ClipboardClient,
  snapshot: WorkspaceSnapshot,
  orderedNoteIds: readonly string[],
  preset: CopyPreset,
): Promise<ComposedClipboard> {
  return client.composeAndWrite(buildComposeRequest(snapshot, orderedNoteIds, preset));
}

export function previewNotes(
  client: ClipboardClient,
  snapshot: WorkspaceSnapshot,
  orderedNoteIds: readonly string[],
  preset: CopyPreset,
): Promise<ComposedClipboard> {
  return client.preview(buildComposeRequest(snapshot, orderedNoteIds, preset));
}

export function shouldPreserveNativeCopy(target: EventTarget | null): boolean {
  return isEditableTarget(target);
}

export function copySuccessDescription(
  result: Pick<ComposedClipboard, 'noteCount'>,
  presetName: string,
  messages: {
    one(input: { preset: string }): string;
    many(input: { count: number; preset: string }): string;
  },
): string {
  return result.noteCount === 1
    ? messages.one({ preset: presetName })
    : messages.many({ count: result.noteCount, preset: presetName });
}
