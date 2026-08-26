import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePressFeedback } from '@/motion/press';
import { setMediaQuery } from '@/test/setup';

describe('press feedback', () => {
  it('responds on pointer down with the press token and reverses without locking', async () => {
    document.documentElement.style.setProperty('--motion-press-scale', '0.975');
    document.documentElement.style.setProperty('--motion-duration-direct', '1ms');
    const { result } = renderHook(usePressFeedback);
    act(() => result.current.onPointerDown());
    await waitFor(() => expect(result.current.style.scale?.get()).toBeCloseTo(0.975));
    act(() => result.current.onPointerUp());
    await waitFor(() => expect(result.current.style.scale?.get()).toBe(1));
    document.documentElement.removeAttribute('style');
  });

  it('accepts repeated pointer and keyboard input without locking', () => {
    const { result } = renderHook(usePressFeedback);
    act(() => {
      result.current.onPointerDown();
      result.current.onPointerCancel();
      result.current.onPointerDown();
      result.current.onPointerLeave();
      result.current.onKeyDown({ key: 'Enter' } as React.KeyboardEvent);
      result.current.onKeyUp();
    });
    expect(result.current.style.scale?.get()).toBe(1);
  });

  it('returns no motion style and no-op handlers under reduced motion', () => {
    setMediaQuery('(prefers-reduced-motion)', true);
    const { result } = renderHook(usePressFeedback);

    act(() => {
      result.current.onPointerDown();
      result.current.onKeyDown({ key: 'Enter' } as React.KeyboardEvent);
    });

    expect(result.current.style.scale).toBeUndefined();
  });
});
