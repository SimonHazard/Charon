import type { ThemeName } from '@charon/theme/theme-contract';
import { createContext, type PropsWithChildren, useContext, useEffect, useState } from 'react';
import { CaptureEditorProvider, useCaptureEditor } from '@/app/capture-editor-context';
import { captureStatusTone } from '@/app/capture-status';
import { type AppLocale, applyLocale, readLocale } from '@/app/locale';
import { readTheme, saveTheme } from '@/app/theme';
import { WorkspaceProvider } from '@/app/workspace-context';
import { toast } from '@/components/ui/toast';
import { tauriCaptureClient } from '@/lib/ipc/capture-client';
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
}: PropsWithChildren<{ workspaceClient?: WorkspaceClient }>) {
  const [theme, updateTheme] = useState(readTheme);
  const [locale, updateLocale] = useState(readLocale);

  const setTheme = (next: ThemeName) => {
    saveTheme(next);
    updateTheme(next);
  };
  const setLocale = (next: AppLocale) => {
    applyLocale(next);
    updateLocale(next);
  };

  return (
    <PreferencesContext.Provider value={{ theme, locale, setTheme, setLocale }}>
      <MotionSystem>
        <WorkspaceProvider client={workspaceClient}>
          <CaptureEditorProvider>
            <CaptureBridge />
            {children}
          </CaptureEditorProvider>
        </WorkspaceProvider>
      </MotionSystem>
    </PreferencesContext.Provider>
  );
}

function CaptureBridge() {
  const { receive } = useCaptureEditor();

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void Promise.all([
      tauriCaptureClient.subscribeEditor((request) => {
        if (active) receive(request);
      }),
      tauriCaptureClient.subscribeStatus((status) => {
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
      void tauriCaptureClient.editorReady();
    });
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [receive]);

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
