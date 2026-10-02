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

import { useWorkspace } from '@/app/workspace-context';
import { useNativePreferences } from '@/features/preferences/preferences-context';
import { isTauriRuntime } from '@/lib/platform';
import {
  tauriUpdateClient,
  type UpdateCandidate,
  type UpdateClient,
  type UpdateProgress,
} from './update-client';

const UPDATE_CHECKS_KEY = 'charon.updateChecksEnabled.v1';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'noUpdate'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'ready'
  | 'error';

type UpdateValue = {
  enabled: boolean;
  canSelfUpdate: boolean;
  status: UpdateStatus;
  version: string | null;
  notes: string;
  downloadedBytes: number;
  totalBytes: number | null;
  restartBlocked: boolean;
  /** Windows (NSIS) closes Charon to install, then the installer reopens it. */
  closesToInstall: boolean;
  setEnabled(enabled: boolean): void;
  checkNow(): Promise<void>;
  download(): Promise<void>;
  install(): Promise<void>;
  restart(): Promise<void>;
};

const UpdateContext = createContext<UpdateValue | null>(null);

function readEnabled() {
  try {
    return window.localStorage.getItem(UPDATE_CHECKS_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(UPDATE_CHECKS_KEY, String(enabled));
    return true;
  } catch {
    return false;
  }
}

export function UpdateProvider({
  children,
  client = tauriUpdateClient,
  enabled = isTauriRuntime(),
}: PropsWithChildren<{ client?: UpdateClient; enabled?: boolean }>) {
  const workspace = useWorkspace();
  const native = useNativePreferences();
  const canSelfUpdate = !['deb', 'rpm', 'msi'].includes(native.preferences.installKind);
  const closesToInstall = native.preferences.installKind === 'nsis';
  const [checksEnabled, setChecksEnabled] = useState(readEnabled);
  const [status, updateStatus] = useState<UpdateStatus>('idle');
  const statusRef = useRef<UpdateStatus>('idle');
  const setStatus = useCallback((next: UpdateStatus) => {
    statusRef.current = next;
    updateStatus(next);
  }, []);
  // Drafts can become dirty while the update downloads; read them live before installing.
  const draftsBlockedRef = useRef(workspace.isWorkspaceSwitchBlocked);
  draftsBlockedRef.current = workspace.isWorkspaceSwitchBlocked;
  const [candidate, setCandidate] = useState<UpdateCandidate | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState<number | null>(null);
  const candidateRef = useRef<UpdateCandidate | null>(null);
  const checkingRef = useRef<Promise<void> | null>(null);
  const initialCheckRef = useRef(false);

  const replaceCandidate = useCallback((next: UpdateCandidate | null) => {
    const previous = candidateRef.current;
    candidateRef.current = next;
    setCandidate(next);
    if (previous && previous !== next) void previous.close().catch(() => undefined);
  }, []);

  const checkNow = useCallback(() => {
    if (!enabled || !checksEnabled) return Promise.resolve();
    if (checkingRef.current) return checkingRef.current;
    const pending = (async () => {
      setStatus('checking');
      setDownloadedBytes(0);
      setTotalBytes(null);
      try {
        const next = await client.check();
        replaceCandidate(next);
        setStatus(next ? 'available' : 'noUpdate');
      } catch {
        replaceCandidate(null);
        setStatus('error');
      }
    })();
    checkingRef.current = pending;
    void pending.finally(() => {
      if (checkingRef.current === pending) checkingRef.current = null;
    });
    return pending;
  }, [checksEnabled, client, enabled, replaceCandidate, setStatus]);

  useEffect(() => {
    if (!checksEnabled || !enabled || initialCheckRef.current) return;
    initialCheckRef.current = true;
    void checkNow();
  }, [checkNow, checksEnabled, enabled]);

  useEffect(
    () => () => {
      const current = candidateRef.current;
      candidateRef.current = null;
      if (current) void current.close().catch(() => undefined);
    },
    [],
  );

  const setEnabled = useCallback(
    (next: boolean) => {
      if (!saveEnabled(next) && next) return;
      setChecksEnabled(next);
      if (!next) {
        initialCheckRef.current = false;
        replaceCandidate(null);
        setStatus('idle');
        setDownloadedBytes(0);
        setTotalBytes(null);
      }
    },
    [replaceCandidate, setStatus],
  );

  const download = useCallback(async () => {
    const update = candidateRef.current;
    if (
      !update ||
      !canSelfUpdate ||
      statusRef.current !== 'available' ||
      draftsBlockedRef.current
    ) {
      return;
    }
    setStatus('downloading');
    setDownloadedBytes(0);
    setTotalBytes(null);
    try {
      await update.download((event: UpdateProgress) => {
        if (event.type === 'started') {
          setTotalBytes(event.totalBytes);
          return;
        }
        if (event.type === 'progress') {
          setDownloadedBytes((current) => current + event.chunkBytes);
        }
      });
      if (candidateRef.current === update) setStatus('downloaded');
    } catch {
      if (candidateRef.current === update) setStatus('error');
    }
  }, [canSelfUpdate, setStatus]);

  // Installing can end the process on Windows, so drafts are re-checked right before it.
  const install = useCallback(async () => {
    const update = candidateRef.current;
    if (!update || statusRef.current !== 'downloaded' || draftsBlockedRef.current) return;
    setStatus('installing');
    try {
      await update.install({ restartAfterInstall: closesToInstall });
      if (candidateRef.current === update) setStatus('ready');
    } catch {
      if (candidateRef.current === update) setStatus('error');
    }
  }, [closesToInstall, setStatus]);

  // macOS and Linux install in place without exiting, so they continue on their own once every
  // draft is safe. Windows waits for its explicit "Close and install".
  useEffect(() => {
    if (status !== 'downloaded' || closesToInstall || workspace.isWorkspaceSwitchBlocked) return;
    void install();
  }, [closesToInstall, install, status, workspace.isWorkspaceSwitchBlocked]);

  const restart = useCallback(async () => {
    if (status !== 'ready' || workspace.isWorkspaceSwitchBlocked) return;
    try {
      await client.relaunch();
    } catch {
      setStatus('error');
    }
  }, [client, setStatus, status, workspace.isWorkspaceSwitchBlocked]);

  const value = useMemo<UpdateValue>(
    () => ({
      enabled: checksEnabled,
      canSelfUpdate,
      status,
      version: candidate?.version ?? null,
      notes: candidate?.notes ?? '',
      downloadedBytes,
      totalBytes,
      restartBlocked: workspace.isWorkspaceSwitchBlocked,
      closesToInstall,
      setEnabled,
      checkNow,
      download,
      install,
      restart,
    }),
    [
      candidate,
      canSelfUpdate,
      checkNow,
      checksEnabled,
      closesToInstall,
      download,
      downloadedBytes,
      install,
      restart,
      setEnabled,
      status,
      totalBytes,
      workspace.isWorkspaceSwitchBlocked,
    ],
  );

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>;
}

export function useUpdates() {
  const value = useContext(UpdateContext);
  if (!value) throw new Error('useUpdates must be used inside UpdateProvider');
  return value;
}
