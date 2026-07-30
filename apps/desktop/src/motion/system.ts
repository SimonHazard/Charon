import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import { createElement, type PropsWithChildren } from 'react';

export const motionProfiles = {
  feedback: { type: 'spring', stiffness: 700, damping: 45, mass: 0.25 },
  surface: { type: 'spring', stiffness: 360, damping: 38, mass: 1 },
  gestureRelease: { type: 'spring', stiffness: 300, damping: 26, mass: 0.9 },
} as const;

export function MotionSystem({ children }: PropsWithChildren) {
  return createElement(
    LazyMotion,
    { features: domAnimation, strict: true },
    createElement(MotionConfig, { reducedMotion: 'user' }, children),
  );
}
