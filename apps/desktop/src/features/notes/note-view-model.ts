import type { NoteDto, SectionDto, WorkspaceSnapshot } from '@/bindings/workspace';

export type NoteViewModel = NoteDto & {
  sectionName: string;
  title: string;
};

export type SectionCounts = {
  open: number;
  done: number;
  trash: number;
};

export function compareSections(a: SectionDto, b: SectionDto): number {
  return a.sortKey - b.sortKey || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

export function compareNotes(a: NoteViewModel, b: NoteViewModel): number {
  return (
    a.sortKey - b.sortKey || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  );
}

export function orderedSections(snapshot: WorkspaceSnapshot): SectionDto[] {
  return [...snapshot.sections].sort(compareSections);
}

export function sectionCounts(snapshot: WorkspaceSnapshot): Map<string, SectionCounts> {
  const counts = new Map(
    snapshot.sections.map((section) => [section.id, { open: 0, done: 0, trash: 0 }]),
  );
  for (const note of snapshot.notes) {
    const count = counts.get(note.sectionId);
    if (!count) continue;
    if (note.trashedAt) count.trash += 1;
    else count[note.status] += 1;
  }
  return counts;
}

export function globalCounts(snapshot: WorkspaceSnapshot): SectionCounts {
  const counts = { open: 0, done: 0, trash: 0 };
  for (const note of snapshot.notes) {
    if (note.trashedAt) counts.trash += 1;
    else counts[note.status] += 1;
  }
  return counts;
}
