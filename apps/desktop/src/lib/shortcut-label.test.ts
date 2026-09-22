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
});
