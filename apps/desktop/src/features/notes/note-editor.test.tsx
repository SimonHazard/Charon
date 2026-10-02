import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import type { CaptureCapabilities } from '@/bindings/capture';
import type { PreferencesSnapshot } from '@/bindings/preferences';
import { NoteEditor, normalizeTagInput } from '@/features/notes/note-editor';
import type { CaptureClient } from '@/lib/ipc/capture-client';
import type { NativePreferencesClient } from '@/lib/ipc/preferences-client';
import { note, snapshot, workspaceClient } from '@/test/workspace-fixture';

const nativeWindow = vi.hoisted(() => ({
  enabled: false,
  closeHandler: undefined as
    | ((event: { preventDefault(): void }) => void | Promise<void>)
    | undefined,
  destroy: vi.fn().mockResolvedValue(undefined),
  unlisten: vi.fn(),
}));

vi.mock('@/lib/platform', () => ({ isTauriRuntime: () => nativeWindow.enabled }));
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    destroy: nativeWindow.destroy,
    onCloseRequested: async (
      handler: (event: { preventDefault(): void }) => void | Promise<void>,
    ) => {
      nativeWindow.closeHandler = handler;
      return nativeWindow.unlisten;
    },
  }),
}));

const nativeCapabilities: CaptureCapabilities = {
  platform: 'macos',
  standardShortcut: 'available',
  inputMonitoring: 'denied',
  accessibility: 'denied',
  doubleShift: 'denied',
  selectedText: 'denied',
  activeShortcut: 'CmdOrCtrl+Shift+Space',
  defaultShortcut: 'CmdOrCtrl+Shift+Space',
  shortcutOrigin: 'default',
  shortcutConfigurable: true,
  richCapture: 'experimental',
};
function captureClientFor(platform: CaptureCapabilities['platform']): CaptureClient {
  const capabilities: CaptureCapabilities = {
    ...nativeCapabilities,
    platform,
    richCapture: platform === 'macos' ? 'experimental' : 'unsupported',
  };
  return {
    capabilities: async () => capabilities,
    open: async () => capabilities,
    requestPermission: async () => capabilities,
    setShortcut: async () => capabilities,
    composerReady: async () => undefined,
    subscribeComposerFocus: async () => () => undefined,
    subscribeStatus: async () => () => undefined,
  };
}
// Closing quits on Windows and Linux; on macOS the window hides instead.
const captureClient = captureClientFor('windows');
const macosCaptureClient = captureClientFor('macos');
function preferencesClientWith(backgroundActive: boolean): NativePreferencesClient {
  const preferences: PreferencesSnapshot = {
    schemaVersion: 1,
    workspaceName: null,
    hasRememberedWorkspace: false,
    installKind: 'unknown',
    backgroundMode: backgroundActive,
    trayAvailability: 'available',
    backgroundActive,
    captureNotifications: false,
    richCapture: false,
  };
  return {
    read: async () => preferences,
    reset: async () => preferences,
    setBackgroundMode: async () => preferences,
    setCaptureNotifications: async () => preferences,
    setRichCapture: async () => preferences,
  };
}
const preferencesClient = preferencesClientWith(false);

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

function editorProps(
  overrides: Partial<React.ComponentProps<typeof NoteEditor>> = {},
): React.ComponentProps<typeof NoteEditor> {
  return {
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
}

function editor(overrides: Partial<React.ComponentProps<typeof NoteEditor>> = {}) {
  const props = editorProps(overrides);
  render(
    <AppProviders>
      <NoteEditor {...props} />
    </AppProviders>,
  );
  return props;
}

describe('inline note editor', () => {
  it('opens Markdown help without editing the draft and Escape closes only the help', async () => {
    const props = editor();
    const user = userEvent.setup();
    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    const trigger = screen.getByRole('button', { name: 'Markdown help' });
    await user.click(trigger);
    expect(
      await screen.findByText('Use these examples in Write, then switch to Preview.'),
    ).toBeTruthy();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByText('Use these examples in Write, then switch to Preview.')).toBeNull(),
    );
    expect(document.activeElement).toBe(trigger);
    expect((textarea as HTMLTextAreaElement).value).toBe('Original');
    expect(props.onSave).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('preserves a reverted draft when the older save snapshot arrives before its response', async () => {
    let finishSave!: () => void;
    const onSave = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishSave = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const props = editorProps({ onSave });
    const view = render(
      <AppProviders>
        <NoteEditor {...props} />
      </AppProviders>,
    );
    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    fireEvent.change(textarea, { target: { value: 'Older edit' } });
    fireEvent.blur(textarea);
    fireEvent.change(textarea, { target: { value: 'Original' } });
    expect(props.onDirtyChange).toHaveBeenLastCalledWith(true);
    view.rerender(
      <AppProviders>
        <NoteEditor {...props} note={{ ...current, body: 'Older edit' }} />
      </AppProviders>,
    );
    expect((textarea as HTMLTextAreaElement).value).toBe('Original');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await act(async () => finishSave());
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls.map(([body]) => body)).toEqual(['Older edit', 'Original']);
  });
  it('flushes a revert made while an older body is still being saved', async () => {
    let resolveSave!: () => void;
    const onSave = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    const props = editor({ onSave });
    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    fireEvent.change(textarea, { target: { value: 'Temporary edit' } });
    fireEvent.blur(textarea);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('Temporary edit'));
    fireEvent.change(textarea, { target: { value: 'Original' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => resolveSave());
    await waitFor(() => expect(props.onClose).toHaveBeenCalledTimes(1));
    expect(onSave.mock.calls.map(([body]) => body)).toEqual(['Temporary edit', 'Original']);
  });

  it('marks a Tag removal busy until it settles and keeps focus in the Tag field', async () => {
    let finish!: () => void;
    const onSetTags = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    editor({ note: { ...current, tags: ['Agent', 'Research'] }, onSetTags });
    // Let the editor's mount-time focus land first so it cannot race the Tag focus below.
    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    const remove = screen.getByRole('button', { name: 'Remove tag Agent' });
    remove.focus();
    fireEvent.click(remove);
    expect(remove.getAttribute('aria-busy')).toBe('true');
    expect(remove.getAttribute('aria-disabled')).toBe('true');
    expect(remove.hasAttribute('disabled')).toBe(false);
    expect(document.activeElement).toBe(remove);
    fireEvent.click(remove);
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag Research' }));
    expect(onSetTags).toHaveBeenCalledTimes(1);
    expect(onSetTags).toHaveBeenCalledWith(['Research']);
    expect(
      screen.getByRole('button', { name: 'Remove tag Research' }).getAttribute('aria-busy'),
    ).toBe('false');

    await act(async () => finish());
    expect(remove.getAttribute('aria-busy')).toBe('false');
    expect(remove.getAttribute('aria-disabled')).toBe('false');
    expect(document.activeElement).toBe(screen.getByRole('combobox'));
  });

  it('removes one Tag per Backspace press in the empty field, never on key repeat', async () => {
    const onSetTags = vi.fn().mockResolvedValue(undefined);
    editor({ note: { ...current, tags: ['Agent', 'Research'] }, onSetTags });
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onSetTags).toHaveBeenCalledTimes(1);
    expect(onSetTags).toHaveBeenLastCalledWith(['Agent']);
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Remove tag Research' }).getAttribute('aria-busy'),
      ).toBe('false'),
    );
    // Holding the key repeats it: once the removal settled, repeats remove nothing more.
    fireEvent.keyDown(input, { key: 'Backspace', repeat: true });
    fireEvent.keyDown(input, { key: 'Backspace', repeat: true });
    expect(onSetTags).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onSetTags).toHaveBeenCalledTimes(2);
  });

  it('brings a failed save forward from Preview and focuses Retry when closing', async () => {
    const user = userEvent.setup();
    const props = editor({ onSave: vi.fn().mockRejectedValue({ messageKey: 'x' }) });
    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    fireEvent.change(textarea, { target: { value: 'Unsaved body' } });
    await user.click(screen.getByRole('tab', { name: 'Preview' }));
    expect(screen.queryByRole('textbox', { name: 'Markdown body' })).toBeNull();
    const close = screen.getByRole('button', { name: 'Close' });
    await user.click(close);
    const retry = await screen.findByRole('button', { name: 'Retry' });
    await waitFor(() => expect(document.activeElement).toBe(retry));
    expect(screen.getByRole('tab', { name: 'Write' }).getAttribute('aria-selected')).toBe('true');
    expect(
      (screen.getByRole('textbox', { name: 'Markdown body' }) as HTMLTextAreaElement).value,
    ).toBe('Unsaved body');
    expect(close.getAttribute('aria-busy')).toBe('false');
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it('keeps a failed Tag removal contextual and ignores IME confirmation keys', async () => {
    const props = editor({ onSetTags: vi.fn().mockRejectedValue(new Error('unavailable')) });
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag Agent' }));
    expect(await screen.findByText('Could not save the tags. Try again.')).toBeTruthy();
    const input = screen.getByRole('combobox');
    fireEvent.change(input, { target: { value: '日本語' } });
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(props.onSetTags).toHaveBeenCalledTimes(1);
  });
  beforeEach(() => {
    nativeWindow.enabled = false;
    nativeWindow.closeHandler = undefined;
    nativeWindow.destroy.mockClear();
    nativeWindow.unlisten.mockClear();
  });

  it('renders the current body on the first paint', () => {
    editor();
    expect(screen.getByRole('textbox', { name: 'Markdown body' })).toHaveProperty(
      'value',
      'Original',
    );
  });

  it('normalizes one optional leading hash and adds tags on Enter', async () => {
    expect(normalizeTagInput('  #Research  ')).toBe('Research');
    const user = userEvent.setup();
    const onSetTags = vi.fn().mockResolvedValue(undefined);
    editor({ onSetTags });
    await user.type(screen.getByPlaceholderText('Add a tag…'), '#Research{Enter}');
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
    const onSave = vi
      .fn()
      .mockRejectedValueOnce({ messageKey: 'note_editor_save_error' })
      .mockResolvedValue(undefined);
    editor({ onSave });
    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    await user.clear(textarea);
    await user.type(textarea, 'Unsaved body');
    await user.tab();
    await screen.findByText(/draft is preserved/i);
    expect((textarea as HTMLTextAreaElement).value).toBe('Unsaved body');
    expect(screen.getByText('Not saved')).toBeTruthy();
    expect(screen.queryByText('Saved')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
  });

  it('saves the draft at once with CmdOrCtrl+S', async () => {
    // Fake timers that still follow the wall clock, so the 650 ms autosave window can be
    // passed at once below without a real wait.
    vi.useFakeTimers({ shouldAdvanceTime: true, toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      const onSave = vi.fn().mockResolvedValue(undefined);
      editor({ onSave });
      const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
      await user.type(textarea, ' changed');
      await user.keyboard('{Meta>}s{/Meta}');
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith('Original changed');
      expect(await screen.findByText('Saved')).toBeTruthy();
      expect(document.activeElement).toBe(textarea);

      // Nothing changed since: Ctrl+S and the autosave window write nothing more.
      expect(fireEvent.keyDown(textarea, { key: 's', ctrlKey: true })).toBe(false);
      await act(() => vi.advanceTimersByTimeAsync(700));
      expect(onSave).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('flushes one dirty draft when the editor unmounts before autosave', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <AppProviders>
        <NoteEditor {...editorProps({ onSave })} />
      </AppProviders>,
    );
    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    await user.clear(textarea);
    await user.type(textarea, 'Flush before debounce');
    view.unmount();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith('Flush before debounce');
  });

  it('flushes a dirty draft once before allowing the native window to close', async () => {
    nativeWindow.enabled = true;
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <AppProviders
        captureClient={captureClient}
        preferencesClient={preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <NoteEditor {...editorProps({ onSave })} />
      </AppProviders>,
    );
    await waitFor(() => expect(nativeWindow.closeHandler).toBeDefined());
    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    await user.clear(textarea);
    await user.type(textarea, 'Close-safe draft');

    const preventDefault = vi.fn();
    await nativeWindow.closeHandler?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Close-safe draft');
    expect(nativeWindow.destroy).toHaveBeenCalledTimes(1);

    view.unmount();
    await Promise.resolve();
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('keeps native close protection until an unmount flush settles', async () => {
    nativeWindow.enabled = true;
    const user = userEvent.setup();
    let releaseSave: (() => void) | undefined;
    const blockedSave = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    const onSave = vi.fn().mockReturnValue(blockedSave);
    const view = render(
      <AppProviders
        captureClient={captureClient}
        preferencesClient={preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <NoteEditor {...editorProps({ onSave })} />
      </AppProviders>,
    );
    await waitFor(() => expect(nativeWindow.closeHandler).toBeDefined());
    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    await user.clear(textarea);
    await user.type(textarea, 'Pending unmount draft');
    view.unmount();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(nativeWindow.unlisten).not.toHaveBeenCalled();

    const preventDefault = vi.fn();
    const close = nativeWindow.closeHandler?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    releaseSave?.();
    await close;

    expect(nativeWindow.destroy).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(nativeWindow.unlisten).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('waits for an older native save and persists a reverted body before closing', async () => {
    nativeWindow.enabled = true;
    let finishSave!: () => void;
    const onSave = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishSave = resolve;
          }),
      )
      .mockResolvedValue(undefined);
    render(
      <AppProviders
        captureClient={captureClient}
        preferencesClient={preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <NoteEditor {...editorProps({ onSave })} />
      </AppProviders>,
    );
    await waitFor(() => expect(nativeWindow.closeHandler).toBeDefined());
    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    fireEvent.change(textarea, { target: { value: 'Pending edit' } });
    fireEvent.blur(textarea);
    fireEvent.change(textarea, { target: { value: 'Original' } });
    const preventDefault = vi.fn();
    const closing = nativeWindow.closeHandler?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(nativeWindow.destroy).not.toHaveBeenCalled();
    await act(async () => {
      finishSave();
      await closing;
    });
    expect(onSave.mock.calls.map(([body]) => body)).toEqual(['Pending edit', 'Original']);
    expect(nativeWindow.destroy).toHaveBeenCalledTimes(1);
  });

  it('flushes a clean and a dirty draft on macOS without destroying the hidden window', async () => {
    nativeWindow.enabled = true;
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders
        captureClient={macosCaptureClient}
        preferencesClient={preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <NoteEditor {...editorProps({ onSave })} />
      </AppProviders>,
    );
    await waitFor(() => expect(nativeWindow.closeHandler).toBeDefined());

    // Native capabilities arrive asynchronously; a clean macOS close is still prevented.
    await waitFor(async () => {
      const preventDefault = vi.fn();
      await nativeWindow.closeHandler?.({ preventDefault });
      expect(preventDefault).toHaveBeenCalledTimes(1);
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(nativeWindow.destroy).not.toHaveBeenCalled();

    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    await user.clear(textarea);
    await user.type(textarea, 'Hidden-window draft');
    const preventDefault = vi.fn();
    await nativeWindow.closeHandler?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Hidden-window draft');
    expect(nativeWindow.destroy).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Markdown body' })).toBe(textarea);
  });

  it('keeps the macOS window before native capabilities load', async () => {
    nativeWindow.enabled = true;
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const pendingCapabilities: CaptureClient = {
      ...macosCaptureClient,
      capabilities: () => new Promise(() => undefined),
    };
    const onSave = vi.fn().mockResolvedValue(undefined);
    try {
      render(
        <AppProviders
          captureClient={pendingCapabilities}
          preferencesClient={preferencesClient}
          workspaceClient={workspaceClient(snapshot())}
        >
          <NoteEditor {...editorProps({ onSave })} />
        </AppProviders>,
      );
      await waitFor(() => expect(nativeWindow.closeHandler).toBeDefined());
      const preventDefault = vi.fn();
      await nativeWindow.closeHandler?.({ preventDefault });
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(onSave).not.toHaveBeenCalled();
      expect(nativeWindow.destroy).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('flushes a clean and a dirty draft without destroying the window while background mode hides it', async () => {
    nativeWindow.enabled = true;
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders
        captureClient={captureClient}
        preferencesClient={preferencesClientWith(true)}
        workspaceClient={workspaceClient(snapshot())}
      >
        <NoteEditor {...editorProps({ onSave })} />
      </AppProviders>,
    );
    await waitFor(() => expect(nativeWindow.closeHandler).toBeDefined());

    // On Windows, the tray icon makes closing hide Charon; native preferences load asynchronously.
    await waitFor(async () => {
      const preventDefault = vi.fn();
      await nativeWindow.closeHandler?.({ preventDefault });
      expect(preventDefault).toHaveBeenCalledTimes(1);
    });
    expect(onSave).not.toHaveBeenCalled();
    expect(nativeWindow.destroy).not.toHaveBeenCalled();

    const textarea = screen.getByRole('textbox', { name: 'Markdown body' });
    await user.clear(textarea);
    await user.type(textarea, 'Tray-hidden draft');
    const preventDefault = vi.fn();
    await nativeWindow.closeHandler?.({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('Tray-hidden draft');
    expect(nativeWindow.destroy).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Markdown body' })).toBe(textarea);
  });

  it('keeps the window open behind the discard prompt while a drawing holds strokes', async () => {
    nativeWindow.enabled = true;
    const user = userEvent.setup();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <AppProviders
        captureClient={captureClient}
        preferencesClient={preferencesClient}
        workspaceClient={workspaceClient(snapshot())}
      >
        <NoteEditor {...editorProps({ onSave })} />
      </AppProviders>,
    );
    await waitFor(() => expect(nativeWindow.closeHandler).toBeDefined());

    // An open drawing without strokes never holds the window.
    fireEvent.click(screen.getByRole('button', { name: 'Draw' }));
    let dialog = await screen.findByRole('dialog', { name: 'Drawing' });
    const untouched = vi.fn();
    await nativeWindow.closeHandler?.({ preventDefault: untouched });
    expect(untouched).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Draw' }));
    dialog = await screen.findByRole('dialog', { name: 'Drawing' });
    drawDot(within(dialog).getByRole('img', { name: 'Drawing canvas' }));
    const preventDefault = vi.fn();
    await act(async () => {
      await nativeWindow.closeHandler?.({ preventDefault });
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(nativeWindow.destroy).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Discard this drawing?')).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(dialog).getByRole('button', { name: 'Keep drawing' }),
      ),
    );
    expect(onSave).not.toHaveBeenCalled();

    // Once discarded, the next close quits as before.
    await user.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const afterDiscard = vi.fn();
    await nativeWindow.closeHandler?.({ preventDefault: afterDiscard });
    expect(afterDiscard).not.toHaveBeenCalled();
  });

  it('refuses to leave the draft (another Note or Quit) while a drawing holds unsaved strokes', async () => {
    const user = userEvent.setup();
    let guard: (() => Promise<boolean>) | undefined;
    const props = editor({
      registerDraftGuard: (next) => {
        guard = next;
        return () => undefined;
      },
    });
    await waitFor(() => expect(guard).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: 'Draw' }));
    const dialog = await screen.findByRole('dialog', { name: 'Drawing' });
    drawDot(within(dialog).getByRole('img', { name: 'Drawing canvas' }));
    let allowed: boolean | undefined;
    await act(async () => {
      allowed = await guard?.();
    });
    expect(allowed).toBe(false);
    expect(within(dialog).getByText('Discard this drawing?')).toBeTruthy();
    expect(props.onSave).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Discard' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await act(async () => {
      allowed = await guard?.();
    });
    expect(allowed).toBe(true);
  });
});

/** One pen dot on the drawing canvas, laid out as a 960 by 600 surface. */
function drawDot(canvas: Element) {
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
  fireEvent.pointerDown(canvas, { pointerId: 1, button: 0, buttons: 1, clientX: 10, clientY: 10 });
  fireEvent.pointerUp(canvas, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
}
