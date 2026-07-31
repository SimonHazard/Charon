import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import { NoteList } from '@/features/notes/note-list';
import type { NoteViewModel } from '@/features/notes/note-view-model';

const note = (index: number): NoteViewModel => ({
  id: `note-${index}`,
  sectionId: 'section',
  sectionName: 'Ideas',
  body: `Markdown ${index}`,
  title: `Note ${index}`,
  status: 'open',
  sortKey: index,
  createdAt: String(index),
  updatedAt: String(index),
  completedAt: null,
  trashedAt: null,
});

describe('note list', () => {
  it('virtualizes 20,000 stable-ID rows without mounting the whole result', async () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
    const notes = Array.from({ length: 20_000 }, (_, index) => note(index));
    render(
      <AppProviders>
        <NoteList
          copyPreset="plain"
          notes={notes}
          onCopy={vi.fn()}
          onCopyPreview={vi.fn()}
          onOpen={vi.fn()}
          onSelection={vi.fn()}
          selection={{ activeId: null, anchorId: null, selectedIds: ['note-2'] }}
        />
      </AppProviders>,
    );
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0));
    expect(screen.getAllByRole('option').length).toBeLessThan(100);
    expect(
      screen.getByText('Note 2').closest('[data-note-id]')?.getAttribute('data-selected'),
    ).toBe('true');
  });
});
