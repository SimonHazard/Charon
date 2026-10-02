/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('modal dialog primitive contract', () => {
  it('uses the transient surface motion and the render API', () => {
    const source = read('src/components/ui/dialog.tsx');
    expect(source).toContain('data-slot="dialog-content"');
    expect(source).toContain('data-starting-style:opacity-0');
    expect(source).toContain('data-ending-style:opacity-0');
    expect(source).toContain('var(--motion-transient-scale)');
    expect(source).toContain('var(--shadow-modal)');
    expect(source).toContain('motion-reduce:[transition-property:opacity]');
    expect(source).not.toMatch(/asChild|transition-all|animate-in|animate-out/u);
  });

  it('has reduced-transparency, contrast, and keyboard-modality fallbacks', () => {
    const css = read('src/styles/app.css');
    const drawing = css.slice(css.indexOf('/* Drawing */'));
    expect(drawing).toMatch(
      /prefers-reduced-transparency: reduce\)\s*\{\s*\[data-slot="dialog-content"\]\s*\{[^}]*background: var\(--material-transient-solid\)/u,
    );
    expect(drawing).toContain('[data-slot="dialog-overlay"]');
    expect(drawing).toContain('prefers-contrast: more');
    expect(drawing).toContain(':root[data-input-modality="keyboard"] [data-slot="dialog-content"]');
    // Product styling stays semantic: no raw palette values in the drawing block.
    expect(drawing).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(|gradient/iu);
  });
});
