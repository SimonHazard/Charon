import {
  IconCheck,
  IconCopy,
  IconDots,
  IconEdit,
  IconPaperclip,
  IconPlus,
} from '@tabler/icons-react';
import { memo, useState } from 'react';

import { useMessages } from '@/app/providers';
import type { AttachmentDto, NoteDto } from '@/bindings/workspace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { NoteEditor } from '@/features/notes/note-editor';

export function noteFirstLine(body: string): string {
  return (
    body
      .split(/\r?\n/u)
      .find((line) => line.trim())
      ?.replace(/^#{1,6}\s*/u, '')
      .trim() ?? ''
  );
}

export const NoteRow = memo(function NoteRow({
  note,
  active,
  selected,
  selectionMode,
  expanded,
  allTags,
  onActivate,
  onToggleSelection,
  onToggleStatus,
  onExpand,
  onFocusAttachments,
  onCloseEditor,
  onTagFilter,
  onCopy,
  onSave,
  onSetTags,
  onAddAttachments,
  onRemoveAttachment,
  onRetryCleanup,
  onDirtyChange,
}: {
  note: NoteDto;
  active: boolean;
  selected: boolean;
  selectionMode: boolean;
  expanded: boolean;
  allTags: readonly string[];
  onActivate(noteId: string, event: React.MouseEvent | React.KeyboardEvent): void;
  onToggleSelection(noteId: string): void;
  onToggleStatus(note: NoteDto): Promise<void>;
  onExpand(noteId: string): void;
  onFocusAttachments(noteId: string): Promise<void>;
  onCloseEditor(): void;
  onTagFilter(tag: string): void;
  onCopy(noteId: string): Promise<void>;
  onSave(noteId: string, body: string): Promise<void>;
  onSetTags(noteId: string, tags: string[]): Promise<void>;
  onAddAttachments(noteId: string): Promise<void>;
  onRemoveAttachment(noteId: string, attachment: AttachmentDto): Promise<void>;
  onRetryCleanup(): Promise<void>;
  onDirtyChange(dirty: boolean): void;
}) {
  const m = useMessages();
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const title = noteFirstLine(note.body) || m.note_untitled();
  const remainingLines = note.body
    .split(/\r?\n/u)
    .filter((line) => line.trim())
    .slice(1, 3)
    .join(' ');
  const attachmentSummary = m.attachment_count({ count: note.attachments.length });
  const attachmentDetails = note.attachments.length
    ? m.note_attachment_names({
        count: attachmentSummary,
        files: note.attachments.map((attachment) => attachment.fileName).join(', '),
      })
    : attachmentSummary;
  const tagSummary = note.tags.length ? note.tags.join(', ') : m.note_metadata_no_tags();

  const copy = async () => {
    try {
      await onCopy(note.id);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 1600);
    } catch {
      setCopyState('error');
    }
  };

  return (
    <article
      className="note-row"
      data-active={active}
      data-expanded={expanded}
      data-note-id={note.id}
      data-selected={selected}
    >
      <div className="note-row-main">
        <div className="note-row-leading">
          {selectionMode ? (
            <Checkbox
              aria-label={m.note_select_label({ title })}
              checked={selected}
              onCheckedChange={() => onToggleSelection(note.id)}
            />
          ) : (
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
          )}
        </div>
        <div className="note-row-content">
          <button
            className="note-row-activation"
            data-note-focus={note.id}
            onClick={(event) => (selectionMode ? onActivate(note.id, event) : onExpand(note.id))}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                if (selectionMode) onActivate(note.id, event);
                else onExpand(note.id);
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
              <Badge className="tag-overflow" variant="secondary">
                +{note.tags.length - 2}
              </Badge>
            ) : null}
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
          </div>
        </div>
        {!selectionMode ? (
          <div className="note-row-actions">
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={m.note_actions({ title })}
                render={<Button size="icon-sm" variant="ghost" />}
              >
                <IconDots aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem onClick={() => void copy()}>
                    <IconCopy aria-hidden="true" />
                    {copyState === 'copied' ? m.copy_inline_copied() : m.copy_as_markdown()}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void onAddAttachments(note.id)}>
                    <IconPlus aria-hidden="true" />
                    {m.attachment_add()}
                  </DropdownMenuItem>
                  {copyState === 'error' ? (
                    <DropdownMenuItem onClick={() => void copy()}>
                      {m.copy_retry()}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              aria-label={m.note_edit({ title })}
              className="note-edit-button"
              onClick={() => onExpand(note.id)}
              size="icon-sm"
              variant="ghost"
            >
              <IconEdit aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>
      {expanded ? (
        <NoteEditor
          allTags={allTags}
          note={note}
          onAddAttachments={() => onAddAttachments(note.id)}
          onClose={onCloseEditor}
          onDirtyChange={onDirtyChange}
          onRemoveAttachment={(attachment) => onRemoveAttachment(note.id, attachment)}
          onRetryCleanup={onRetryCleanup}
          onSave={(body) => onSave(note.id, body)}
          onSetTags={(tags) => onSetTags(note.id, tags)}
        />
      ) : null}
    </article>
  );
});
