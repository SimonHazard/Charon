import { defaultTheme } from '@charon/theme/theme-contract';
import { describe, expect, it } from 'vitest';
import { applyTheme, readTheme } from '@/app/theme';

describe('theme preference', () => {
  it('uses Solarized for first run and invalid saved values', () => {
    expect(defaultTheme).toBe('solarized');
    expect(readTheme({ getItem: () => null })).toBe('solarized');
    expect(readTheme({ getItem: () => 'sepia' })).toBe('solarized');
  });

  it.each(['light', 'dark'] as const)('preserves an explicit saved %s choice', (theme) => {
    expect(readTheme({ getItem: () => theme })).toBe(theme);
  });

  it('uses Solarized when storage is unavailable', () => {
    expect(
      readTheme({
        getItem: () => {
          throw new Error('storage unavailable');
        },
      }),
    ).toBe('solarized');
  });

  it.each(['light', 'solarized', 'dark'] as const)('applies the %s theme', (theme) => {
    applyTheme(theme);
    expect(document.documentElement.dataset.theme).toBe(theme);
  });
});
