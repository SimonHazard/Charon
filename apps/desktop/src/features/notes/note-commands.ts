import type { WorkspaceCommandDraft } from '@/app/workspace-context';
import type { NoteDto, NoteStatus, SectionDto } from '@/bindings/workspace';

const SORT_STEP = 1024;

export function nextNoteSortKey(notes: readonly NoteDto[], sectionId: string): number {
  let maximum = -SORT_STEP;
  for (const note of notes) {
    if (note.sectionId === sectionId && note.sortKey > maximum) maximum = note.sortKey;
  }
  return maximum + SORT_STEP;
}

export function nextSectionSortKey(sections: readonly SectionDto[]): number {
  let maximum = -SORT_STEP;
  for (const section of sections) {
    if (section.sortKey > maximum) maximum = section.sortKey;
  }
  return maximum + SORT_STEP;
}

export function createNoteCommand(
  notes: readonly NoteDto[],
  sectionId: string,
  body = '',
): WorkspaceCommandDraft {
  return { type: 'createNote', sectionId, body, sortKey: nextNoteSortKey(notes, sectionId) };
}

export function updateNoteCommand(noteId: string, body: string): WorkspaceCommandDraft {
  return { type: 'updateNote', noteId, body };
}

export function setStatusCommand(
  noteIds: readonly string[],
  status: NoteStatus,
): WorkspaceCommandDraft {
  return noteIds.length === 1
    ? { type: 'setNoteStatus', noteId: noteIds[0] as string, status }
    : { type: 'batchSetStatus', noteIds: [...noteIds], status };
}

export function moveNotesCommand(
  noteIds: readonly string[],
  destinationSectionId: string,
  notes: readonly NoteDto[] = [],
): WorkspaceCommandDraft {
  if (noteIds.length === 1) {
    return {
      type: 'moveNote',
      noteId: noteIds[0] as string,
      sectionId: destinationSectionId,
      sortKey: nextNoteSortKey(notes, destinationSectionId),
    };
  }
  return { type: 'batchMove', noteIds: [...noteIds], destinationSectionId };
}

export function reorderNoteCommand(
  orderedNotes: readonly NoteDto[],
  noteId: string,
  direction: -1 | 1,
): WorkspaceCommandDraft | null {
  const index = orderedNotes.findIndex((note) => note.id === noteId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= orderedNotes.length) return null;
  const target = orderedNotes[targetIndex] as NoteDto;
  const beyond = orderedNotes[targetIndex + direction];
  const sortKey = beyond
    ? Math.trunc((target.sortKey + beyond.sortKey) / 2)
    : target.sortKey + direction * SORT_STEP;
  return { type: 'reorderNote', noteId, sortKey };
}

export function reorderSectionCommand(
  sections: readonly SectionDto[],
  sectionId: string,
  direction: -1 | 1,
): WorkspaceCommandDraft | null {
  const index = sections.findIndex((section) => section.id === sectionId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= sections.length) return null;
  const target = sections[targetIndex] as SectionDto;
  const beyond = sections[targetIndex + direction];
  const sortKey = beyond
    ? Math.trunc((target.sortKey + beyond.sortKey) / 2)
    : target.sortKey + direction * SORT_STEP;
  return { type: 'reorderSection', sectionId, sortKey };
}
