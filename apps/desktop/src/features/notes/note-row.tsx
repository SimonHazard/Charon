import { IconCheck, IconCopy, IconEdit, IconPaperclip, IconTrash } from '@tabler/icons-react';
import { AnimatePresence, m as motion, useReducedMotion } from 'motion/react';
import { memo, useMemo, useRef, useState } from 'react';

import { useMessages } from '@/app/providers';
import type { AttachmentDto, NoteDto, NoteStatus } from '@/bindings/workspace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { stripDrawingBlocks } from '@/features/notes/drawing/drawing-format';
import { NoteEditor, noteEditorId } from '@/features/notes/note-editor';
import { iconSwapMotion } from '@/motion/system';

const lineBreak = /\r?\n/u;
const headingMarker = /^#{1,6}\s*/u;

/** Keyboard-initiated row actions swap instantly; read at activation, never per render. */
const keyboardActivation = () => document.documentElement.dataset.inputModality === 'keyboard';

/**
 * `CmdOrCtrl+C` on the focused row itself, with no text selected anywhere. Keys from editable
 * text, the editor, or a dialog never target the row button, so their native Copy is untouched.
 */
function rowCopyShortcut(event: React.KeyboardEvent<HTMLButtonElement>) {
  return (
    event.target === event.currentTarget &&
    (event.metaKey || event.ctrlKey) &&
    !event.shiftKey &&
    !event.altKey &&
    !event.repeat &&
    !event.nativeEvent.isComposing &&
    event.key.toLocaleLowerCase() === 'c' &&
    (window.getSelection()?.isCollapsed ?? true)
  );
}

export function noteHeadline(
  source: string,
  drawingLabel = '',
): { title: string; snippet: string } {
  // A drawing contributes its localized label, never SVG source lines.
  const body = stripDrawingBlocks(source, drawingLabel);
  let title = '';
  const snippet: string[] = [];
  let cursor = 0;
  while (cursor <= body.length && snippet.length < 2) {
    const match = lineBreak.exec(body.slice(cursor));
    const end = match ? cursor + (match.index ?? 0) : body.length;
    const line = body.slice(cursor, end).trim();
    if (line) {
      if (title) snippet.push(line);
      else title = line.replace(headingMarker, '').trim();
    }
    if (!match) break;
    cursor = end + match[0].length;
  }
  return { title, snippet: snippet.join(' ') };
}

export const NoteRow = memo(function NoteRow({
  note,
  expanded,
  acknowledged = false,
  allTags,
  copyState,
  onCopy,
  onSetStatus,
  onExpand,
  onFocusAttachments,
  onCloseEditor,
  onTagFilter,
  onDelete,
  onSave,
  onSetTags,
  onAddAttachments,
  onRemoveAttachment,
  onRetryCleanup,
  onDirtyChange,
  registerDraftGuard,
}: {
  note: NoteDto;
  expanded: boolean;
  /** Briefly tints a Note that a selected-text capture just created. */
  acknowledged?: boolean;
  allTags: readonly string[];
  copyState: { status: 'copied' | 'error'; message: string } | null;
  onCopy(noteId: string): Promise<void>;
  onSetStatus(noteId: string, status: NoteStatus): Promise<void>;
  onExpand(noteId: string): void;
  onFocusAttachments(noteId: string): Promise<void>;
  onCloseEditor(noteId: string): void;
  onTagFilter(tag: string): void;
  onDelete(noteId: string): void;
  onSave(noteId: string, body: string): Promise<void>;
  onSetTags(noteId: string, tags: string[]): Promise<void>;
  onAddAttachments(noteId: string): Promise<void>;
  onRemoveAttachment(noteId: string, attachment: AttachmentDto): Promise<void>;
  onRetryCleanup(): Promise<void>;
  onDirtyChange(dirty: boolean): void;
  registerDraftGuard?(guard: () => Promise<boolean>): () => void;
}) {
  const m = useMessages();
  const reduceMotion = useReducedMotion() ?? false;
  // The requested status shows on activation and falls back to the stored one when it settles.
  const [optimisticStatus, setOptimisticStatus] = useState<NoteStatus | null>(null);
  const [instantCue, setInstantCue] = useState(false);
  const statusRequestRef = useRef(0);
  const status = optimisticStatus ?? note.status;
  const copied = copyState?.status === 'copied';
  const drawingLabel = m.drawing_label();
  const headline = useMemo(() => noteHeadline(note.body, drawingLabel), [note.body, drawingLabel]);
  const title = headline.title || m.note_untitled();
  const remainingLines = headline.snippet;
  const attachmentSummary = m.attachment_count({ count: note.attachments.length });
  const attachmentDetails = note.attachments.length
    ? m.note_attachment_names({
        count: attachmentSummary,
        files: note.attachments.map((attachment) => attachment.fileName).join(', '),
      })
    : attachmentSummary;
  const tagSummary = note.tags.length ? note.tags.join(', ') : m.note_metadata_no_tags();
  const statusSummary = status === 'done' ? m.note_status_done() : m.note_status_open();
  const statusAction = status === 'done' ? m.note_mark_open() : m.note_mark_done();
  const copyDisclosureId = `copy-disclosure-${note.id}`;
  const noteSummaryId = `note-summary-${note.id}`;
  const editorId = noteEditorId(note.id);

  // Edit on an open Note moves focus into its editor; collapsing stays with Close and Escape.
  const focusOpenEditor = () => {
    const editor = document.getElementById(editorId);
    const target =
      editor?.querySelector<HTMLElement>('textarea') ??
      editor?.querySelector<HTMLElement>('[data-note-editor-tab="write"]');
    target?.focus({ preventScroll: true });
  };

  const requestStatus = async () => {
    const next: NoteStatus = status === 'done' ? 'open' : 'done';
    const request = statusRequestRef.current + 1;
    statusRequestRef.current = request;
    setOptimisticStatus(next);
    setInstantCue(keyboardActivation());
    try {
      await onSetStatus(note.id, next);
    } catch {
      // The Workspace warning reports the failure; the row returns to the stored status.
    } finally {
      if (statusRequestRef.current === request) setOptimisticStatus(null);
    }
  };

  return (
    <motion.article
      className="note-row"
      data-acknowledged={acknowledged || undefined}
      data-expanded={expanded}
      data-note-id={note.id}
      data-status={status}
    >
      <div className="note-row-main">
        <div className="note-row-leading">
          <Tooltip>
            <TooltipTrigger
              aria-busy={optimisticStatus !== null}
              aria-label={statusAction}
              aria-pressed={status === 'done'}
              className="note-status-button"
              onClick={() => void requestStatus()}
              render={<Button size="icon-sm" variant="ghost" />}
            >
              <span aria-hidden className="note-status-dot" data-status={status}>
                <AnimatePresence initial={false} mode="wait">
                  {status === 'done' ? (
                    <motion.span
                      className="note-icon-swap"
                      key="check"
                      {...iconSwapMotion(reduceMotion, instantCue)}
                    >
                      <IconCheck />
                    </motion.span>
                  ) : null}
                </AnimatePresence>
              </span>
            </TooltipTrigger>
            <TooltipContent>{statusAction}</TooltipContent>
          </Tooltip>
        </div>
        <div className="note-row-content">
          <button
            aria-controls={expanded ? editorId : undefined}
            aria-describedby={noteSummaryId}
            aria-expanded={expanded}
            aria-keyshortcuts="Meta+C Control+C"
            className="note-row-activation"
            data-note-focus={note.id}
            onClick={() => onExpand(note.id)}
            onKeyDown={(event) => {
              if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                event.stopPropagation();
                onDelete(note.id);
              } else if (rowCopyShortcut(event)) {
                // Like Delete, it targets only this focused Note; selected text keeps native Copy.
                event.preventDefault();
                event.stopPropagation();
                setInstantCue(true);
                void onCopy(note.id);
              }
            }}
            type="button"
          >
            <span className="note-row-title">{title}</span>
            {remainingLines ? <span className="note-row-snippet">{remainingLines}</span> : null}
          </button>
          <div className="note-row-metadata" data-note-metadata>
            <span className="sr-only" id={noteSummaryId}>
              {statusSummary}{' '}
              {m.note_metadata_summary({ tags: tagSummary, attachments: attachmentDetails })}
            </span>
            {note.attachments.length ? (
              <Tooltip>
                <TooltipTrigger
                  aria-label={m.attachment_focus({ count: attachmentSummary })}
                  className="attachment-count"
                  onClick={() => void onFocusAttachments(note.id)}
                  render={<button type="button" />}
                >
                  <IconPaperclip aria-hidden="true" />
                  <span aria-hidden="true">{note.attachments.length}</span>
                </TooltipTrigger>
                <TooltipContent>{m.attachment_focus({ count: attachmentSummary })}</TooltipContent>
              </Tooltip>
            ) : null}
            {note.tags.slice(0, 2).map((tag) => (
              <Tooltip key={tag}>
                <TooltipTrigger
                  aria-label={m.tag_filter_apply({ tag })}
                  className="tag-filter-chip"
                  onClick={() => onTagFilter(tag)}
                  render={<button type="button" />}
                >
                  {tag}
                </TooltipTrigger>
                <TooltipContent>{m.tag_filter_apply({ tag })}</TooltipContent>
              </Tooltip>
            ))}
            {note.tags.length > 2 ? (
              <Badge className="tag-overflow">+{note.tags.length - 2}</Badge>
            ) : null}
          </div>
        </div>
        <div className="note-row-actions">
          <Tooltip>
            <TooltipTrigger
              aria-describedby={copyDisclosureId}
              aria-label={m.copy_note_as_markdown({ title })}
              className="note-copy-button"
              data-copied={copied ? '' : undefined}
              onClick={() => {
                setInstantCue(keyboardActivation());
                void onCopy(note.id);
              }}
              render={<Button size="icon-sm" variant="ghost" />}
            >
              {/* The success announcement lives in the shelf's polite status region. */}
              <AnimatePresence initial={false} mode="wait">
                <motion.span
                  className="note-icon-swap"
                  key={copied ? 'copied' : 'copy'}
                  {...iconSwapMotion(reduceMotion, instantCue)}
                >
                  {copied ? (
                    <IconCheck aria-hidden="true" />
                  ) : (
                    <IconCopy aria-hidden="true" data-icon="inline-start" />
                  )}
                </motion.span>
              </AnimatePresence>
            </TooltipTrigger>
            <TooltipContent className="copy-action-tooltip">
              <span>{m.copy_as_markdown()}</span>
              <span className="copy-disclosure">{m.copy_local_paths_disclosure()}</span>
            </TooltipContent>
          </Tooltip>
          <span className="sr-only" id={copyDisclosureId}>
            {m.copy_local_paths_disclosure()}
          </span>
          <Tooltip>
            <TooltipTrigger
              aria-controls={expanded ? editorId : undefined}
              aria-expanded={expanded}
              aria-label={m.note_edit({ title })}
              className="note-edit-button"
              onClick={() => (expanded ? focusOpenEditor() : onExpand(note.id))}
              render={<Button size="icon-sm" variant="ghost" />}
            >
              <IconEdit aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{m.note_edit_tooltip()}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              aria-label={m.note_delete({ title })}
              className="note-delete-button"
              onClick={() => onDelete(note.id)}
              render={<Button size="icon-sm" variant="ghost" />}
            >
              <IconTrash aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{m.note_delete_tooltip()}</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {copyState?.status === 'error' ? (
        <p className="inline-error note-copy-state" role="alert">
          {copyState.message}
        </p>
      ) : null}
      <AnimatePresence initial={false} mode="popLayout">
        {expanded ? (
          <NoteEditor
            allTags={allTags}
            key={note.id}
            note={note}
            onAddAttachments={() => onAddAttachments(note.id)}
            onClose={() => onCloseEditor(note.id)}
            onDirtyChange={onDirtyChange}
            registerDraftGuard={registerDraftGuard}
            onRemoveAttachment={(attachment) => onRemoveAttachment(note.id, attachment)}
            onRetryCleanup={onRetryCleanup}
            onSave={(body) => onSave(note.id, body)}
            onSetTags={(tags) => onSetTags(note.id, tags)}
          />
        ) : null}
      </AnimatePresence>
    </motion.article>
  );
});
