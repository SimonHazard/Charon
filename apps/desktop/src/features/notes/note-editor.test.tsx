import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import type { CaptureCapabilities } from '@/bindings/capture';
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
};
const captureClient: CaptureClient = {
  capabilities: async () => nativeCapabilities,
  open: async () => nativeCapabilities,
  requestPermission: async () => nativeCapabilities,
  composerReady: async () => undefined,
  subscribeComposerFocus: async () => () => undefined,
  subscribeStatus: async () => () => undefined,
};
const preferencesClient: NativePreferencesClient = {
  read: async () => ({
    schemaVersion: 1,
    workspaceName: null,
    hasRememberedWorkspace: false,
  }),
  reset: async () => ({
    schemaVersion: 1,
    workspaceName: null,
    hasRememberedWorkspace: false,
  }),
};

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
});
