import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import type {
  AttachmentDragEvent,
  AttachmentDropEvent,
  WorkspaceCommand,
} from '@/bindings/workspace';
import { toast } from '@/components/ui/toast';
import { NoteScreen } from '@/features/notes/note-screen';
import type { AttachmentIntakeClient } from '@/lib/ipc/attachment-intake-client';
import { captureClients } from '@/test/capture-fixture';
import { shellClients } from '@/test/shell-fixture';
import { note, snapshot, workspaceClient } from '@/test/workspace-fixture';

const nativeWindow = vi.hoisted(() => ({
  enabled: false,
  closeHandler: undefined as ((event: { preventDefault(): void }) => void) | undefined,
}));

vi.mock('@/lib/platform', () => ({ isTauriRuntime: () => nativeWindow.enabled }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onCloseRequested: async (handler: (event: { preventDefault(): void }) => void) => {
      nativeWindow.closeHandler = handler;
      return () => {
        if (nativeWindow.closeHandler === handler) nativeWindow.closeHandler = undefined;
      };
    },
  }),
}));

const current = snapshot([
  note({ id: 'alpha', body: '# Alpha\nPrompt for the agent', tags: ['Agent'] }),
  note({ id: 'beta', body: '# Beta release notes', tags: ['Research'] }),
  note({ id: 'done', body: 'Completed note', status: 'done' }),
]);

function intakeClient() {
  let drag: ((event: AttachmentDragEvent) => void) | undefined;
  let drop: ((event: AttachmentDropEvent) => void) | undefined;
  const client = {
    paste: vi.fn<AttachmentIntakeClient['paste']>(),
    discard: vi.fn<AttachmentIntakeClient['discard']>(async () => undefined),
    subscribeDrag: vi.fn<AttachmentIntakeClient['subscribeDrag']>(async (listener) => {
      drag = listener;
      return () => undefined;
    }),
    subscribeDrop: vi.fn<AttachmentIntakeClient['subscribeDrop']>(async (listener) => {
      drop = listener;
      return () => undefined;
    }),
  } satisfies AttachmentIntakeClient;
  return {
    client,
    drag: (event: AttachmentDragEvent) => drag?.(event),
    drop: (event: AttachmentDropEvent) => drop?.(event),
  };
}

function renderShelf({
  native = false,
  attachmentIntake,
  onCommand,
}: {
  native?: boolean;
  attachmentIntake?: AttachmentIntakeClient;
  onCommand?: (command: WorkspaceCommand) => void | Promise<void>;
} = {}) {
  const commands: WorkspaceCommand[] = [];
  const nativeClients = captureClients();
  const shell = shellClients();
  const client = workspaceClient(current, async (command) => {
    commands.push(command);
    await onCommand?.(command);
  });
  render(
    <AppProviders
      captureClient={native ? nativeClients.captureClient : undefined}
      preferencesClient={native ? nativeClients.preferencesClient : undefined}
      shellClient={shell.shellClient}
      workspaceClient={client}
    >
      <NoteScreen attachmentIntake={attachmentIntake} snapshot={current} />
    </AppProviders>,
  );
  return { commands, shell, preferencesClient: nativeClients.preferencesClient };
}

async function openNewDrawing(user: ReturnType<typeof userEvent.setup>) {
  await user.keyboard('{Meta>}k{/Meta}');
  await user.type(await screen.findByRole('combobox'), 'new drawing');
  await user.keyboard('{Enter}');
  const dialog = await screen.findByRole('dialog', { name: 'Drawing' });
  const canvas = within(dialog).getByRole('img', { name: 'Drawing canvas' });
  Object.defineProperty(canvas, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      left: 0,
      top: 0,
      width: 960,
      height: 600,
      right: 960,
      bottom: 600,
      x: 0,
      y: 0,
    }),
  });
  fireEvent.pointerDown(canvas, {
    pointerId: 1,
    button: 0,
    buttons: 1,
    clientX: 100,
    clientY: 100,
  });
  fireEvent.pointerMove(canvas, { pointerId: 1, buttons: 1, clientX: 200, clientY: 160 });
  fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, clientX: 200, clientY: 160 });
  return dialog;
}

const liveRegion = () =>
  document.querySelector<HTMLElement>('.note-screen > [aria-live="polite"]')?.textContent;

describe('shelf flows of ADRs 0029-0033', () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(600);
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(900);
    HTMLElement.prototype.scrollIntoView = () => undefined;
  });

  afterEach(() => {
    nativeWindow.enabled = false;
    nativeWindow.closeHandler = undefined;
    vi.restoreAllMocks();
  });

  it('opens the command menu with CmdOrCtrl+K and lists Tags, actions, appearance, and language', async () => {
    renderShelf();
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const dialog = await screen.findByRole('dialog', { name: 'Commands' });
    const input = within(dialog).getByRole('combobox', {
      name: 'Search commands, tags, and notes',
    });
    await waitFor(() => expect(input).toHaveProperty('ownerDocument.activeElement', input));
    const groups = within(dialog)
      .getAllByRole('group')
      .map((group) => group.getAttribute('aria-labelledby'))
      .map((id) => (id ? document.getElementById(id)?.textContent : null));
    expect(groups).toEqual(['Tags', 'Actions', 'Appearance', 'Language']);
    expect(within(dialog).getByRole('option', { name: 'Focus #Agent' })).toBeTruthy();
    expect(within(dialog).getByRole('option', { name: /^Hide Charon/u })).toBeTruthy();
    // The first option is highlighted and named by the combobox.
    const first = within(dialog).getAllByRole('option')[0] as HTMLElement;
    expect(input.getAttribute('aria-activedescendant')).toBe(first.id);
    expect(first.getAttribute('aria-selected')).toBe('true');
  });

  it('searches Notes and opens the chosen one in its editor', async () => {
    const user = userEvent.setup();
    renderShelf();
    await user.keyboard('{Meta>}k{/Meta}');
    const input = await screen.findByRole('combobox');
    await user.type(input, 'beta');
    const dialog = screen.getByRole('dialog', { name: 'Commands' });
    expect(within(dialog).getByRole('option', { name: 'Beta release notes' })).toBeTruthy();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Commands' })).toBeNull());
    expect(await screen.findByRole('textbox', { name: 'Markdown body' })).toHaveProperty(
      'value',
      '# Beta release notes',
    );
  });

  it('moves the highlight with the arrows and shows an empty state', async () => {
    const user = userEvent.setup();
    renderShelf();
    await user.keyboard('{Meta>}k{/Meta}');
    const input = await screen.findByRole('combobox');
    const options = () => screen.getAllByRole('option');
    await user.keyboard('{ArrowDown}');
    expect(input.getAttribute('aria-activedescendant')).toBe(options()[1]?.id);
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(input.getAttribute('aria-activedescendant')).toBe(options().at(-1)?.id);
    // Longer than any Tag, so not even a new Tag is offered.
    await user.type(input, 'q'.repeat(49));
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No matching command.')).toBeTruthy();
  });

  it('focuses a Tag: the shelf filters and new Notes join it', async () => {
    const user = userEvent.setup();
    const { commands } = renderShelf();
    await user.keyboard('{Meta>}k{/Meta}');
    const input = await screen.findByRole('combobox');
    await user.type(input, 'research');
    await user.keyboard('{Enter}');

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Commands' })).toBeNull());
    expect(screen.getByText('Focused')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Leave tag Research' })).toBeTruthy();
    expect(document.querySelectorAll('[data-note-id]')).toHaveLength(1);
    expect(document.querySelector('.composer-context')?.textContent).toBe(
      'New notes are taggedResearch',
    );

    const composer = screen.getByRole('textbox', { name: 'Capture a note' });
    await user.type(composer, 'Follow-up prompt{Enter}');
    await waitFor(() =>
      expect(commands).toContainEqual(
        expect.objectContaining({
          type: 'createNote',
          body: 'Follow-up prompt',
          tags: ['Research'],
        }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Leave tag Research' }));
    expect(document.querySelector('.composer-context')).toBeNull();
  });

  it('offers a new Tag for a query that names none, after the matching actions', async () => {
    const user = userEvent.setup();
    renderShelf();
    await user.keyboard('{Meta>}k{/Meta}');
    const input = await screen.findByRole('combobox');
    await user.type(input, '#Roadmap');
    const options = screen.getAllByRole('option');
    expect(options.at(-1)?.textContent).toBe('Focus new tag #Roadmap');
    await user.click(options.at(-1) as HTMLElement);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Leave tag Roadmap' })).toBeTruthy(),
    );
  });

  it('persists the focused Tag natively and restores it when Rust refuses', async () => {
    const user = userEvent.setup();
    const { preferencesClient } = renderShelf({ native: true });
    const setFocusedTag = vi
      .spyOn(preferencesClient, 'setFocusedTag')
      .mockRejectedValueOnce({ code: 'invalid_value', messageKey: 'preferences_error_unknown' });
    await user.click(await screen.findByRole('button', { name: 'Focus tag Agent' }));
    expect(setFocusedTag).toHaveBeenCalledWith('Agent');
    await waitFor(() => expect(screen.queryByText('Focused')).toBeNull());
  });

  it('switches appearance and language from the menu', async () => {
    const user = userEvent.setup();
    renderShelf();
    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(await screen.findByRole('combobox'), 'dark');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(await screen.findByRole('combobox'), 'fran');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.documentElement.lang).toBe('fr'));
    expect(await screen.findByRole('button', { name: 'Commandes' })).toBeTruthy();
    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(await screen.findByRole('combobox'), 'english');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));
  });

  it('hides Charon with Escape at the shelf root, never while something consumes it', async () => {
    const user = userEvent.setup();
    const { shell } = renderShelf();
    const search = screen.getByRole('textbox', { name: 'Search notes' });
    await user.type(search, 'alpha');
    await user.keyboard('{Escape}');
    expect(search).toHaveProperty('value', '');
    expect(shell.shellClient.hide).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(shell.shellClient.hide).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    await screen.findByRole('textbox', { name: 'Markdown body' });
    await user.keyboard('{Escape}');
    expect(shell.shellClient.hide).toHaveBeenCalledTimes(1);
  });

  it('attaches pasted files to the open editor and creates a Note for files pasted elsewhere', async () => {
    const user = userEvent.setup();
    const intake = intakeClient();
    intake.client.paste.mockResolvedValue({ tokens: ['t1', 't2'], fileNames: ['a.pdf', 'b.png'] });
    const { commands } = renderShelf({ attachmentIntake: intake.client });

    // Text keeps the native paste.
    fireEvent.paste(document.body, { clipboardData: { types: ['text/plain'] } });
    expect(intake.client.paste).not.toHaveBeenCalled();

    fireEvent.paste(document.body, { clipboardData: { types: ['Files'] } });
    await waitFor(() =>
      expect(commands).toContainEqual(
        expect.objectContaining({ type: 'createNote', body: 'a.pdf\nb.png', tags: [] }),
      ),
    );
    await waitFor(() =>
      expect(commands).toContainEqual(
        expect.objectContaining({ type: 'importNoteAttachments', sourceTokens: ['t1', 't2'] }),
      ),
    );
    await waitFor(() => expect(liveRegion()).toBe('2 files attached'));

    commands.length = 0;
    await user.click(screen.getByRole('button', { name: 'Edit Alpha' }));
    const editor = await screen.findByRole('textbox', { name: 'Markdown body' });
    editor.focus();
    fireEvent.paste(editor, { clipboardData: { types: ['Files'] } });
    await waitFor(() =>
      expect(commands).toEqual([
        expect.objectContaining({
          type: 'importNoteAttachments',
          noteId: 'alpha',
          sourceTokens: ['t1', 't2'],
        }),
      ]),
    );
  });

  it('marks the Note under a file drag and attaches dropped files to it', async () => {
    const intake = intakeClient();
    const { commands } = renderShelf({ attachmentIntake: intake.client });
    await waitFor(() => expect(intake.client.subscribeDrop).toHaveBeenCalled());
    const row = document.querySelector<HTMLElement>('[data-note-id="beta"]');
    const elementFromPoint = vi.fn(() => row);
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    });

    act(() => intake.drag({ over: true, x: 20, y: 120 }));
    expect(row?.dataset.dropTarget).toBe('true');
    act(() =>
      intake.drop({ sources: { tokens: ['drop'], fileNames: ['spec.md'] }, x: 20, y: 120 }),
    );
    await waitFor(() =>
      expect(commands).toEqual([
        expect.objectContaining({
          type: 'importNoteAttachments',
          noteId: 'beta',
          sourceTokens: ['drop'],
        }),
      ]),
    );
    expect(row?.dataset.dropTarget).toBeUndefined();

    elementFromPoint.mockReturnValue(null);
    act(() => intake.drag({ over: true, x: 20, y: 500 }));
    expect(screen.getByText('Drop to create a note with these files')).toBeTruthy();
    act(() => intake.drag({ over: false, x: 0, y: 0 }));
    expect(screen.queryByText('Drop to create a note with these files')).toBeNull();
  });

  it('refuses more than 20 files before creating anything', async () => {
    const intake = intakeClient();
    const tokens = Array.from({ length: 21 }, (_, index) => `t${index}`);
    intake.client.paste.mockResolvedValue({ tokens, fileNames: tokens });
    const add = vi.spyOn(toast, 'add');
    const { commands } = renderShelf({ attachmentIntake: intake.client });
    fireEvent.paste(document.body, { clipboardData: { types: ['Files'] } });
    await waitFor(() =>
      expect(add).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'A note holds at most 20 attachments.' }),
      ),
    );
    expect(commands).toEqual([]);
    expect(intake.client.discard).toHaveBeenCalledWith(tokens);
  });

  it('imports each of two quick pastes into the exact Note its creation returned', async () => {
    const intake = intakeClient();
    intake.client.paste
      .mockResolvedValueOnce({ tokens: ['first'], fileNames: ['one.png'] })
      .mockResolvedValueOnce({ tokens: ['second'], fileNames: ['two.png'] });
    const { commands } = renderShelf({ attachmentIntake: intake.client });
    fireEvent.paste(document.body, { clipboardData: { types: ['Files'] } });
    fireEvent.paste(document.body, { clipboardData: { types: ['Files'] } });
    await waitFor(() => expect(commands).toHaveLength(4));
    const [firstCreate, firstImport, secondCreate, secondImport] = commands;
    expect(firstCreate).toMatchObject({ type: 'createNote', body: 'one.png' });
    expect(secondCreate).toMatchObject({ type: 'createNote', body: 'two.png' });
    expect(firstImport).toMatchObject({ type: 'importNoteAttachments', sourceTokens: ['first'] });
    expect(secondImport).toMatchObject({ type: 'importNoteAttachments', sourceTokens: ['second'] });
    const firstId = firstImport?.type === 'importNoteAttachments' ? firstImport.noteId : null;
    const secondId = secondImport?.type === 'importNoteAttachments' ? secondImport.noteId : null;
    expect(firstId).toMatch(/^created-/);
    expect(secondId).toMatch(/^created-/);
    expect(firstId).not.toBe(secondId);
    expect(intake.client.discard).not.toHaveBeenCalled();
  });

  it('forgets the pasted files when their Note cannot be created', async () => {
    const intake = intakeClient();
    intake.client.paste.mockResolvedValue({ tokens: ['shot'], fileNames: ['Pasted image.png'] });
    const { commands } = renderShelf({
      attachmentIntake: intake.client,
      onCommand: (command) => {
        if (command.type === 'createNote') throw new Error('disk full');
      },
    });
    fireEvent.paste(document.body, { clipboardData: { types: ['Files'] } });
    await waitFor(() => expect(intake.client.discard).toHaveBeenCalledWith(['shot']));
    expect(commands.map((command) => command.type)).toEqual(['createNote']);
  });

  it('opens a new drawing from the menu', async () => {
    const user = userEvent.setup();
    renderShelf();
    await user.keyboard('{Meta>}k{/Meta}');
    await user.type(await screen.findByRole('combobox'), 'new drawing');
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'Drawing' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Arrow' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Text' })).toBeTruthy();
  });

  it('keeps a New drawing with strokes when Quit is requested', async () => {
    const user = userEvent.setup();
    const add = vi.spyOn(toast, 'add');
    const { shell } = renderShelf();
    const dialog = await openNewDrawing(user);

    act(() => shell.requestQuit());
    await waitFor(() => expect(shell.shellClient.cancelQuit).toHaveBeenCalledTimes(1));
    expect(shell.shellClient.quit).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({
        description: 'Finish saving the open note or drawing before quitting.',
      }),
    );
    expect(within(dialog).getByText('Discard this drawing?')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Drawing' })).toBe(dialog);
  });

  it('keeps a New drawing open with Retry until its Note exists', async () => {
    const user = userEvent.setup();
    let failures = 1;
    const { commands } = renderShelf({
      onCommand: (command) => {
        if (command.type === 'createNote' && failures > 0) {
          failures -= 1;
          throw new Error('disk full');
        }
      },
    });
    const dialog = await openNewDrawing(user);

    await user.click(within(dialog).getByRole('button', { name: 'Insert' }));
    expect((await within(dialog).findByRole('alert')).textContent).toBe(
      'The note was not created. Your drawing is kept; retry after resolving the workspace issue.',
    );
    expect(screen.getByRole('dialog', { name: 'Drawing' })).toBe(dialog);

    await user.click(within(dialog).getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Drawing' })).toBeNull());
    const created = commands.filter((command) => command.type === 'createNote');
    expect(created).toHaveLength(2);
    expect(created[1]).toEqual(created[0]);
    await waitFor(() => expect(liveRegion()).toBe('Drawing saved as a new note'));
  });

  it('keeps the window open while a New drawing holds strokes', async () => {
    const user = userEvent.setup();
    renderShelf({ attachmentIntake: intakeClient().client });
    nativeWindow.enabled = true;
    const dialog = await openNewDrawing(user);
    await waitFor(() => expect(nativeWindow.closeHandler).toBeDefined());

    const preventDefault = vi.fn();
    act(() => nativeWindow.closeHandler?.({ preventDefault }));
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText('Discard this drawing?')).toBeTruthy();

    await user.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(nativeWindow.closeHandler).toBeUndefined());
  });
});
