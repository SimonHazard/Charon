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
import { asCaptureError, type CaptureClient, tauriCaptureClient } from '@/lib/ipc/capture-client';
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
  installKind: 'unknown',
  backgroundMode: false,
  trayAvailability: 'unavailable',
  backgroundActive: false,
  captureNotifications: false,
  richCapture: false,
};

type NativePreferencesValue = {
  preferences: PreferencesSnapshot;
  capabilities: CaptureCapabilities | null;
  loading: boolean;
  pendingPermission: CapturePermissionKind | null;
  errorKey: string | null;
  pendingBackground: boolean;
  /** A background-mode failure, shown beside its toggle rather than with capture errors. */
  backgroundErrorKey: string | null;
  pendingNotifications: boolean;
  /** A capture-notification failure, shown beside its toggle. */
  notificationsErrorKey: string | null;
  pendingRichCapture: boolean;
  /** A formatted-capture failure, shown beside its toggle (ADR 0026). */
  richCaptureErrorKey: string | null;
  pendingShortcut: boolean;
  /** A composer-shortcut change failure, shown beside the shortcut row (ADR 0025). */
  shortcutErrorKey: string | null;
  refresh(): Promise<void>;
  requestPermission(permission: CapturePermissionKind): Promise<void>;
  setBackgroundMode(enabled: boolean): Promise<void>;
  setCaptureNotifications(enabled: boolean): Promise<void>;
  setRichCapture(enabled: boolean): Promise<void>;
  /** Replaces the composer accelerator, or restores the default with `null`; true on success. */
  setShortcut(shortcut: string | null): Promise<boolean>;
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
  const [pendingBackground, setPendingBackground] = useState(false);
  const [backgroundErrorKey, setBackgroundErrorKey] = useState<string | null>(null);
  const [pendingNotifications, setPendingNotifications] = useState(false);
  const [notificationsErrorKey, setNotificationsErrorKey] = useState<string | null>(null);
  const [pendingRichCapture, setPendingRichCapture] = useState(false);
  const [richCaptureErrorKey, setRichCaptureErrorKey] = useState<string | null>(null);
  const [pendingShortcut, setPendingShortcut] = useState(false);
  const [shortcutErrorKey, setShortcutErrorKey] = useState<string | null>(null);
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

  const setBackgroundMode = useCallback(
    async (enabled: boolean) => {
      setPendingBackground(true);
      setBackgroundErrorKey(null);
      try {
        setPreferences(await preferencesClient.setBackgroundMode(enabled));
      } catch (error) {
        setBackgroundErrorKey(asPreferencesError(error).messageKey);
      } finally {
        setPendingBackground(false);
      }
    },
    [preferencesClient],
  );

  const setCaptureNotifications = useCallback(
    async (enabled: boolean) => {
      setPendingNotifications(true);
      setNotificationsErrorKey(null);
      try {
        setPreferences(await preferencesClient.setCaptureNotifications(enabled));
      } catch (error) {
        setNotificationsErrorKey(asPreferencesError(error).messageKey);
      } finally {
        setPendingNotifications(false);
      }
    },
    [preferencesClient],
  );

  const setRichCapture = useCallback(
    async (enabled: boolean) => {
      setPendingRichCapture(true);
      setRichCaptureErrorKey(null);
      try {
        setPreferences(await preferencesClient.setRichCapture(enabled));
      } catch (error) {
        setRichCaptureErrorKey(asPreferencesError(error).messageKey);
      } finally {
        setPendingRichCapture(false);
      }
    },
    [preferencesClient],
  );

  const setShortcut = useCallback(
    async (shortcut: string | null) => {
      setPendingShortcut(true);
      setShortcutErrorKey(null);
      try {
        setCapabilities(await captureClient.setShortcut(shortcut));
        return true;
      } catch (error) {
        // Rust kept the previous accelerator active, so the displayed one stays true.
        setShortcutErrorKey(asCaptureError(error).messageKey);
        return false;
      } finally {
        setPendingShortcut(false);
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
        pendingBackground,
        backgroundErrorKey,
        pendingNotifications,
        notificationsErrorKey,
        pendingRichCapture,
        richCaptureErrorKey,
        pendingShortcut,
        shortcutErrorKey,
        refresh,
        requestPermission,
        setBackgroundMode,
        setCaptureNotifications,
        setRichCapture,
        setShortcut,
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
