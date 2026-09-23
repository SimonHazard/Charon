// Resolved themes, the only values `data-theme` receives.
export const themeNames = ['light', 'dark'] as const;
export const themePreferences = ['system', 'light', 'dark'] as const;

export type ThemeName = (typeof themeNames)[number];
export type ThemePreference = (typeof themePreferences)[number];

export const themeStorageKey = 'charon:theme:v1';
export const themeAttribute = 'data-theme';
export const defaultThemePreference: ThemePreference = 'system';
export const themeMediaQuery = '(prefers-color-scheme: dark)';

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && themePreferences.includes(value as ThemePreference);
}

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ThemeName {
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
}
