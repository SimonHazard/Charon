import { describe, expect, it } from 'vitest';

import { motionProfiles, reducedSurfaceTransition, surfaceMotionStates } from '@/motion/system';

describe('motion profiles', () => {
  it('exposes only the three approved profiles', () => {
    expect(Object.keys(motionProfiles)).toEqual(['feedback', 'surface', 'gestureRelease']);
  });

  it('keeps ordinary surfaces critically damped and gesture release distinct', () => {
    expect(motionProfiles.surface.damping).toBeGreaterThan(motionProfiles.gestureRelease.damping);
    expect(motionProfiles.feedback.stiffness).toBeGreaterThan(motionProfiles.surface.stiffness);
  });

  it('keeps capture surface entry and exit symmetric with a reduced-motion fade', () => {
    expect(surfaceMotionStates.hidden).toEqual({ opacity: 0, scale: 0.985 });
    expect(surfaceMotionStates.visible).toEqual({ opacity: 1, scale: 1 });
    expect(surfaceMotionStates.reducedHidden).toEqual({ opacity: 0, scale: 1 });
    expect(reducedSurfaceTransition.duration).toBeLessThan(0.2);
  });
});
