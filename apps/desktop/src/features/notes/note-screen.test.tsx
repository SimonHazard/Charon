import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import type { WorkspaceCommand } from '@/bindings/workspace';
import { NoteScreen } from '@/features/notes/note-screen';
import type { ClipboardClient } from '@/lib/ipc/clipboard-client';
import { note, snapshot, workspaceClient } from '@/test/workspace-fixture';

const current = snapshot([
  note({ id: 'alpha', body: '# Alpha\nbody', tags: ['Agent'] }),
  note({
    id: 'file',
    body: 'Attachment note',
    attachments: [
      {
        id: 'a',
        fileName: 'brief.pdf',
        relativePath: 'attachments/file/a.pdf',
        createdAt: '2026-08-05T10:00:00.000Z',
      },
    ],
  }),
  note({ id: 'done', body: 'Completed note', status: 'done' }),
]);

function renderScreen(
  options: {
    onCommand?: (command: WorkspaceCommand) => void | Promise<void>;
    clipboardClient?: ClipboardClient;
    pickAttachments?: () => Promise<string[]>;
  } = {},
) {
  const client = workspaceClient(current, options.onCommand);
  render(
    <AppProviders workspaceClient={client}>
      <NoteScreen
        clipboardClient={options.clipboardClient}
        pickAttachments={options.pickAttachments}
        snapshot={current}
      />
    </AppProviders>,
  );
}

describe('single note shelf', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
  });

  it('shows Open and Done together and searches body, tags, and attachment names', async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(screen.getByText('Completed note')).toBeTruthy();
    expect(document.querySelector('[data-note-id="done"]')?.getAttribute('data-status')).toBe(
      'done',
    );
    expect(document.querySelector('.status-segment')).toBeNull();
    const search = screen.getByRole('textbox', { name: 'Search notes' });
    await user.type(search, 'brief.pdf');
    expect(await screen.findByText('Attachment note')).toBeTruthy();
    expect(screen.queryByText('Alpha')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear search and tag filter' }));
    await user.click(screen.getByRole('button', { name: 'Agent' }));
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.queryByText('Attachment note')).toBeNull();
  });

  it('keeps search first, then the unified list and solid composer', () => {
    renderScreen();
    const list = screen.getByRole('list', { name: 'Notes' });
    const shelf = list.parentElement?.parentElement;

    expect(shelf?.className).toBe('note-screen');
    expect(Array.from(shelf?.children ?? []).map((child) => child.className)).toEqual([
      'note-workbar',
      'note-context',
      'note-list',
      'composer-dock',
    ]);
    const workbar = shelf?.firstElementChild;
    expect(workbar?.firstElementChild?.className).toBe('note-search');
    expect(workbar?.children).toHaveLength(1);
    const search = workbar?.firstElementChild;
    expect(search?.querySelector('.shelf-actions')).not.toBeNull();
    expect(
      within(search as HTMLElement).getByRole('button', { name: 'Keyboard shortcuts' }),
    ).toBeTruthy();
    expect(within(search as HTMLElement).getByRole('button', { name: 'Settings' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull();
    expect(document.querySelector('.capture-hint')).toBeNull();
  });

  it('selects notes directly and exposes compact contextual actions', async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(screen.queryByRole('button', { name: 'Select' })).toBeNull();
    expect(screen.queryByRole('group', { name: /note selected/ })).toBeNull();

    await user.click(screen.getByRole('button', { name: /^Alpha/ }));
    const actions = screen.getByRole('group', { name: '1 note selected' });
    expect(within(actions).getByText('1 note selected')).toBeTruthy();
    expect(within(actions).getByRole('button', { name: 'Selection actions' })).toBeTruthy();
    expect(within(actions).getByRole('button', { name: 'Delete 1' })).toBeTruthy();
    expect(within(actions).getByRole('button', { name: 'Clear selection' })).toBeTruthy();
    await user.click(within(actions).getByRole('button', { name: 'Selection actions' }));
    expect(await screen.findByText('Mark done')).toBeTruthy();
    expect(await screen.findByText('Copy as Markdown')).toBeTruthy();
  });

  it('extends a click selection with Shift and preserves search editing focus', async () => {
    const user = userEvent.setup();
    renderScreen();
    fireEvent.click(screen.getByRole('button', { name: /^Alpha/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Attachment note/ }), {
      shiftKey: true,
    });
    expect(screen.getByRole('group', { name: '2 notes selected' })).toBeTruthy();
    const search = screen.getByRole('textbox', { name: 'Search notes' });
    await user.type(search, 'brief.pdf');
    expect(document.activeElement).toBe(search);
    expect(screen.getByRole('button', { name: /^Attachment note/ })).toBeTruthy();
  });

  it('copies only note IDs through the canonical ClipboardComposer request', async () => {
    const user = userEvent.setup();
    const composeAndWrite = vi
      .fn()
      .mockResolvedValue({ noteCount: 1, tagCount: 1, attachmentCount: 0, byteCount: 24 });
    renderScreen({ clipboardClient: { composeAndWrite } });
    await user.click(screen.getByRole('button', { name: /^Alpha/ }));
    await user.click(screen.getByRole('button', { name: 'Selection actions' }));
    await user.click(await screen.findByText('Copy as Markdown'));
    await waitFor(() =>
      expect(composeAndWrite).toHaveBeenCalledWith({ expectedRevision: 1, noteIds: ['alpha'] }),
    );
    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Copied');
    expect(screen.queryByText(/\/Users\//)).toBeNull();
  });

  it('keeps a failed bulk copy contextual and preserves the selection', async () => {
    const user = userEvent.setup();
    renderScreen({
      clipboardClient: {
        composeAndWrite: vi.fn().mockRejectedValue({ code: 'write_failed' }),
      },
    });
    await user.click(screen.getByRole('button', { name: /^Alpha/ }));
    await user.click(screen.getByRole('button', { name: 'Selection actions' }));
    await user.click(await screen.findByText('Copy as Markdown'));

    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn.t copy/);
    expect(screen.getByRole('group', { name: '1 note selected' })).toBeTruthy();
  });

  it('forwards transient picker paths only to the typed attachment command', async () => {
    const user = userEvent.setup();
    const commands: WorkspaceCommand[] = [];
    renderScreen({
      onCommand: (command) => {
        commands.push(command);
      },
      pickAttachments: async () => ['/external/brief.pdf'],
    });
    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await user.click(await screen.findByRole('button', { name: 'Add attachment' }));
    await waitFor(() =>
      expect(commands.some((command) => command.type === 'importNoteAttachments')).toBe(true),
    );
    const command = commands.find((item) => item.type === 'importNoteAttachments');
    expect(command).toMatchObject({
      type: 'importNoteAttachments',
      noteId: 'alpha',
      sourcePaths: ['/external/brief.pdf'],
    });
    expect(document.body.textContent).not.toContain('/external/brief.pdf');
  });

  it('expands the same Note and focuses Attachments from its paperclip count', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Show 1 attachments in this note' }));
    const heading = await screen.findByRole('heading', { name: 'Attachments' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(document.querySelector('[data-note-editor="file"]')).toBeTruthy();
  });

  it('uses one irreversible confirmation from the direct row trash action', async () => {
    const user = userEvent.setup();
    const commands: WorkspaceCommand[] = [];
    renderScreen({
      onCommand: (command) => {
        commands.push(command);
      },
    });
    await user.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Delete 1 note permanently?')).toBeTruthy();
    expect(within(dialog).getByText(/cannot be undone/i)).toBeTruthy();
    expect(within(dialog).getByText(/external backups/i)).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() =>
      expect(commands.some((command) => command.type === 'deleteNotes')).toBe(true),
    );
    expect(screen.queryByText('Trash')).toBeNull();
    expect(screen.queryByText('Undo')).toBeNull();
  });

  it('reports cleanup-required without claiming success and retries through snapshot recovery', async () => {
    const user = userEvent.setup();
    renderScreen({
      onCommand: (command) => {
        if (command.type === 'deleteNotes') {
          throw {
            code: 'deletion_cleanup_required',
            messageKey: 'workspace_error_deletion_cleanup_required',
          };
        }
      },
    });
    await user.click(screen.getByRole('button', { name: 'Delete Alpha' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(await screen.findByText(/cleanup could not be verified/i)).toBeTruthy();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
