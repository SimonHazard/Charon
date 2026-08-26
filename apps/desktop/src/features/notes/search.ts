import type { NoteDto } from '@/bindings/workspace';

export type NoteFilter = {
  query: string;
  tag: string | null;
};

const whitespace = /\s+/gu;

function foldSearchText(value: string): string {
  // Charon supports English and French. Their case rules match Unicode's
  // locale-independent lowercase, while NFKD both decomposes accents for the
  // fold and normalizes compatibility forms such as full-width CJK text.
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
}

export function normalizeSearchText(value: string): string {
  return foldSearchText(value).replace(whitespace, ' ').trim();
}

type IndexEntry = {
  note: NoteDto;
  haystack: string | null;
  tagKeys: readonly string[];
};

export type NoteIndex = {
  filter(notes: readonly NoteDto[], filter: NoteFilter): readonly NoteDto[];
  tags(notes: readonly NoteDto[]): readonly string[];
};

/**
 * Query tokens never contain whitespace, so collapsing runs of it inside the
 * haystack cannot change a match — and it costs ~11 ms per 20k Notes.
 */
function haystackOf(entry: IndexEntry): string {
  if (entry.haystack === null) {
    let raw = entry.note.body;
    for (const tag of entry.note.tags) raw += ` ${tag}`;
    for (const attachment of entry.note.attachments) raw += ` ${attachment.fileName}`;
    entry.haystack = foldSearchText(raw);
  }
  return entry.haystack;
}

/**
 * Normalizing every body on every call costs ~25 ms at 20k Notes, and the
 * Workspace hands us a new array on each autosave. Entries are keyed by Note
 * object identity, so a reused object keeps its normalized text and a changed
 * one cannot serve stale results.
 */
export function createNoteIndex(): NoteIndex {
  let entries = new Map<string, IndexEntry>();
  let syncedNotes: readonly NoteDto[] | null = null;
  let tagSource: readonly NoteDto[] | null = null;
  let tagList: readonly string[] = [];
  const sync = (notes: readonly NoteDto[]) => {
    if (syncedNotes === notes) return;
    const next = new Map<string, IndexEntry>();
    for (const note of notes) {
      const cached = entries.get(note.id);
      next.set(
        note.id,
        cached?.note === note
          ? cached
          : {
              note,
              haystack: null,
              tagKeys: note.tags.map(normalizeSearchText),
            },
      );
    }
    entries = next;
    syncedNotes = notes;
  };

  return {
    filter(notes, filter) {
      sync(notes);
      const tokens = normalizeSearchText(filter.query).split(' ').filter(Boolean);
      const exactTag = filter.tag ? normalizeSearchText(filter.tag) : null;
      if (!tokens.length && !exactTag) return notes;
      return notes.filter((note) => {
        const entry = entries.get(note.id);
        if (!entry) return false;
        if (exactTag && !entry.tagKeys.includes(exactTag)) return false;
        if (!tokens.length) return true;
        const haystack = haystackOf(entry);
        return tokens.every((token) => haystack.includes(token));
      });
    },

    tags(notes) {
      sync(notes);
      if (tagSource === notes) return tagList;
      const values = new Map<string, string>();
      for (const note of notes) {
        const entry = entries.get(note.id);
        if (!entry) continue;
        note.tags.forEach((tag, index) => {
          const key = entry.tagKeys[index];
          if (key !== undefined && !values.has(key)) values.set(key, tag);
        });
      }
      const next = [...values.values()];
      const changed =
        next.length !== tagList.length || next.some((tag, index) => tag !== tagList[index]);
      if (changed) tagList = next;
      tagSource = notes;
      return tagList;
    },
  };
}

const sharedIndex = createNoteIndex();

export function filterNotes(notes: readonly NoteDto[], filter: NoteFilter): readonly NoteDto[] {
  return sharedIndex.filter(notes, filter);
}
