import { describe, expect, it, vi } from 'vitest';

import type { CaptureStatusEvent } from '@/bindings/capture';
import { asCaptureError, tauriCaptureClient } from '@/lib/ipc/capture-client';

const events = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, listener: (event: { payload: unknown }) => void) => {
    events.listeners.set(name, listener);
    return () => events.listeners.delete(name);
  },
}));

describe('capture client', () => {
  it('preserves typed errors and never leaks unknown selected content', () => {
    const denied = { code: 'permission_denied', messageKey: 'capture_error_permission_denied' };
    expect(asCaptureError(denied)).toBe(denied);
    expect(asCaptureError(new Error('private selected text'))).toEqual({
      code: 'unknown',
      messageKey: 'capture_error_unknown',
    });
  });

  it('forwards the content-free capture status with the created Note id', async () => {
    const received: CaptureStatusEvent[] = [];
    const stop = await tauriCaptureClient.subscribeStatus((status) => received.push(status));
    const payload: CaptureStatusEvent = {
      messageKey: 'capture_note_created',
      noteId: '00000000-0000-4000-8000-000000000007',
    };
    events.listeners.get('capture://status')?.({ payload });
    expect(received).toEqual([payload]);
    expect(Object.keys(received[0] ?? {}).sort()).toEqual(['messageKey', 'noteId']);
    stop();
    expect(events.listeners.has('capture://status')).toBe(false);
  });
});
