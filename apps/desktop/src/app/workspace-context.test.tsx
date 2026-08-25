import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import type { WorkspaceCommand, WorkspaceSnapshot } from '@/bindings/workspace';
import type { WorkspaceClient } from '@/lib/ipc/workspace-client';
import { note, snapshot, workspaceClient } from '@/test/workspace-fixture';

function CommandHarness() {
  const workspace = useWorkspace();
  return (
    <button
      disabled={!workspace.snapshot}
      onClick={() => {
        void workspace.executeWorkspaceCommand({
          type: 'updateNote',
          noteId: 'note',
          body: 'body',
        });
        void workspace.executeWorkspaceCommand({
          type: 'setNoteTags',
          noteId: 'note',
          tags: ['Agent'],
        });
      }}
      type="button"
    >
      run
    </button>
  );
}

function WorkspaceChooserHarness() {
  const workspace = useWorkspace();
  return (
    <button onClick={() => void workspace.chooseWorkspace()} type="button">
      {workspace.snapshot?.workspaceId ?? 'Choose'}
    </button>
  );
}

function SnapshotHarness() {
  const workspace = useWorkspace();
  return (
    <div>
      <output>
        {workspace.snapshot?.revision}:{workspace.snapshot?.notes[0]?.body ?? 'empty'}
      </output>
      <button onClick={() => void workspace.refreshWorkspace()} type="button">
        refresh
      </button>
    </div>
  );
}

describe('workspace command queue', () => {
  it('serializes body and metadata writes against each acknowledged revision', async () => {
    const user = userEvent.setup();
    let current = snapshot([note({ id: 'note', body: 'initial' })]);
    const seen: WorkspaceCommand[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const client: WorkspaceClient = {
      snapshot: async () => current,
      subscribe: async () => () => undefined,
      execute: vi.fn(async (command) => {
        seen.push(command);
        if (seen.length === 1) await firstBlocked;
        current = { ...current, revision: current.revision + 1 } as WorkspaceSnapshot;
        return { snapshot: current, transactionId: `tx-${current.revision}` };
      }),
    };
    render(
      <AppProviders workspaceClient={client}>
        <CommandHarness />
      </AppProviders>,
    );
    const button = screen.getByRole('button', { name: 'run' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    await user.click(button);
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]?.expectedRevision).toBe(1);
    releaseFirst?.();
    await waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]?.expectedRevision).toBe(2);
  });

  it('opens the folder returned by the native chooser and applies its snapshot', async () => {
    const user = userEvent.setup();
    const initial = snapshot();
    const selected = { ...snapshot(), workspaceId: 'selected-workspace' };
    const client: WorkspaceClient = {
      snapshot: vi.fn().mockResolvedValue(initial),
      chooseDirectory: vi.fn().mockResolvedValue('/synthetic/selected'),
      openOrCreate: vi.fn().mockResolvedValue(selected),
      subscribe: async () => () => undefined,
    };
    render(
      <AppProviders workspaceClient={client}>
        <WorkspaceChooserHarness />
      </AppProviders>,
    );
    const button = await screen.findByRole('button', { name: initial.workspaceId });
    await user.click(button);
    await waitFor(() => expect(client.openOrCreate).toHaveBeenCalledWith('/synthetic/selected'));
    expect(await screen.findByRole('button', { name: 'selected-workspace' })).toBeTruthy();
  });

  it('ignores older events and applies a newer Workspace event', async () => {
    const initial = snapshot([note({ id: 'note', body: 'initial' })]);
    const client = workspaceClient(initial);
    render(
      <AppProviders workspaceClient={client}>
        <SnapshotHarness />
      </AppProviders>,
    );
    expect(await screen.findByText('1:initial')).toBeTruthy();

    client.emit({
      revision: 0,
      snapshot: { ...initial, revision: 0, notes: [note({ id: 'note', body: 'older' })] },
    });
    expect(screen.getByText('1:initial')).toBeTruthy();

    client.emit({
      revision: 2,
      snapshot: { ...initial, revision: 2, notes: [note({ id: 'note', body: 'newer' })] },
    });
    expect(await screen.findByText('2:newer')).toBeTruthy();
  });

  it('does not rewind when a late refresh resolves after a newer event', async () => {
    const user = userEvent.setup();
    const initial = snapshot([note({ id: 'note', body: 'initial' })]);
    const fixture = workspaceClient(initial);
    let resolveLate: ((value: WorkspaceSnapshot) => void) | undefined;
    const late = new Promise<WorkspaceSnapshot>((resolve) => {
      resolveLate = resolve;
    });
    const client = {
      ...fixture,
      snapshot: vi
        .fn()
        .mockResolvedValueOnce(initial)
        .mockImplementationOnce(() => late),
    };
    render(
      <AppProviders workspaceClient={client}>
        <SnapshotHarness />
      </AppProviders>,
    );
    expect(await screen.findByText('1:initial')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'refresh' }));
    fixture.emit({
      revision: 2,
      snapshot: { ...initial, revision: 2, notes: [note({ id: 'note', body: 'event' })] },
    });
    expect(await screen.findByText('2:event')).toBeTruthy();
    resolveLate?.({ ...initial, revision: 1, notes: [note({ id: 'note', body: 'late' })] });
    await waitFor(() => expect(client.snapshot).toHaveBeenCalledTimes(2));
    expect(screen.getByText('2:event')).toBeTruthy();
  });

  it('refreshes the Workspace when the window regains focus', async () => {
    const initial = snapshot();
    const client = workspaceClient(initial);
    client.snapshot = vi.fn(client.snapshot);
    render(
      <AppProviders workspaceClient={client}>
        <SnapshotHarness />
      </AppProviders>,
    );
    expect(await screen.findByText('1:empty')).toBeTruthy();
    fireEvent.focus(window);
    await waitFor(() => expect(client.snapshot).toHaveBeenCalledTimes(2));
  });
});
