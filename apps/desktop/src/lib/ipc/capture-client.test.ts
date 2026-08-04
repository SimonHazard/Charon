import { describe, expect, it } from 'vitest';

import { asCaptureError } from '@/lib/ipc/capture-client';

describe('capture client', () => {
  it('preserves typed errors and never leaks unknown selected content', () => {
    const denied = { code: 'permission_denied', messageKey: 'capture_error_permission_denied' };
    expect(asCaptureError(denied)).toBe(denied);
    expect(asCaptureError(new Error('private selected text'))).toEqual({
      code: 'unknown',
      messageKey: 'capture_error_unknown',
    });
  });
});
