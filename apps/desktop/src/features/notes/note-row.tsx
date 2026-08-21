import { IconCheck, IconCopy, IconEdit, IconPaperclip, IconTrash } from '@tabler/icons-react';
import { AnimatePresence, m as motion } from 'motion/react';
import { memo, useMemo } from 'react';

import { useMessages } from '@/app/providers';
import type { AttachmentDto, NoteDto } from '@/bindings/workspace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NoteEditor } from '@/features/notes/note-editor';
import { surfaceTransition } from '@/motion/system';

const lineBreak = /\r?\n/u;
const headingMarker = /^#{1,6}\s*/u;

export function noteHeadline(body: string): { title: string; snippet: string } {
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
  allTags,
  copyState,
  onCopy,
  onToggleStatus,
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
}: {
  note: NoteDto;
  expanded: boolean;
  allTags: readonly string[];
  copyState: { status: 'copied' | 'error'; message: string } | null;
  onCopy(noteId: string): Promise<void>;
  onToggleStatus(note: NoteDto): Promise<void>;
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
}) {
  const m = useMessages();
  const headline = useMemo(() => noteHeadline(note.body), [note.body]);
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

  return (
    <motion.article
      className="note-row"
      data-expanded={expanded}
      data-note-id={note.id}
      data-status={note.status}
      layout="size"
      transition={{ layout: surfaceTransition }}
    >
      <div className="note-row-main">
        <div className="note-row-leading">
          <Button
            aria-label={note.status === 'done' ? m.note_mark_open() : m.note_mark_done()}
            className="note-status-button"
            onClick={() => void onToggleStatus(note)}
            size="icon-sm"
            variant="ghost"
          >
            <span aria-hidden className="note-status-dot" data-status={note.status}>
              {note.status === 'done' ? <IconCheck /> : null}
            </span>
          </Button>
        </div>
        <div className="note-row-content">
          <button
            className="note-row-activation"
            data-note-focus={note.id}
            onClick={() => onExpand(note.id)}
            onKeyDown={(event) => {
              if (event.key === 'Delete' || event.key === 'Backspace') {
                event.preventDefault();
                event.stopPropagation();
                onDelete(note.id);
              }
            }}
            type="button"
          >
            <span className="note-row-title">{title}</span>
            {remainingLines ? <span className="note-row-snippet">{remainingLines}</span> : null}
          </button>
          <div className="note-row-metadata" data-note-metadata>
            <span className="sr-only">
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
              <button
                className="tag-filter-chip"
                key={tag}
                onClick={() => onTagFilter(tag)}
                type="button"
              >
                {tag}
              </button>
            ))}
            {note.tags.length > 2 ? (
              <Badge className="tag-overflow">+{note.tags.length - 2}</Badge>
            ) : null}
          </div>
        </div>
        <div className="note-row-actions">
          <Tooltip>
            <TooltipTrigger
              aria-description={m.copy_local_paths_disclosure()}
              aria-label={m.copy_note_as_markdown({ title })}
              className="note-copy-button"
              onClick={() => void onCopy(note.id)}
              render={<Button size="icon-sm" variant="ghost" />}
            >
              <IconCopy aria-hidden="true" data-icon="inline-start" />
            </TooltipTrigger>
            <TooltipContent className="copy-action-tooltip">
              <span>{m.copy_as_markdown()}</span>
              <span className="copy-disclosure">{m.copy_local_paths_disclosure()}</span>
            </TooltipContent>
          </Tooltip>
          <Button
            aria-label={m.note_edit({ title })}
            className="note-edit-button"
            onClick={() => onExpand(note.id)}
            size="icon-sm"
            variant="ghost"
          >
            <IconEdit aria-hidden="true" />
          </Button>
          <Button
            aria-label={m.note_delete({ title })}
            className="note-delete-button"
            onClick={() => onDelete(note.id)}
            size="icon-sm"
            variant="ghost"
          >
            <IconTrash aria-hidden="true" />
          </Button>
        </div>
      </div>
      {copyState ? (
        <p
          className={
            copyState.status === 'error'
              ? 'inline-error note-copy-state'
              : 'inline-success note-copy-state'
          }
          role={copyState.status === 'error' ? 'alert' : 'status'}
        >
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
