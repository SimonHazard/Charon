import { invoke } from '@tauri-apps/api/core';

import type {
  PreferencesIpcError,
  PreferencesSnapshot,
  PreferencesUpdate,
} from '@/bindings/preferences';

export interface NativePreferencesClient {
  read(): Promise<PreferencesSnapshot>;
  update(update: PreferencesUpdate): Promise<PreferencesSnapshot>;
  reset(): Promise<PreferencesSnapshot>;
}

export const tauriPreferencesClient: NativePreferencesClient = {
  read: () => invoke<PreferencesSnapshot>('preferences_read'),
  update: (update) => invoke<PreferencesSnapshot>('preferences_update', { update }),
  reset: () => invoke<PreferencesSnapshot>('preferences_reset'),
};

export function asPreferencesError(error: unknown): PreferencesIpcError {
  if (error && typeof error === 'object' && 'code' in error && 'messageKey' in error) {
    return error as PreferencesIpcError;
  }
  return { code: 'unknown', messageKey: 'preferences_error_unknown' };
}
