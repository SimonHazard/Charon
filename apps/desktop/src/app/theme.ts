import {
  defaultTheme,
  isThemeName,
  type ThemeName,
  themeAttribute,
  themeStorageKey,
} from '@charon/theme/theme-contract';

export function readTheme(storage: Pick<Storage, 'getItem'> = localStorage): ThemeName {
  try {
    const saved = storage.getItem(themeStorageKey);
    return isThemeName(saved) ? saved : defaultTheme;
  } catch {
    return defaultTheme;
  }
}

export function applyTheme(theme: ThemeName, root: HTMLElement = document.documentElement) {
  root.setAttribute(themeAttribute, theme);
}

export function saveTheme(theme: ThemeName, storage: Pick<Storage, 'setItem'> = localStorage) {
  try {
    storage.setItem(themeStorageKey, theme);
  } catch {
    // The preference remains applied for this session when storage is unavailable.
  }
  applyTheme(theme);
}
