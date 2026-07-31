import { describe, expect, it } from 'vitest';

import { asClipboardError } from '@/lib/ipc/clipboard-client';

describe('clipboard client', () => {
  it('preserves typed IPC errors and sanitizes unknown failures', () => {
    const denied = {
      code: 'permission_denied',
      messageKey: 'clipboard_error_permission_denied',
    };
    expect(asClipboardError(denied)).toBe(denied);
    expect(asClipboardError(new Error('private clipboard payload'))).toEqual({
      code: 'write_failed',
      messageKey: 'clipboard_error_write_failed',
    });
  });
});
