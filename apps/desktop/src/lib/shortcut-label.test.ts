import { describe, expect, it } from 'vitest';

import { formatShortcut } from '@/lib/shortcut-label';

const english = { shift: 'Shift', space: 'Space' };
const french = { shift: 'Maj', space: 'Espace' };

describe('formatShortcut', () => {
  it.each(['windows', 'linuxX11'] as const)('formats the portable shortcut on %s', (platform) => {
    expect(formatShortcut('Alt+Shift+Space', platform, english)).toBe('Alt + Shift + Space');
  });

  it('uses macOS glyphs for the native shortcut', () => {
    expect(formatShortcut('CmdOrCtrl+Shift+Space', 'macos', english)).toBe('⌘ + ⇧ + Space');
  });

  it('uses localized key labels', () => {
    expect(formatShortcut('Alt+Shift+Space', 'windows', french)).toBe('Alt + Maj + Espace');
  });

  it('names the Windows key Win on Windows and Super on Linux', () => {
    expect(formatShortcut('Super+Alt+N', 'windows', english)).toBe('Win + Alt + N');
    expect(formatShortcut('Super+Alt+N', 'linuxX11', english)).toBe('Super + Alt + N');
    expect(formatShortcut('Super+Space', 'linuxWayland', english)).toBe('Super + Space');
  });

  it('names Home, End, Page Up, Page Down, and Escape with localized labels', () => {
    const named = {
      ...french,
      home: 'Début',
      end: 'Fin',
      pageUp: 'Pg. préc.',
      pageDown: 'Pg. suiv.',
      escape: 'Échap',
    };
    expect(
      ['Home', 'End', 'PageUp', 'PageDown', 'Esc', 'Escape'].map((key) =>
        formatShortcut(key, 'windows', named),
      ),
    ).toEqual(['Début', 'Fin', 'Pg. préc.', 'Pg. suiv.', 'Échap', 'Échap']);
    // Without a label, the accelerator's own name stays.
    expect(formatShortcut('PageUp', 'macos', english)).toBe('PageUp');
  });

  it('formats a chosen macOS shortcut with glyphs in its stored order', () => {
    expect(formatShortcut('Cmd+Ctrl+Alt+Shift+F13', 'macos', english)).toBe('⌘ + ⌃ + ⌥ + ⇧ + F13');
  });
});
