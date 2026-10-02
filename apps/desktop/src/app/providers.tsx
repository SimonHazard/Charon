import type { ThemePreference } from '@charon/theme/theme-contract';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  CaptureAcknowledgementProvider,
  useCaptureAcknowledgement,
} from '@/app/capture-acknowledgement-context';
import { captureStatusTone } from '@/app/capture-status';
import { ComposerFocusProvider, useComposerFocus } from '@/app/composer-focus-context';
import { type AppLocale, applyLocale, readLocale } from '@/app/locale';
import { QuitRequestProvider } from '@/app/quit-request-context';
import { ShellBridge } from '@/app/shell-bridge';
import {
  applyTheme,
  readThemePreference,
  saveThemePreference,
  watchSystemTheme,
} from '@/app/theme';
import { WorkspaceProvider } from '@/app/workspace-context';
import { toast } from '@/components/ui/toast';
import { NativePreferencesProvider } from '@/features/preferences/preferences-context';
import type { UpdateClient } from '@/features/updates/update-client';
import { UpdateProvider } from '@/features/updates/update-context';
import { type CaptureClient, tauriCaptureClient } from '@/lib/ipc/capture-client';
import type { NativePreferencesClient } from '@/lib/ipc/preferences-client';
import { type ShellClient, tauriShellClient } from '@/lib/ipc/shell-client';
import type { WorkspaceClient } from '@/lib/ipc/workspace-client';
import { isTauriRuntime } from '@/lib/platform';
import { MotionSystem } from '@/motion/system';
import { m } from '@/paraglide/messages.js';

type Preferences = {
  theme: ThemePreference;
  locale: AppLocale;
  setTheme(theme: ThemePreference): void;
  setLocale(locale: AppLocale): void;
};

const PreferencesContext = createContext<Preferences | null>(null);

export function AppProviders({
  children,
  workspaceClient,
  captureClient,
  preferencesClient,
  updateClient,
  shellClient,
}: PropsWithChildren<{
  workspaceClient?: WorkspaceClient;
  captureClient?: CaptureClient;
  preferencesClient?: NativePreferencesClient;
  updateClient?: UpdateClient;
  shellClient?: ShellClient;
}>) {
  const [theme, updateTheme] = useState(readThemePreference);
  const [locale, updateLocale] = useState(readLocale);
  const activeCaptureClient = captureClient ?? tauriCaptureClient;
  const nativePreferencesEnabled = isTauriRuntime() || Boolean(captureClient || preferencesClient);
  const updaterEnabled = isTauriRuntime() || Boolean(updateClient);
  const activeShellClient = shellClient ?? tauriShellClient;
  const shellEnabled = isTauriRuntime() || Boolean(shellClient);

  const setTheme = useCallback((next: ThemePreference) => {
    saveThemePreference(next);
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

  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    return watchSystemTheme(() => applyTheme('system'));
  }, [theme]);

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
                <CaptureAcknowledgementProvider>
                  <QuitRequestProvider client={activeShellClient}>
                    <CaptureBridge
                      client={activeCaptureClient}
                      enabled={nativePreferencesEnabled}
                    />
                    <ShellBridge
                      client={activeShellClient}
                      enabled={shellEnabled}
                      locale={locale}
                    />
                    {children}
                  </QuitRequestProvider>
                </CaptureAcknowledgementProvider>
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
  const { publish } = useCaptureAcknowledgement();

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
        if (tone === 'success') {
          // A capture stays silent; the shelf acknowledges the Note once the user reveals it.
          if (status.noteId) publish({ noteId: status.noteId, at: Date.now() });
          return;
        }
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
  }, [client, enabled, publish, receive]);

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
