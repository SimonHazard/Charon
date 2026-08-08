import type { NoteDto, NoteStatus } from '@/bindings/workspace';

export type NoteFilter = {
  query: string;
  status: NoteStatus;
  tag: string | null;
};

const whitespace = /\s+/gu;

export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(whitespace, ' ').trim();
}

export function filterNotes(notes: readonly NoteDto[], filter: NoteFilter): NoteDto[] {
  const tokens = normalizeSearchText(filter.query).split(' ').filter(Boolean);
  const exactTag = filter.tag?.toLocaleLowerCase() ?? null;
  return notes.filter((note) => {
    if (note.status !== filter.status) return false;
    if (exactTag && !note.tags.some((tag) => tag.toLocaleLowerCase() === exactTag)) return false;
    if (!tokens.length) return true;
    const haystack = normalizeSearchText(
      [note.body, ...note.tags, ...note.attachments.map((attachment) => attachment.fileName)].join(
        ' ',
      ),
    );
    return tokens.every((token) => haystack.includes(token));
  });
}
