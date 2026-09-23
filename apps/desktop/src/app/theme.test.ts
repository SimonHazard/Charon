import { defaultThemePreference, themeMediaQuery } from '@charon/theme/theme-contract';
import { describe, expect, it, vi } from 'vitest';
import { applyTheme, readThemePreference, watchSystemTheme } from '@/app/theme';
import { setMediaQuery } from '@/test/setup';

describe('theme preference', () => {
  it('uses System for first run and when storage is unavailable', () => {
    expect(defaultThemePreference).toBe('system');
    expect(readThemePreference({ getItem: () => null })).toBe('system');
    expect(
      readThemePreference({
        getItem: () => {
          throw new Error('storage unavailable');
        },
      }),
    ).toBe('system');
  });

  it('maps legacy solarized and other invalid values to Light', () => {
    expect(readThemePreference({ getItem: () => 'solarized' })).toBe('light');
    expect(readThemePreference({ getItem: () => 'sepia' })).toBe('light');
    expect(readThemePreference({ getItem: () => '' })).toBe('light');
  });

  it.each(['system', 'light', 'dark'] as const)(
    'preserves an explicit saved %s choice',
    (theme) => {
      expect(readThemePreference({ getItem: () => theme })).toBe(theme);
    },
  );

  it('resolves System to dark when the media query matches', () => {
    setMediaQuery(themeMediaQuery, true);
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('watchSystemTheme re-applies on change and its remover detaches the listener', () => {
    applyTheme('system');
    expect(document.documentElement.dataset.theme).toBe('light');
    const onChange = vi.fn(() => applyTheme('system'));
    const remove = watchSystemTheme(onChange);

    setMediaQuery(themeMediaQuery, true);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.theme).toBe('dark');

    remove();
    setMediaQuery(themeMediaQuery, false);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('applyTheme clears the pre-paint background', () => {
    document.documentElement.style.backgroundColor = '#171221';
    applyTheme('dark');
    expect(document.documentElement.style.backgroundColor).toBe('');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});
