import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { preferenceQueries, useMotionPreferences } from '@/motion/preferences';

describe('motion preferences', () => {
  it('tracks transparency and contrast independently', () => {
    expect(preferenceQueries).toEqual({
      reducedTransparency: '(prefers-reduced-transparency: reduce)',
      increasedContrast: '(prefers-contrast: more)',
    });
  });

  it('removes every media-query listener on unmount', () => {
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener,
        removeEventListener,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
    const view = renderHook(useMotionPreferences);
    expect(addEventListener.mock.calls.length).toBeGreaterThanOrEqual(2);
    view.unmount();
    expect(removeEventListener).toHaveBeenCalledTimes(2);
  });
});
