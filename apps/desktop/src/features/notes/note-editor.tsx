import { useCallback, useEffect, useReducer, useRef, useState } from 'react';

import { useMessages } from '@/app/providers';
import type { NoteDto } from '@/bindings/workspace';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { closedDraft, draftReducer, hasUnsavedDraft } from '@/features/notes/draft-controller';
import { NotePreview } from '@/features/notes/note-preview';

const AUTOSAVE_DELAY_MS = 650;

export function NoteEditor({
  note,
  newDraftKey = null,
  open,
  focusRequest = 0,
  saveRequest = 0,
  onOpenChange,
  onSave,
  onCreate,
  onCreated,
  onUnsavedChange,
}: {
  note: NoteDto | null;
  newDraftKey?: string | null;
  open: boolean;
  focusRequest?: number;
  saveRequest?: number;
  onOpenChange(open: boolean): void;
  onSave(noteId: string, body: string): Promise<void>;
  onCreate(body: string): Promise<string>;
  onCreated(noteId: string): void;
  onUnsavedChange?(unsaved: boolean): void;
}) {
  const m = useMessages();
  const [draft, dispatch] = useReducer(draftReducer, closedDraft);
  const [discardOpen, setDiscardOpen] = useState(false);
  const inFlight = useRef(false);
  const openedNoteId = useRef<string | null>(null);
  const handledSaveRequest = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      openedNoteId.current = null;
      dispatch({ type: 'close' });
      return;
    }
    if (note && openedNoteId.current !== note.id) {
      openedNoteId.current = note.id;
      dispatch({ type: 'open', noteId: note.id, body: note.body });
    } else if (!note && newDraftKey && openedNoteId.current !== newDraftKey) {
      openedNoteId.current = newDraftKey;
      dispatch({ type: 'open', noteId: newDraftKey, body: '' });
    }
  }, [newDraftKey, note, open]);

  useEffect(() => {
    onUnsavedChange?.(hasUnsavedDraft(draft));
  }, [draft, onUnsavedChange]);

  useEffect(() => {
    if (!open) return;
    void focusRequest;
    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequest, open]);

  const save = useCallback(async () => {
    if (!draft.noteId || !hasUnsavedDraft(draft) || inFlight.current) return;
    inFlight.current = true;
    dispatch({ type: 'saving' });
    try {
      if (draft.noteId.startsWith('new:')) {
        const createdId = await onCreate(draft.value);
        openedNoteId.current = createdId;
        dispatch({ type: 'open', noteId: createdId, body: draft.value });
        onCreated(createdId);
      } else {
        await onSave(draft.noteId, draft.value);
        dispatch({ type: 'saved', body: draft.value });
      }
    } catch (error) {
      const key =
        error && typeof error === 'object' && 'messageKey' in error
          ? String(error.messageKey)
          : 'note_editor_save_error';
      dispatch({ type: 'failed', errorKey: key });
    } finally {
      inFlight.current = false;
    }
  }, [draft, onCreate, onCreated, onSave]);

  useEffect(() => {
    if (draft.status !== 'dirty') return;
    const timeout = window.setTimeout(() => void save(), AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [draft.status, save]);

  useEffect(() => {
    if (saveRequest <= handledSaveRequest.current) return;
    handledSaveRequest.current = saveRequest;
    void save();
  }, [save, saveRequest]);

  const requestClose = (next: boolean) => {
    if (next) return onOpenChange(true);
    if (hasUnsavedDraft(draft)) setDiscardOpen(true);
    else onOpenChange(false);
  };

  const errorMessage = draft.errorKey
    ? ((m as unknown as Record<string, () => string>)[draft.errorKey]?.() ??
      m.note_editor_save_error())
    : null;

  return (
    <>
      <Dialog onOpenChange={requestClose} open={open}>
        <DialogContent className="note-editor-dialog">
          <DialogHeader>
            <DialogTitle>{m.note_editor_title()}</DialogTitle>
            <DialogDescription>{m.note_editor_description()}</DialogDescription>
          </DialogHeader>
          <Tabs defaultValue="write">
            <TabsList>
              <TabsTrigger value="write">{m.note_editor_write()}</TabsTrigger>
              <TabsTrigger value="preview">{m.note_editor_preview()}</TabsTrigger>
            </TabsList>
            <TabsContent value="write">
              <Field data-invalid={Boolean(errorMessage)}>
                <FieldLabel className="sr-only" htmlFor="note-markdown">
                  {m.note_editor_markdown_label()}
                </FieldLabel>
                <Textarea
                  aria-invalid={Boolean(errorMessage)}
                  autoFocus
                  id="note-markdown"
                  ref={textareaRef}
                  onBlur={(event) => {
                    if (
                      !event.currentTarget
                        .closest('[data-slot=dialog-content]')
                        ?.contains(event.relatedTarget)
                    ) {
                      void save();
                    }
                  }}
                  onChange={(event) => dispatch({ type: 'change', value: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape' && hasUnsavedDraft(draft)) {
                      event.preventDefault();
                      event.stopPropagation();
                      setDiscardOpen(true);
                    }
                  }}
                  rows={14}
                  value={draft.value}
                />
                <FieldDescription aria-live="polite">
                  {draft.status === 'saving'
                    ? m.note_editor_saving()
                    : draft.status === 'dirty'
                      ? m.note_editor_dirty()
                      : m.note_editor_saved()}
                </FieldDescription>
                {errorMessage ? <FieldError>{errorMessage}</FieldError> : null}
              </Field>
            </TabsContent>
            <TabsContent value="preview">
              <NotePreview body={draft.value} label={m.note_editor_preview_label()} />
            </TabsContent>
          </Tabs>
          <DialogFooter>
            <Button
              onClick={() => void save()}
              disabled={!hasUnsavedDraft(draft) || draft.status === 'saving'}
            >
              {m.note_editor_save()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog onOpenChange={setDiscardOpen} open={discardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.note_editor_discard_title()}</AlertDialogTitle>
            <AlertDialogDescription>{m.note_editor_discard_description()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                dispatch({ type: 'revert' });
                setDiscardOpen(false);
                onOpenChange(false);
              }}
            >
              {m.note_editor_discard()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
