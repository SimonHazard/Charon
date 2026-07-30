import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef } from 'react';
import { NoteRow } from '@/features/notes/note-row';
import type { NoteViewModel } from '@/features/notes/note-view-model';
import type { SelectionState } from '@/features/notes/selection-model';

const ROW_HEIGHT = 76;

export function NoteList({
  notes,
  selection,
  onSelection,
  onOpen,
}: {
  notes: readonly NoteViewModel[];
  selection: SelectionState;
  onSelection(
    action:
      | { type: 'click'; id: string; toggle: boolean; extend: boolean }
      | { type: 'toggle'; id: string }
      | { type: 'keyboard'; event: React.KeyboardEvent },
  ): void;
  onOpen(noteId: string): void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const selected = new Set(selection.selectedIds);
  const virtualizer = useVirtualizer({
    count: notes.length,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => notes[index]?.id ?? index,
    getScrollElement: () => parentRef.current,
    initialRect: { width: 900, height: 600 },
    overscan: 8,
  });

  useEffect(() => {
    const index = selection.activeId
      ? notes.findIndex((note) => note.id === selection.activeId)
      : -1;
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'auto' });
      const activeElement = Array.from(
        parentRef.current?.querySelectorAll<HTMLElement>('[data-note-focus]') ?? [],
      ).find((element) => element.dataset.noteFocus === selection.activeId);
      activeElement?.focus({ preventScroll: true });
    }
  }, [notes, selection.activeId, virtualizer]);

  return (
    <div
      aria-multiselectable="true"
      className="note-list"
      onKeyDown={(event) => onSelection({ type: 'keyboard', event })}
      ref={parentRef}
      role="listbox"
    >
      <div className="note-list-inner" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const note = notes[virtualRow.index];
          if (!note) return null;
          return (
            <div
              className="note-virtual-row"
              data-index={virtualRow.index}
              key={note.id}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              <NoteRow
                active={selection.activeId === note.id}
                note={note}
                onActivate={(event, id) =>
                  onSelection({
                    type: 'click',
                    id,
                    toggle: event.metaKey || event.ctrlKey,
                    extend: event.shiftKey,
                  })
                }
                onOpen={onOpen}
                onToggle={(id) => onSelection({ type: 'toggle', id })}
                selected={selected.has(note.id)}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
