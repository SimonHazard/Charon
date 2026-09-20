import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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
import { reconcileSnapshot } from '@/lib/workspace-snapshot';

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
  chooseWorkspace(): Promise<'blocked' | 'cancelled' | 'success' | 'failed'>;
  openDefaultWorkspace(): Promise<boolean>;
  retryWorkspaceStartup(): Promise<boolean>;
  canChooseWorkspace: boolean;
  isChoosingWorkspace: boolean;
  workspaceSwitchError: WorkspaceIpcError | null;
  dismissWorkspaceSwitchError(): void;
  isWorkspaceSwitchBlocked: boolean;
  setWorkspaceSwitchBlocked(blocked: boolean): void;
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
}: PropsWithChildren<{
  client?: WorkspaceClient;
  workspaceKey?: string;
}>) {
  const [state, setState] = useState<WorkspaceViewState>({
    status: 'loading',
    snapshot: null,
    error: null,
  });
  const snapshotRef = useRef<WorkspaceSnapshot | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [isChoosingWorkspace, setIsChoosingWorkspace] = useState(false);
  const [isWorkspaceSwitchBlocked, updateWorkspaceSwitchBlocked] = useState(false);
  const workspaceSwitchBlockedRef = useRef(false);
  const setWorkspaceSwitchBlocked = useCallback((blocked: boolean) => {
    workspaceSwitchBlockedRef.current = blocked;
    updateWorkspaceSwitchBlocked(blocked);
  }, []);
  const [workspaceSwitchError, setWorkspaceSwitchError] = useState<WorkspaceIpcError | null>(null);
  const dismissWorkspaceSwitchError = useCallback(() => setWorkspaceSwitchError(null), []);
  const lastFocusRefreshRef = useRef(Number.NEGATIVE_INFINITY);

  const applySnapshot = useCallback((snapshot: WorkspaceSnapshot) => {
    const current = snapshotRef.current;
    if (
      current &&
      current.workspaceId === snapshot.workspaceId &&
      snapshot.revision < current.revision
    ) {
      return current;
    }
    const merged = reconcileSnapshot(current, snapshot);
    snapshotRef.current = merged;
    setState({ status: 'ready', snapshot: merged, error: null });
    return merged;
  }, []);

  const refreshWorkspace = useCallback(() => {
    const refresh = async () => applySnapshot(await client.snapshot());
    const pending = writeQueueRef.current.then(refresh, refresh);
    writeQueueRef.current = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
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
    if (isWorkspaceSwitchBlocked) return 'blocked' as const;
    if (!client.chooseDirectory || !client.openOrCreate) return 'failed' as const;
    setIsChoosingWorkspace(true);
    try {
      const path = await client.chooseDirectory();
      if (!path) return 'cancelled' as const;
      if (workspaceSwitchBlockedRef.current) return 'blocked' as const;
      const snapshot = await client.openOrCreate(path);
      applySnapshot(snapshot);
      setWorkspaceSwitchError(null);
      return 'success' as const;
    } catch (error) {
      const workspaceError = asWorkspaceError(error);
      setWorkspaceSwitchError(workspaceError);
      setState((current) =>
        current.snapshot ? current : { status: 'empty', snapshot: null, error: workspaceError },
      );
      return 'failed' as const;
    } finally {
      setIsChoosingWorkspace(false);
    }
  }, [applySnapshot, client, isWorkspaceSwitchBlocked]);

  const openDefaultWorkspace = useCallback(async () => {
    if (isWorkspaceSwitchBlocked || !client.bootstrapDefault) return false;
    setIsChoosingWorkspace(true);
    try {
      applySnapshot(await client.bootstrapDefault());
      setWorkspaceSwitchError(null);
      return true;
    } catch (error) {
      const workspaceError = asWorkspaceError(error);
      setWorkspaceSwitchError(workspaceError);
      setState((current) =>
        current.snapshot ? current : { status: 'empty', snapshot: null, error: workspaceError },
      );
      return false;
    } finally {
      setIsChoosingWorkspace(false);
    }
  }, [applySnapshot, client, isWorkspaceSwitchBlocked]);

  const retryWorkspaceStartup = useCallback(async () => {
    if (!client.bootstrap) return false;
    try {
      applySnapshot(await client.bootstrap());
      return true;
    } catch (error) {
      const workspaceError = asWorkspaceError(error);
      setState({ status: 'empty', snapshot: null, error: workspaceError });
      return false;
    }
  }, [applySnapshot, client]);

  useEffect(() => {
    void workspaceKey;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setState({ status: 'loading', snapshot: null, error: null });
    snapshotRef.current = null;
    writeQueueRef.current = Promise.resolve();
    setIsChoosingWorkspace(false);
    setWorkspaceSwitchBlocked(false);
    setWorkspaceSwitchError(null);

    const connect = async () => {
      try {
        let snapshot: WorkspaceSnapshot;
        try {
          snapshot = await client.snapshot();
        } catch (error) {
          const workspaceError = asWorkspaceError(error);
          if (workspaceError.code !== 'not_open') throw workspaceError;
          if (client.bootstrap) snapshot = await client.bootstrap();
          else if (client.bootstrapDefault) snapshot = await client.bootstrapDefault();
          else throw workspaceError;
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
          if (!active || event.origin !== 'external') return;
          const current = snapshotRef.current;
          if (
            current &&
            current.workspaceId === event.snapshot.workspaceId &&
            event.revision <= current.revision
          ) {
            return;
          }
          const merged = reconcileSnapshot(current, event.snapshot);
          snapshotRef.current = merged;
          setState({ status: 'ready', snapshot: merged, error: null });
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
  }, [applySnapshot, client, workspaceKey, setWorkspaceSwitchBlocked]);

  useEffect(() => {
    if (state.status !== 'ready' && state.status !== 'warning') return;
    const refreshWhenVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = performance.now();
      if (now - lastFocusRefreshRef.current < 1_000) return;
      lastFocusRefreshRef.current = now;
      void refreshWorkspace().catch(() => undefined);
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshWorkspace, state.status]);

  const canChooseWorkspace = Boolean(client.chooseDirectory && client.openOrCreate);
  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ...state,
      executeWorkspaceCommand,
      refreshWorkspace,
      chooseWorkspace,
      openDefaultWorkspace,
      retryWorkspaceStartup,
      canChooseWorkspace,
      isChoosingWorkspace,
      workspaceSwitchError,
      dismissWorkspaceSwitchError,
      isWorkspaceSwitchBlocked,
      setWorkspaceSwitchBlocked,
    }),
    [
      canChooseWorkspace,
      chooseWorkspace,
      executeWorkspaceCommand,
      isChoosingWorkspace,
      workspaceSwitchError,
      dismissWorkspaceSwitchError,
      isWorkspaceSwitchBlocked,
      setWorkspaceSwitchBlocked,
      openDefaultWorkspace,
      refreshWorkspace,
      retryWorkspaceStartup,
      state,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error('useWorkspace must be used inside WorkspaceProvider');
  return value;
}
