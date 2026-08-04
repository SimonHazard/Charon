import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useCaptureEditor } from '@/app/capture-editor-context';
import { AppProviders } from '@/app/providers';
import { useWorkspace, WorkspaceProvider } from '@/app/workspace-context';
import type {
  NoteDto,
  WorkspaceCommand,
  WorkspaceCommandResult,
  WorkspaceSnapshot,
} from '@/bindings/workspace';
import { NoteScreen } from '@/features/notes/note-screen';
import type { WorkspaceClient } from '@/lib/ipc/workspace-client';

const note = (id: string, body: string, sortKey: number): NoteDto => ({
  id,
  sectionId: 'section',
  body,
  status: 'open',
  sortKey,
  createdAt: String(sortKey),
  updatedAt: String(sortKey),
  completedAt: null,
  trashedAt: null,
});

const initial: WorkspaceSnapshot = {
  schemaVersion: 1,
  workspaceId: 'workspace',
  revision: 1,
  sections: [{ id: 'section', name: 'Ideas', sortKey: 0, createdAt: '1', updatedAt: '1' }],
  notes: [note('one', 'First', 0), note('two', 'Second', 1), note('three', 'Third', 2)],
};

function ReadyNotes() {
  const workspace = useWorkspace();
  return workspace.snapshot ? <NoteScreen snapshot={workspace.snapshot} /> : null;
}

let captureRequestId = 0;
let emitCaptureRequest: (() => void) | undefined;
let setNotesMounted: ((mounted: boolean) => void) | undefined;

function CaptureRequestBridge() {
  const { receive } = useCaptureEditor();
  emitCaptureRequest = () => receive({ requestId: ++captureRequestId });
  return null;
}

function RemountableReadyNotes() {
  const workspace = useWorkspace();
  const [mounted, setMounted] = useState(true);
  setNotesMounted = setMounted;
  return mounted && workspace.snapshot ? <NoteScreen snapshot={workspace.snapshot} /> : null;
}

function setupClient() {
  let current = initial;
  const execute = vi.fn(async (command: WorkspaceCommand): Promise<WorkspaceCommandResult> => {
    if (command.type === 'mergeNotes') {
      const now = '2026-07-30T20:00:00Z';
      current = {
        ...current,
        revision: current.revision + 1,
        notes: [
          ...current.notes.map((candidate) =>
            command.noteIds.includes(candidate.id) ? { ...candidate, trashedAt: now } : candidate,
          ),
          note('composite', 'First\n\n---\n\nSecond', command.sortKey),
        ],
      };
    } else if (command.type === 'batchTrash') {
      current = {
        ...current,
        revision: current.revision + 1,
        notes: current.notes.map((candidate) =>
          command.noteIds.includes(candidate.id)
            ? { ...candidate, trashedAt: '2026-07-30T20:00:00Z' }
            : candidate,
        ),
      };
    } else if (command.type === 'createNote') {
      current = {
        ...current,
        revision: current.revision + 1,
        notes: [
          ...current.notes,
          {
            ...note(`created-${current.revision}`, command.body, command.sortKey),
            sectionId: command.sectionId,
          },
        ],
      };
    }
    return {
      snapshot: current,
      transactionId: `tx-${current.revision}`,
      undoToken: `tx-${current.revision}`,
    };
  });
  const client: WorkspaceClient = {
    snapshot: async () => current,
    subscribe: async () => () => undefined,
    execute,
  };
  return { client, execute };
}

function renderScreen(client: WorkspaceClient, withCaptureRequest = false) {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(900);
  return render(
    <AppProviders>
      <WorkspaceProvider client={client}>
        <ReadyNotes />
        {withCaptureRequest ? <CaptureRequestBridge /> : null}
      </WorkspaceProvider>
    </AppProviders>,
  );
}

describe('note screen workflows', () => {
  it('maps a selected merge to one Rust command and focuses the composite after success', async () => {
    const user = userEvent.setup();
    const { client, execute } = setupClient();
    renderScreen(client);
    await user.click(await screen.findByRole('checkbox', { name: 'Select First' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Second' }));
    expect(screen.getByText('2 notes selected')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Merge' }));
    await user.click(screen.getByRole('button', { name: 'Create composite' }));
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      type: 'mergeNotes',
      noteIds: ['one', 'two'],
      destinationSectionId: 'section',
    });
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-note-focus')).toBe('composite'),
    );
  });

  it('supports range selection and grouped trash from the keyboard', async () => {
    const user = userEvent.setup();
    const { client, execute } = setupClient();
    renderScreen(client);
    await screen.findByRole('button', { name: /First.*Ideas.*Open/ });
    await waitFor(() =>
      expect(document.activeElement?.getAttribute('data-note-focus')).toBe('one'),
    );
    await user.keyboard('{ArrowDown}');
    await user.keyboard(' ');
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(screen.getByText('2 notes selected')).toBeTruthy();
    await user.keyboard('{Delete}');
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Move to trash' });
    await user.click(confirm);
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      type: 'batchTrash',
      noteIds: ['two', 'three'],
    });
  });

  it('creates one normal note from the compact input in the active section', async () => {
    const user = userEvent.setup();
    const { client, execute } = setupClient();
    renderScreen(client);
    const input = await screen.findByRole('textbox', { name: 'Add a note to Ideas' });
    await user.type(input, 'Captured inline{Enter}');
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      type: 'createNote',
      sectionId: 'section',
      body: 'Captured inline',
    });
  });

  it('opens an unpersisted empty editor and preserves its dirty draft on repeated requests', async () => {
    const user = userEvent.setup();
    const { client, execute } = setupClient();
    renderScreen(client, true);
    await act(async () => emitCaptureRequest?.());
    const editor = await screen.findByRole('textbox', { name: 'Markdown body' });
    expect(document.activeElement).toBe(editor);
    expect((editor as HTMLTextAreaElement).value).toBe('');
    expect(execute).not.toHaveBeenCalled();

    await user.type(editor, 'Unsaved thought');
    await act(async () => emitCaptureRequest?.());
    expect((editor as HTMLTextAreaElement).value).toBe('Unsaved thought');
    expect(document.activeElement).toBe(editor);
    expect(execute).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Save now' }));
    await waitFor(() => expect(execute).toHaveBeenCalledTimes(1));
    expect(execute.mock.calls[0]?.[0]).toMatchObject({
      type: 'createNote',
      sectionId: 'section',
      body: 'Unsaved thought',
    });
  });

  it('replaces a clean existing-note editor with an empty draft on a capture request', async () => {
    const user = userEvent.setup();
    const { client, execute } = setupClient();
    renderScreen(client, true);
    const first = await screen.findByRole('button', { name: /First.*Ideas.*Open/ });
    await user.dblClick(first);
    expect(
      ((await screen.findByRole('textbox', { name: 'Markdown body' })) as HTMLTextAreaElement)
        .value,
    ).toBe('First');

    await act(async () => emitCaptureRequest?.());

    const editor = await screen.findByRole('textbox', { name: 'Markdown body' });
    expect((editor as HTMLTextAreaElement).value).toBe('');
    expect(document.activeElement).toBe(editor);
    expect(execute).not.toHaveBeenCalled();
  });

  it('consumes an editor request so remounting Notes does not replay it', async () => {
    const { client } = setupClient();
    render(
      <AppProviders>
        <WorkspaceProvider client={client}>
          <RemountableReadyNotes />
          <CaptureRequestBridge />
        </WorkspaceProvider>
      </AppProviders>,
    );

    await act(async () => emitCaptureRequest?.());
    expect(await screen.findByRole('textbox', { name: 'Markdown body' })).toBeTruthy();

    await act(async () => setNotesMounted?.(false));
    expect(screen.queryByRole('textbox', { name: 'Markdown body' })).toBeNull();
    await act(async () => setNotesMounted?.(true));
    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: 'Markdown body' })).toBeNull(),
    );
  });
});
