import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import { NoteList } from '@/features/notes/note-list';
import { note } from '@/test/workspace-fixture';

const callbacks = {
  onCopy: vi.fn().mockResolvedValue(undefined),
  onToggleStatus: vi.fn().mockResolvedValue(undefined),
  onExpand: vi.fn(),
  onFocusAttachments: vi.fn().mockResolvedValue(undefined),
  onCloseEditor: vi.fn(),
  onTagFilter: vi.fn(),
  onDelete: vi.fn(),
  onSave: vi.fn().mockResolvedValue(undefined),
  onSetTags: vi.fn().mockResolvedValue(undefined),
  onAddAttachments: vi.fn().mockResolvedValue(undefined),
  onRemoveAttachment: vi.fn().mockResolvedValue(undefined),
  onRetryCleanup: vi.fn().mockResolvedValue(undefined),
  onDirtyChange: vi.fn(),
};

describe('virtual note list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
  });

  it('keeps a 20,000-note fixture below 150 rendered rows', async () => {
    const notes = Array.from({ length: 20_000 }, (_, index) =>
      note({ id: `note-${index}`, body: `Note ${index}` }),
    );
    render(
      <AppProviders>
        <NoteList {...callbacks} allTags={[]} copyState={null} expandedId={null} notes={notes} />
      </AppProviders>,
    );
    await waitFor(() =>
      expect(document.querySelectorAll('[data-note-id]').length).toBeGreaterThan(0),
    );
    expect(document.querySelectorAll('[data-note-id]').length).toBeLessThan(150);
    const firstItem = screen.getAllByRole('listitem')[0];
    expect(firstItem?.getAttribute('aria-setsize')).toBe('20000');
    expect(firstItem?.getAttribute('aria-posinset')).toBe('1');
  });

  it('exposes tags, attachments, status, copy, edit, and delete to keyboard users', async () => {
    const user = userEvent.setup();
    const item = note({
      id: 'note-a',
      body: '# Alpha\nOne restrained preview line',
      tags: ['Agent', 'Research', 'Local'],
      attachments: [
        {
          id: 'a',
          fileName: 'brief.pdf',
          relativePath: 'attachments/note-a/a.pdf',
          createdAt: '2026-08-05T10:00:00.000Z',
        },
      ],
    });
    render(
      <AppProviders>
        <NoteList
          {...callbacks}
          allTags={['Agent', 'Research', 'Local']}
          copyState={null}
          expandedId={null}
          notes={[item]}
        />
      </AppProviders>,
    );
    expect(screen.getByRole('button', { name: 'Agent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Research' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Local' })).toBeNull();
    expect(screen.getByText('+1')).toBeTruthy();
    expect(
      screen.getByText(/Status: Open\. Tags: Agent, Research, Local\. 1 attachment\. Files/),
    ).toBeTruthy();
    expect(screen.getByText('One restrained preview line')).toBeTruthy();
    expect(document.querySelector('.note-row-main')?.children).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Mark done' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    const copyButton = screen.getByRole('button', { name: 'Copy Alpha as Markdown' });
    const descriptionId = copyButton.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId ?? '')?.textContent).toMatch(
      /managed local Attachment paths enter the clipboard/i,
    );
    await user.click(copyButton);
    expect(callbacks.onCopy).toHaveBeenCalledWith('note-a');
    expect(screen.getByRole('button', { name: 'Edit Alpha' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    expect(callbacks.onDelete).toHaveBeenCalledWith('note-a');
    await user.click(screen.getByRole('button', { name: 'Show 1 attachment in this note' }));
    expect(callbacks.onFocusAttachments).toHaveBeenCalledWith('note-a');
  });

  it('moves native focus with Arrow keys and deletes only the focused Note', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders>
        <NoteList
          {...callbacks}
          allTags={[]}
          copyState={null}
          expandedId={null}
          notes={[note({ id: 'note-a', body: 'Alpha' }), note({ id: 'note-b', body: 'Beta' })]}
        />
      </AppProviders>,
    );
    const alpha = screen.getByRole('button', { name: 'Alpha' });
    const beta = screen.getByRole('button', { name: 'Beta' });
    alpha.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(document.activeElement).toBe(beta));
    await user.keyboard('{Delete}');
    expect(callbacks.onDelete).toHaveBeenCalledWith('note-b');
  });

  it('keeps Arrow-key focus on a row through 30 rapid moves', async () => {
    const user = userEvent.setup();
    const notes = Array.from({ length: 100 }, (_, index) =>
      note({ id: `note-${index}`, body: `Note ${index}` }),
    );
    render(
      <AppProviders>
        <NoteList {...callbacks} allTags={[]} copyState={null} expandedId={null} notes={notes} />
      </AppProviders>,
    );
    screen.getByRole('button', { name: 'Note 0' }).focus();
    let index = 0;
    for (let step = 1; step <= 30; step += 1) {
      const direction = step <= 10 || step > 20 ? 'ArrowDown' : 'ArrowUp';
      index += direction === 'ArrowDown' ? 1 : -1;
      await user.keyboard(`{${direction}}`);
      await waitFor(() =>
        expect(document.activeElement?.getAttribute('data-note-focus')).toBe(`note-${index}`),
      );
    }
    expect(document.activeElement).not.toBe(document.body);
  });

  it('keeps an expanded draft mounted outside the virtual range, including failed saves', async () => {
    const user = userEvent.setup();
    const notes = Array.from({ length: 100 }, (_, index) =>
      note({ id: `note-${index}`, body: `Note ${index}` }),
    );
    callbacks.onSave.mockRejectedValueOnce(new Error('unavailable'));
    render(
      <AppProviders>
        <NoteList {...callbacks} allTags={[]} copyState={null} expandedId="note-0" notes={notes} />
      </AppProviders>,
    );
    const textarea = await screen.findByRole('textbox', { name: 'Markdown body' });
    await user.clear(textarea);
    await user.type(textarea, 'Virtualized draft');

    const scroller = document.querySelector<HTMLElement>('.note-list');
    expect(scroller).not.toBeNull();
    if (!scroller) return;
    scroller.scrollTop = 7_000;
    fireEvent.scroll(scroller);

    expect(screen.getByRole('textbox', { name: 'Markdown body' })).toBe(textarea);
    await waitFor(() => expect(callbacks.onSave).toHaveBeenCalledTimes(1));
    expect(callbacks.onSave).toHaveBeenCalledWith('note-0', 'Virtualized draft');
    expect((textarea as HTMLTextAreaElement).value).toBe('Virtualized draft');
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeTruthy();
  });

  it('leaves arrows and text selection inside the editor and tag input', async () => {
    render(
      <AppProviders>
        <NoteList
          {...callbacks}
          allTags={[]}
          copyState={null}
          expandedId="note-a"
          notes={[note({ id: 'note-a', body: 'Alpha' }), note({ id: 'note-b', body: 'Beta' })]}
        />
      </AppProviders>,
    );
    for (const input of screen.getAllByRole('textbox')) {
      input.focus();
      expect(fireEvent.keyDown(input, { key: 'ArrowDown' })).toBe(true);
      expect(document.activeElement).toBe(input);
    }
    const row = screen.getByRole('button', { name: 'Alpha' });
    row.focus();
    expect(fireEvent.keyDown(row, { key: 'ArrowDown', shiftKey: true })).toBe(true);
    expect(document.activeElement).toBe(row);
  });
});
