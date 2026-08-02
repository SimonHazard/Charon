import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import type { NoteDto } from '@/bindings/workspace';
import { NoteEditor } from '@/features/notes/note-editor';

const note: NoteDto = {
  id: 'note',
  sectionId: 'section',
  body: '<img src=x onerror=alert(1)>\n# Safe title',
  status: 'open',
  sortKey: 0,
  createdAt: '1',
  updatedAt: '1',
  completedAt: null,
  trashedAt: null,
};

describe('note editor', () => {
  it('renders raw HTML as inert text in the conservative preview', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <NoteEditor
          note={note}
          onCreate={vi.fn()}
          onCreated={vi.fn()}
          onOpenChange={vi.fn()}
          onSave={vi.fn()}
          open
        />
      </AppProviders>,
    );
    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByTestId('note-preview').querySelector('img')).toBeNull();
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Safe title' })).toBeTruthy();
  });

  it('preserves rejected draft text with a visible recovery error', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockRejectedValue({ messageKey: 'workspace_error_stale_revision' });
    render(
      <AppProviders>
        <NoteEditor
          note={{ ...note, body: 'old' }}
          onCreate={vi.fn()}
          onCreated={vi.fn()}
          onOpenChange={vi.fn()}
          onSave={onSave}
          open
        />
      </AppProviders>,
    );
    const editor = screen.getByRole('textbox', { name: 'Markdown body' });
    await user.clear(editor);
    await user.type(editor, 'new draft');
    await user.click(screen.getByRole('button', { name: 'Save now' }));
    expect(await screen.findByText(/workspace changed outside this view/i)).toBeTruthy();
    expect((editor as HTMLTextAreaElement).value).toBe('new draft');
  });
});
