import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import type {
  WorkspaceCommand,
  WorkspaceCommandResult,
  WorkspaceIpcError,
  WorkspaceSnapshot,
} from '@/bindings/workspace';
import {
  asWorkspaceError,
  tauriWorkspaceClient,
  type WorkspaceClient,
} from '@/lib/ipc/workspace-client';
import { isTauriRuntime } from '@/lib/platform';
import { m } from '@/paraglide/messages.js';

export type WorkspaceViewState =
  | { status: 'loading'; snapshot: WorkspaceSnapshot | null; error: null }
  | { status: 'empty'; snapshot: null; error: WorkspaceIpcError | null }
  | { status: 'ready'; snapshot: WorkspaceSnapshot; error: null }
  | { status: 'warning'; snapshot: WorkspaceSnapshot; error: WorkspaceIpcError }
  | { status: 'error'; snapshot: null; error: WorkspaceIpcError };

export type WorkspaceCommandDraft = {
  [Type in WorkspaceCommand['type']]: Omit<
    Extract<WorkspaceCommand, { type: Type }>,
    'expectedRevision'
  >;
}[WorkspaceCommand['type']];

type WorkspaceContextValue = WorkspaceViewState & {
  executeWorkspaceCommand(command: WorkspaceCommandDraft): Promise<WorkspaceCommandResult>;
  refreshWorkspace(): Promise<WorkspaceSnapshot>;
  chooseWorkspace(): Promise<void>;
  canChooseWorkspace: boolean;
  isChoosingWorkspace: boolean;
};

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

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  children,
  client = isTauriRuntime() ? tauriWorkspaceClient : browserClient,
  workspaceKey = 'current',
  defaultSectionName = m.workspace_default_section(),
}: PropsWithChildren<{
  client?: WorkspaceClient;
  workspaceKey?: string;
  defaultSectionName?: string;
}>) {
  const [state, setState] = useState<WorkspaceViewState>({
    status: 'loading',
    snapshot: null,
    error: null,
  });
  const snapshotRef = useRef<WorkspaceSnapshot | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const defaultSectionNameRef = useRef(defaultSectionName);
  defaultSectionNameRef.current = defaultSectionName;
  const [isChoosingWorkspace, setIsChoosingWorkspace] = useState(false);

  const applySnapshot = useCallback((snapshot: WorkspaceSnapshot) => {
    snapshotRef.current = snapshot;
    setState({ status: 'ready', snapshot, error: null });
  }, []);

  const refreshWorkspace = useCallback(async () => {
    const snapshot = await client.snapshot();
    applySnapshot(snapshot);
    return snapshot;
  }, [applySnapshot, client]);

  const executeWorkspaceCommand = useCallback(
    (draft: WorkspaceCommandDraft) => {
      const execute = async () => {
        const snapshot = snapshotRef.current;
        if (!snapshot || !client.execute) {
          throw asWorkspaceError({
            code: 'not_open',
            messageKey: 'workspace_error_not_open',
          });
        }

        const command = {
          ...draft,
          expectedRevision: snapshot.revision,
        } as WorkspaceCommand;

        try {
          const result = await client.execute(command);
          applySnapshot(result.snapshot);
          return result;
        } catch (error) {
          const workspaceError = asWorkspaceError(error);
          if (workspaceError.code === 'stale_revision') {
            try {
              const refreshed = await client.snapshot();
              snapshotRef.current = refreshed;
              setState({ status: 'warning', snapshot: refreshed, error: workspaceError });
            } catch {
              setState((current) =>
                current.snapshot
                  ? { status: 'warning', snapshot: current.snapshot, error: workspaceError }
                  : { status: 'error', snapshot: null, error: workspaceError },
              );
            }
          } else {
            setState((current) =>
              current.snapshot
                ? { status: 'warning', snapshot: current.snapshot, error: workspaceError }
                : { status: 'error', snapshot: null, error: workspaceError },
            );
          }
          throw workspaceError;
        }
      };

      const pending = writeQueueRef.current.then(execute, execute);
      writeQueueRef.current = pending.then(
        () => undefined,
        () => undefined,
      );
      return pending;
    },
    [applySnapshot, client],
  );

  const chooseWorkspace = useCallback(async () => {
    if (!client.chooseDirectory || !client.openOrCreate) return;
    setIsChoosingWorkspace(true);
    try {
      const path = await client.chooseDirectory();
      if (!path) return;
      const snapshot = await client.openOrCreate(path, defaultSectionName);
      applySnapshot(snapshot);
    } catch (error) {
      const workspaceError = asWorkspaceError(error);
      setState((current) =>
        current.snapshot
          ? { status: 'warning', snapshot: current.snapshot, error: workspaceError }
          : { status: 'empty', snapshot: null, error: workspaceError },
      );
    } finally {
      setIsChoosingWorkspace(false);
    }
  }, [applySnapshot, client, defaultSectionName]);

  useEffect(() => {
    void workspaceKey;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setState({ status: 'loading', snapshot: null, error: null });
    snapshotRef.current = null;
    writeQueueRef.current = Promise.resolve();
    setIsChoosingWorkspace(false);

    const connect = async () => {
      try {
        let snapshot: WorkspaceSnapshot;
        try {
          snapshot = await client.snapshot();
        } catch (error) {
          const workspaceError = asWorkspaceError(error);
          if (workspaceError.code !== 'not_open' || !client.bootstrapDefault) throw workspaceError;
          snapshot = await client.bootstrapDefault(defaultSectionNameRef.current);
        }
        if (!active) return;
        applySnapshot(snapshot);
      } catch (error) {
        if (!active) return;
        const workspaceError = asWorkspaceError(error);
        setState((current) =>
          workspaceError.code === 'not_open'
            ? { status: 'empty', snapshot: null, error: null }
            : current.snapshot
              ? { status: 'warning', snapshot: current.snapshot, error: workspaceError }
              : { status: 'empty', snapshot: null, error: workspaceError },
        );
      }

      try {
        unsubscribe = await client.subscribe((event) => {
          if (!active) return;
          setState((current) => {
            const revision = current.snapshot?.revision ?? -1;
            if (event.revision <= revision) return current;
            snapshotRef.current = event.snapshot;
            return { status: 'ready', snapshot: event.snapshot, error: null };
          });
        });
        if (!active) unsubscribe();
      } catch (error) {
        if (!active) return;
        const workspaceError = asWorkspaceError(error);
        setState((current) =>
          current.snapshot
            ? { status: 'warning', snapshot: current.snapshot, error: workspaceError }
            : current.status === 'empty'
              ? current
              : { status: 'error', snapshot: null, error: workspaceError },
        );
      }
    };

    void connect();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [applySnapshot, client, workspaceKey]);

  return (
    <WorkspaceContext.Provider
      value={{
        ...state,
        executeWorkspaceCommand,
        refreshWorkspace,
        chooseWorkspace,
        canChooseWorkspace: Boolean(client.chooseDirectory && client.openOrCreate),
        isChoosingWorkspace,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
