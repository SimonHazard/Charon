import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePressFeedback } from '@/motion/press';

describe('press feedback', () => {
  it('responds immediately and reverses from its current value', () => {
    const { result } = renderHook(usePressFeedback);
    act(() => result.current.onPointerDown());
    expect(result.current.style.scale.get()).toBe(0.98);
    act(() => result.current.onPointerUp());
    expect(result.current.style.scale.get()).toBe(1);
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
    expect(result.current.style.scale.get()).toBe(1);
  });
});
