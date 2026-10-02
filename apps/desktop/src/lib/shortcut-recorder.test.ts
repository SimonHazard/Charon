import { describe, expect, it } from 'vitest';

import {
  acceleratorFromKeyboardEvent,
  heldModifiers,
  lastFunctionKey,
  type RecorderKeyEvent,
} from '@/lib/shortcut-recorder';

const press = (code: string, modifiers: Partial<RecorderKeyEvent> = {}): RecorderKeyEvent => ({
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  isComposing: false,
  ...modifiers,
});

describe('acceleratorFromKeyboardEvent', () => {
  it.each([
    'ShiftLeft',
    'ShiftRight',
    'ControlLeft',
    'ControlRight',
    'AltLeft',
    'AltRight',
    'MetaLeft',
    'MetaRight',
    'CapsLock',
    'Fn',
  ])('keeps waiting while %s is the pressed key', (code) => {
    expect(acceleratorFromKeyboardEvent(press(code, { ctrlKey: true }), 'windows')).toEqual({
      kind: 'pending',
    });
  });

  it('keeps waiting while an input method composes', () => {
    expect(
      acceleratorFromKeyboardEvent(
        press('KeyN', { ctrlKey: true, altKey: true, isComposing: true }),
        'windows',
      ),
    ).toEqual({ kind: 'pending' });
  });

  it.each([
    ['KeyN', 'N'],
    ['Digit7', '7'],
    ['Space', 'Space'],
    ['F1', 'F1'],
    ['F24', 'F24'],
  ])('records %s as %s', (code, key) => {
    expect(
      acceleratorFromKeyboardEvent(press(code, { ctrlKey: true, altKey: true }), 'windows'),
    ).toEqual({ kind: 'accelerator', value: `Ctrl+Alt+${key}` });
  });

  it.each([
    'Enter',
    'Tab',
    'Escape',
    'Backspace',
    'ArrowUp',
    'Minus',
    'Numpad1',
    'F25',
    'IntlBackslash',
  ])('refuses %s', (code) => {
    expect(
      acceleratorFromKeyboardEvent(press(code, { ctrlKey: true, altKey: true }), 'windows'),
    ).toEqual({ kind: 'unsupported' });
  });

  it('records up to F24, except beyond F20 on macOS like the shortcut backend', () => {
    const f = (code: string, platform: 'macos' | 'windows' | 'linuxX11') =>
      acceleratorFromKeyboardEvent(press(code, { ctrlKey: true, altKey: true }), platform);
    expect(f('F20', 'macos')).toEqual({ kind: 'accelerator', value: 'Ctrl+Alt+F20' });
    expect(f('F21', 'macos')).toEqual({ kind: 'unsupported' });
    expect(f('F21', 'linuxX11')).toEqual({ kind: 'accelerator', value: 'Ctrl+Alt+F21' });
    expect(f('F0', 'windows')).toEqual({ kind: 'unsupported' });
    expect(f('F01', 'windows')).toEqual({ kind: 'unsupported' });
    expect(lastFunctionKey('macos')).toBe('F20');
    expect(lastFunctionKey('windows')).toBe('F24');
  });

  it('refuses a key with fewer than two modifiers', () => {
    expect(acceleratorFromKeyboardEvent(press('KeyN'), 'macos')).toEqual({ kind: 'unsupported' });
    expect(acceleratorFromKeyboardEvent(press('KeyN', { shiftKey: true }), 'macos')).toEqual({
      kind: 'unsupported',
    });
    expect(acceleratorFromKeyboardEvent(press('KeyF', { metaKey: true }), 'macos')).toEqual({
      kind: 'unsupported',
    });
  });

  it('names the command key Cmd on macOS and Super elsewhere, in canonical order', () => {
    const all = { metaKey: true, ctrlKey: true, altKey: true, shiftKey: true };
    expect(acceleratorFromKeyboardEvent(press('KeyN', all), 'macos')).toEqual({
      kind: 'accelerator',
      value: 'Cmd+Ctrl+Alt+Shift+N',
    });
    expect(acceleratorFromKeyboardEvent(press('KeyN', all), 'linuxX11')).toEqual({
      kind: 'accelerator',
      value: 'Super+Ctrl+Alt+Shift+N',
    });
  });

  it('records the physical key, so AZERTY A (code KeyQ) is stored as Q', () => {
    expect(
      acceleratorFromKeyboardEvent(press('KeyQ', { metaKey: true, altKey: true }), 'macos'),
    ).toEqual({ kind: 'accelerator', value: 'Cmd+Alt+Q' });
  });
});

describe('heldModifiers', () => {
  it('lists the held modifiers for live feedback', () => {
    expect(heldModifiers(press('ShiftLeft', { shiftKey: true, altKey: true }), 'windows')).toEqual([
      'Alt',
      'Shift',
    ]);
    expect(heldModifiers(press('MetaLeft', { metaKey: true }), 'windows')).toEqual(['Super']);
    expect(heldModifiers(press('KeyA'), 'macos')).toEqual([]);
  });
});
