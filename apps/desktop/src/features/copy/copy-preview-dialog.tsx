import { useMessages } from '@/app/providers';
import type { ClipboardIpcError, ComposedClipboard, CopyPreset } from '@/bindings/clipboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { COPY_PRESET_MESSAGE_KEYS } from '@/features/copy/copy-preset';

export function CopyPreviewDialog({
  error,
  loading,
  onCopy,
  onOpenChange,
  onRetry,
  open,
  preset,
  result,
}: {
  error: ClipboardIpcError | null;
  loading: boolean;
  onCopy(): void;
  onOpenChange(open: boolean): void;
  onRetry(): void;
  open: boolean;
  preset: CopyPreset;
  result: ComposedClipboard | null;
}) {
  const m = useMessages();
  const errorMessage = error
    ? ((m as unknown as Record<string, () => string>)[error.messageKey]?.() ??
      m.clipboard_error_write_failed())
    : null;

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{m.copy_preview_title()}</DialogTitle>
          <DialogDescription>{m.copy_preview_description()}</DialogDescription>
        </DialogHeader>
        <Badge variant="secondary">{m[COPY_PRESET_MESSAGE_KEYS[preset]]()}</Badge>
        <Textarea
          aria-label={m.copy_preview_markdown_label()}
          className="min-h-64 resize-y"
          readOnly
          value={loading ? m.copy_preview_loading() : (result?.markdown ?? '')}
        />
        {errorMessage ? <p role="alert">{errorMessage}</p> : null}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="outline">
            {m.common_cancel()}
          </Button>
          {error ? (
            <Button disabled={loading} onClick={onRetry}>
              {m.copy_retry()}
            </Button>
          ) : (
            <Button disabled={loading || !result} onClick={onCopy}>
              {m.copy_preview_copy()}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
