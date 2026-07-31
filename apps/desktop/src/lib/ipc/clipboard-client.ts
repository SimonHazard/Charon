import { invoke } from '@tauri-apps/api/core';

import type { ClipboardIpcError, ComposedClipboard, ComposeRequest } from '@/bindings/clipboard';

export interface ClipboardClient {
  preview(request: ComposeRequest): Promise<ComposedClipboard>;
  composeAndWrite(request: ComposeRequest): Promise<ComposedClipboard>;
}

export const tauriClipboardClient: ClipboardClient = {
  preview: (request) => invoke<ComposedClipboard>('clipboard_preview', { request }),
  composeAndWrite: (request) =>
    invoke<ComposedClipboard>('clipboard_compose_and_write', { request }),
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
