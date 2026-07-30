import { describe, expect, it } from 'vitest';

import { motionProfiles } from '@/motion/system';

describe('motion profiles', () => {
  it('exposes only the three approved profiles', () => {
    expect(Object.keys(motionProfiles)).toEqual(['feedback', 'surface', 'gestureRelease']);
  });

  it('keeps ordinary surfaces critically damped and gesture release distinct', () => {
    expect(motionProfiles.surface.damping).toBeGreaterThan(motionProfiles.gestureRelease.damping);
    expect(motionProfiles.feedback.stiffness).toBeGreaterThan(motionProfiles.surface.stiffness);
  });
});
