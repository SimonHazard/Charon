export const CLIPBOARD_RESTORE_WARNING_KEY = 'capture_warning_clipboard_not_restored';
export const CAPTURE_NOTE_CREATED_KEY = 'capture_note_created';

export type CaptureStatusTone = 'success' | 'warning' | 'error';

export function captureStatusTone(messageKey: string): CaptureStatusTone {
  if (messageKey === CAPTURE_NOTE_CREATED_KEY) return 'success';
  return messageKey === CLIPBOARD_RESTORE_WARNING_KEY ? 'warning' : 'error';
}
