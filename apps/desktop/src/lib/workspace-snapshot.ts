import type { AttachmentDto, NoteDto, WorkspaceSnapshot } from '@/bindings/workspace';

function sameAttachments(
  previous: readonly AttachmentDto[],
  next: readonly AttachmentDto[],
): boolean {
  if (previous.length !== next.length) return false;
  return previous.every((attachment, index) => {
    const candidate = next[index];
    return (
      candidate !== undefined &&
      attachment.id === candidate.id &&
      attachment.fileName === candidate.fileName &&
      attachment.relativePath === candidate.relativePath &&
      attachment.createdAt === candidate.createdAt
    );
  });
}

export function sameNote(previous: NoteDto, next: NoteDto): boolean {
  return (
    previous.id === next.id &&
    previous.status === next.status &&
    previous.createdAt === next.createdAt &&
    previous.updatedAt === next.updatedAt &&
    previous.completedAt === next.completedAt &&
    previous.body === next.body &&
    previous.tags.length === next.tags.length &&
    previous.tags.every((tag, index) => tag === next.tags[index]) &&
    sameAttachments(previous.attachments, next.attachments)
  );
}

/**
 * Every command answers with a freshly deserialized Workspace, so a one-Note
 * edit hands React 20k new objects. Reusing the objects that did not change
 * lets `memo(NoteRow)` and the search index skip the rows nobody touched.
 */
export function reconcileSnapshot(
  previous: WorkspaceSnapshot | null,
  next: WorkspaceSnapshot,
): WorkspaceSnapshot {
  if (!previous || previous === next) return next;
  const known = new Map(previous.notes.map((note) => [note.id, note]));
  let reused = 0;
  const notes = next.notes.map((note) => {
    const candidate = known.get(note.id);
    if (!candidate || !sameNote(candidate, note)) return note;
    reused += 1;
    return candidate;
  });
  const unchanged = reused === notes.length && notes.length === previous.notes.length;
  const ordered = unchanged && notes.every((note, index) => note === previous.notes[index]);
  return { ...next, notes: ordered ? previous.notes : notes };
}
