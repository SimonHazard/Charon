import type { PlatformKind } from '@/bindings/capture';

const macGlyphs: Record<string, string> = {
  CmdOrCtrl: '⌘',
  Cmd: '⌘',
  Super: '⌘',
  Ctrl: '⌃',
  Alt: '⌥',
  Shift: '⇧',
};

/** Localized names of the keys whose label is a word (from Paraglide). */
export type KeyLabels = {
  shift: string;
  space: string;
  home?: string;
  end?: string;
  pageUp?: string;
  pageDown?: string;
  escape?: string;
};

const namedKeys: Record<string, Exclude<keyof KeyLabels, 'shift' | 'space'>> = {
  Home: 'home',
  End: 'end',
  PageUp: 'pageUp',
  PageDown: 'pageDown',
  Esc: 'escape',
  Escape: 'escape',
};

/** Formats a Tauri accelerator for display in a keyboard key label. */
export function formatShortcut(
  accelerator: string,
  platform: PlatformKind,
  labels: KeyLabels,
): string {
  const parts = accelerator
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts
    .map((part) => {
      if (platform === 'macos' && part in macGlyphs) return macGlyphs[part];
      if (part === 'CmdOrCtrl') return 'Ctrl';
      if (part === 'Super' && platform === 'windows') return 'Win';
      if (part === 'Shift') return labels.shift;
      if (part === 'Space') return labels.space;
      const named = namedKeys[part];
      return (named && labels[named]) ?? part;
    })
    .join(' + ');
}
