import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type {
  CaptureCapabilities,
  CaptureComposerRequest,
  CaptureIpcError,
  CapturePermissionKind,
  CaptureStatusEvent,
} from '@/bindings/capture';

export type CaptureComposerRequestListener = (request: CaptureComposerRequest) => void;
export type CaptureStatusListener = (status: CaptureStatusEvent) => void;

export interface CaptureClient {
  capabilities(): Promise<CaptureCapabilities>;
  open(): Promise<CaptureCapabilities>;
  requestPermission(permission: CapturePermissionKind): Promise<CaptureCapabilities>;
  composerReady(): Promise<void>;
  subscribeComposerFocus(listener: CaptureComposerRequestListener): Promise<() => void>;
  subscribeStatus(listener: CaptureStatusListener): Promise<() => void>;
}

export const tauriCaptureClient: CaptureClient = {
  capabilities: () => invoke<CaptureCapabilities>('capture_capabilities'),
  open: () => invoke<CaptureCapabilities>('capture_open'),
  requestPermission: (permission) =>
    invoke<CaptureCapabilities>('capture_request_permission', { permission }),
  composerReady: () => invoke<void>('capture_composer_ready'),
  subscribeComposerFocus: async (listener) => {
    const unlisten = await listen<CaptureComposerRequest>(
      'capture://composer-focus-requested',
      (event) => listener(event.payload),
    );
    return unlisten;
  },
  subscribeStatus: async (listener) => {
    const unlisten = await listen<CaptureStatusEvent>('capture://status', (event) =>
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
