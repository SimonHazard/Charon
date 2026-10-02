import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import type { WorkspaceCommand } from '@/bindings/workspace';
import { toast } from '@/components/ui/toast';
import { WorkspaceState } from '@/components/workspace-state';
import { NoteScreen } from '@/features/notes/note-screen';
import type { ClipboardClient } from '@/lib/ipc/clipboard-client';
import { captureClients } from '@/test/capture-fixture';
import { shellClients } from '@/test/shell-fixture';
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

function renderCaptureScreen() {
  const native = captureClients();
  const composerReady = vi.spyOn(native.captureClient, 'composerReady');
  const ui = (value: typeof current) => (
    <AppProviders
      captureClient={native.captureClient}
      preferencesClient={native.preferencesClient}
      workspaceClient={workspaceClient(current)}
    >
      <NoteScreen snapshot={value} />
    </AppProviders>
  );
  const view = render(ui(current));
  return {
    ...native,
    composerReady,
    showSnapshot: (value: typeof current) => view.rerender(ui(value)),
  };
}

const captured = note({
  id: 'captured',
  body: 'Captured selection',
  createdAt: '2026-08-06T10:00:00.000Z',
});
const withCaptured = { ...current, revision: 2, notes: [captured, ...current.notes] };
const liveRegion = () =>
  document.querySelector<HTMLElement>('.note-screen > [aria-live="polite"]')?.textContent;
const acknowledgedRows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.note-row[data-acknowledged]')).map(
    (row) => row.dataset.noteId,
  );

describe('captured Note acknowledgement', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
  });

  it('waits for the snapshot that contains the Note, then announces, marks, and scrolls to it', async () => {
    const scrollTo = vi.spyOn(HTMLElement.prototype, 'scrollTo');
    const { emitStatus, composerReady, showSnapshot } = renderCaptureScreen();
    await waitFor(() => expect(composerReady).toHaveBeenCalled());

    act(() => emitStatus({ messageKey: 'capture_note_created', noteId: 'captured' }));
    expect(liveRegion()).toBe('');
    expect(acknowledgedRows()).toEqual([]);
    expect(document.querySelector('[role="status"][data-slot="toast"]')).toBeNull();

    scrollTo.mockClear();
    showSnapshot(withCaptured);
    await waitFor(() => expect(liveRegion()).toBe('Note captured.'));
    expect(acknowledgedRows()).toEqual(['captured']);
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    expect(screen.getByRole('textbox', { name: 'Search notes' })).toHaveProperty('value', '');
  });

  it('clears the row mark after 2.5 seconds', async () => {
    const { emitStatus, composerReady, showSnapshot } = renderCaptureScreen();
    await waitFor(() => expect(composerReady).toHaveBeenCalled());
    vi.useFakeTimers();
    try {
      act(() => emitStatus({ messageKey: 'capture_note_created', noteId: 'captured' }));
      showSnapshot(withCaptured);
      expect(acknowledgedRows()).toEqual(['captured']);
      act(() => vi.advanceTimersByTime(2_499));
      expect(acknowledgedRows()).toEqual(['captured']);
      act(() => vi.advanceTimersByTime(1));
      expect(acknowledgedRows()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('drops an acknowledgement whose Note never appears within 5 seconds', async () => {
    const { emitStatus, composerReady, showSnapshot } = renderCaptureScreen();
    await waitFor(() => expect(composerReady).toHaveBeenCalled());
    vi.useFakeTimers();
    try {
      act(() => emitStatus({ messageKey: 'capture_note_created', noteId: 'captured' }));
      act(() => vi.advanceTimersByTime(5_000));
      showSnapshot(withCaptured);
      expect(liveRegion()).toBe('');
      expect(acknowledgedRows()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('only announces a Note that the current search hides, and keeps the search', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(HTMLElement.prototype, 'scrollTo');
    const { emitStatus, composerReady, showSnapshot } = renderCaptureScreen();
    await waitFor(() => expect(composerReady).toHaveBeenCalled());
    const search = screen.getByRole('textbox', { name: 'Search notes' });
    await user.type(search, 'Alpha');
    await waitFor(() => expect(screen.queryByText('Completed note')).toBeNull());
    search.blur();
    showSnapshot(withCaptured);

    scrollTo.mockClear();
    act(() => emitStatus({ messageKey: 'capture_note_created', noteId: 'captured' }));
    await waitFor(() => expect(liveRegion()).toBe('Note captured.'));
    expect(acknowledgedRows()).toEqual([]);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(search).toHaveProperty('value', 'Alpha');
    expect(screen.queryByText('Captured selection')).toBeNull();
  });

  it('marks without scrolling while the user types in the composer', async () => {
    const user = userEvent.setup();
    const scrollTo = vi.spyOn(HTMLElement.prototype, 'scrollTo');
    const { emitStatus, composerReady, showSnapshot } = renderCaptureScreen();
    await waitFor(() => expect(composerReady).toHaveBeenCalled());
    const composer = screen.getByRole('textbox', { name: 'Capture a note' });
    await user.type(composer, 'Draft');
    showSnapshot(withCaptured);

    scrollTo.mockClear();
    act(() => emitStatus({ messageKey: 'capture_note_created', noteId: 'captured' }));
    await waitFor(() => expect(acknowledgedRows()).toEqual(['captured']));
    expect(scrollTo).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(composer);
    expect(composer).toHaveProperty('value', 'Draft');
  });
});

describe('single note shelf', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
  });

  it('preserves a failed editor through search and a request to open another Note', async () => {
    const user = userEvent.setup();
    let fail = true;
    renderScreen({
      onCommand: async (command) => {
        if (command.type === 'updateNote' && fail) throw new Error('unavailable');
      },
    });
    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    const textarea = await screen.findByRole('textbox', { name: 'Markdown body' });
    await user.clear(textarea);
    await user.type(textarea, 'Keep this unsaved draft');
    await user.click(screen.getByRole('button', { name: 'Edit Completed note' }));
    await screen.findByRole('button', { name: 'Retry' });
    expect((textarea as HTMLTextAreaElement).value).toBe('Keep this unsaved draft');
    expect(document.querySelector('[data-note-editor="done"]')).toBeNull();
    await user.type(screen.getByRole('textbox', { name: 'Search notes' }), 'no matching note');
    expect(screen.getByRole('textbox', { name: 'Markdown body' })).toBe(textarea);
    await user.click(screen.getByRole('button', { name: 'Clear search and tag filter' }));
    fail = false;
    await user.click(screen.getByRole('button', { name: 'Edit Completed note' }));
    await waitFor(() => expect(document.querySelector('[data-note-editor="done"]')).not.toBeNull());
  });

  it('shows Open and Done together and searches body, tags, and attachment names', async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(screen.getByText('Completed note')).toBeTruthy();
    expect(document.querySelector('[data-note-id="done"]')?.getAttribute('data-status')).toBe(
      'done',
    );
    expect(screen.getByRole('button', { name: 'Mark open' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(document.querySelector('.status-segment')).toBeNull();
    const search = screen.getByRole('textbox', { name: 'Search notes' });
    await user.type(search, 'brief.pdf');
    expect(await screen.findByText('Attachment note')).toBeTruthy();
    expect(screen.queryByText('Alpha')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Clear search and tag filter' }));
    await user.click(screen.getByRole('button', { name: 'Show notes tagged Agent' }));
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.queryByText('Attachment note')).toBeNull();
  });

  it('clears the query and Tag filter on Escape and keeps focus in search', async () => {
    const user = userEvent.setup();
    renderScreen();
    const search = screen.getByRole('textbox', { name: 'Search notes' }) as HTMLInputElement;
    search.focus();
    // With nothing to clear, Escape is left alone.
    expect(fireEvent.keyDown(search, { key: 'Escape' })).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Show notes tagged Agent' }));
    await user.type(search, 'alpha');
    expect(document.querySelector('.active-tag-filter')).not.toBeNull();
    expect(screen.queryByText('Completed note')).toBeNull();

    await user.keyboard('{Escape}');
    expect(search.value).toBe('');
    expect(document.querySelector('.active-tag-filter')).toBeNull();
    expect(document.activeElement).toBe(search);
    expect(await screen.findByText('Completed note')).toBeTruthy();
  });

  it('announces the settled match count once, 300 ms after the search changes', () => {
    vi.useFakeTimers();
    try {
      renderScreen();
      const search = screen.getByRole('textbox', { name: 'Search notes' });
      fireEvent.change(search, { target: { value: 'n' } });
      act(() => vi.advanceTimersByTime(200));
      fireEvent.change(search, { target: { value: 'not' } });
      act(() => vi.advanceTimersByTime(200));
      fireEvent.change(search, { target: { value: 'note' } });
      act(() => vi.advanceTimersByTime(299));
      expect(liveRegion()).toBe('');
      act(() => vi.advanceTimersByTime(1));
      expect(liveRegion()).toBe('2 matching notes');
      act(() => vi.advanceTimersByTime(10_000));
      expect(liveRegion()).toBe('');

      fireEvent.change(search, { target: { value: 'brief.pdf' } });
      act(() => vi.advanceTimersByTime(300));
      expect(liveRegion()).toBe('1 matching note');

      // Clearing the search announces nothing new.
      act(() => vi.advanceTimersByTime(3_000));
      fireEvent.change(search, { target: { value: '' } });
      act(() => vi.advanceTimersByTime(1_000));
      expect(liveRegion()).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the deletion announcement while a search is active', async () => {
    const user = userEvent.setup();
    render(
      <AppProviders workspaceClient={workspaceClient(current)}>
        <WorkspaceState>{(value) => <NoteScreen snapshot={value} />}</WorkspaceState>
      </AppProviders>,
    );
    const search = await screen.findByRole('textbox', { name: 'Search notes' });
    await user.type(search, 'note');
    await waitFor(() => expect(liveRegion()).toBe('2 matching notes'));

    await user.click(screen.getByRole('button', { name: 'Delete Attachment note' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(screen.queryByText('Attachment note')).toBeNull());
    await waitFor(() => expect(liveRegion()).toBe('Note deleted.'));
    // The smaller match count never replaces the deletion result.
    await new Promise((resolve) => window.setTimeout(resolve, 400));
    expect(liveRegion()).toBe('Note deleted.');
  });

  it('keeps search first, then the unified list and solid composer', () => {
    renderScreen();
    const list = screen.getByRole('list', { name: 'Notes' });
    const shelf = list.parentElement?.parentElement;

    expect(shelf?.className).toBe('note-screen');
    expect(Array.from(shelf?.children ?? []).map((child) => child.className)).toEqual([
      'sr-only',
      'note-workbar',
      'note-context',
      'note-list',
      'composer-dock',
    ]);
    const workbar = shelf?.querySelector('.note-workbar');
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

  it('opens a Note directly and exposes only per-Note actions', async () => {
    const user = userEvent.setup();
    renderScreen();
    expect(screen.getByRole('button', { name: 'Copy Alpha as Markdown' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Edit Alpha' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete Alpha' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /^Alpha/ }));
    const editor = await screen.findByRole('textbox', { name: 'Markdown body' });
    await waitFor(() => expect(document.activeElement).toBe(editor));
  });

  it('copies one Note through the canonical ClipboardComposer request', async () => {
    const user = userEvent.setup();
    const composeAndWrite = vi
      .fn()
      .mockResolvedValue({ tagCount: 1, attachmentCount: 0, byteCount: 24 });
    renderScreen({ clipboardClient: { composeAndWrite } });
    await user.click(screen.getByRole('button', { name: 'Copy Alpha as Markdown' }));
    await waitFor(() =>
      expect(composeAndWrite).toHaveBeenCalledWith({ expectedRevision: 1, noteId: 'alpha' }),
    );
    expect(
      (await screen.findAllByText('Copied')).every(
        (item) => item.getAttribute('role') === 'status',
      ),
    ).toBe(true);
    expect(screen.queryByText(/\/Users\//)).toBeNull();
  });

  it('confirms a copy in place and clears it after its transient window', async () => {
    vi.useFakeTimers();
    try {
      const composeAndWrite = vi
        .fn()
        .mockResolvedValue({ tagCount: 1, attachmentCount: 0, byteCount: 24 });
      renderScreen({ clipboardClient: { composeAndWrite } });
      const copy = screen.getByRole('button', { name: 'Copy Alpha as Markdown' });

      fireEvent.click(copy);
      await act(async () => Promise.resolve());
      expect(document.querySelector('.note-copy-button[data-copied]')).toBe(copy);
      expect(document.querySelector('.inline-success, .note-copy-state')).toBeNull();
      expect(document.querySelector('.note-screen > [role="status"]')?.textContent).toBe('Copied');
      act(() => vi.advanceTimersByTime(2_499));
      expect(copy.hasAttribute('data-copied')).toBe(true);
      act(() => vi.advanceTimersByTime(1));
      expect(document.querySelector('.note-copy-button[data-copied]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a failed per-Note copy contextual without changing the Note', async () => {
    const user = userEvent.setup();
    renderScreen({
      clipboardClient: {
        composeAndWrite: vi.fn().mockRejectedValue({ code: 'write_failed' }),
      },
    });
    await user.click(screen.getByRole('button', { name: 'Copy Alpha as Markdown' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/Couldn.t copy/);
    expect(screen.getByText('Alpha')).toBeTruthy();
  });

  it('forwards only opaque picker tokens to the typed attachment command', async () => {
    const user = userEvent.setup();
    const commands: WorkspaceCommand[] = [];
    renderScreen({
      onCommand: (command) => {
        commands.push(command);
      },
      pickAttachments: async () => ['opaque-token'],
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
      sourceTokens: ['opaque-token'],
    });
    expect(document.body.textContent).not.toContain('opaque-token');
  });

  it('expands the same Note and focuses Attachments from its paperclip count', async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(screen.getByRole('button', { name: 'Show 1 attachment in this note' }));
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
    expect(within(dialog).getByText('Delete this note permanently?')).toBeTruthy();
    expect(within(dialog).getByText(/cannot be undone/i)).toBeTruthy();
    expect(within(dialog).getByText(/external backups/i)).toBeTruthy();
    within(dialog).getByRole('button', { name: 'Cancel' }).focus();
    const focusedBeforeSearchShortcut = document.activeElement;
    fireEvent.keyDown(window, { key: 'f', metaKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(focusedBeforeSearchShortcut);
    expect(document.querySelector('[name="noteSearch"]')).not.toBe(document.activeElement);
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() =>
      expect(commands.some((command) => command.type === 'deleteNote')).toBe(true),
    );
    expect(screen.queryByText('Trash')).toBeNull();
    expect(screen.queryByText('Undo')).toBeNull();
  });

  it('keeps one polite shelf announcement region and announces a status change', async () => {
    const user = userEvent.setup();
    renderScreen();
    const liveRegion = document.querySelector<HTMLElement>('.note-screen > [aria-live="polite"]');
    expect(liveRegion?.getAttribute('role')).toBe('status');
    expect(liveRegion?.textContent).toBe('');
    await user.click(screen.getAllByRole('button', { name: 'Mark done' })[0]);
    await waitFor(() => expect(liveRegion?.textContent).toBe('Note marked done.'));
    await user.type(screen.getByRole('textbox', { name: 'Capture a note' }), 'New local note');
    await user.click(screen.getByRole('button', { name: 'Add note' }));
    await waitFor(() => expect(liveRegion?.textContent).toBe('Note added.'));
  });

  it('reports cleanup-required without claiming success and retries through snapshot recovery', async () => {
    const user = userEvent.setup();
    renderScreen({
      onCommand: (command) => {
        if (command.type === 'deleteNote') {
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

describe('draft-safe Quit', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderQuitScreen(onCommand?: (command: WorkspaceCommand) => void | Promise<void>) {
    const shell = shellClients();
    render(
      <AppProviders
        shellClient={shell.shellClient}
        workspaceClient={workspaceClient(current, onCommand)}
      >
        <NoteScreen snapshot={current} />
      </AppProviders>,
    );
    await waitFor(() => expect(shell.shellClient.setLabels).toHaveBeenCalled());
    return shell;
  }

  it('quits from the tray when nothing is unsent', async () => {
    const { shellClient, requestQuit } = await renderQuitScreen();

    act(() => requestQuit());
    await waitFor(() => expect(shellClient.quit).toHaveBeenCalledTimes(1));
    expect(shellClient.cancelQuit).not.toHaveBeenCalled();
  });

  it('saves the open note before quitting', async () => {
    const user = userEvent.setup();
    const commands: WorkspaceCommand[] = [];
    const { shellClient, requestQuit } = await renderQuitScreen((command) => {
      commands.push(command);
    });
    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    const textarea = await screen.findByRole('textbox', { name: 'Markdown body' });
    await user.clear(textarea);
    await user.type(textarea, 'Saved before quitting');

    act(() => requestQuit());
    await waitFor(() => expect(shellClient.quit).toHaveBeenCalledTimes(1));
    expect(commands).toContainEqual(
      expect.objectContaining({
        type: 'updateNote',
        noteId: 'alpha',
        body: 'Saved before quitting',
      }),
    );
    expect(shellClient.cancelQuit).not.toHaveBeenCalled();
  });

  it('keeps Charon running with unsent composer text and says why beside it', async () => {
    const user = userEvent.setup();
    const add = vi.spyOn(toast, 'add');
    const { shellClient, requestQuit } = await renderQuitScreen();
    const composer = screen.getByRole('textbox', { name: 'Capture a note' });
    await user.type(composer, 'Unsent thought');
    await user.click(screen.getByRole('textbox', { name: 'Search notes' }));

    act(() => requestQuit());
    await waitFor(() => expect(shellClient.cancelQuit).toHaveBeenCalledTimes(1));
    expect(shellClient.quit).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Add or clear the note you are writing before quitting.',
        type: 'warning',
      }),
    );
    expect(document.activeElement).toBe(composer);
    expect(composer).toHaveProperty('value', 'Unsent thought');
  });

  it('keeps Charon running when the open note cannot be saved', async () => {
    const user = userEvent.setup();
    const add = vi.spyOn(toast, 'add');
    const { shellClient, requestQuit } = await renderQuitScreen((command) => {
      if (command.type === 'updateNote') throw new Error('unavailable');
    });
    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    const textarea = await screen.findByRole('textbox', { name: 'Markdown body' });
    await user.clear(textarea);
    await user.type(textarea, 'Not saved yet');

    act(() => requestQuit());
    await waitFor(() => expect(shellClient.cancelQuit).toHaveBeenCalledTimes(1));
    expect(shellClient.quit).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Finish saving the open note or drawing before quitting.',
      }),
    );
    expect(screen.getByRole('textbox', { name: 'Markdown body' })).toHaveProperty(
      'value',
      'Not saved yet',
    );
  });
});
