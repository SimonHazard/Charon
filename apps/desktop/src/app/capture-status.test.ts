import { describe, expect, it } from 'vitest';
import { captureStatusTone } from '@/app/capture-status';

describe('capture status presentation', () => {
  it('presents clipboard restoration as a warning without weakening capture errors', () => {
    expect(captureStatusTone('capture_warning_clipboard_not_restored')).toBe('warning');
    expect(captureStatusTone('workspace_error_not_open')).toBe('error');
  });
});
