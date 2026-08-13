import {
  IconCheck,
  IconCircle,
  IconCopy,
  IconDots,
  IconSearch,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { useComposerFocus } from '@/app/composer-focus-context';
import { useMessages } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import type { NoteDto, NoteStatus, WorkspaceSnapshot } from '@/bindings/workspace';
import { ShelfActions } from '@/components/shelf-chrome';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { CaptureInput, type CaptureInputHandle } from '@/features/notes/capture-input';
import { NoteList } from '@/features/notes/note-list';
import { filterNotes } from '@/features/notes/search';
import { emptySelection, selectionReducer } from '@/features/notes/selection-model';
import {
  asClipboardError,
  type ClipboardClient,
  tauriClipboardClient,
} from '@/lib/ipc/clipboard-client';

type AttachmentPicker = () => Promise<string[]>;

const nativeAttachmentPicker: AttachmentPicker = async () => {
  const selected = await open({ directory: false, multiple: true });
  if (!selected) return [];
  return Array.isArray(selected) ? selected : [selected];
};

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function NoteScreen({
  snapshot,
  clipboardClient = tauriClipboardClient,
  pickAttachments = nativeAttachmentPicker,
}: {
  snapshot: WorkspaceSnapshot;
  clipboardClient?: ClipboardClient;
  pickAttachments?: AttachmentPicker;
}) {
  const m = useMessages();
  const composerFocus = useComposerFocus();
  const { executeWorkspaceCommand, refreshWorkspace, setWorkspaceSwitchBlocked } = useWorkspace();
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState<string | null>(null);
  const [selection, dispatchSelection] = useReducer(selectionReducer, emptySelection);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTargetIds, setDeleteTargetIds] = useState<string[]>([]);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<'cleanup' | 'other' | null>(null);
  const [bulkCopyState, setBulkCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const searchRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<CaptureInputHandle>(null);
  const shouldFocusActive = useRef(false);
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const notes = useMemo(
    () => filterNotes(snapshot.notes, { query, tag }),
    [query, snapshot.notes, tag],
  );
  const visibleIds = useMemo(() => notes.map((note) => note.id), [notes]);
  const allTags = useMemo(() => {
    const values = new Map<string, string>();
    for (const note of snapshot.notes) {
      for (const value of note.tags) {
        const key = value.toLocaleLowerCase();
        if (!values.has(key)) values.set(key, value);
      }
    }
    return [...values.values()];
  }, [snapshot.notes]);
  const selectedNotes = useMemo(() => {
    const selected = new Set(selection.selectedIds);
    return snapshot.notes.filter((note) => selected.has(note.id));
  }, [selection.selectedIds, snapshot.notes]);
  const bulkTargetStatus: NoteStatus =
    selectedNotes.length && selectedNotes.every((note) => note.status === 'done') ? 'open' : 'done';

  useEffect(() => {
    dispatchSelection({ type: 'reconcile', visibleIds });
  }, [visibleIds]);

  useEffect(() => {
    if (!shouldFocusActive.current || !selection.activeId) return;
    shouldFocusActive.current = false;
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-note-focus="${selection.activeId}"]`)
        ?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selection.activeId]);

  useEffect(() => {
    if (!composerFocus.request) return;
    captureRef.current?.focus();
    composerFocus.consume(composerFocus.request.requestId);
  }, [composerFocus]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'f') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const copyNotes = useCallback(
    async (noteIds: readonly string[]) => {
      try {
        await clipboardClient.composeAndWrite({
          expectedRevision: snapshot.revision,
          noteIds: [...noteIds],
        });
        setBulkCopyState('copied');
      } catch (error) {
        setBulkCopyState('error');
        throw asClipboardError(error);
      }
    },
    [clipboardClient, snapshot.revision],
  );

  const expandNote = useCallback((noteId: string) => {
    dispatchSelection({ type: 'clear' });
    setExpandedId(noteId);
  }, []);

  const focusAttachments = useCallback(
    async (noteId: string) => {
      expandNote(noteId);
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>(`[data-attachment-heading="${noteId}"]`)
              ?.focus({ preventScroll: true });
            resolve();
          });
        });
      });
    },
    [expandNote],
  );

  const importAttachments = useCallback(
    async (noteId: string) => {
      const sourcePaths = await pickAttachments();
      if (!sourcePaths.length) return;
      await executeWorkspaceCommand({ type: 'importNoteAttachments', noteId, sourcePaths });
    },
    [executeWorkspaceCommand, pickAttachments],
  );

  const leaveSelection = useCallback(() => {
    dispatchSelection({ type: 'clear' });
    setDeleteError(null);
  }, []);

  const requestDelete = useCallback((noteIds: readonly string[]) => {
    if (!noteIds.length) return;
    setDeleteError(null);
    setDeleteTargetIds([...noteIds]);
  }, []);

  const deleteNotes = useCallback(async () => {
    if (!deleteTargetIds.length || deletePending) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await executeWorkspaceCommand({ type: 'deleteNotes', noteIds: deleteTargetIds });
      setDeleteTargetIds([]);
      leaveSelection();
      window.requestAnimationFrame(() => {
        const next = document.querySelector<HTMLElement>('[data-note-focus]');
        if (next) next.focus();
        else captureRef.current?.focus();
      });
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      setDeleteError(code === 'deletion_cleanup_required' ? 'cleanup' : 'other');
    } finally {
      setDeletePending(false);
    }
  }, [deletePending, deleteTargetIds, executeWorkspaceCommand, leaveSelection]);

  const retryDeletionCleanup = useCallback(async () => {
    if (deletePending) return;
    setDeletePending(true);
    try {
      await refreshWorkspace();
      setDeleteTargetIds([]);
      leaveSelection();
    } catch {
      setDeleteError('cleanup');
    } finally {
      setDeletePending(false);
    }
  }, [deletePending, leaveSelection, refreshWorkspace]);

  const handleListSelection = useCallback(
    (
      action:
        | { type: 'click'; id: string; toggle: boolean; extend: boolean }
        | { type: 'toggle'; id: string }
        | { type: 'keyboard'; event: React.KeyboardEvent },
    ) => {
      if (action.type === 'click') {
        dispatchSelection({
          type: 'click',
          id: action.id,
          visibleIds,
          toggle: action.toggle,
          extend: action.extend,
        });
        return;
      }
      if (action.type === 'toggle') {
        dispatchSelection({ type: 'activate', id: action.id });
        dispatchSelection({ type: 'toggleActive', visibleIds });
        return;
      }
      const event = action.event;
      const currentSelection = selectionRef.current;
      if (isEditableTarget(event.target)) return;
      if (event.key === 'Escape') {
        if (!currentSelection.selectedIds.length) return;
        event.preventDefault();
        leaveSelection();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'a') {
        event.preventDefault();
        dispatchSelection({ type: 'selectAllVisible', visibleIds });
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        shouldFocusActive.current = true;
        dispatchSelection({
          type: 'move',
          direction: event.key === 'ArrowDown' ? 1 : -1,
          visibleIds,
          extend: event.shiftKey,
        });
      } else if (event.key === ' ') {
        event.preventDefault();
        dispatchSelection({ type: 'toggleActive', visibleIds });
      } else if (event.key === 'Enter' && currentSelection.activeId) {
        event.preventDefault();
        expandNote(currentSelection.activeId);
      } else if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        currentSelection.selectedIds.length
      ) {
        event.preventDefault();
        requestDelete(currentSelection.selectedIds);
      }
    },
    [expandNote, leaveSelection, requestDelete, visibleIds],
  );

  const closeEditor = useCallback((noteId: string) => {
    setExpandedId((current) => (current === noteId ? null : current));
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(`[data-note-focus="${noteId}"]`)?.focus();
    });
  }, []);
  const removeAttachment = useCallback(
    (noteId: string, attachment: NoteDto['attachments'][number]) =>
      executeWorkspaceCommand({
        type: 'deleteNoteAttachments',
        noteId,
        attachmentIds: [attachment.id],
      }).then(() => undefined),
    [executeWorkspaceCommand],
  );
  const retryCleanup = useCallback(
    () => refreshWorkspace().then(() => undefined),
    [refreshWorkspace],
  );
  const saveNote = useCallback(
    (noteId: string, body: string) =>
      executeWorkspaceCommand({ type: 'updateNote', noteId, body }).then(() => undefined),
    [executeWorkspaceCommand],
  );
  const setNoteTags = useCallback(
    (noteId: string, tags: string[]) =>
      executeWorkspaceCommand({ type: 'setNoteTags', noteId, tags }).then(() => undefined),
    [executeWorkspaceCommand],
  );
  const filterByTag = useCallback((value: string) => setTag(value), []);
  const toggleNoteStatus = useCallback(
    (note: NoteDto) =>
      executeWorkspaceCommand({
        type: 'setNoteStatus',
        noteIds: [note.id],
        status: note.status === 'open' ? 'done' : 'open',
      }).then(() => undefined),
    [executeWorkspaceCommand],
  );

  const clearSearch = () => {
    setQuery('');
    setTag(null);
    searchRef.current?.focus();
  };

  const emptyTitle = query || tag ? m.note_empty_search_title() : m.note_empty_all_title();
  const emptyDescription =
    query || tag ? m.note_empty_search_description_flat() : m.note_empty_all_description();
  const selectedCount =
    selection.selectedIds.length === 1
      ? m.selection_count_one()
      : m.selection_count_many({ count: selection.selectedIds.length });
  const bulkStatusLabel = bulkTargetStatus === 'done' ? m.note_mark_done() : m.note_mark_open();

  return (
    <section className="note-screen">
      <div className="note-workbar">
        <div className="note-search">
          <IconSearch aria-hidden="true" />
          <Input
            aria-label={m.note_search_label()}
            autoComplete="off"
            name="noteSearch"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={m.note_search_placeholder_flat()}
            ref={searchRef}
            value={query}
          />
          {query || tag ? (
            <Button
              aria-label={m.note_search_clear()}
              onClick={clearSearch}
              size="icon-sm"
              variant="ghost"
            >
              <IconX aria-hidden="true" />
            </Button>
          ) : null}
          <ShelfActions />
        </div>
        {selection.selectedIds.length ? (
          <fieldset aria-label={selectedCount} className="selection-context">
            <strong aria-live="polite" className="selection-count">
              <span className="selection-count-long">{selectedCount}</span>
              <span aria-hidden="true" className="selection-count-short">
                {selection.selectedIds.length}
              </span>
            </strong>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={m.selection_actions()}
                render={<Button size="icon-sm" variant="ghost" />}
              >
                <IconDots aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() =>
                      void executeWorkspaceCommand({
                        type: 'setNoteStatus',
                        noteIds: selection.selectedIds,
                        status: bulkTargetStatus,
                      })
                    }
                  >
                    {bulkTargetStatus === 'done' ? (
                      <IconCheck aria-hidden="true" />
                    ) : (
                      <IconCircle aria-hidden="true" />
                    )}
                    {bulkStatusLabel}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    aria-description={m.copy_local_paths_disclosure()}
                    onClick={() => void copyNotes(selection.selectedIds).catch(() => undefined)}
                  >
                    <IconCopy aria-hidden="true" />
                    {m.copy_as_markdown()}
                  </DropdownMenuItem>
                  <DropdownMenuLabel className="copy-disclosure">
                    {m.copy_local_paths_disclosure()}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger
                aria-label={m.delete_selected({ count: selection.selectedIds.length })}
                onClick={() => requestDelete(selection.selectedIds)}
                render={<Button size="icon-sm" variant="destructive" />}
              >
                <IconTrash aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>
                {m.delete_selected({ count: selection.selectedIds.length })}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                aria-label={m.selection_clear()}
                onClick={leaveSelection}
                render={<Button size="icon-sm" variant="ghost" />}
              >
                <IconX aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>{m.selection_clear()}</TooltipContent>
            </Tooltip>
          </fieldset>
        ) : null}
      </div>
      <div className="note-context">
        {tag ? (
          <div className="active-tag-filter">
            <Badge>{tag}</Badge>
            <Button
              aria-label={m.tag_filter_clear({ tag })}
              onClick={() => setTag(null)}
              size="icon-sm"
              variant="ghost"
            >
              <IconX aria-hidden="true" />
            </Button>
          </div>
        ) : null}
        {bulkCopyState === 'error' ? (
          <p className="inline-error" role="alert">
            {m.clipboard_error_write_failed()}
          </p>
        ) : null}
        {bulkCopyState === 'copied' ? (
          <p className="inline-success" role="status">
            {m.copy_inline_copied()}
          </p>
        ) : null}
      </div>
      {notes.length ? (
        <NoteList
          allTags={allTags}
          expandedId={expandedId}
          notes={notes}
          onAddAttachments={importAttachments}
          onCloseEditor={closeEditor}
          onDelete={(noteId) => requestDelete([noteId])}
          onDirtyChange={setWorkspaceSwitchBlocked}
          onExpand={expandNote}
          onFocusAttachments={focusAttachments}
          onRemoveAttachment={removeAttachment}
          onRetryCleanup={retryCleanup}
          onSave={saveNote}
          onSelection={handleListSelection}
          onSetTags={setNoteTags}
          onTagFilter={filterByTag}
          onToggleStatus={toggleNoteStatus}
          selection={selection}
        />
      ) : (
        <Empty className="note-empty">
          <EmptyHeader>
            <EmptyMedia>
              <IconSearch aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {query || tag ? (
              <Button onClick={clearSearch} variant="outline">
                {m.note_search_clear()}
              </Button>
            ) : (
              <Button onClick={() => captureRef.current?.focus()} variant="outline">
                {m.capture_focus()}
              </Button>
            )}
          </EmptyContent>
        </Empty>
      )}
      <div className="composer-dock">
        <CaptureInput
          onCreate={async (body) => {
            await executeWorkspaceCommand({ type: 'createNote', body });
          }}
          ref={captureRef}
        />
      </div>

      <AlertDialog
        open={Boolean(deleteTargetIds.length)}
        onOpenChange={(open) => {
          if (!open && !deletePending) setDeleteTargetIds([]);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTargetIds.length === 1
                ? m.delete_title_one()
                : m.delete_title({ count: deleteTargetIds.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.delete_description({ count: deleteTargetIds.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <p className="delete-boundary">{m.delete_external_boundary()}</p>
          {deleteError ? (
            <p className="inline-error" role="alert">
              {deleteError === 'cleanup' ? m.delete_cleanup_required() : m.delete_error()}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePending}>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletePending}
              onClick={() =>
                void (deleteError === 'cleanup' ? retryDeletionCleanup() : deleteNotes())
              }
              variant="destructive"
            >
              {deleteError ? m.common_retry() : m.delete_confirm()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
