import { IconCheck, IconCircle, IconCopy, IconSearch, IconTrash, IconX } from '@tabler/icons-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import { useComposerFocus } from '@/app/composer-focus-context';
import { useMessages } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import type { NoteDto, NoteStatus, WorkspaceSnapshot } from '@/bindings/workspace';
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
  const [status, setStatus] = useState<NoteStatus>('open');
  const [tag, setTag] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selection, dispatchSelection] = useReducer(selectionReducer, emptySelection);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<'cleanup' | 'other' | null>(null);
  const [bulkCopyState, setBulkCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const searchRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<CaptureInputHandle>(null);

  const notes = useMemo(
    () => filterNotes(snapshot.notes, { query, status, tag }),
    [query, snapshot.notes, status, tag],
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
  const openCount = useMemo(
    () => snapshot.notes.filter((note) => note.status === 'open').length,
    [snapshot.notes],
  );
  const doneCount = snapshot.notes.length - openCount;

  useEffect(() => {
    dispatchSelection({ type: 'reconcile', visibleIds });
  }, [visibleIds]);

  useEffect(() => {
    if (!selectionMode || !selection.activeId) return;
    const focused = document.activeElement;
    if (
      focused instanceof HTMLInputElement ||
      focused instanceof HTMLTextAreaElement ||
      (focused instanceof HTMLElement && focused.isContentEditable)
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(`[data-note-focus="${selection.activeId}"]`)
        ?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selection.activeId, selectionMode]);

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

  const focusAttachments = useCallback(async (noteId: string) => {
    setExpandedId(noteId);
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
  }, []);

  const importAttachments = useCallback(
    async (noteId: string) => {
      await focusAttachments(noteId);
      const sourcePaths = await pickAttachments();
      if (!sourcePaths.length) return;
      await executeWorkspaceCommand({ type: 'importNoteAttachments', noteId, sourcePaths });
    },
    [executeWorkspaceCommand, focusAttachments, pickAttachments],
  );

  const leaveSelection = useCallback(() => {
    setSelectionMode(false);
    dispatchSelection({ type: 'clear' });
    setDeleteError(null);
  }, []);

  const deleteSelected = useCallback(async () => {
    if (!selection.selectedIds.length || deletePending) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      await executeWorkspaceCommand({ type: 'deleteNotes', noteIds: selection.selectedIds });
      setDeleteOpen(false);
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
  }, [deletePending, executeWorkspaceCommand, leaveSelection, selection.selectedIds]);

  const retryDeletionCleanup = useCallback(async () => {
    if (deletePending) return;
    setDeletePending(true);
    try {
      await refreshWorkspace();
      setDeleteOpen(false);
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
          toggle: true,
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
      if (!selectionMode) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        leaveSelection();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'a') {
        event.preventDefault();
        dispatchSelection({ type: 'selectAllVisible', visibleIds });
      } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        dispatchSelection({
          type: 'move',
          direction: event.key === 'ArrowDown' ? 1 : -1,
          visibleIds,
          extend: event.shiftKey,
        });
      } else if (event.key === ' ') {
        event.preventDefault();
        dispatchSelection({ type: 'toggleActive', visibleIds });
      } else if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selection.selectedIds.length
      ) {
        event.preventDefault();
        setDeleteOpen(true);
      }
    },
    [leaveSelection, selection.selectedIds.length, selectionMode, visibleIds],
  );

  const clearSearch = () => {
    setQuery('');
    setTag(null);
    searchRef.current?.focus();
  };

  const emptyTitle =
    query || tag
      ? m.note_empty_search_title()
      : status === 'open'
        ? m.note_empty_open_title()
        : m.note_empty_done_title();
  const emptyDescription =
    query || tag
      ? m.note_empty_search_description_flat()
      : status === 'open'
        ? m.note_empty_open_description()
        : m.note_empty_done_description();
  const selectedCount =
    selection.selectedIds.length === 1
      ? m.selection_count_one()
      : m.selection_count_many({ count: selection.selectedIds.length });
  const bulkStatusLabel = status === 'open' ? m.note_mark_done() : m.note_mark_open();

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
        </div>
        <div className="note-toolbar-row">
          {selectionMode ? (
            <div aria-label={selectedCount} className="selection-bar" role="toolbar">
              <strong className="selection-count" aria-live="polite">
                {selectedCount}
              </strong>
              <div className="selection-actions">
                <Tooltip>
                  <TooltipTrigger
                    aria-label={bulkStatusLabel}
                    disabled={!selection.selectedIds.length}
                    onClick={() =>
                      void executeWorkspaceCommand({
                        type: 'setNoteStatus',
                        noteIds: selection.selectedIds,
                        status: status === 'open' ? 'done' : 'open',
                      })
                    }
                    render={<Button size="sm" variant="ghost" />}
                  >
                    {status === 'open' ? (
                      <IconCheck aria-hidden="true" />
                    ) : (
                      <IconCircle aria-hidden="true" />
                    )}
                    <span className="selection-action-label">{bulkStatusLabel}</span>
                  </TooltipTrigger>
                  <TooltipContent>{bulkStatusLabel}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    aria-description={m.copy_local_paths_disclosure()}
                    aria-label={m.copy_as_markdown()}
                    disabled={!selection.selectedIds.length}
                    onClick={() => void copyNotes(selection.selectedIds)}
                    render={<Button size="sm" variant="ghost" />}
                  >
                    <IconCopy aria-hidden="true" />
                    <span className="selection-action-label">{m.copy_as_markdown()}</span>
                  </TooltipTrigger>
                  <TooltipContent className="copy-tooltip">
                    <strong>{m.copy_as_markdown()}</strong>
                    <span>{m.copy_local_paths_disclosure()}</span>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    aria-label={m.delete_selected({ count: selection.selectedIds.length })}
                    disabled={!selection.selectedIds.length}
                    onClick={() => setDeleteOpen(true)}
                    render={<Button size="sm" variant="destructive" />}
                  >
                    <IconTrash aria-hidden="true" />
                    <span className="selection-action-label">
                      {m.delete_selected({ count: selection.selectedIds.length })}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {m.delete_selected({ count: selection.selectedIds.length })}
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger
                    aria-label={m.common_cancel()}
                    onClick={leaveSelection}
                    render={<Button size="sm" variant="ghost" />}
                  >
                    <IconX aria-hidden="true" />
                    <span className="selection-action-label">{m.common_cancel()}</span>
                  </TooltipTrigger>
                  <TooltipContent>{m.common_cancel()}</TooltipContent>
                </Tooltip>
              </div>
            </div>
          ) : (
            <>
              <ToggleGroup
                aria-label={m.note_status_filter_label()}
                className="status-segment"
                onValueChange={(values) => {
                  const next = values[0];
                  if (next === 'open' || next === 'done') setStatus(next);
                }}
                spacing={0}
                value={[status]}
              >
                <ToggleGroupItem value="open">
                  {m.note_status_open()} <span aria-hidden>{openCount}</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="done">
                  {m.note_status_done()} <span aria-hidden>{doneCount}</span>
                </ToggleGroupItem>
              </ToggleGroup>
              <Button
                className="selection-entry"
                onClick={() => setSelectionMode(true)}
                size="sm"
                variant="ghost"
              >
                {m.selection_enter()}
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="note-context">
        {tag ? (
          <div className="active-tag-filter">
            <Badge variant="secondary">{tag}</Badge>
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
          onCloseEditor={() => {
            const closingId = expandedId;
            setExpandedId(null);
            window.requestAnimationFrame(() => {
              if (closingId) {
                document.querySelector<HTMLElement>(`[data-note-focus="${closingId}"]`)?.focus();
              }
            });
          }}
          onDirtyChange={setWorkspaceSwitchBlocked}
          onCopy={(noteId) => copyNotes([noteId])}
          onExpand={setExpandedId}
          onFocusAttachments={focusAttachments}
          onRemoveAttachment={(noteId, attachment) =>
            executeWorkspaceCommand({
              type: 'deleteNoteAttachments',
              noteId,
              attachmentIds: [attachment.id],
            }).then(() => undefined)
          }
          onRetryCleanup={() => refreshWorkspace().then(() => undefined)}
          onSave={(noteId, body) =>
            executeWorkspaceCommand({ type: 'updateNote', noteId, body }).then(() => undefined)
          }
          onSelection={handleListSelection}
          onSetTags={(noteId, tags) =>
            executeWorkspaceCommand({ type: 'setNoteTags', noteId, tags }).then(() => undefined)
          }
          onTagFilter={(value) => setTag(value)}
          onToggleStatus={(note: NoteDto) =>
            executeWorkspaceCommand({
              type: 'setNoteStatus',
              noteIds: [note.id],
              status: note.status === 'open' ? 'done' : 'open',
            }).then(() => undefined)
          }
          selection={selection}
          selectionMode={selectionMode}
        />
      ) : (
        <Empty className="note-empty">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <IconSearch />
            </EmptyMedia>
            <EmptyTitle>{emptyTitle}</EmptyTitle>
            <EmptyDescription>{emptyDescription}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            {status === 'done' && !query && !tag ? (
              <Button onClick={() => setStatus('open')} variant="outline">
                {m.note_show_open()}
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
          onCreated={() => setStatus('open')}
          ref={captureRef}
        />
      </div>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(open) => {
          if (!deletePending) setDeleteOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {selection.selectedIds.length === 1
                ? m.delete_title_one()
                : m.delete_title({ count: selection.selectedIds.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {m.delete_description({ count: selection.selectedIds.length })}
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
                void (deleteError === 'cleanup' ? retryDeletionCleanup() : deleteSelected())
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
