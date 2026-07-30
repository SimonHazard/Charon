import { describe, expect, it } from 'vitest';

import type { NoteDto } from '@/bindings/workspace';
import {
  createNoteCommand,
  reorderNoteCommand,
  setStatusCommand,
} from '@/features/notes/note-commands';

const note = (id: string, sortKey: number): NoteDto => ({
  id,
  sectionId: 'section',
  body: id,
  status: 'open',
  sortKey,
  createdAt: id,
  updatedAt: id,
  completedAt: null,
  trashedAt: null,
});

describe('note commands', () => {
  it('builds typed create and batch status mutations', () => {
    expect(createNoteCommand([note('a', 0)], 'section', 'draft')).toEqual({
      type: 'createNote',
      sectionId: 'section',
      body: 'draft',
      sortKey: 1024,
    });
    expect(setStatusCommand(['a', 'b'], 'done')).toEqual({
      type: 'batchSetStatus',
      noteIds: ['a', 'b'],
      status: 'done',
    });
  });

  it('provides keyboard reorder commands and blocks edges', () => {
    const notes = [note('a', 0), note('b', 1024), note('c', 2048)];
    expect(reorderNoteCommand(notes, 'b', -1)).toMatchObject({
      type: 'reorderNote',
      noteId: 'b',
      sortKey: -1024,
    });
    expect(reorderNoteCommand(notes, 'a', -1)).toBeNull();
  });
});
