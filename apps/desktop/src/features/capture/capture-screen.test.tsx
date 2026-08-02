import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import { WorkspaceProvider } from '@/app/workspace-context';
import type { CaptureCapabilities, CaptureRequest } from '@/bindings/capture';
import type {
  WorkspaceCommand,
  WorkspaceCommandResult,
  WorkspaceSnapshot,
} from '@/bindings/workspace';
import { CaptureScreen } from '@/features/capture/capture-screen';
import type { CaptureClient, CaptureRequestListener } from '@/lib/ipc/capture-client';
import type { WorkspaceClient } from '@/lib/ipc/workspace-client';

const capabilities = (state: CaptureCapabilities['doubleShift']): CaptureCapabilities => ({
  platform: 'macos',
  standardShortcut: 'available',
  doubleShift: state,
  selectedText: state,
  activeShortcut: 'CmdOrCtrl+Shift+Space',
});

const workspaceSnapshot: WorkspaceSnapshot = {
  schemaVersion: 1,
  workspaceId: 'workspace',
  revision: 1,
  sections: [
    { id: 'inbox', name: 'Inbox', sortKey: 0, createdAt: '1', updatedAt: '1' },
    { id: 'later', name: 'Later', sortKey: 1, createdAt: '1', updatedAt: '1' },
  ],
  notes: [],
};

function request(
  requestId: number,
  prefill: string,
  state = capabilities('available'),
): CaptureRequest {
  return { requestId, trigger: 'doubleShift', prefill, capabilities: state };
}

function setup({
  state = capabilities('available'),
  execute,
}: {
  state?: CaptureCapabilities;
  execute?: (command: WorkspaceCommand) => Promise<WorkspaceCommandResult>;
} = {}) {
  let listener: CaptureRequestListener | undefined;
  const unsubscribe = vi.fn();
  const close = vi.fn(async () => undefined);
  const captureClient: CaptureClient = {
    capabilities: async () => state,
    open: async () => state,
    requestPermission: async () => capabilities('available'),
    setShortcut: async () => state,
    close,
    subscribe: async (next) => {
      listener = next;
      return unsubscribe;
    },
  };
  const executeMock = vi.fn(
    execute ??
      (async (): Promise<WorkspaceCommandResult> => ({
        snapshot: { ...workspaceSnapshot, revision: 2 },
        transactionId: 'capture-transaction',
        undoToken: 'capture-transaction',
      })),
  );
  const workspaceClient: WorkspaceClient = {
    snapshot: async () => workspaceSnapshot,
    subscribe: async () => () => undefined,
    execute: executeMock,
  };
  const view = render(
    <AppProviders>
      <WorkspaceProvider client={workspaceClient}>
        <CaptureScreen client={captureClient} />
      </WorkspaceProvider>
    </AppProviders>,
  );
  return {
    close,
    execute: executeMock,
    emit(next: CaptureRequest) {
      act(() => listener?.(next));
    },
    unsubscribe,
    view,
  };
}

describe('capture screen', () => {
  it('prefills authorized selection, focuses immediately, and cleans up its listener', async () => {
    const harness = setup();
    const textarea = await screen.findByRole('textbox', { name: 'Markdown' });
    harness.emit(request(1, 'Selected from another app'));
    expect((textarea as HTMLTextAreaElement).value).toBe('Selected from another app');
    await waitFor(() => expect(document.activeElement).toBe(textarea));
    harness.view.unmount();
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('shows the permission-denied fallback and keeps an empty manual draft usable', async () => {
    const harness = setup({ state: capabilities('denied') });
    const textarea = await screen.findByRole('textbox', { name: 'Markdown' });
    harness.emit(request(1, '', capabilities('denied')));
    expect((textarea as HTMLTextAreaElement).value).toBe('');
    expect(await screen.findByText(/Accessibility is off/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enable Accessibility' })).toBeTruthy();
  });

  it('does not promise a global shortcut when runtime registration failed', async () => {
    const state = { ...capabilities('denied'), standardShortcut: 'error' as const };
    const harness = setup({ state });
    await screen.findByRole('textbox', { name: 'Markdown' });
    harness.emit(request(1, '', state));
    expect(await screen.findByText(/Global capture is unavailable/)).toBeTruthy();
  });

  it('preserves a dirty draft and refocuses it when capture is triggered again', async () => {
    const user = userEvent.setup();
    const harness = setup();
    const textarea = await screen.findByRole('textbox', { name: 'Markdown' });
    harness.emit(request(1, 'initial'));
    await user.clear(textarea);
    await user.type(textarea, 'my unsaved draft');
    harness.emit(request(2, 'new external selection'));
    expect((textarea as HTMLTextAreaElement).value).toBe('my unsaved draft');
    await waitFor(() => expect(document.activeElement).toBe(textarea));
  });

  it('confirms dirty close and discards only after explicit action', async () => {
    const user = userEvent.setup();
    const harness = setup();
    const textarea = await screen.findByRole('textbox', { name: 'Markdown' });
    harness.emit(request(1, ''));
    await user.type(textarea, 'keep this');
    await user.click(screen.getByRole('button', { name: /^Close/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(harness.close).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Discard draft' }));
    await waitFor(() => expect(harness.close).toHaveBeenCalledTimes(1));
  });

  it('preserves a conflict draft and sends exactly one create command per retry', async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const harness = setup({
      execute: async (command) => {
        attempts += 1;
        if (attempts === 1) {
          throw {
            code: 'stale_revision',
            messageKey: 'workspace_error_stale_revision',
            expectedRevision: 1,
            actualRevision: 2,
            recoveryLocation: null,
          };
        }
        expect(command.type).toBe('createNote');
        return {
          snapshot: { ...workspaceSnapshot, revision: 3 },
          transactionId: 'capture-transaction',
          undoToken: 'capture-transaction',
        };
      },
    });
    const textarea = await screen.findByRole('textbox', { name: 'Markdown' });
    harness.emit(request(1, ''));
    await user.type(textarea, 'retry-safe draft');
    const save = screen.getByRole('button', { name: /^Save/ });
    await user.click(save);
    expect(await screen.findByText(/note was not saved/i)).toBeTruthy();
    expect((textarea as HTMLTextAreaElement).value).toBe('retry-safe draft');
    expect(harness.execute).toHaveBeenCalledTimes(1);
    await user.click(save);
    await waitFor(() => expect(harness.execute).toHaveBeenCalledTimes(2));
    expect(harness.execute.mock.calls[1]?.[0]).toMatchObject({
      type: 'createNote',
      sectionId: 'inbox',
      body: 'retry-safe draft',
    });
    expect(harness.close).toHaveBeenCalledTimes(1);
  });

  it('keeps Enter multiline and saves only with the explicit modified shortcut', async () => {
    const user = userEvent.setup();
    const harness = setup();
    const textarea = await screen.findByRole('textbox', { name: 'Markdown' });
    harness.emit(request(1, ''));
    await user.type(textarea, 'line one{enter}line two');
    expect((textarea as HTMLTextAreaElement).value).toBe('line one\nline two');
    expect(harness.execute).not.toHaveBeenCalled();
    await user.keyboard('{Control>}{Enter}{/Control}');
    await waitFor(() => expect(harness.execute).toHaveBeenCalledTimes(1));
  });
});
