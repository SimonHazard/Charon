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
  setEnabled(enabled: boolean): void;
  checkNow(): Promise<void>;
  downloadAndInstall(): Promise<void>;
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
  const [checksEnabled, setChecksEnabled] = useState(readEnabled);
  const [status, setStatus] = useState<UpdateStatus>('idle');
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
  }, [checksEnabled, client, enabled, replaceCandidate]);

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
    [replaceCandidate],
  );

  const downloadAndInstall = useCallback(async () => {
    const update = candidateRef.current;
    if (!update || !canSelfUpdate || workspace.isWorkspaceSwitchBlocked) return;
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
      setStatus('installing');
      await update.install();
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [canSelfUpdate, workspace.isWorkspaceSwitchBlocked]);

  const restart = useCallback(async () => {
    if (status !== 'ready' || workspace.isWorkspaceSwitchBlocked) return;
    try {
      await client.relaunch();
    } catch {
      setStatus('error');
    }
  }, [client, status, workspace.isWorkspaceSwitchBlocked]);

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
      setEnabled,
      checkNow,
      downloadAndInstall,
      restart,
    }),
    [
      candidate,
      canSelfUpdate,
      checkNow,
      checksEnabled,
      downloadAndInstall,
      downloadedBytes,
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
