// biome-ignore-all lint/a11y/noRedundantRoles: WebKit drops list semantics when CSS removes markers.
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useMessages } from '@/app/providers';
import type { AttachmentDto, NoteDto, NoteStatus } from '@/bindings/workspace';
import { NoteRow } from '@/features/notes/note-row';

const ROW_HEIGHT = 84;
// The `.note-list` scroll-edge fade depths in px (0.75rem, 1rem; ADR 0022). Keyboard navigation
// and `scrollToIndex` keep this much clearance, so a focused row never parks under a fade.
const FADE_START = 12;
const FADE_END = 16;
/** Rows that PageUp and PageDown move focus by. */
const PAGE_ROWS = 10;
const rowSteps: Readonly<Record<string, number>> = {
  ArrowDown: 1,
  ArrowUp: -1,
  PageDown: PAGE_ROWS,
  PageUp: -PAGE_ROWS,
};

/** One request to scroll a Note into view; a new object asks again. */
export type NoteRevealRequest = { noteId: string };

export function NoteList({
  notes,
  expandedId,
  acknowledgedId = null,
  revealRequest = null,
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
  notes: readonly NoteDto[];
  expandedId: string | null;
  acknowledgedId?: string | null;
  revealRequest?: NoteRevealRequest | null;
  allTags: readonly string[];
  copyState: { noteId: string; status: 'copied' | 'error'; message: string } | null;
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
  const parentRef = useRef<HTMLDivElement>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const expandedIndex = notes.findIndex((note) => note.id === expandedId);
  const virtualizer = useVirtualizer({
    count: notes.length,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: (index) => notes[index]?.id ?? index,
    getScrollElement: () => parentRef.current,
    initialRect: { width: 480, height: 600 },
    overscan: 10,
    scrollPaddingEnd: FADE_END,
    scrollPaddingStart: FADE_START,
    rangeExtractor: (range) => {
      const visible = defaultRangeExtractor(range);
      // An editor owns a live draft, including failed saves. Scrolling must not discard it.
      return expandedIndex < 0 || visible.includes(expandedIndex)
        ? visible
        : [...visible, expandedIndex].sort((a, b) => a - b);
    },
  });

  // The editor opens in place; when it would open below the fold, bring its row to the top so
  // the focused field is visible. The textarea focuses with `preventScroll`, so this is the
  // only scroll, and it waits one frame for the expanded row's layout.
  const expandedIndexRef = useRef(expandedIndex);
  useLayoutEffect(() => {
    expandedIndexRef.current = expandedIndex;
  });
  useLayoutEffect(() => {
    if (!expandedId) return;
    const frame = window.requestAnimationFrame(() => {
      const index = expandedIndexRef.current;
      const scroller = parentRef.current;
      const row = scroller?.querySelector<HTMLElement>(`[data-index="${index}"]`);
      if (index < 0 || !scroller || !row) return;
      if (row.getBoundingClientRect().bottom > scroller.getBoundingClientRect().bottom) {
        virtualizer.scrollToIndex(index, { align: 'start' });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [expandedId, virtualizer]);

  const handledRevealRef = useRef<NoteRevealRequest | null>(null);
  useEffect(() => {
    if (!revealRequest || handledRevealRef.current === revealRequest) return;
    const index = notes.findIndex((note) => note.id === revealRequest.noteId);
    if (index < 0) return;
    handledRevealRef.current = revealRequest;
    virtualizer.scrollToIndex(index, { align: 'start' });
  }, [notes, revealRequest, virtualizer]);

  useLayoutEffect(() => {
    if (!pendingFocusId) return;
    const next = document.querySelector<HTMLElement>(`[data-note-focus="${pendingFocusId}"]`);
    if (!next) return;
    next.focus({ preventScroll: true });
    setPendingFocusId(null);
  });

  const moveFocus = useCallback(
    (event: React.KeyboardEvent) => {
      const step = rowSteps[event.key];
      if (step === undefined && event.key !== 'Home' && event.key !== 'End') return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (
        event.defaultPrevented ||
        event.nativeEvent.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !target?.matches('[data-note-focus]')
      )
        return;
      const activeRow = target?.closest<HTMLElement>('[data-index]');
      const currentIndex = Number(activeRow?.dataset.index);
      if (!Number.isInteger(currentIndex)) return;
      event.preventDefault();
      const lastIndex = notes.length - 1;
      const nextIndex =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? lastIndex
            : Math.max(0, Math.min(lastIndex, currentIndex + (step ?? 0)));
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

  // Which edges clip content, read at render: the virtualizer re-renders on scroll start/stop,
  // range changes and item resizes, so no scroll listener or per-frame state is needed. The fade
  // may lag the very top or bottom by the virtualizer's scroll-reset delay (ADR 0022).
  const scrollOffset = virtualizer.scrollOffset ?? 0;
  const viewportHeight = virtualizer.scrollRect?.height ?? 0;
  const clippedStart = scrollOffset > 1;
  const clippedEnd =
    viewportHeight > 0 && scrollOffset + viewportHeight < virtualizer.getTotalSize() - 1;

  return (
    <div
      className="note-list"
      data-clipped-end={clippedEnd}
      data-clipped-start={clippedStart}
      ref={parentRef}
    >
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
                acknowledged={acknowledgedId === note.id}
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
                registerDraftGuard={registerDraftGuard}
                onExpand={onExpand}
                onFocusAttachments={onFocusAttachments}
                onRemoveAttachment={onRemoveAttachment}
                onRetryCleanup={onRetryCleanup}
                onSave={onSave}
                onSetTags={onSetTags}
                onTagFilter={onTagFilter}
                onSetStatus={onSetStatus}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
