import { memo } from 'react';

import { useMessages } from '@/app/providers';
import type { CopyPreset } from '@/bindings/clipboard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { NoteCopyMenu } from '@/features/copy/copy-menu';
import type { NoteViewModel } from '@/features/notes/note-view-model';

export const NoteRow = memo(function NoteRow({
  note,
  active,
  selected,
  onActivate,
  onToggle,
  onOpen,
  copyPreset,
  onCopy,
  onCopyPreview,
}: {
  note: NoteViewModel;
  active: boolean;
  selected: boolean;
  onActivate(event: React.MouseEvent, noteId: string): void;
  onToggle(noteId: string): void;
  onOpen(noteId: string): void;
  copyPreset: CopyPreset;
  onCopy(noteId: string, preset: CopyPreset): void;
  onCopyPreview(noteId: string, preset: CopyPreset): void;
}) {
  const m = useMessages();
  const title = note.title || m.note_untitled();
  return (
    <div
      aria-selected={selected}
      className="note-row"
      data-active={active}
      data-selected={selected}
      data-note-id={note.id}
      role="option"
      tabIndex={-1}
    >
      <Checkbox
        aria-label={m.note_select_label({ title })}
        checked={selected}
        onCheckedChange={() => onToggle(note.id)}
      />
      <Button
        className="note-row-activation"
        data-note-focus={note.id}
        onClick={(event) => onActivate(event, note.id)}
        onDoubleClick={() => onOpen(note.id)}
        size="lg"
        tabIndex={active ? 0 : -1}
        variant="ghost"
      >
        <span className="note-row-copy">
          <span className="note-row-title">{title}</span>
          <span className="note-row-snippet">{note.body}</span>
        </span>
        <span className="note-row-meta">
          <Badge variant="secondary">{note.sectionName}</Badge>
          <span>{note.status === 'done' ? m.note_status_done() : m.note_status_open()}</span>
        </span>
      </Button>
      <NoteCopyMenu
        defaultPreset={copyPreset}
        onCopy={(preset) => onCopy(note.id, preset)}
        onPreview={(preset) => onCopyPreview(note.id, preset)}
        title={title}
      />
    </div>
  );
});
