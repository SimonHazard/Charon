import type { WorkspaceSnapshot } from '@/bindings/workspace';
import type { NoteViewModel } from '@/features/notes/note-view-model';

export type NoteFilter = {
  query: string;
  sectionId: string | null;
  status: 'all' | 'open' | 'done';
  trash: boolean;
};

const whitespace = /\s+/gu;

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(whitespace, ' ').trim();
}

export function filterNotes(notes: readonly NoteViewModel[], filter: NoteFilter): NoteViewModel[] {
  const tokens = normalizeSearchText(filter.query).split(' ').filter(Boolean);
  return notes.filter((note) => {
    if (filter.trash !== Boolean(note.trashedAt)) return false;
    if (filter.sectionId && note.sectionId !== filter.sectionId) return false;
    if (filter.status !== 'all' && note.status !== filter.status) return false;
    if (tokens.length === 0) return true;
    const haystack = normalizeSearchText(`${note.sectionName} ${note.body}`);
    return tokens.every((token) => haystack.includes(token));
  });
}

export function createSearchIndex(snapshot: WorkspaceSnapshot): NoteViewModel[] {
  const sections = new Map(snapshot.sections.map((section) => [section.id, section.name]));
  return snapshot.notes.map((note) => ({
    ...note,
    sectionName: sections.get(note.sectionId) ?? '',
    title:
      note.body
        .split(/\r?\n/u)
        .find((line) => line.trim())
        ?.replace(/^#{1,6}\s*/u, '') ?? '',
  }));
}
