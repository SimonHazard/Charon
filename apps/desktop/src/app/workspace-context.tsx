import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';

import type { WorkspaceIpcError, WorkspaceSnapshot } from '@/bindings/workspace';
import {
  asWorkspaceError,
  tauriWorkspaceClient,
  type WorkspaceClient,
} from '@/lib/ipc/workspace-client';
import { isTauriRuntime } from '@/lib/platform';

export type WorkspaceViewState =
  | { status: 'loading'; snapshot: WorkspaceSnapshot | null; error: null }
  | { status: 'empty'; snapshot: null; error: null }
  | { status: 'ready'; snapshot: WorkspaceSnapshot; error: null }
  | { status: 'warning'; snapshot: WorkspaceSnapshot; error: WorkspaceIpcError }
  | { status: 'error'; snapshot: null; error: WorkspaceIpcError };

const browserClient: WorkspaceClient = {
  snapshot: () =>
    Promise.reject({
      code: 'not_open',
      messageKey: 'workspace_error_not_open',
      expectedRevision: null,
      actualRevision: null,
      recoveryLocation: null,
    } satisfies WorkspaceIpcError),
  subscribe: async () => () => undefined,
};

const WorkspaceContext = createContext<WorkspaceViewState | null>(null);

export function WorkspaceProvider({
  children,
  client = isTauriRuntime() ? tauriWorkspaceClient : browserClient,
  workspaceKey = 'current',
}: PropsWithChildren<{ client?: WorkspaceClient; workspaceKey?: string }>) {
  const [state, setState] = useState<WorkspaceViewState>({
    status: 'loading',
    snapshot: null,
    error: null,
  });

  useEffect(() => {
    void workspaceKey;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setState({ status: 'loading', snapshot: null, error: null });

    const connect = async () => {
      try {
        const snapshot = await client.snapshot();
        if (!active) return;
        setState({ status: 'ready', snapshot, error: null });
        unsubscribe = await client.subscribe((event) => {
          if (!active) return;
          setState((current) => {
            const revision = current.snapshot?.revision ?? -1;
            return event.revision > revision
              ? { status: 'ready', snapshot: event.snapshot, error: null }
              : current;
          });
        });
        if (!active) unsubscribe();
      } catch (error) {
        if (!active) return;
        const workspaceError = asWorkspaceError(error);
        setState((current) =>
          workspaceError.code === 'not_open'
            ? { status: 'empty', snapshot: null, error: null }
            : current.snapshot
              ? { status: 'warning', snapshot: current.snapshot, error: workspaceError }
              : { status: 'error', snapshot: null, error: workspaceError },
        );
      }
    };

    void connect();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [client, workspaceKey]);

  return <WorkspaceContext.Provider value={state}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
