import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import { createElement, type PropsWithChildren } from 'react';

export const surfaceTransition = {
  type: 'spring',
  stiffness: 360,
  damping: 38,
  mass: 1,
} as const;

export const surfaceCollapsedScale = 0.985;

export function MotionSystem({ children }: PropsWithChildren) {
  return createElement(
    LazyMotion,
    { features: domAnimation, strict: true },
    createElement(MotionConfig, { reducedMotion: 'user' }, children),
  );
}
