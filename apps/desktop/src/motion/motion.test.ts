/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { surfaceCollapsedScale, surfaceTransition } from '@/motion/system';

describe('motion contract', () => {
  it('keeps the editor surface critically damped without bounce', () => {
    expect(surfaceTransition.type).toBe('spring');
    expect(surfaceTransition.damping).toBeGreaterThan(30);
    expect(surfaceCollapsedScale).toBeGreaterThanOrEqual(0.98);
  });

  it('keeps the surface spring critically damped or over-damped (ADR 0005)', () => {
    const { damping, mass, stiffness } = surfaceTransition;
    // A damping ratio below 1 overshoots: the editor would bounce past its resting state.
    expect(damping / (2 * Math.sqrt(stiffness * mass))).toBeGreaterThanOrEqual(1);
  });

  it('keeps shared CSS motion to the direct and transient profiles in active use', () => {
    const css = readFileSync(resolve(process.cwd(), '../../packages/theme/src/motion.css'), 'utf8');

    expect(css).toContain('--motion-duration-direct:');
    expect(css).toContain('--motion-duration-transient: 160ms;');
    expect(css).toContain('--motion-easing-transient:');
    expect(css).toContain('--motion-transient-scale: 0.985;');
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*--motion-duration-transient:\s*120ms/);
    expect(css).toContain('--motion-duration-transient-exit: 110ms;');
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*--motion-duration-transient-exit:\s*100ms/);
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*--motion-transient-scale:\s*1/);
    expect(css).toContain('--motion-duration-surface: 360ms;');
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*--motion-duration-surface:\s*120ms/);
    expect(css).toContain('--motion-surface-travel: 150%;');
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*--motion-surface-travel:\s*0%/);
    expect(css).toMatch(/prefers-reduced-transparency:[\s\S]*--material-blur:\s*0px/);
    expect(css).not.toContain(['transition:', 'all'].join(' '));
    expect(css).not.toContain(['@', 'keyframes'].join(''));
  });
});
