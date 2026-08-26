import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import type { CaptureCapabilities, CapturePermissionKind } from '@/bindings/capture';
import type { PreferencesSnapshot } from '@/bindings/preferences';
import { type CaptureClient, tauriCaptureClient } from '@/lib/ipc/capture-client';
import {
  asPreferencesError,
  type NativePreferencesClient,
  tauriPreferencesClient,
} from '@/lib/ipc/preferences-client';
import { isTauriRuntime } from '@/lib/platform';

const defaultPreferences: PreferencesSnapshot = {
  schemaVersion: 1,
  workspaceName: null,
  hasRememberedWorkspace: false,
};

type NativePreferencesValue = {
  preferences: PreferencesSnapshot;
  capabilities: CaptureCapabilities | null;
  loading: boolean;
  pendingPermission: CapturePermissionKind | null;
  errorKey: string | null;
  refresh(): Promise<void>;
  requestPermission(permission: CapturePermissionKind): Promise<void>;
};

const NativePreferencesContext = createContext<NativePreferencesValue | null>(null);

export function NativePreferencesProvider({
  children,
  captureClient = tauriCaptureClient,
  preferencesClient = tauriPreferencesClient,
  enabled = isTauriRuntime(),
}: PropsWithChildren<{
  captureClient?: CaptureClient;
  preferencesClient?: NativePreferencesClient;
  enabled?: boolean;
}>) {
  const [preferences, setPreferences] = useState(defaultPreferences);
  const [capabilities, setCapabilities] = useState<CaptureCapabilities | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [pendingPermission, setPendingPermission] = useState<CapturePermissionKind | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const refreshPromiseRef = useRef<Promise<void> | null>(null);

  const refresh = useCallback(() => {
    if (!enabled) return Promise.resolve();
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const pending = (async () => {
      setLoading(true);
      setErrorKey(null);
      try {
        const [nextPreferences, nextCapabilities] = await Promise.all([
          preferencesClient.read(),
          captureClient.capabilities(),
        ]);
        setPreferences(nextPreferences);
        setCapabilities(nextCapabilities);
      } catch (error) {
        setErrorKey(asPreferencesError(error).messageKey);
      } finally {
        setLoading(false);
      }
    })();
    refreshPromiseRef.current = pending;
    void pending.finally(() => {
      if (refreshPromiseRef.current === pending) refreshPromiseRef.current = null;
    });
    return pending;
  }, [captureClient, enabled, preferencesClient]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.removeEventListener('focus', refreshWhenVisible);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [enabled, refresh]);

  const requestPermission = useCallback(
    async (permission: CapturePermissionKind) => {
      setPendingPermission(permission);
      setErrorKey(null);
      try {
        setCapabilities(await captureClient.requestPermission(permission));
      } catch (error) {
        setErrorKey(asPreferencesError(error).messageKey);
      } finally {
        setPendingPermission(null);
      }
    },
    [captureClient],
  );

  return (
    <NativePreferencesContext.Provider
      value={{
        preferences,
        capabilities,
        loading,
        pendingPermission,
        errorKey,
        refresh,
        requestPermission,
      }}
    >
      {children}
    </NativePreferencesContext.Provider>
  );
}

export function useNativePreferences() {
  const value = useContext(NativePreferencesContext);
  if (!value) throw new Error('useNativePreferences must be used inside NativePreferencesProvider');
  return value;
}
