import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { executeCommand } from '@/app/commands/command-registry';
import { createCopyCommands } from '@/app/commands/default-commands';
import { applyLocale } from '@/app/locale';
import { AppProviders } from '@/app/providers';
import { useWorkspace, WorkspaceProvider } from '@/app/workspace-context';
import type { ComposedClipboard, ComposeRequest } from '@/bindings/clipboard';
import type { NoteDto, WorkspaceSnapshot } from '@/bindings/workspace';
import { toast } from '@/components/ui/toast';
import {
  buildComposeRequest,
  copyNotes,
  copySuccessDescription,
  previewNotes,
  shouldPreserveNativeCopy,
} from '@/features/copy/copy-actions';
import { readCopyPreset, saveCopyPreset } from '@/features/copy/copy-preset';
import { NoteScreen } from '@/features/notes/note-screen';
import type { ClipboardClient } from '@/lib/ipc/clipboard-client';
import type { WorkspaceClient } from '@/lib/ipc/workspace-client';
import { m } from '@/paraglide/messages.js';

const note = (id: string, sectionId: string, body: string, sortKey: number): NoteDto => ({
  id,
  sectionId,
  body,
  status: 'open',
  sortKey,
  createdAt: String(sortKey),
  updatedAt: String(sortKey),
  completedAt: null,
  trashedAt: null,
});

const snapshot: WorkspaceSnapshot = {
  schemaVersion: 1,
  workspaceId: 'workspace',
  revision: 1,
  sections: [
    { id: 'ideas', name: 'Ideas', sortKey: 0, createdAt: '1', updatedAt: '1' },
    { id: 'later', name: 'Later', sortKey: 1, createdAt: '2', updatedAt: '2' },
  ],
  notes: [note('one', 'ideas', 'First', 0), note('two', 'later', 'Second', 1)],
};

const composed: ComposedClipboard = {
  markdown: 'First\n\nSecond',
  noteCount: 2,
  omittedEmptyCount: 0,
  preview: 'First\n\nSecond',
};

function ReadyNotes({ clipboardClient }: { clipboardClient: ClipboardClient }) {
  const workspace = useWorkspace();
  return workspace.snapshot ? (
    <NoteScreen clipboardClient={clipboardClient} snapshot={workspace.snapshot} />
  ) : null;
}

function renderWorkflow(clipboardClient: ClipboardClient) {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
  const workspaceClient: WorkspaceClient = {
    snapshot: async () => snapshot,
    subscribe: async () => () => undefined,
  };
  return render(
    <AppProviders>
      <WorkspaceProvider client={workspaceClient}>
        <ReadyNotes clipboardClient={clipboardClient} />
      </WorkspaceProvider>
    </AppProviders>,
  );
}

describe('copy actions', () => {
  it('builds the Rust request from ordered selection and current section values', async () => {
    const request = buildComposeRequest(snapshot, ['two', 'one'], 'sectioned');
    expect(request.notes).toEqual([
      { id: 'two', sectionName: 'Later', body: 'Second', selectionOrder: 0 },
      { id: 'one', sectionName: 'Ideas', body: 'First', selectionOrder: 1 },
    ]);

    const client: ClipboardClient = {
      preview: vi.fn(async () => composed),
      composeAndWrite: vi.fn(async () => composed),
    };
    await previewNotes(client, snapshot, ['two', 'one'], 'sectioned');
    await copyNotes(client, snapshot, ['two', 'one'], 'sectioned');
    expect(client.preview).toHaveBeenCalledWith(request);
    expect(client.composeAndWrite).toHaveBeenCalledWith(request);
  });

  it('versions and validates the remembered default preset', () => {
    saveCopyPreset('task-list');
    expect(readCopyPreset()).toBe('task-list');
    localStorage.setItem('charon.copy-preset', JSON.stringify({ version: 2, preset: 'plain' }));
    expect(readCopyPreset()).toBe('plain');
    localStorage.setItem('charon.copy-preset', '{');
    expect(readCopyPreset()).toBe('plain');
  });

  it('preserves native editable copy while commands remain available elsewhere', () => {
    const copyDefault = vi.fn();
    const command = createCopyCommands({
      isAvailable: () => true,
      copyDefault,
      preview: vi.fn(),
      copyPreset: vi.fn(),
    })[0];
    const input = document.createElement('input');
    const contentEditable = document.createElement('div');
    contentEditable.setAttribute('contenteditable', 'true');
    const row = document.createElement('div');

    expect(shouldPreserveNativeCopy(input)).toBe(true);
    expect(shouldPreserveNativeCopy(contentEditable)).toBe(true);
    expect(executeCommand(command as NonNullable<typeof command>, input)).toBe(false);
    expect(executeCommand(command as NonNullable<typeof command>, row)).toBe(true);
    expect(copyDefault).toHaveBeenCalledTimes(1);
  });

  it('copies an ordered bulk selection and reports localized plural success', async () => {
    applyLocale('en');
    const user = userEvent.setup();
    const clipboardClient: ClipboardClient = {
      preview: vi.fn(async () => composed),
      composeAndWrite: vi.fn(async (_request: ComposeRequest) => composed),
    };
    const toastSpy = vi.spyOn(toast, 'add').mockReturnValue('copy-success');
    renderWorkflow(clipboardClient);

    await user.click(await screen.findByRole('checkbox', { name: 'Select First' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Second' }));
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(clipboardClient.composeAndWrite).toHaveBeenCalledTimes(1));
    expect(clipboardClient.composeAndWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        preset: 'plain',
        notes: [
          expect.objectContaining({ id: 'one', selectionOrder: 0 }),
          expect.objectContaining({ id: 'two', selectionOrder: 1 }),
        ],
      }),
    );
    expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ description: '2 notes copied as Plain Markdown.' }),
    );

    applyLocale('fr');
    expect(
      copySuccessDescription({ noteCount: 1 }, m.copy_preset_plain(), {
        one: m.copy_success_one,
        many: m.copy_success_many,
      }),
    ).toBe('1 note copiée comme Markdown brut.');
    applyLocale('en');
  });

  it('preserves selection on failure and exposes a retry action', async () => {
    const user = userEvent.setup();
    const composeAndWrite = vi
      .fn<ClipboardClient['composeAndWrite']>()
      .mockRejectedValueOnce({
        code: 'permission_denied',
        messageKey: 'clipboard_error_permission_denied',
      })
      .mockResolvedValueOnce(composed);
    const clipboardClient: ClipboardClient = {
      preview: vi.fn(async () => composed),
      composeAndWrite,
    };
    const toastSpy = vi.spyOn(toast, 'add').mockReturnValue('copy-error');
    renderWorkflow(clipboardClient);

    await user.click(await screen.findByRole('checkbox', { name: 'Select First' }));
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(toastSpy).toHaveBeenCalled());
    expect(screen.getByText('1 note selected')).toBeTruthy();

    const errorToast = toastSpy.mock.calls.at(-1)?.[0];
    expect(errorToast).toMatchObject({
      type: 'error',
      description: 'Clipboard write access was denied. Allow it in system settings, then retry.',
    });
    (errorToast?.actionProps as { onClick?: () => void } | undefined)?.onClick?.();
    await waitFor(() => expect(composeAndWrite).toHaveBeenCalledTimes(2));
  });
});
