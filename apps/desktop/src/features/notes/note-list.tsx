import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef } from 'react';

import { useMessages } from '@/app/providers';
import type { AttachmentDto, NoteDto } from '@/bindings/workspace';
import { NoteRow } from '@/features/notes/note-row';
import type { SelectionState } from '@/features/notes/selection-model';

const ROW_HEIGHT = 84;

export function NoteList({
  notes,
  selection,
  selectionMode,
  expandedId,
  allTags,
  onSelection,
  onToggleStatus,
  onExpand,
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
  notes: readonly NoteDto[];
  selection: SelectionState;
  selectionMode: boolean;
  expandedId: string | null;
  allTags: readonly string[];
  onSelection(
    action:
      | { type: 'click'; id: string; toggle: boolean; extend: boolean }
      | { type: 'toggle'; id: string }
      | { type: 'keyboard'; event: React.KeyboardEvent },
  ): void;
  onToggleStatus(note: NoteDto): Promise<void>;
  onExpand(noteId: string): void;
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
  const parentRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => new Set(selection.selectedIds), [selection.selectedIds]);
  const virtualizer = useVirtualizer({
    count: notes.length,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => notes[index]?.id ?? index,
    getScrollElement: () => parentRef.current,
    initialRect: { width: 480, height: 600 },
    overscan: 10,
  });

  useEffect(() => {
    const index = selection.activeId
      ? notes.findIndex((note) => note.id === selection.activeId)
      : -1;
    if (index < 0) return;
    virtualizer.scrollToIndex(index, { align: 'auto' });
  }, [notes, selection.activeId, virtualizer]);

  return (
    <div className="note-list" ref={parentRef}>
      <ul
        aria-label={m.note_list_label()}
        className="note-list-inner"
        onKeyDown={(event) => onSelection({ type: 'keyboard', event })}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const note = notes[virtualRow.index];
          if (!note) return null;
          return (
            <li
              className="note-virtual-row"
              data-index={virtualRow.index}
              key={note.id}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
              tabIndex={-1}
            >
              <NoteRow
                active={selection.activeId === note.id}
                allTags={allTags}
                expanded={expandedId === note.id}
                note={note}
                onActivate={(id, event) =>
                  onSelection({
                    type: 'click',
                    id,
                    toggle: 'metaKey' in event && (event.metaKey || event.ctrlKey),
                    extend: 'shiftKey' in event && event.shiftKey,
                  })
                }
                onAddAttachments={onAddAttachments}
                onCloseEditor={onCloseEditor}
                onCopy={onCopy}
                onDirtyChange={onDirtyChange}
                onExpand={onExpand}
                onRemoveAttachment={onRemoveAttachment}
                onRetryCleanup={onRetryCleanup}
                onSave={onSave}
                onSetTags={onSetTags}
                onTagFilter={onTagFilter}
                onToggleSelection={(id) => onSelection({ type: 'toggle', id })}
                onToggleStatus={onToggleStatus}
                selected={selected.has(note.id)}
                selectionMode={selectionMode}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
