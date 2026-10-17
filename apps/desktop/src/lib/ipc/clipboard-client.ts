import { invoke } from '@tauri-apps/api/core';

import type { ClipboardIpcError, ComposedClipboard, ComposeRequest } from '@/bindings/clipboard';

export interface ClipboardClient {
  composeAndWrite(request: ComposeRequest): Promise<ComposedClipboard>;
  /** Copies one drawing rendered to PNG as an image, after an explicit action (ADR 0033). */
  writeDrawingImage?(png: Uint8Array): Promise<void>;
}

export const tauriClipboardClient: ClipboardClient = {
  composeAndWrite: (request) =>
    invoke<ComposedClipboard>('clipboard_compose_and_write', { request }),
  writeDrawingImage: (png) =>
    invoke<void>('clipboard_write_drawing_image', { png: Array.from(png) }),
};

export function asClipboardError(error: unknown): ClipboardIpcError {
  if (error && typeof error === 'object' && 'code' in error && 'messageKey' in error) {
    return error as ClipboardIpcError;
  }
  return {
    code: 'write_failed',
    messageKey: 'clipboard_error_write_failed',
  };
}
