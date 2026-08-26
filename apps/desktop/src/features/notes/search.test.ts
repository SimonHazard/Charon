import { describe, expect, it, vi } from 'vitest';

import { createNoteIndex, filterNotes } from '@/features/notes/search';
import { note } from '@/test/workspace-fixture';

const notes = [
  note({ id: 'body', body: 'Alpha body', tags: ['Agent'] }),
  note({ id: 'tag', body: 'Second', tags: ['Research'] }),
  note({
    id: 'file',
    body: 'Third',
    attachments: [
      {
        id: 'file-id',
        fileName: 'brief.pdf',
        relativePath: 'attachments/file/brief.pdf',
        createdAt: '2026-08-05T10:00:00.000Z',
      },
    ],
  }),
  note({ id: 'done', body: 'Alpha completed', status: 'done' }),
];

describe('flat note search', () => {
  it('searches body, tags, and attachment names across every status', () => {
    expect(filterNotes(notes, { query: 'alpha', tag: null }).map((item) => item.id)).toEqual([
      'body',
      'done',
    ]);
    expect(filterNotes(notes, { query: 'research', tag: null }).map((item) => item.id)).toEqual([
      'tag',
    ]);
    expect(filterNotes(notes, { query: 'brief.pdf', tag: null }).map((item) => item.id)).toEqual([
      'file',
    ]);
  });

  it('applies a case-insensitive exact tag filter', () => {
    expect(filterNotes(notes, { query: '', tag: 'agent' }).map((item) => item.id)).toEqual([
      'body',
    ]);
    expect(filterNotes(notes, { query: '', tag: 'age' })).toEqual([]);
  });

  it('folds French diacritics in either direction for body and exact Tag matching', () => {
    const accented = [note({ id: 'accented', body: 'Café résumé', tags: ['Café'] })];

    expect(filterNotes(accented, { query: 'cafe resume', tag: null })).toEqual(accented);
    expect(
      filterNotes([note({ id: 'plain', body: 'cafe resume' })], { query: 'café', tag: null }),
    ).toHaveLength(1);
    expect(filterNotes(accented, { query: '', tag: 'cafe' })).toEqual(accented);
  });

  it('matches every token in a multi-token query', () => {
    const corpus = [note({ id: 'brief', body: 'Agent ready\nLocal brief' })];

    expect(filterNotes(corpus, { query: 'agent brief', tag: null })).toEqual(corpus);
  });

  it('normalizes CJK full-width compatibility forms', () => {
    const corpus = [note({ id: 'cjk', body: 'ＡＩ エージェント' })];

    expect(filterNotes(corpus, { query: 'AI', tag: null })).toEqual(corpus);
  });
});

describe('incremental note index', () => {
  it('normalizes a Note once and reuses it while the object is unchanged', () => {
    const index = createNoteIndex();
    const normalize = vi.spyOn(String.prototype, 'normalize');

    index.filter(notes, { query: 'alpha', tag: null });
    const first = normalize.mock.calls.length;
    index.filter(notes, { query: 'alph', tag: null });
    const second = normalize.mock.calls.length;

    normalize.mockRestore();
    expect(first).toBeGreaterThanOrEqual(notes.length);
    expect(second - first).toBe(1);
  });

  it('re-normalizes only the Note the Workspace replaced', () => {
    const index = createNoteIndex();
    index.filter(notes, { query: 'alpha', tag: null });
    const edited = [note({ id: 'body', body: 'Omega body', tags: ['Agent'] }), ...notes.slice(1)];
    const normalize = vi.spyOn(String.prototype, 'normalize');

    const results = index.filter(edited, { query: 'omega', tag: null });
    const calls = normalize.mock.calls.length;
    normalize.mockRestore();

    expect(results.map((item) => item.id)).toEqual(['body']);
    expect(calls).toBe(3);
  });

  it('drops Notes that left the Workspace', () => {
    const index = createNoteIndex();
    index.filter(notes, { query: 'alpha', tag: null });
    const remaining = notes.filter((item) => item.id !== 'body');

    expect(index.filter(remaining, { query: 'alpha', tag: null }).map((item) => item.id)).toEqual([
      'done',
    ]);
  });

  it('keeps one Tag list identity while the Tag set is unchanged', () => {
    const index = createNoteIndex();
    const first = index.tags(notes);
    const reordered = [...notes];

    expect(index.tags(notes)).toBe(first);
    expect(index.tags(reordered)).toBe(first);
    expect(first).toEqual(['Agent', 'Research']);
    expect(
      index.tags([note({ id: 'body', body: 'Alpha body', tags: ['Agent', 'Handoff'] })]),
    ).toEqual(['Agent', 'Handoff']);
  });

  it('returns the incoming list untouched when no filter is active', () => {
    const index = createNoteIndex();

    expect(index.filter(notes, { query: '  ', tag: null })).toBe(notes);
  });
});

describe('haystack normalization equivalence', () => {
  it('matches tokens across line breaks, tabs, and compatibility forms', () => {
    const multiline = [
      note({ id: 'multiline', body: 'Premier paragraphe\n\tRelire le brief\r\ncomplet' }),
      note({ id: 'compatibility', body: 'Reunion \uFB01nale' }),
    ];

    expect(
      filterNotes(multiline, { query: 'brief complet', tag: null }).map((item) => item.id),
    ).toEqual(['multiline']);
    expect(filterNotes(multiline, { query: 'RELIRE', tag: null }).map((item) => item.id)).toEqual([
      'multiline',
    ]);
    expect(filterNotes(multiline, { query: 'finale', tag: null }).map((item) => item.id)).toEqual([
      'compatibility',
    ]);
  });
});
