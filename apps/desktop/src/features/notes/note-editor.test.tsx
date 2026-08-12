import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import { NoteEditor, normalizeTagInput } from '@/features/notes/note-editor';
import { note } from '@/test/workspace-fixture';

const current = note({
  id: 'note-1',
  body: 'Original',
  tags: ['Agent'],
  attachments: [
    {
      id: 'a-1',
      fileName: 'brief.pdf',
      relativePath: 'attachments/note-1/a-1.pdf',
      createdAt: '2026-08-05T10:00:00.000Z',
    },
  ],
});

function editor(overrides: Partial<React.ComponentProps<typeof NoteEditor>> = {}) {
  const props: React.ComponentProps<typeof NoteEditor> = {
    note: current,
    allTags: ['Agent', 'Research'],
    onSave: vi.fn().mockResolvedValue(undefined),
    onSetTags: vi.fn().mockResolvedValue(undefined),
    onAddAttachments: vi.fn().mockResolvedValue(undefined),
    onRemoveAttachment: vi.fn().mockResolvedValue(undefined),
    onRetryCleanup: vi.fn().mockResolvedValue(undefined),
    onDirtyChange: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(
    <AppProviders>
      <NoteEditor {...props} />
    </AppProviders>,
  );
  return props;
}

describe('inline note editor', () => {
  it('normalizes one optional leading hash and adds tags on Enter', async () => {
    expect(normalizeTagInput('  #Research  ')).toBe('Research');
    const user = userEvent.setup();
    const onSetTags = vi.fn().mockResolvedValue(undefined);
    editor({ onSetTags });
    await user.type(screen.getByPlaceholderText('Add a tag'), '#Research{Enter}');
    await waitFor(() => expect(onSetTags).toHaveBeenCalledWith(['Agent', 'Research']));
  });

  it('shows only attachment metadata and confirms permanent removal', async () => {
    const user = userEvent.setup();
    const onRemoveAttachment = vi.fn().mockResolvedValue(undefined);
    editor({ onRemoveAttachment });
    expect(screen.getByText('brief.pdf')).toBeTruthy();
    expect(document.querySelector('img, video, audio, iframe')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Remove brief.pdf' }));
    expect(screen.getByText(/cannot be recovered/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Remove permanently' }));
    await waitFor(() => expect(onRemoveAttachment).toHaveBeenCalledWith(current.attachments[0]));
  });

  it('keeps a complete long Unicode filename accessible while showing metadata only', async () => {
    const fileName = `${'résumé-研究-'.repeat(12)}final.pdf`;
    editor({
      note: note({
        id: 'long-name',
        body: 'Long filename',
        attachments: [
          {
            id: 'long',
            fileName,
            relativePath: 'attachments/long-name/long.pdf',
            createdAt: '2026-08-05T10:00:00.000Z',
          },
        ],
      }),
    });
    expect(screen.getByText(fileName).textContent).toBe(fileName);
    expect(screen.getByRole('button', { name: `Remove ${fileName}` })).toBeTruthy();
    expect(document.querySelector('img, video, audio, iframe')).toBeNull();
  });

  it('disables duplicate import intent, then offers an in-section retry after failure', async () => {
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onAddAttachments = vi
      .fn()
      .mockImplementationOnce(() => blocked.then(() => Promise.reject(new Error('failed'))))
      .mockResolvedValue(undefined);
    editor({ onAddAttachments });
    const add = screen.getByRole('button', { name: 'Add attachment' });
    await user.click(add);
    expect((screen.getByRole('button', { name: 'Importing…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.getByRole('tab', { name: 'Preview' }).getAttribute('aria-selected')).toBe('true');
    expect(onAddAttachments).toHaveBeenCalledTimes(1);
    release?.();
    expect(await screen.findByText(/was not imported/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onAddAttachments).toHaveBeenCalledTimes(2));
  });

  it('keeps all 20 Attachment rows operable and exposes the limit locally', () => {
    const attachments = Array.from({ length: 20 }, (_, index) => ({
      id: `attachment-${index}`,
      fileName: `research-${index}-${'非常に長い名前'.repeat(4)}.pdf`,
      relativePath: `attachments/limit/attachment-${index}.pdf`,
      createdAt: `2026-08-05T10:${String(index).padStart(2, '0')}:00.000Z`,
    }));
    editor({ note: note({ id: 'limit', body: 'Limit', attachments }) });
    expect(screen.getAllByRole('button', { name: /^Remove research-/ })).toHaveLength(20);
    expect(screen.getByText('Attachment limit reached: 20 of 20.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Add attachment' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('keeps cleanup-required removal blocked until Workspace refresh succeeds', async () => {
    const user = userEvent.setup();
    const onRetryCleanup = vi.fn().mockResolvedValue(undefined);
    editor({
      onRemoveAttachment: vi.fn().mockRejectedValue({
        code: 'deletion_cleanup_required',
        messageKey: 'workspace_error_deletion_cleanup_required',
      }),
      onRetryCleanup,
    });
    await user.click(screen.getByRole('button', { name: 'Remove brief.pdf' }));
    await user.click(screen.getByRole('button', { name: 'Remove permanently' }));
    expect(await screen.findByText(/cleanup could not be verified/i)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onRetryCleanup).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('preserves a rejected Markdown draft', async () => {
    const user = userEvent.setup();
    editor({ onSave: vi.fn().mockRejectedValue({ messageKey: 'note_editor_save_error' }) });
    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    await user.clear(textarea);
    await user.type(textarea, 'Unsaved body');
    await user.tab();
    await screen.findByText(/draft is preserved/i);
    expect((textarea as HTMLTextAreaElement).value).toBe('Unsaved body');
  });
});
