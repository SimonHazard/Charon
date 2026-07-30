import { IconFilePlus, IconSearchOff, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useCommandRegistration } from '@/app/commands/command-provider';
import type { AppCommand } from '@/app/commands/command-registry';
import { useMessages } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import type { WorkspaceCommandResult, WorkspaceSnapshot } from '@/bindings/workspace';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { MergeDialog } from '@/features/notes/merge-dialog';
import {
  createNoteCommand,
  moveNotesCommand,
  nextNoteSortKey,
  reorderNoteCommand,
  setStatusCommand,
  updateNoteCommand,
} from '@/features/notes/note-commands';
import { NoteEditor } from '@/features/notes/note-editor';
import { NoteList } from '@/features/notes/note-list';
import { NoteToolbar } from '@/features/notes/note-toolbar';
import { compareNotes, orderedSections } from '@/features/notes/note-view-model';
import { createSearchIndex, filterNotes } from '@/features/notes/search';
import { SectionManager } from '@/features/notes/section-manager';
import { SelectionBar } from '@/features/notes/selection-bar';
import { emptySelection, selectionReducer } from '@/features/notes/selection-model';
import { BulkTrashDialog, TrashView } from '@/features/notes/trash-view';
import { showUndoToast } from '@/features/notes/undo-toast';

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}

export function NoteScreen({
  snapshot,
  sectionId = null,
}: {
  snapshot: WorkspaceSnapshot;
  sectionId?: string | null;
}) {
  const m = useMessages();
  const { executeWorkspaceCommand } = useWorkspace();
  const [query, setQuery] = useState('');
  const deferredQuery = useDebouncedValue(query, 120);
  const [status, setStatus] = useState<'all' | 'open' | 'done'>('all');
  const [trash, setTrash] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(sectionId);
  const [selection, dispatchSelection] = useReducer(selectionReducer, emptySelection);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [sectionManagerOpen, setSectionManagerOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [mergeOpen, setMergeOpen] = useState(false);
  const [trashConfirmOpen, setTrashConfirmOpen] = useState(false);
  const [saveRequest, setSaveRequest] = useState(0);
  const [lastUndoToken, setLastUndoToken] = useState<string | null>(null);
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const indexedNotes = useMemo(() => createSearchIndex(snapshot).sort(compareNotes), [snapshot]);
  const notes = useMemo(
    () =>
      filterNotes(indexedNotes, {
        query: deferredQuery,
        sectionId: activeSectionId,
        status,
        trash,
      }),
    [activeSectionId, deferredQuery, indexedNotes, status, trash],
  );
  const visibleIds = useMemo(() => notes.map((note) => note.id), [notes]);
  const activeNote = snapshot.notes.find((note) => note.id === selection.activeId) ?? null;
  const editorNote = snapshot.notes.find((note) => note.id === editorId) ?? null;
  const actionIds = useMemo(
    () =>
      selection.selectedIds.length
        ? selection.selectedIds
        : selection.activeId
          ? [selection.activeId]
          : [],
    [selection.activeId, selection.selectedIds],
  );
  const selectedNotes = useMemo(
    () => actionIds.flatMap((id) => snapshot.notes.find((note) => note.id === id) ?? []),
    [actionIds, snapshot.notes],
  );
  const sections = useMemo(() => orderedSections(snapshot), [snapshot]);
  const trashContext = useMemo(() => {
    const names = Array.from(
      new Set(
        selectedNotes.map(
          (note) => snapshot.sections.find((section) => section.id === note.sectionId)?.name ?? '',
        ),
      ),
    ).filter(Boolean);
    return names.join(', ') || m.trash_context_current();
  }, [m, selectedNotes, snapshot.sections]);

  useEffect(() => setActiveSectionId(sectionId), [sectionId]);

  useEffect(() => {
    dispatchSelection({ type: 'reconcile', visibleIds });
  }, [visibleIds]);

  useEffect(() => {
    if (mergeOpen || !pendingFocusId) return;
    const frame = window.requestAnimationFrame(() => {
      const target = Array.from(document.querySelectorAll<HTMLElement>('[data-note-focus]')).find(
        (element) => element.dataset.noteFocus === pendingFocusId,
      );
      target?.focus({ preventScroll: true });
      setPendingFocusId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [mergeOpen, pendingFocusId]);

  const presentUndo = useCallback(
    (result: WorkspaceCommandResult, title: string, description: string) => {
      if (!result.undoToken) return;
      const token = result.undoToken;
      setLastUndoToken(token);
      showUndoToast({
        title,
        description,
        undoLabel: m.undo_action(),
        onUndo: async () => {
          await executeWorkspaceCommand({ type: 'undo', transactionId: token });
          setLastUndoToken((current) => (current === token ? null : current));
          dispatchSelection({ type: 'clear' });
        },
      });
    },
    [executeWorkspaceCommand, m],
  );

  const createNote = useCallback(async () => {
    const section =
      snapshot.sections.find((candidate) => candidate.id === activeSectionId) ??
      snapshot.sections[0];
    if (!section) return;
    const existing = new Set(snapshot.notes.map((note) => note.id));
    const result = await executeWorkspaceCommand(createNoteCommand(snapshot.notes, section.id, ''));
    const created = result.snapshot.notes.find((note) => !existing.has(note.id));
    if (created) {
      setQuery('');
      setStatus('all');
      setTrash(false);
      setActiveSectionId(created.sectionId);
      dispatchSelection({
        type: 'click',
        id: created.id,
        visibleIds: [created.id],
        toggle: false,
        extend: false,
      });
      setEditorId(created.id);
    }
  }, [activeSectionId, executeWorkspaceCommand, snapshot]);

  const setSelectedStatus = useCallback(
    async (nextStatus: 'open' | 'done') => {
      if (actionIds.length === 0) return;
      const result = await executeWorkspaceCommand(setStatusCommand(actionIds, nextStatus));
      presentUndo(result, m.undo_status_title(), m.undo_status_description());
    },
    [actionIds, executeWorkspaceCommand, m, presentUndo],
  );

  const toggleDone = useCallback(async () => {
    const allDone = actionIds.every(
      (id) => snapshot.notes.find((note) => note.id === id)?.status === 'done',
    );
    await setSelectedStatus(allDone ? 'open' : 'done');
  }, [actionIds, setSelectedStatus, snapshot.notes]);

  const trashNotes = useCallback(async () => {
    if (actionIds.length === 0) return;
    const result = await executeWorkspaceCommand(
      actionIds.length === 1
        ? { type: 'trashNote', noteId: actionIds[0] as string }
        : { type: 'batchTrash', noteIds: actionIds },
    );
    presentUndo(result, m.undo_trash_title(), m.undo_trash_description());
    dispatchSelection({ type: 'clear' });
  }, [actionIds, executeWorkspaceCommand, m, presentUndo]);

  const moveSelected = useCallback(
    async (destinationSectionId: string) => {
      if (actionIds.length === 0) return;
      const result = await executeWorkspaceCommand(
        moveNotesCommand(actionIds, destinationSectionId, snapshot.notes),
      );
      presentUndo(result, m.undo_move_title(), m.undo_move_description());
      setActiveSectionId(destinationSectionId);
    },
    [actionIds, executeWorkspaceCommand, m, presentUndo, snapshot.notes],
  );

  const restoreSelected = useCallback(async () => {
    if (actionIds.length === 0) return;
    const result = await executeWorkspaceCommand(
      actionIds.length === 1
        ? { type: 'restoreNote', noteId: actionIds[0] as string }
        : { type: 'batchRestore', noteIds: actionIds },
    );
    presentUndo(result, m.undo_restore_title(), m.undo_restore_description());
    dispatchSelection({ type: 'clear' });
  }, [actionIds, executeWorkspaceCommand, m, presentUndo]);

  const permanentlyDeleteSelected = useCallback(async () => {
    if (actionIds.length !== 1) return;
    await executeWorkspaceCommand({
      type: 'permanentlyDeleteNote',
      noteId: actionIds[0] as string,
    });
    dispatchSelection({ type: 'clear' });
  }, [actionIds, executeWorkspaceCommand]);

  const confirmMerge = useCallback(
    async (noteIds: string[], destinationSectionId: string) => {
      const existing = new Set(snapshot.notes.map((note) => note.id));
      const result = await executeWorkspaceCommand({
        type: 'mergeNotes',
        noteIds,
        destinationSectionId,
        sortKey: nextNoteSortKey(snapshot.notes, destinationSectionId),
      });
      const composite = result.snapshot.notes.find((note) => !existing.has(note.id));
      setQuery('');
      setStatus('all');
      setTrash(false);
      setActiveSectionId(destinationSectionId);
      if (composite) {
        setPendingFocusId(composite.id);
        dispatchSelection({
          type: 'click',
          id: composite.id,
          visibleIds: [composite.id],
          toggle: false,
          extend: false,
        });
      }
      presentUndo(result, m.undo_merge_title(), m.undo_merge_description());
    },
    [executeWorkspaceCommand, m, presentUndo, snapshot.notes],
  );

  const performLastUndo = useCallback(async () => {
    if (!lastUndoToken) return;
    const token = lastUndoToken;
    setLastUndoToken(null);
    await executeWorkspaceCommand({ type: 'undo', transactionId: token });
    dispatchSelection({ type: 'clear' });
  }, [executeWorkspaceCommand, lastUndoToken]);

  const reorderActive = useCallback(
    async (direction: -1 | 1) => {
      if (!activeNote) return;
      const inSection = snapshot.notes
        .filter((note) => note.sectionId === activeNote.sectionId && !note.trashedAt)
        .sort((a, b) => a.sortKey - b.sortKey || a.id.localeCompare(b.id));
      const command = reorderNoteCommand(inSection, activeNote.id, direction);
      if (command) await executeWorkspaceCommand(command);
    },
    [activeNote, executeWorkspaceCommand, snapshot.notes],
  );

  const commands = useMemo<AppCommand[]>(
    () => [
      {
        id: 'notes.save',
        labelKey: 'command_notes_save',
        descriptionKey: 'command_notes_save_description',
        category: 'notes',
        defaultShortcut: 'Mod+S',
        allowInEditable: true,
        isAvailable: () => Boolean(editorId),
        execute: () => setSaveRequest((current) => current + 1),
      },
      {
        id: 'notes.search-focus',
        labelKey: 'command_notes_search',
        descriptionKey: 'command_notes_search_description',
        category: 'notes',
        defaultShortcut: 'Mod+F',
        isAvailable: () => true,
        execute: () => searchRef.current?.focus(),
      },
      {
        id: 'notes.new',
        labelKey: 'command_notes_new',
        descriptionKey: 'command_notes_new_description',
        category: 'notes',
        defaultShortcut: 'Mod+N',
        isAvailable: () => snapshot.sections.length > 0 && !trash,
        execute: createNote,
      },
      {
        id: 'notes.edit',
        labelKey: 'command_notes_edit',
        descriptionKey: 'command_notes_edit_description',
        category: 'notes',
        defaultShortcut: 'Enter',
        isAvailable: () => Boolean(selection.activeId),
        execute: () => setEditorId(selection.activeId),
      },
      {
        id: 'notes.toggle-status',
        labelKey: 'command_notes_toggle_status',
        descriptionKey: 'command_notes_toggle_status_description',
        category: 'notes',
        defaultShortcut: 'Mod+Enter',
        isAvailable: () => actionIds.length > 0 && !trash,
        execute: toggleDone,
      },
      {
        id: 'selection.select-all',
        labelKey: 'command_selection_all',
        descriptionKey: 'command_selection_all_description',
        category: 'selection',
        defaultShortcut: 'Mod+A',
        isAvailable: () => visibleIds.length > 0,
        execute: () => dispatchSelection({ type: 'selectAllVisible', visibleIds }),
      },
      {
        id: 'selection.extend-up',
        labelKey: 'command_selection_extend_up',
        descriptionKey: 'command_selection_extend_up_description',
        category: 'selection',
        defaultShortcut: 'Shift+ArrowUp',
        isAvailable: () => visibleIds.length > 0,
        execute: () => dispatchSelection({ type: 'move', direction: -1, extend: true, visibleIds }),
      },
      {
        id: 'selection.extend-down',
        labelKey: 'command_selection_extend_down',
        descriptionKey: 'command_selection_extend_down_description',
        category: 'selection',
        defaultShortcut: 'Shift+ArrowDown',
        isAvailable: () => visibleIds.length > 0,
        execute: () => dispatchSelection({ type: 'move', direction: 1, extend: true, visibleIds }),
      },
      {
        id: 'notes.reorder-up',
        labelKey: 'command_notes_reorder_up',
        descriptionKey: 'command_notes_reorder_up_description',
        category: 'notes',
        defaultShortcut: 'Alt+ArrowUp',
        isAvailable: () => Boolean(activeNote) && !trash,
        execute: () => reorderActive(-1),
      },
      {
        id: 'notes.reorder-down',
        labelKey: 'command_notes_reorder_down',
        descriptionKey: 'command_notes_reorder_down_description',
        category: 'notes',
        defaultShortcut: 'Alt+ArrowDown',
        isAvailable: () => Boolean(activeNote) && !trash,
        execute: () => reorderActive(1),
      },
      {
        id: 'notes.move',
        labelKey: 'command_notes_move',
        descriptionKey: 'command_notes_move_description',
        category: 'notes',
        isAvailable: () => actionIds.length > 0 && !trash,
        execute: () => {
          if (selection.selectedIds.length === 0 && selection.activeId) {
            dispatchSelection({ type: 'toggleActive', visibleIds });
          }
          setMoveOpen(true);
        },
      },
      {
        id: 'notes.merge',
        labelKey: 'command_notes_merge',
        descriptionKey: 'command_notes_merge_description',
        category: 'notes',
        defaultShortcut: 'Mod+M',
        isAvailable: () => actionIds.length >= 2 && !trash,
        execute: () => setMergeOpen(true),
      },
      {
        id: 'notes.trash',
        labelKey: 'command_notes_trash',
        descriptionKey: 'command_notes_trash_description',
        category: 'notes',
        defaultShortcut: 'Delete',
        destructive: true,
        isAvailable: () => actionIds.length > 0 && !trash,
        execute: () => setTrashConfirmOpen(true),
      },
      {
        id: 'workspace.undo',
        labelKey: 'command_workspace_undo',
        descriptionKey: 'command_workspace_undo_description',
        category: 'workspace',
        defaultShortcut: 'Mod+Z',
        isAvailable: () => Boolean(lastUndoToken),
        execute: performLastUndo,
      },
    ],
    [
      actionIds,
      activeNote,
      createNote,
      editorId,
      lastUndoToken,
      performLastUndo,
      reorderActive,
      selection.activeId,
      selection.selectedIds.length,
      snapshot.sections.length,
      toggleDone,
      trash,
      visibleIds,
    ],
  );
  useCommandRegistration(commands);

  const handleKeyboard = (event: React.KeyboardEvent) => {
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !event.shiftKey) {
      event.preventDefault();
      dispatchSelection({
        type: 'move',
        direction: event.key === 'ArrowDown' ? 1 : -1,
        extend: false,
        visibleIds,
      });
    } else if (event.key === ' ') {
      event.preventDefault();
      dispatchSelection({ type: 'toggleActive', visibleIds });
    } else if (event.key === 'Escape' && selection.selectedIds.length > 0) {
      event.preventDefault();
      dispatchSelection({ type: 'clear' });
    }
  };

  const emptyKind =
    snapshot.notes.length === 0
      ? 'workspace'
      : trash
        ? 'trash'
        : deferredQuery
          ? 'search'
          : 'section';

  return (
    <div className="note-screen">
      <NoteToolbar
        canCreate={snapshot.sections.length > 0}
        onCreate={() => void createNote().catch(() => undefined)}
        onManageSections={() => setSectionManagerOpen(true)}
        onQueryChange={setQuery}
        onStatusChange={setStatus}
        onTrashChange={(next) => {
          setTrash(next);
          dispatchSelection({ type: 'clear' });
        }}
        query={query}
        searchRef={searchRef}
        status={status}
        trash={trash}
      />
      {notes.length > 0 ? (
        <NoteList
          notes={notes}
          onOpen={setEditorId}
          onSelection={(action) => {
            if (action.type === 'keyboard') return handleKeyboard(action.event);
            if (action.type === 'toggle') {
              dispatchSelection({
                type: 'click',
                id: action.id,
                visibleIds,
                toggle: true,
                extend: false,
              });
              return;
            }
            dispatchSelection({ ...action, type: 'click', visibleIds });
          }}
          selection={selection}
        />
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {emptyKind === 'search' ? (
                <IconSearchOff />
              ) : emptyKind === 'trash' ? (
                <IconTrash />
              ) : (
                <IconFilePlus />
              )}
            </EmptyMedia>
            <EmptyTitle>
              {emptyKind === 'workspace'
                ? m.note_empty_workspace_title()
                : emptyKind === 'trash'
                  ? m.note_empty_trash_title()
                  : emptyKind === 'search'
                    ? m.note_empty_search_title()
                    : m.note_empty_section_title()}
            </EmptyTitle>
            <EmptyDescription>
              {emptyKind === 'workspace'
                ? m.note_empty_workspace_description()
                : emptyKind === 'trash'
                  ? m.note_empty_trash_description()
                  : emptyKind === 'search'
                    ? m.note_empty_search_description()
                    : m.note_empty_section_description()}
            </EmptyDescription>
          </EmptyHeader>
          {emptyKind === 'workspace' && snapshot.sections.length > 0 ? (
            <EmptyContent>
              <Button onClick={() => void createNote().catch(() => undefined)}>
                {m.note_new()}
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      )}
      {trash ? (
        <TrashView
          count={selection.selectedIds.length}
          onPermanentlyDelete={permanentlyDeleteSelected}
          onRestore={restoreSelected}
        />
      ) : (
        <SelectionBar
          count={selection.selectedIds.length}
          moveOpen={moveOpen}
          onMerge={() => setMergeOpen(true)}
          onMove={(destination) => void moveSelected(destination).catch(() => undefined)}
          onMoveOpenChange={setMoveOpen}
          onSetDone={() => void setSelectedStatus('done').catch(() => undefined)}
          onSetOpen={() => void setSelectedStatus('open').catch(() => undefined)}
          onTrash={() => setTrashConfirmOpen(true)}
          sections={sections}
        />
      )}
      <NoteEditor
        note={editorNote}
        onOpenChange={(open) => {
          if (!open) setEditorId(null);
        }}
        onSave={async (noteId, body) => {
          await executeWorkspaceCommand(updateNoteCommand(noteId, body));
        }}
        open={Boolean(editorNote)}
        saveRequest={saveRequest}
      />
      <MergeDialog
        notes={selectedNotes}
        onConfirm={confirmMerge}
        onOpenChange={setMergeOpen}
        open={mergeOpen}
        sections={sections}
      />
      <BulkTrashDialog
        context={trashContext}
        count={actionIds.length}
        onConfirm={trashNotes}
        onOpenChange={setTrashConfirmOpen}
        open={trashConfirmOpen}
      />
      <SectionManager
        onCommand={executeWorkspaceCommand}
        onOpenChange={setSectionManagerOpen}
        open={sectionManagerOpen}
        snapshot={snapshot}
      />
    </div>
  );
}
