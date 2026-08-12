import { render, screen, waitFor, within } from '@testing-library/react';
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

  it('defaults to Open and searches body, tags, and attachment names', async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(screen.getByRole('button', { name: /Open/ }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('Completed note')).toBeNull();
    const search = screen.getByRole('textbox', { name: 'Search notes' });
    await user.type(search, 'brief.pdf');
    expect(await screen.findByText('Attachment note')).toBeTruthy();
    expect(screen.queryByText('Alpha')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear search and tag filter' }));
    await user.click(screen.getByRole('button', { name: 'Agent' }));
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.queryByText('Attachment note')).toBeNull();
  });

  it('keeps search first, status and Selection second, then the list and solid composer', () => {
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
    expect(workbar?.lastElementChild?.className).toBe('note-toolbar-row');
    expect(screen.getByRole('button', { name: /Open/ }).getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('.capture-hint')).toBeNull();
  });

  it('replaces status controls with a complete non-scrolling Selection bar', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Select' }));

    const toolbar = screen.getByRole('toolbar', { name: '0 notes selected' });
    expect(within(toolbar).getByText('0 notes selected')).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: 'Mark done' })).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: 'Copy as Markdown' })).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: 'Delete 0' })).toBeTruthy();
    expect(within(toolbar).getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Open/ })).toBeNull();

    await user.click(screen.getByRole('checkbox', { name: 'Select Alpha' }));
    expect(screen.getByRole('toolbar', { name: '1 note selected' })).toBeTruthy();
  });

  it('reconciles Selection while preserving native search editing focus', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Alpha/ })),
    );
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
    await user.click(screen.getByRole('button', { name: 'Actions for Alpha' }));
    await user.click(await screen.findByText('Copy as Markdown'));
    await waitFor(() =>
      expect(composeAndWrite).toHaveBeenCalledWith({ expectedRevision: 1, noteIds: ['alpha'] }),
    );
    expect(screen.queryByText(/\/Users\//)).toBeNull();
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
    await user.click(screen.getByRole('button', { name: 'Actions for Alpha' }));
    await user.click(await screen.findByText('Add attachment'));
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

  it('uses one irreversible batch confirmation and no Trash or Undo affordance', async () => {
    const user = userEvent.setup();
    const commands: WorkspaceCommand[] = [];
    renderScreen({
      onCommand: (command) => {
        commands.push(command);
      },
    });
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: /^Alpha/ }));
    await user.click(screen.getByRole('button', { name: 'Delete 1' }));
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText(/cannot be undone/i)).toBeTruthy();
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
    await user.click(screen.getByRole('button', { name: 'Select' }));
    await user.click(screen.getByRole('button', { name: /^Alpha/ }));
    await user.click(screen.getByRole('button', { name: 'Delete 1' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    expect(await screen.findByText(/cleanup could not be verified/i)).toBeTruthy();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  });
});
