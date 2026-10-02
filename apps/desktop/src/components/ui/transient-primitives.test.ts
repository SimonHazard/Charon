/// <reference types="node" />

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readComponent = (name: string) =>
  readFileSync(resolve(process.cwd(), `src/components/ui/${name}.tsx`), 'utf8');

describe('compact transient primitive contract', () => {
  it.each(['popover', 'select', 'tooltip'])('%s uses symmetric origin-aware states', (name) => {
    const source = readComponent(name);

    expect(source).toContain('origin-(--transform-origin)');
    expect(source).toContain('data-starting-style:opacity-0');
    expect(source).toContain('data-ending-style:opacity-0');
    expect(source).toContain('var(--motion-duration-transient)');
    expect(source).toContain('var(--motion-transient-scale)');
    expect(source).toContain('motion-reduce:[transition-property:opacity]');
    expect(source).not.toMatch(/slide-in|animate-in|animate-out|shadow-(md|lg|xl)/u);
  });

  // Tailwind's `transition-*` utilities also reset duration and easing to its 150ms default, so
  // under reduced motion they would override the 120ms entrance token (docs/UX.md). Reduced
  // motion narrows only the transitioned property; `transition-none` sets nothing else.
  it.each(['alert-dialog', 'dialog', 'popover', 'select', 'toast', 'tooltip'])(
    '%s keeps its duration and easing tokens under reduced motion',
    (name) => {
      const source = readComponent(name);

      expect(source).toContain('motion-reduce:[transition-property:opacity]');
      expect(source).not.toMatch(/motion-reduce:transition(?:-(?!none\b)|(?=[\s'"]))/u);
    },
  );

  // Every transient surface leaves along its entrance path, only faster (docs/UX.md).
  it.each(['alert-dialog', 'dialog', 'popover', 'select', 'tooltip'])(
    '%s exits faster than it enters',
    (name) => {
      const source = readComponent(name);
      const entrances = source.match(
        /\[transition-duration:var\(--motion-duration-transient\)\]/gu,
      );
      const exits = source.match(
        /\[transition-duration:var\(--motion-duration-transient\)\] data-ending-style:\[transition-duration:var\(--motion-duration-transient-exit\)\]/gu,
      );

      expect(entrances?.length ?? 0).toBeGreaterThan(0);
      expect(exits?.length).toBe(entrances?.length);
    },
  );

  it('toast travels on the reduced-motion-aware token and stays off the composer', () => {
    const source = readComponent('toast');

    expect(source).toContain('var(--motion-surface-travel)');
    expect(source).not.toContain('150%');
    expect(source).not.toContain('will-change');
    expect(source).toContain('motion-reduce:[transition-property:opacity]');
    expect(source).toContain("swipeDirection={['up', 'right']}");
    expect(source).toContain('top-(--toast-top)');
    expect(source).not.toMatch(/\bbottom-(0|4)\b|data-\[swipe-direction=(down|left)\]/u);
  });

  it('keeps compact controls immediate and semantic', () => {
    const button = readComponent('button');
    const toggleGroup = readComponent('toggle-group');

    expect(button).toContain('var(--motion-press-scale)');
    expect(button).toContain('var(--control-hover)');
    expect(button).toContain('var(--control-pressed)');
    expect(toggleGroup).toContain('var(--selection-surface)');
    expect(toggleGroup).toContain('data-pressed:hover:bg-[var(--selection-surface)]');
    expect(toggleGroup).not.toContain('transition-all');
  });
});
