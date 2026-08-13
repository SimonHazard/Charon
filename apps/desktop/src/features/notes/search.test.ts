import { describe, expect, it } from 'vitest';

import { filterNotes } from '@/features/notes/search';
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
});
