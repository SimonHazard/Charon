import { invoke } from '@tauri-apps/api/core';

import type { PreferencesIpcError, PreferencesSnapshot } from '@/bindings/preferences';

export interface NativePreferencesClient {
  read(): Promise<PreferencesSnapshot>;
  reset(): Promise<PreferencesSnapshot>;
  setBackgroundMode(enabled: boolean): Promise<PreferencesSnapshot>;
  /** The opt-in, content-free capture notification (ADR 0024). */
  setCaptureNotifications(enabled: boolean): Promise<PreferencesSnapshot>;
  /** The opt-in formatted capture on macOS (ADR 0026). */
  setRichCapture(enabled: boolean): Promise<PreferencesSnapshot>;
}

export const tauriPreferencesClient: NativePreferencesClient = {
  read: () => invoke<PreferencesSnapshot>('preferences_read'),
  reset: () => invoke<PreferencesSnapshot>('preferences_reset'),
  setBackgroundMode: (enabled) =>
    invoke<PreferencesSnapshot>('preferences_set_background_mode', { enabled }),
  setCaptureNotifications: (enabled) =>
    invoke<PreferencesSnapshot>('preferences_set_capture_notifications', { enabled }),
  setRichCapture: (enabled) =>
    invoke<PreferencesSnapshot>('preferences_set_rich_capture', { enabled }),
};

export function asPreferencesError(error: unknown): PreferencesIpcError {
  if (error && typeof error === 'object' && 'code' in error && 'messageKey' in error) {
    return error as PreferencesIpcError;
  }
  return { code: 'unknown', messageKey: 'preferences_error_unknown' };
}
