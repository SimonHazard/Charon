import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import { NoteList } from '@/features/notes/note-list';
import { emptySelection } from '@/features/notes/selection-model';
import { note } from '@/test/workspace-fixture';

const callbacks = {
  onSelection: vi.fn(),
  onToggleStatus: vi.fn().mockResolvedValue(undefined),
  onExpand: vi.fn(),
  onCloseEditor: vi.fn(),
  onTagFilter: vi.fn(),
  onCopy: vi.fn().mockResolvedValue(undefined),
  onSave: vi.fn().mockResolvedValue(undefined),
  onSetTags: vi.fn().mockResolvedValue(undefined),
  onAddAttachments: vi.fn().mockResolvedValue(undefined),
  onRemoveAttachment: vi.fn().mockResolvedValue(undefined),
  onRetryCleanup: vi.fn().mockResolvedValue(undefined),
  onDirtyChange: vi.fn(),
};

describe('virtual note list', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
  });

  it('keeps a 20,000-note fixture below 150 rendered rows', async () => {
    const notes = Array.from({ length: 20_000 }, (_, index) =>
      note({ id: `note-${index}`, body: `Note ${index}` }),
    );
    render(
      <AppProviders>
        <NoteList
          {...callbacks}
          allTags={[]}
          expandedId={null}
          notes={notes}
          selection={emptySelection}
          selectionMode={false}
        />
      </AppProviders>,
    );
    await waitFor(() =>
      expect(document.querySelectorAll('[data-note-id]').length).toBeGreaterThan(0),
    );
    expect(document.querySelectorAll('[data-note-id]').length).toBeLessThan(150);
  });

  it('exposes tags, attachments, status, actions, and edit to keyboard users', async () => {
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
          expandedId={null}
          notes={[item]}
          selection={emptySelection}
          selectionMode={false}
        />
      </AppProviders>,
    );
    expect(screen.getByRole('button', { name: 'Agent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Research' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Local' })).toBeNull();
    expect(screen.getByText('+1')).toBeTruthy();
    expect(screen.getByText(/Tags: Agent, Research, Local\. 1 attachments\./)).toBeTruthy();
    expect(screen.getByText('One restrained preview line')).toBeTruthy();
    expect(document.querySelector('.note-row-main')?.children).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Mark done' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Actions for Alpha' }));
    expect(await screen.findByText('Copy as Markdown')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Alpha' })).toBeTruthy();
  });
});
