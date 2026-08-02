export const CLIPBOARD_RESTORE_WARNING_KEY = 'capture_warning_clipboard_not_restored';

export function captureStatusTone(messageKey: string): 'warning' | 'error' {
  return messageKey === CLIPBOARD_RESTORE_WARNING_KEY ? 'warning' : 'error';
}
