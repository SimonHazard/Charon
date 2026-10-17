import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type {
  AttachmentDragEvent,
  AttachmentDropEvent,
  AttachmentSources,
} from '@/bindings/workspace';

/**
 * Files dropped on or pasted into Charon (ADR 0032). Rust reads the drop or the clipboard and
 * hands back single-use tokens plus display names; React never sees a source path or file bytes.
 */
export interface AttachmentIntakeClient {
  /** Reads the files, or else the image, on the clipboard after an explicit paste. */
  paste(): Promise<AttachmentSources>;
  /** Forgets tokens that will not be imported and deletes their temporary copies. */
  discard(tokens: string[]): Promise<void>;
  subscribeDrag(listener: (event: AttachmentDragEvent) => void): Promise<() => void>;
  subscribeDrop(listener: (event: AttachmentDropEvent) => void): Promise<() => void>;
}

export const tauriAttachmentIntakeClient: AttachmentIntakeClient = {
  paste: () => invoke<AttachmentSources>('workspace_paste_attachments'),
  discard: (tokens) => invoke<void>('workspace_discard_attachment_sources', { tokens }),
  subscribeDrag: async (listener) =>
    listen<AttachmentDragEvent>('attachments://drag', (event) => listener(event.payload)),
  subscribeDrop: async (listener) =>
    listen<AttachmentDropEvent>('attachments://drop', (event) => listener(event.payload)),
};

/** Outside the desktop shell nothing can be dropped or pasted as a file. */
export const unavailableAttachmentIntakeClient: AttachmentIntakeClient = {
  paste: async () => ({ tokens: [], fileNames: [] }),
  discard: async () => undefined,
  subscribeDrag: async () => () => undefined,
  subscribeDrop: async () => () => undefined,
};
