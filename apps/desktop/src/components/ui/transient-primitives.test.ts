/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readComponent = (name: string) =>
  readFileSync(resolve(process.cwd(), `src/components/ui/${name}.tsx`), 'utf8');

describe('compact transient primitive contract', () => {
  it.each(['popover', 'tooltip'])('%s uses symmetric origin-aware states', (name) => {
    const source = readComponent(name);

    expect(source).toContain('origin-(--transform-origin)');
    expect(source).toContain('data-starting-style:opacity-0');
    expect(source).toContain('data-ending-style:opacity-0');
    expect(source).toContain('var(--motion-duration-transient)');
    expect(source).toContain('var(--motion-transient-scale)');
    expect(source).toContain('motion-reduce:transition-opacity');
    expect(source).not.toMatch(/slide-in|animate-in|animate-out|shadow-(md|lg|xl)/u);
  });

  it('keeps compact controls immediate and semantic', () => {
    const button = readComponent('button');
    const toggleGroup = readComponent('toggle-group');

    expect(button).toContain('var(--motion-press-scale)');
    expect(button).toContain('var(--control-hover)');
    expect(button).toContain('var(--control-pressed)');
    expect(toggleGroup).toContain('var(--selection-surface)');
    expect(toggleGroup).toContain('data-pressed:hover:bg-[var(--selection-surface)]');
    expect(toggleGroup).not.toContain('transition-colors');
  });
});
