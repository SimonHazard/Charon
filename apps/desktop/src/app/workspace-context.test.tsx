import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  useWorkspace,
  type WorkspaceCommandDraft,
  WorkspaceProvider,
} from '@/app/workspace-context';
import type { WorkspaceSnapshot } from '@/bindings/workspace';
import type { WorkspaceClient, WorkspaceListener } from '@/lib/ipc/workspace-client';

const snapshot = (revision: number): WorkspaceSnapshot => ({
  schemaVersion: 1,
  workspaceId: 'workspace',
  revision,
  sections: [],
  notes: [],
});

function Observer() {
  const state = useWorkspace();
  return <output>{`${state.status}:${state.snapshot?.revision ?? 'none'}`}</output>;
}

let workspaceApi: ReturnType<typeof useWorkspace> | null = null;

function ApiObserver() {
  workspaceApi = useWorkspace();
  return <output>{`${workspaceApi.status}:${workspaceApi.snapshot?.revision ?? 'none'}`}</output>;
}

describe('workspace context', () => {
  it('bootstraps a localized default workspace when none is open', async () => {
    const bootstrapDefault = vi.fn(async () => snapshot(1));
    const client: WorkspaceClient = {
      snapshot: async () =>
        Promise.reject({
          code: 'not_open',
          messageKey: 'workspace_error_not_open',
        }),
      bootstrapDefault,
      subscribe: async () => () => undefined,
    };

    render(
      <WorkspaceProvider client={client} defaultSectionName="Boîte de réception">
        <Observer />
      </WorkspaceProvider>,
    );

    await screen.findByText('ready:1');
    expect(bootstrapDefault).toHaveBeenCalledWith('Boîte de réception');
  });

  it('keeps directory choice available when default bootstrap fails', async () => {
    const chooseDirectory = vi.fn(async () => '/local/Notes');
    const openOrCreate = vi.fn(async () => snapshot(3));
    const client: WorkspaceClient = {
      snapshot: async () =>
        Promise.reject({
          code: 'not_open',
          messageKey: 'workspace_error_not_open',
        }),
      bootstrapDefault: async () =>
        Promise.reject({
          code: 'io',
          messageKey: 'workspace_error_io',
        }),
      chooseDirectory,
      openOrCreate,
      subscribe: async () => () => undefined,
    };

    render(
      <WorkspaceProvider client={client} defaultSectionName="Inbox">
        <ApiObserver />
      </WorkspaceProvider>,
    );

    await screen.findByText('empty:none');
    expect(workspaceApi?.canChooseWorkspace).toBe(true);
    await act(async () => {
      await workspaceApi?.chooseWorkspace();
    });
    expect(chooseDirectory).toHaveBeenCalledTimes(1);
    expect(openOrCreate).toHaveBeenCalledWith('/local/Notes', 'Inbox');
    expect(screen.getByText('ready:3')).toBeTruthy();
  });

  it('leaves the empty state unchanged when directory choice is cancelled', async () => {
    const openOrCreate = vi.fn(async () => snapshot(3));
    const client: WorkspaceClient = {
      snapshot: async () =>
        Promise.reject({
          code: 'not_open',
          messageKey: 'workspace_error_not_open',
        }),
      chooseDirectory: async () => null,
      openOrCreate,
      subscribe: async () => () => undefined,
    };

    render(
      <WorkspaceProvider client={client}>
        <ApiObserver />
      </WorkspaceProvider>,
    );

    await screen.findByText('empty:none');
    await act(async () => {
      await workspaceApi?.chooseWorkspace();
    });
    expect(openOrCreate).not.toHaveBeenCalled();
    expect(screen.getByText('empty:none')).toBeTruthy();
  });

  it('loads, accepts newer events, ignores stale events, and cleans up once', async () => {
    let listener: WorkspaceListener | undefined;
    const unsubscribe = vi.fn();
    const client: WorkspaceClient = {
      snapshot: async () => snapshot(2),
      subscribe: async (next) => {
        listener = next;
        return unsubscribe;
      },
    };
    const view = render(
      <WorkspaceProvider client={client}>
        <Observer />
      </WorkspaceProvider>,
    );
    await screen.findByText('ready:2');
    listener?.({ revision: 1, snapshot: snapshot(1) });
    expect(screen.getByText('ready:2')).toBeTruthy();
    listener?.({ revision: 3, snapshot: snapshot(3) });
    await screen.findByText('ready:3');
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('switches clients without leaking the old subscription', async () => {
    const firstCleanup = vi.fn();
    const first: WorkspaceClient = {
      snapshot: async () => snapshot(1),
      subscribe: async () => firstCleanup,
    };
    const second: WorkspaceClient = {
      snapshot: async () => snapshot(4),
      subscribe: async () => () => undefined,
    };
    const view = render(
      <WorkspaceProvider client={first} workspaceKey="one">
        <Observer />
      </WorkspaceProvider>,
    );
    await screen.findByText('ready:1');
    view.rerender(
      <WorkspaceProvider client={second} workspaceKey="two">
        <Observer />
      </WorkspaceProvider>,
    );
    await screen.findByText('ready:4');
    await waitFor(() => expect(firstCleanup).toHaveBeenCalledTimes(1));
  });

  it('does not reconnect an open workspace when the localized default name changes', async () => {
    const readSnapshot = vi.fn(async () => snapshot(2));
    const client: WorkspaceClient = {
      snapshot: readSnapshot,
      subscribe: async () => () => undefined,
    };
    const view = render(
      <WorkspaceProvider client={client} defaultSectionName="Inbox">
        <Observer />
      </WorkspaceProvider>,
    );
    await screen.findByText('ready:2');

    view.rerender(
      <WorkspaceProvider client={client} defaultSectionName="Boîte de réception">
        <Observer />
      </WorkspaceProvider>,
    );

    expect(screen.getByText('ready:2')).toBeTruthy();
    expect(readSnapshot).toHaveBeenCalledTimes(1);
  });

  it('retains the last valid snapshot when subscription setup reports an error', async () => {
    const client: WorkspaceClient = {
      snapshot: async () => snapshot(7),
      subscribe: async () =>
        Promise.reject({
          code: 'watch_failed',
          messageKey: 'workspace_error_unknown',
        }),
    };
    render(
      <WorkspaceProvider client={client}>
        <Observer />
      </WorkspaceProvider>,
    );
    expect(await screen.findByText('warning:7')).toBeTruthy();
  });

  it('serializes writes and stamps each command with the latest revision', async () => {
    const commands: number[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const client: WorkspaceClient = {
      snapshot: async () => snapshot(1),
      subscribe: async () => () => undefined,
      execute: async (command) => {
        commands.push(command.expectedRevision);
        if (commands.length === 1) await firstGate;
        const next = snapshot(command.expectedRevision + 1);
        return { snapshot: next, transactionId: `tx-${next.revision}`, undoToken: null };
      },
    };
    render(
      <WorkspaceProvider client={client}>
        <ApiObserver />
      </WorkspaceProvider>,
    );
    await screen.findByText('ready:1');
    const draft: WorkspaceCommandDraft = { type: 'createSection', name: 'Ideas', sortKey: 0 };
    const first = workspaceApi?.executeWorkspaceCommand(draft);
    const second = workspaceApi?.executeWorkspaceCommand(draft);
    await waitFor(() => expect(commands).toEqual([1]));
    releaseFirst?.();
    await act(async () => {
      await Promise.all([first, second]);
    });
    expect(commands).toEqual([1, 2]);
    expect(screen.getByText('ready:3')).toBeTruthy();
  });

  it('refreshes after a stale revision and asks the view to retry', async () => {
    let snapshots = 0;
    const client: WorkspaceClient = {
      snapshot: async () => snapshot(++snapshots === 1 ? 2 : 5),
      subscribe: async () => () => undefined,
      execute: async () =>
        Promise.reject({
          code: 'stale_revision',
          messageKey: 'workspace_error_stale_revision',
          expectedRevision: 2,
          actualRevision: 5,
          recoveryLocation: null,
        }),
    };
    render(
      <WorkspaceProvider client={client}>
        <ApiObserver />
      </WorkspaceProvider>,
    );
    await screen.findByText('ready:2');
    await act(async () => {
      await expect(
        workspaceApi?.executeWorkspaceCommand({
          type: 'createSection',
          name: 'Ideas',
          sortKey: 0,
        }),
      ).rejects.toMatchObject({ code: 'stale_revision' });
    });
    expect(screen.getByText('warning:5')).toBeTruthy();
  });
});
