import { IconFilePlus, IconSearchOff, IconTrash } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useCommandRegistration } from '@/app/commands/command-provider';
import type { AppCommand } from '@/app/commands/command-registry';
import { useMessages } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import type { WorkspaceSnapshot } from '@/bindings/workspace';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import {
  createNoteCommand,
  reorderNoteCommand,
  setStatusCommand,
  updateNoteCommand,
} from '@/features/notes/note-commands';
import { NoteEditor } from '@/features/notes/note-editor';
import { NoteList } from '@/features/notes/note-list';
import { NoteToolbar } from '@/features/notes/note-toolbar';
import { compareNotes } from '@/features/notes/note-view-model';
import { createSearchIndex, filterNotes } from '@/features/notes/search';
import { SectionManager } from '@/features/notes/section-manager';
import { emptySelection, selectionReducer } from '@/features/notes/selection-model';

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
  const [selection, dispatchSelection] = useReducer(selectionReducer, emptySelection);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [sectionManagerOpen, setSectionManagerOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const indexedNotes = useMemo(() => createSearchIndex(snapshot).sort(compareNotes), [snapshot]);
  const notes = useMemo(
    () =>
      filterNotes(indexedNotes, {
        query: deferredQuery,
        sectionId,
        status,
        trash,
      }),
    [deferredQuery, indexedNotes, sectionId, status, trash],
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

  useEffect(() => {
    dispatchSelection({ type: 'reconcile', visibleIds });
  }, [visibleIds]);

  const createNote = useCallback(async () => {
    const section =
      snapshot.sections.find((candidate) => candidate.id === sectionId) ?? snapshot.sections[0];
    if (!section) return;
    const existing = new Set(snapshot.notes.map((note) => note.id));
    const result = await executeWorkspaceCommand(createNoteCommand(snapshot.notes, section.id, ''));
    const created = result.snapshot.notes.find((note) => !existing.has(note.id));
    if (created) {
      dispatchSelection({
        type: 'click',
        id: created.id,
        visibleIds: [created.id],
        toggle: false,
        extend: false,
      });
      setEditorId(created.id);
    }
  }, [executeWorkspaceCommand, sectionId, snapshot]);

  const toggleDone = useCallback(async () => {
    if (actionIds.length === 0) return;
    const allDone = actionIds.every(
      (id) => snapshot.notes.find((note) => note.id === id)?.status === 'done',
    );
    await executeWorkspaceCommand(setStatusCommand(actionIds, allDone ? 'open' : 'done'));
  }, [actionIds, executeWorkspaceCommand, snapshot.notes]);

  const trashNotes = useCallback(async () => {
    if (actionIds.length === 0) return;
    await executeWorkspaceCommand(
      actionIds.length === 1
        ? { type: 'trashNote', noteId: actionIds[0] as string }
        : { type: 'batchTrash', noteIds: actionIds },
    );
    dispatchSelection({ type: 'clear' });
  }, [actionIds, executeWorkspaceCommand]);

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
        id: 'notes.trash',
        labelKey: 'command_notes_trash',
        descriptionKey: 'command_notes_trash_description',
        category: 'notes',
        defaultShortcut: 'Delete',
        destructive: true,
        isAvailable: () => actionIds.length > 0 && !trash,
        execute: trashNotes,
      },
    ],
    [
      actionIds,
      activeNote,
      createNote,
      reorderActive,
      selection.activeId,
      snapshot.sections.length,
      toggleDone,
      trash,
      trashNotes,
      visibleIds,
    ],
  );
  useCommandRegistration(commands);

  const handleKeyboard = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      dispatchSelection({
        type: 'move',
        direction: event.key === 'ArrowDown' ? 1 : -1,
        extend: event.shiftKey,
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
        onCreate={() => void createNote()}
        onManageSections={() => setSectionManagerOpen(true)}
        onQueryChange={setQuery}
        onStatusChange={setStatus}
        onTrashChange={setTrash}
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
              <Button onClick={() => void createNote()}>{m.note_new()}</Button>
            </EmptyContent>
          ) : null}
        </Empty>
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
