import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type { NativeLabels } from '@/bindings/preferences';

/** The window shell and the opt-in background mode's tray (ADR 0023). */
export interface ShellClient {
  /** Sends the localized tray labels; Rust never hardcodes UI copy. */
  setLabels(labels: NativeLabels): Promise<void>;
  /** Exits once the draft guard found nothing unsent. */
  quit(): Promise<void>;
  /** Keeps Charon running and reveals its window after a blocked quit. */
  cancelQuit(): Promise<void>;
  /** The tray's Quit asks the webview to run its draft guard first. */
  subscribeQuitRequest(listener: () => void): Promise<() => void>;
}

export const tauriShellClient: ShellClient = {
  setLabels: (labels) => invoke<void>('shell_set_labels', { labels }),
  quit: () => invoke<void>('shell_quit'),
  cancelQuit: () => invoke<void>('shell_cancel_quit'),
  subscribeQuitRequest: async (listener) => {
    const unlisten = await listen<null>('shell://quit-requested', () => listener());
    return unlisten;
  },
};
