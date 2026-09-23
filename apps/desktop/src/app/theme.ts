import {
  defaultThemePreference,
  isThemePreference,
  resolveTheme,
  type ThemePreference,
  themeAttribute,
  themeMediaQuery,
  themeStorageKey,
} from '@charon/theme/theme-contract';

export function readThemePreference(
  storage: Pick<Storage, 'getItem'> = localStorage,
): ThemePreference {
  try {
    const saved = storage.getItem(themeStorageKey);
    if (saved === null) return defaultThemePreference;
    // A legacy `solarized` value, or any other unknown value, resolves to Light (ADR 0012).
    return isThemePreference(saved) ? saved : 'light';
  } catch {
    return defaultThemePreference;
  }
}

function prefersDark() {
  return window.matchMedia(themeMediaQuery).matches;
}

export function applyTheme(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
  dark: boolean = prefersDark(),
) {
  root.setAttribute(themeAttribute, resolveTheme(preference, dark));
  // The pre-paint script paints the canvas inline; the stylesheet owns it from here.
  root.style.removeProperty('background-color');
}

export function saveThemePreference(
  preference: ThemePreference,
  storage: Pick<Storage, 'setItem'> = localStorage,
) {
  try {
    storage.setItem(themeStorageKey, preference);
  } catch {
    // The preference remains applied for this session when storage is unavailable.
  }
  applyTheme(preference);
}

export function watchSystemTheme(onChange: () => void) {
  const query = window.matchMedia(themeMediaQuery);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
