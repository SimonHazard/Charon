import { animate, useMotionValue, useReducedMotion } from 'motion/react';
import { useCallback } from 'react';

function readNumberToken(name: string, fallback: number): number {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function directDurationSeconds(): number {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--motion-duration-direct')
    .trim();
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return 0.09;
  return value.endsWith('ms') ? parsed / 1_000 : parsed;
}

export function usePressFeedback() {
  const reduce = useReducedMotion();
  const scale = useMotionValue(1);
  const moveTo = useCallback(
    (target: number) => {
      if (reduce) return;
      animate(scale, target, { duration: directDurationSeconds() });
    },
    [reduce, scale],
  );
  const press = useCallback(() => moveTo(readNumberToken('--motion-press-scale', 0.98)), [moveTo]);
  const release = useCallback(() => moveTo(1), [moveTo]);

  return {
    style: reduce ? {} : { scale },
    onPointerDown: press,
    onPointerUp: release,
    onPointerCancel: release,
    onPointerLeave: release,
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') press();
    },
    onKeyUp: release,
  };
}
