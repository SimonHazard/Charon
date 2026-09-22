import type { PlatformKind } from '@/bindings/capture';

const macGlyphs: Record<string, string> = {
  CmdOrCtrl: '⌘',
  Cmd: '⌘',
  Super: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
};

/** Formats a Tauri accelerator for display in a keyboard key label. */
export function formatShortcut(
  accelerator: string,
  platform: PlatformKind,
  labels: { shift: string; space: string },
): string {
  const parts = accelerator
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts
    .map((part) => {
      if (platform === 'macos' && part in macGlyphs) return macGlyphs[part];
      if (part === 'CmdOrCtrl') return 'Ctrl';
      if (part === 'Shift') return labels.shift;
      if (part === 'Space') return labels.space;
      return part;
    })
    .join(' + ');
}
