import type { PlatformKind } from '@/bindings/capture';

/**
 * Turns one key press into a composer accelerator candidate (ADR 0025). Rust stays the authority:
 * it validates, refuses reserved combinations, and registers. The recorder only keeps waiting
 * while modifiers are held and names keys by physical position (`event.code`), as the shortcut
 * backends do, so a non-QWERTY layout may show a letter that differs from the keycap.
 */
export type RecordedShortcut =
  | { kind: 'pending' }
  | { kind: 'unsupported' }
  | { kind: 'accelerator'; value: string };

export type RecorderKeyEvent = Pick<
  KeyboardEvent,
  'code' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'isComposing'
>;

const modifierCodes = new Set([
  'ShiftLeft',
  'ShiftRight',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
  'CapsLock',
  'Fn',
  'FnLock',
]);

/** The highest function key each platform's shortcut backend registers (Rust mirrors it). */
export function lastFunctionKey(platform: PlatformKind): 'F20' | 'F24' {
  return platform === 'macos' ? 'F20' : 'F24';
}

function keyName(code: string, platform: PlatformKind): string | null {
  const letter = /^Key([A-Z])$/u.exec(code)?.[1];
  if (letter) return letter;
  const digit = /^Digit([0-9])$/u.exec(code)?.[1];
  if (digit) return digit;
  if (code === 'Space') return code;
  const functionKey = /^F([1-9]\d?)$/u.exec(code)?.[1];
  const highest = Number(lastFunctionKey(platform).slice(1));
  return functionKey && Number(functionKey) <= highest ? code : null;
}

/** The held modifiers in canonical order: Cmd (macOS) or Super, Ctrl, Alt, Shift. */
export function heldModifiers(event: RecorderKeyEvent, platform: PlatformKind): string[] {
  return [
    event.metaKey ? (platform === 'macos' ? 'Cmd' : 'Super') : null,
    event.ctrlKey ? 'Ctrl' : null,
    event.altKey ? 'Alt' : null,
    event.shiftKey ? 'Shift' : null,
  ].filter((modifier): modifier is string => modifier !== null);
}

export function acceleratorFromKeyboardEvent(
  event: RecorderKeyEvent,
  platform: PlatformKind,
): RecordedShortcut {
  if (event.isComposing || modifierCodes.has(event.code)) return { kind: 'pending' };
  const key = keyName(event.code, platform);
  const modifiers = heldModifiers(event, platform);
  // Same floor as Rust: two distinct modifiers, so at least one is Cmd, Super, Ctrl, or Alt.
  if (!key || modifiers.length < 2) return { kind: 'unsupported' };
  return { kind: 'accelerator', value: [...modifiers, key].join('+') };
}
