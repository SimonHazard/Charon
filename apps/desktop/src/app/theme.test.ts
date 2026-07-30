import { describe, expect, it } from 'vitest';

import { applyTheme, readTheme } from '@/app/theme';

describe('theme preference', () => {
  it('falls back to light for invalid saved values', () => {
    expect(readTheme({ getItem: () => 'sepia' })).toBe('light');
  });

  it.each(['light', 'solarized', 'dark'] as const)('applies the %s theme', (theme) => {
    applyTheme(theme);
    expect(document.documentElement.dataset.theme).toBe(theme);
  });
});
