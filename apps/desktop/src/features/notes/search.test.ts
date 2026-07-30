import { describe, expect, it } from 'vitest';

import { filterNotes, normalizeSearchText } from '@/features/notes/search';

const notes = [
  {
    id: 'a',
    sectionId: 's1',
    sectionName: 'Références',
    body: '# Résumé\nMarkdown **local**',
    title: 'Résumé',
    status: 'open' as const,
    sortKey: 0,
    createdAt: '1',
    updatedAt: '1',
    completedAt: null,
    trashedAt: null,
  },
  {
    id: 'b',
    sectionId: 's2',
    sectionName: 'Done',
    body: 'Second prompt',
    title: 'Second prompt',
    status: 'done' as const,
    sortKey: 1,
    createdAt: '2',
    updatedAt: '2',
    completedAt: '2',
    trashedAt: null,
  },
  {
    id: 'c',
    sectionId: 's1',
    sectionName: 'Références',
    body: 'Removed',
    title: 'Removed',
    status: 'open' as const,
    sortKey: 2,
    createdAt: '3',
    updatedAt: '3',
    completedAt: null,
    trashedAt: '3',
  },
];

describe('note search', () => {
  it('normalizes Unicode case and whitespace', () => {
    expect(normalizeSearchText('  RÉSUMÉ\n\tLocal  ')).toBe('résumé local');
  });

  it('matches Markdown bodies and section names with deterministic tokens', () => {
    expect(
      filterNotes(notes, {
        query: 'RÉSUMÉ local',
        sectionId: null,
        status: 'all',
        trash: false,
      }).map((note) => note.id),
    ).toEqual(['a']);
    expect(
      filterNotes(notes, {
        query: 'références',
        sectionId: null,
        status: 'open',
        trash: false,
      }).map((note) => note.id),
    ).toEqual(['a']);
  });

  it('separates status, section, and trash filters', () => {
    expect(
      filterNotes(notes, { query: '', sectionId: 's2', status: 'done', trash: false }).map(
        (note) => note.id,
      ),
    ).toEqual(['b']);
    expect(
      filterNotes(notes, { query: '', sectionId: null, status: 'all', trash: true }).map(
        (note) => note.id,
      ),
    ).toEqual(['c']);
  });
});
