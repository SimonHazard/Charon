import { domAnimation, LazyMotion, MotionConfig } from 'motion/react';
import { createElement, type PropsWithChildren } from 'react';

export const motionProfiles = {
  feedback: { type: 'spring', stiffness: 700, damping: 45, mass: 0.25 },
  surface: { type: 'spring', stiffness: 360, damping: 38, mass: 1 },
  gestureRelease: { type: 'spring', stiffness: 300, damping: 26, mass: 0.9 },
} as const;

export const surfaceMotionStates = {
  hidden: { opacity: 0, scale: 0.985 },
  reducedHidden: { opacity: 0, scale: 1 },
  visible: { opacity: 1, scale: 1 },
} as const;

export const reducedSurfaceTransition = { duration: 0.12 } as const;

export function MotionSystem({ children }: PropsWithChildren) {
  return createElement(
    LazyMotion,
    { features: domAnimation, strict: true },
    createElement(MotionConfig, { reducedMotion: 'user' }, children),
  );
}
