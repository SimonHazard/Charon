import { IconFile, IconPaperclip, IconX } from '@tabler/icons-react';
import { m as motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { useMessages } from '@/app/providers';
import type { AttachmentDto, NoteDto } from '@/bindings/workspace';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { closedDraft, draftReducer, hasUnsavedDraft } from '@/features/notes/draft-controller';
import { NotePreview } from '@/features/notes/note-preview';
import { motionProfiles } from '@/motion/system';

const AUTOSAVE_DELAY_MS = 650;

export function normalizeTagInput(value: string): string {
  return value.trim().replace(/^#/u, '').trim();
}

export function NoteEditor({
  note,
  allTags,
  onSave,
  onSetTags,
  onAddAttachments,
  onRemoveAttachment,
  onRetryCleanup,
  onClose,
}: {
  note: NoteDto;
  allTags: readonly string[];
  onSave(body: string): Promise<void>;
  onSetTags(tags: string[]): Promise<void>;
  onAddAttachments(): Promise<void>;
  onRemoveAttachment(attachment: AttachmentDto): Promise<void>;
  onRetryCleanup(): Promise<void>;
  onClose(): void;
}) {
  const m = useMessages();
  const [draft, dispatch] = useReducer(draftReducer, closedDraft);
  const [tagInput, setTagInput] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);
  const [attachmentPending, setAttachmentPending] = useState(false);
  const [attachmentError, setAttachmentError] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<AttachmentDto | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const [removeError, setRemoveError] = useState<'cleanup' | 'other' | null>(null);
  const inFlight = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    const current = draftRef.current;
    if (current.noteId !== note.id || (!hasUnsavedDraft(current) && current.value !== note.body)) {
      dispatch({ type: 'open', noteId: note.id, body: note.body });
    }
  }, [note.body, note.id]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() =>
      textareaRef.current?.focus({ preventScroll: true }),
    );
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const save = useCallback(async () => {
    if (!hasUnsavedDraft(draft)) return true;
    if (inFlight.current) return false;
    inFlight.current = true;
    dispatch({ type: 'saving' });
    try {
      await onSave(draft.value);
      dispatch({ type: 'saved', body: draft.value });
      return true;
    } catch (error) {
      const key =
        error && typeof error === 'object' && 'messageKey' in error
          ? String(error.messageKey)
          : 'note_editor_save_error';
      dispatch({ type: 'failed', errorKey: key });
      return false;
    } finally {
      inFlight.current = false;
    }
  }, [draft, onSave]);

  useEffect(() => {
    if (draft.status !== 'dirty') return;
    const timeout = window.setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [draft.status, save]);

  const suggestions = useMemo(() => {
    const needle = tagInput.toLocaleLowerCase();
    const used = new Set(note.tags.map((tag) => tag.toLocaleLowerCase()));
    return allTags
      .filter(
        (tag) =>
          !used.has(tag.toLocaleLowerCase()) &&
          (!needle || tag.toLocaleLowerCase().includes(needle)),
      )
      .slice(0, 5);
  }, [allTags, note.tags, tagInput]);

  const addTag = async (raw: string) => {
    const tag = normalizeTagInput(raw);
    if (!tag) return;
    if (note.tags.some((current) => current.toLocaleLowerCase() === tag.toLocaleLowerCase())) {
      setTagError(m.tag_error_duplicate());
      return;
    }
    if (note.tags.length >= 16) {
      setTagError(m.tag_error_limit());
      return;
    }
    try {
      await onSetTags([...note.tags, tag]);
      setTagInput('');
      setTagError(null);
    } catch {
      setTagError(m.tag_error_invalid());
    }
  };

  const removeTag = async (tag: string) => {
    setTagError(null);
    await onSetTags(note.tags.filter((current) => current !== tag));
  };

  const addAttachments = async () => {
    if (attachmentPending) return;
    setAttachmentPending(true);
    setAttachmentError(false);
    try {
      await onAddAttachments();
    } catch {
      setAttachmentError(true);
    } finally {
      setAttachmentPending(false);
    }
  };

  const close = async () => {
    if (hasUnsavedDraft(draft) && !(await save())) return;
    onClose();
  };

  const bodyError = draft.errorKey
    ? ((m as unknown as Record<string, () => string>)[draft.errorKey]?.() ??
      m.note_editor_save_error())
    : null;

  return (
    <motion.section
      animate={{ opacity: 1, scale: 1, x: 0 }}
      className="note-editor-inline"
      data-note-editor={note.id}
      initial={{ opacity: 0, scale: 0.99, x: -4 }}
      transition={motionProfiles.surface}
    >
      <div className="note-editor-heading">
        <strong>{m.note_editor_title()}</strong>
        <Button
          aria-label={m.common_close()}
          onClick={() => void close()}
          size="icon-sm"
          variant="ghost"
        >
          <IconX aria-hidden="true" />
        </Button>
      </div>
      <Tabs defaultValue="write">
        <TabsList variant="line">
          <TabsTrigger value="write">{m.note_editor_write()}</TabsTrigger>
          <TabsTrigger value="preview">{m.note_editor_preview()}</TabsTrigger>
        </TabsList>
        <TabsContent value="write">
          <Field data-invalid={Boolean(bodyError)}>
            <FieldLabel className="sr-only" htmlFor={`note-markdown-${note.id}`}>
              {m.note_editor_markdown_label()}
            </FieldLabel>
            <Textarea
              aria-invalid={Boolean(bodyError)}
              id={`note-markdown-${note.id}`}
              onBlur={() => void save()}
              onChange={(event) => dispatch({ type: 'change', value: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  event.preventDefault();
                  void close();
                }
              }}
              ref={textareaRef}
              rows={12}
              value={draft.value}
            />
            <FieldDescription aria-live="polite">
              {draft.status === 'saving'
                ? m.note_editor_saving()
                : draft.status === 'dirty'
                  ? m.note_editor_dirty()
                  : m.note_editor_saved()}
            </FieldDescription>
            {bodyError ? <FieldError>{bodyError}</FieldError> : null}
          </Field>
        </TabsContent>
        <TabsContent value="preview">
          <NotePreview body={draft.value} label={m.note_editor_preview_label()} />
        </TabsContent>
      </Tabs>

      <div className="note-editor-metadata">
        <Field data-invalid={Boolean(tagError)}>
          <FieldLabel htmlFor={`note-tags-${note.id}`}>{m.tags_label()}</FieldLabel>
          <div className="tag-editor-row">
            {note.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
                <button
                  aria-label={m.tag_remove({ tag })}
                  onClick={() => void removeTag(tag)}
                  type="button"
                >
                  <IconX aria-hidden="true" />
                </button>
              </Badge>
            ))}
            <Input
              autoComplete="off"
              id={`note-tags-${note.id}`}
              list={`note-tag-suggestions-${note.id}`}
              onChange={(event) => {
                setTagInput(event.target.value);
                setTagError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',') {
                  event.preventDefault();
                  void addTag(tagInput);
                } else if (event.key === 'Backspace' && !tagInput && note.tags.length) {
                  void removeTag(note.tags.at(-1) as string);
                }
              }}
              placeholder={m.tag_add_placeholder()}
              value={tagInput}
            />
            <datalist id={`note-tag-suggestions-${note.id}`}>
              {suggestions.map((tag) => (
                <option key={tag} value={tag} />
              ))}
            </datalist>
          </div>
          {tagError ? <FieldError>{tagError}</FieldError> : null}
        </Field>

        <section aria-label={m.attachments_label()} className="attachment-editor">
          <div className="attachment-heading">
            <strong>{m.attachments_label()}</strong>
            <Button
              disabled={attachmentPending}
              onClick={() => void addAttachments()}
              size="sm"
              variant="outline"
            >
              <IconPaperclip aria-hidden="true" />
              {attachmentPending ? m.attachment_importing() : m.attachment_add()}
            </Button>
          </div>
          {note.attachments.length ? (
            <ul className="attachment-list">
              {note.attachments.map((attachment) => (
                <li key={attachment.id}>
                  <IconFile aria-hidden="true" />
                  <span>{attachment.fileName}</span>
                  <Button
                    aria-label={m.attachment_remove({ file: attachment.fileName })}
                    onClick={() => {
                      setRemoveError(null);
                      setRemoveTarget(attachment);
                    }}
                    size="icon-sm"
                    variant="ghost"
                  >
                    <IconX aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="attachment-empty">{m.attachment_empty()}</p>
          )}
          {attachmentError ? (
            <p className="inline-error" role="alert">
              {m.attachment_import_error()}
            </p>
          ) : null}
        </section>
      </div>

      <AlertDialog
        open={Boolean(removeTarget)}
        onOpenChange={(open) => {
          if (!open && !removePending) setRemoveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.attachment_remove_title()}</AlertDialogTitle>
            <AlertDialogDescription>
              {m.attachment_remove_description({ file: removeTarget?.fileName ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {removeError ? (
            <p className="inline-error" role="alert">
              {removeError === 'cleanup'
                ? m.delete_cleanup_required()
                : m.attachment_remove_error()}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removePending}>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              disabled={removePending}
              onClick={async () => {
                if (!removeTarget || removePending) return;
                setRemovePending(true);
                try {
                  if (removeError === 'cleanup') await onRetryCleanup();
                  else await onRemoveAttachment(removeTarget);
                  setRemoveTarget(null);
                  setRemoveError(null);
                } catch (error) {
                  const code =
                    error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
                  setRemoveError(code === 'deletion_cleanup_required' ? 'cleanup' : 'other');
                } finally {
                  setRemovePending(false);
                }
              }}
              variant="destructive"
            >
              {removeError ? m.common_retry() : m.attachment_remove_confirm()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.section>
  );
}
