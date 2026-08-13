import { defaultTheme } from '@charon/theme/theme-contract';
import { describe, expect, it } from 'vitest';
import { applyTheme, readTheme } from '@/app/theme';

describe('theme preference', () => {
  it('uses Light for first run, legacy Solarized, and invalid saved values', () => {
    expect(defaultTheme).toBe('light');
    expect(readTheme({ getItem: () => null })).toBe('light');
    expect(readTheme({ getItem: () => 'solarized' })).toBe('light');
    expect(readTheme({ getItem: () => 'sepia' })).toBe('light');
  });

  it.each(['light', 'dark'] as const)('preserves an explicit saved %s choice', (theme) => {
    expect(readTheme({ getItem: () => theme })).toBe(theme);
  });

  it('uses Light when storage is unavailable', () => {
    expect(
      readTheme({
        getItem: () => {
          throw new Error('storage unavailable');
        },
      }),
    ).toBe('light');
  });

  it.each(['light', 'dark'] as const)('applies the %s theme', (theme) => {
    applyTheme(theme);
    expect(document.documentElement.dataset.theme).toBe(theme);
  });
});
