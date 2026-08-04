import type { ThemeName } from '@charon/theme/theme-contract';
import { createContext, type PropsWithChildren, useContext, useState } from 'react';
import { CaptureEditorProvider } from '@/app/capture-editor-context';
import { CommandProvider } from '@/app/commands/command-provider';
import { type AppLocale, applyLocale, readLocale } from '@/app/locale';
import { readTheme, saveTheme } from '@/app/theme';
import { WorkspaceProvider } from '@/app/workspace-context';
import { MotionSystem } from '@/motion/system';
import { m } from '@/paraglide/messages.js';

type Preferences = {
  theme: ThemeName;
  locale: AppLocale;
  setTheme(theme: ThemeName): void;
  setLocale(locale: AppLocale): void;
};

const PreferencesContext = createContext<Preferences | null>(null);

export function AppProviders({ children }: PropsWithChildren) {
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
        <WorkspaceProvider defaultSectionName={m.workspace_default_section()}>
          <CaptureEditorProvider>
            <CommandProvider>{children}</CommandProvider>
          </CaptureEditorProvider>
        </WorkspaceProvider>
      </MotionSystem>
    </PreferencesContext.Provider>
  );
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
