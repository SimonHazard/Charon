import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type { CaptureCapabilities, CaptureIpcError, CaptureRequest } from '@/bindings/capture';

export type CaptureRequestListener = (request: CaptureRequest) => void;

export interface CaptureClient {
  capabilities(): Promise<CaptureCapabilities>;
  open(): Promise<CaptureCapabilities>;
  requestPermission(): Promise<CaptureCapabilities>;
  setShortcut(shortcut: string): Promise<CaptureCapabilities>;
  close(): Promise<void>;
  subscribe(listener: CaptureRequestListener): Promise<() => void>;
}

export const tauriCaptureClient: CaptureClient = {
  capabilities: () => invoke<CaptureCapabilities>('capture_capabilities'),
  open: () => invoke<CaptureCapabilities>('capture_open'),
  requestPermission: () => invoke<CaptureCapabilities>('capture_request_permission'),
  setShortcut: (shortcut) => invoke<CaptureCapabilities>('capture_set_shortcut', { shortcut }),
  close: () => invoke<void>('capture_close'),
  subscribe: async (listener) => {
    const unlisten = await listen<CaptureRequest>('capture://requested', (event) =>
      listener(event.payload),
    );
    return unlisten;
  },
};

export function asCaptureError(error: unknown): CaptureIpcError {
  if (error && typeof error === 'object' && 'code' in error && 'messageKey' in error) {
    return error as CaptureIpcError;
  }
  return { code: 'unknown', messageKey: 'capture_error_unknown' };
}
