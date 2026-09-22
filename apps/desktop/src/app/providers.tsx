import type { ThemeName } from '@charon/theme/theme-contract';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { captureStatusTone } from '@/app/capture-status';
import { ComposerFocusProvider, useComposerFocus } from '@/app/composer-focus-context';
import { type AppLocale, applyLocale, readLocale } from '@/app/locale';
import { readTheme, saveTheme } from '@/app/theme';
import { WorkspaceProvider } from '@/app/workspace-context';
import { toast } from '@/components/ui/toast';
import { NativePreferencesProvider } from '@/features/preferences/preferences-context';
import type { UpdateClient } from '@/features/updates/update-client';
import { UpdateProvider } from '@/features/updates/update-context';
import { type CaptureClient, tauriCaptureClient } from '@/lib/ipc/capture-client';
import type { NativePreferencesClient } from '@/lib/ipc/preferences-client';
import type { WorkspaceClient } from '@/lib/ipc/workspace-client';
import { isTauriRuntime } from '@/lib/platform';
import { MotionSystem } from '@/motion/system';
import { m } from '@/paraglide/messages.js';

type Preferences = {
  theme: ThemeName;
  locale: AppLocale;
  setTheme(theme: ThemeName): void;
  setLocale(locale: AppLocale): void;
};

const PreferencesContext = createContext<Preferences | null>(null);

export function AppProviders({
  children,
  workspaceClient,
  captureClient,
  preferencesClient,
  updateClient,
}: PropsWithChildren<{
  workspaceClient?: WorkspaceClient;
  captureClient?: CaptureClient;
  preferencesClient?: NativePreferencesClient;
  updateClient?: UpdateClient;
}>) {
  const [theme, updateTheme] = useState(readTheme);
  const [locale, updateLocale] = useState(readLocale);
  const activeCaptureClient = captureClient ?? tauriCaptureClient;
  const nativePreferencesEnabled = isTauriRuntime() || Boolean(captureClient || preferencesClient);
  const updaterEnabled = isTauriRuntime() || Boolean(updateClient);

  const setTheme = useCallback((next: ThemeName) => {
    saveTheme(next);
    updateTheme(next);
  }, []);
  const setLocale = useCallback((next: AppLocale) => {
    applyLocale(next);
    updateLocale(next);
  }, []);
  const preferences = useMemo<Preferences>(
    () => ({ theme, locale, setTheme, setLocale }),
    [locale, setLocale, setTheme, theme],
  );

  useEffect(() => {
    applyLocale(readLocale());
  }, []);

  return (
    <PreferencesContext.Provider value={preferences}>
      <MotionSystem>
        <WorkspaceProvider client={workspaceClient}>
          <NativePreferencesProvider
            captureClient={activeCaptureClient}
            enabled={nativePreferencesEnabled}
            preferencesClient={preferencesClient}
          >
            <UpdateProvider client={updateClient} enabled={updaterEnabled}>
              <ComposerFocusProvider>
                <CaptureBridge client={activeCaptureClient} enabled={nativePreferencesEnabled} />
                {children}
              </ComposerFocusProvider>
            </UpdateProvider>
          </NativePreferencesProvider>
        </WorkspaceProvider>
      </MotionSystem>
    </PreferencesContext.Provider>
  );
}

function CaptureBridge({ client, enabled }: { client: CaptureClient; enabled: boolean }) {
  const { receive } = useComposerFocus();

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void Promise.all([
      client.subscribeComposerFocus((request) => {
        if (active) receive(request);
      }),
      client.subscribeStatus((status) => {
        if (!active) return;
        const tone = captureStatusTone(status.messageKey);
        const description =
          (m as unknown as Record<string, () => string>)[status.messageKey]?.() ??
          m.capture_error_unknown();
        toast.add({
          title:
            tone === 'warning' ? m.capture_status_warning_title() : m.capture_status_error_title(),
          description,
          type: tone,
        });
      }),
    ]).then((stops) => {
      if (!active) {
        stops.forEach((stop) => {
          stop();
        });
        return;
      }
      unsubscribe = () =>
        stops.forEach((stop) => {
          stop();
        });
      void client.composerReady();
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [client, enabled, receive]);

  return null;
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences must be used inside AppProviders');
  return value;
}

export function useMessages() {
  usePreferences();
  return m;
}
