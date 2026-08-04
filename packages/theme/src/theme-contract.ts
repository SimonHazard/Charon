export const themeNames = ['light', 'solarized', 'dark'] as const;

export type ThemeName = (typeof themeNames)[number];

export const themeStorageKey = 'charon:theme:v1';
export const themeAttribute = 'data-theme';
export const defaultTheme: ThemeName = 'solarized';

export function isThemeName(value: unknown): value is ThemeName {
  return typeof value === 'string' && themeNames.includes(value as ThemeName);
}
