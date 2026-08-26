// biome-ignore-all lint/a11y/noRedundantRoles: WebKit drops list semantics when CSS removes markers.
import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { useMessages } from '@/app/providers';
import type { AttachmentDto, NoteDto } from '@/bindings/workspace';
import { NoteRow } from '@/features/notes/note-row';

const ROW_HEIGHT = 84;

export function NoteList({
  notes,
  expandedId,
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
  notes: readonly NoteDto[];
  expandedId: string | null;
  allTags: readonly string[];
  copyState: { noteId: string; status: 'copied' | 'error'; message: string } | null;
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
  const parentRef = useRef<HTMLDivElement>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const virtualizer = useVirtualizer({
    count: notes.length,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => notes[index]?.id ?? index,
    getScrollElement: () => parentRef.current,
    initialRect: { width: 480, height: 600 },
    overscan: 10,
  });

  useLayoutEffect(() => {
    if (!pendingFocusId) return;
    const next = document.querySelector<HTMLElement>(`[data-note-focus="${pendingFocusId}"]`);
    if (!next) return;
    next.focus({ preventScroll: true });
    setPendingFocusId(null);
  });

  const moveFocus = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const activeRow = target?.closest<HTMLElement>('[data-index]');
      const currentIndex = Number(activeRow?.dataset.index);
      if (!Number.isInteger(currentIndex)) return;
      event.preventDefault();
      const nextIndex = Math.max(
        0,
        Math.min(notes.length - 1, currentIndex + (event.key === 'ArrowDown' ? 1 : -1)),
      );
      const nextId = notes[nextIndex]?.id;
      if (!nextId) return;
      setPendingFocusId(nextId);
      virtualizer.scrollToIndex(nextIndex, { align: 'auto' });
      const mounted = document.querySelector<HTMLElement>(`[data-note-focus="${nextId}"]`);
      if (mounted) {
        mounted.focus({ preventScroll: true });
        setPendingFocusId(null);
      }
    },
    [notes, virtualizer],
  );

  return (
    <div className="note-list" ref={parentRef}>
      <ul
        aria-label={m.note_list_label()}
        className="note-list-inner"
        onKeyDown={moveFocus}
        role="list"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const note = notes[virtualRow.index];
          if (!note) return null;
          return (
            <li
              aria-posinset={virtualRow.index + 1}
              aria-setsize={notes.length}
              className="note-virtual-row"
              data-index={virtualRow.index}
              key={note.id}
              ref={virtualizer.measureElement}
              role="listitem"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
              tabIndex={-1}
            >
              <NoteRow
                allTags={allTags}
                copyState={
                  copyState?.noteId === note.id
                    ? { status: copyState.status, message: copyState.message }
                    : null
                }
                expanded={expandedId === note.id}
                note={note}
                onAddAttachments={onAddAttachments}
                onCloseEditor={onCloseEditor}
                onCopy={onCopy}
                onDelete={onDelete}
                onDirtyChange={onDirtyChange}
                onExpand={onExpand}
                onFocusAttachments={onFocusAttachments}
                onRemoveAttachment={onRemoveAttachment}
                onRetryCleanup={onRetryCleanup}
                onSave={onSave}
                onSetTags={onSetTags}
                onTagFilter={onTagFilter}
                onToggleStatus={onToggleStatus}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
