import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useWorkspace, WorkspaceProvider } from '@/app/workspace-context';
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

describe('workspace context', () => {
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
});
