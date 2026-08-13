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

  it('keeps shared CSS motion to the direct and transient profiles in active use', () => {
    const css = readFileSync(resolve(process.cwd(), '../../packages/theme/src/motion.css'), 'utf8');

    expect(css).toContain('--motion-duration-direct:');
    expect(css).toContain('--motion-duration-transient: 160ms;');
    expect(css).toContain('--motion-easing-transient:');
    expect(css).toContain('--motion-transient-scale: 0.985;');
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*--motion-duration-transient:\s*120ms/);
    expect(css).toMatch(/prefers-reduced-motion:[\s\S]*--motion-transient-scale:\s*1/);
    expect(css).toMatch(/prefers-reduced-transparency:[\s\S]*--material-blur:\s*0px/);
    expect(css).not.toContain(['transition:', 'all'].join(' '));
    expect(css).not.toContain(['@', 'keyframes'].join(''));
  });
});
