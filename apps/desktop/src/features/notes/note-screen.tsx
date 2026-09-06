import { IconSearch, IconX } from '@tabler/icons-react';
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useComposerFocus } from '@/app/composer-focus-context';
import { useMessages } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import type { NoteDto, WorkspaceSnapshot } from '@/bindings/workspace';
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { CaptureInput, type CaptureInputHandle } from '@/features/notes/capture-input';
import { NoteList } from '@/features/notes/note-list';
import { createNoteIndex, type NoteIndex } from '@/features/notes/search';
import {
  asClipboardError,
  type ClipboardClient,
  tauriClipboardClient,
} from '@/lib/ipc/clipboard-client';
import { tauriWorkspaceClient } from '@/lib/ipc/workspace-client';

type AttachmentPicker = () => Promise<string[]>;

const nativeAttachmentPicker: AttachmentPicker = () =>
  tauriWorkspaceClient.chooseAttachments?.() ?? Promise.resolve([]);

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editorDirty, setEditorDirty] = useState(false);
  const [composerDirty, setComposerDirty] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<'cleanup' | 'other' | null>(null);
  const [copyState, setCopyState] = useState<{
    noteId: string;
    status: 'copied' | 'error';
    message: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<CaptureInputHandle>(null);
  const announcementTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const pendingDeleteFocusRef = useRef<{ deletedId: string; index: number } | null>(null);

  const indexRef = useRef<NoteIndex | null>(null);
  indexRef.current ??= createNoteIndex();
  const index = indexRef.current;
  /** The first query of a session normalizes the corpus (~44 ms at 20k Notes); the field stays live while it runs. */
  const deferredQuery = useDeferredValue(query);
  const notes = useMemo(
    () => index.filter(snapshot.notes, { query: deferredQuery, tag }),
    [deferredQuery, index, snapshot.notes, tag],
  );
  const allTags = useMemo(() => index.tags(snapshot.notes), [index, snapshot.notes]);
  const announce = useCallback((text: string) => {
    if (announcementTimerRef.current !== null) {
      window.clearTimeout(announcementTimerRef.current);
    }
    setAnnouncement(text);
    announcementTimerRef.current = window.setTimeout(() => {
      setAnnouncement('');
      announcementTimerRef.current = null;
    }, 3_000);
  }, []);

  useEffect(
    () => () => {
      if (announcementTimerRef.current !== null) {
        window.clearTimeout(announcementTimerRef.current);
      }
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    setWorkspaceSwitchBlocked(editorDirty || composerDirty);
    return () => setWorkspaceSwitchBlocked(false);
  }, [composerDirty, editorDirty, setWorkspaceSwitchBlocked]);

  useLayoutEffect(() => {
    const pending = pendingDeleteFocusRef.current;
    if (!pending || deleteTargetId || notes.some((note) => note.id === pending.deletedId)) return;
    const next = notes[Math.min(pending.index, notes.length - 1)];
    const frame = window.requestAnimationFrame(() => {
      if (next) {
        document
          .querySelector<HTMLElement>(`[data-note-focus="${next.id}"]`)
          ?.focus({ preventScroll: true });
      } else {
        captureRef.current?.focus();
      }
      pendingDeleteFocusRef.current = null;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [deleteTargetId, notes]);
  useEffect(() => {
    if (!composerFocus.request) return;
    captureRef.current?.focus();
    composerFocus.consume(composerFocus.request.requestId);
  }, [composerFocus]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'f') {
        if (document.querySelector('[role="alertdialog"][data-open]')) return;
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', focusSearch);
    return () => window.removeEventListener('keydown', focusSearch);
  }, []);

  const copyNote = useCallback(
    async (noteId: string) => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
      try {
        await clipboardClient.composeAndWrite({
          expectedRevision: snapshot.revision,
          noteId,
        });
        const message = m.copy_inline_copied();
        setCopyState({ noteId, status: 'copied', message });
        announce(message);
        copyTimerRef.current = window.setTimeout(() => {
          setCopyState((current) =>
            current?.noteId === noteId && current.status === 'copied' ? null : current,
          );
          copyTimerRef.current = null;
        }, 2_500);
      } catch (error) {
        const clipboardError = asClipboardError(error);
        if (clipboardError.code === 'stale_revision') {
          try {
            await refreshWorkspace();
          } catch {
            // Keep the content-free stale warning when the refresh also fails.
          }
        }
        const message =
          {
            empty_body: m.clipboard_error_empty_body(),
            invalid_request: m.clipboard_error_invalid_request(),
            validation: m.clipboard_error_invalid_request(),
            stale_revision: m.workspace_error_stale_revision(),
            not_found: m.workspace_error_not_found(),
            permission_denied: m.clipboard_error_permission_denied(),
            platform_unavailable: m.clipboard_error_platform_unavailable(),
            workspace_unavailable: m.clipboard_error_workspace_unavailable(),
            write_failed: m.clipboard_error_write_failed(),
          }[clipboardError.code] ?? m.clipboard_error_write_failed();
        setCopyState({ noteId, status: 'error', message });
      }
    },
    [announce, clipboardClient, m, refreshWorkspace, snapshot.revision],
  );

  const expandNote = useCallback((noteId: string) => {
    setCopyState((current) => (current?.noteId === noteId ? null : current));
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
      const sourceTokens = await pickAttachments();
      if (!sourceTokens.length) return;
      await executeWorkspaceCommand({ type: 'importNoteAttachments', noteId, sourceTokens });
    },
    [executeWorkspaceCommand, pickAttachments],
  );

  const requestDelete = useCallback((noteId: string) => {
    setCopyState((current) => (current?.noteId === noteId ? null : current));
    setDeleteError(null);
    setDeleteTargetId(noteId);
  }, []);

  const deleteNote = useCallback(async () => {
    if (!deleteTargetId || deletePending) return;
    setDeletePending(true);
    setDeleteError(null);
    try {
      const deletedIndex = notes.findIndex((note) => note.id === deleteTargetId);
      await executeWorkspaceCommand({ type: 'deleteNote', noteId: deleteTargetId });
      pendingDeleteFocusRef.current = {
        deletedId: deleteTargetId,
        index: Math.max(0, deletedIndex),
      };
      setDeleteTargetId(null);
      announce(m.delete_done());
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      setDeleteError(code === 'deletion_cleanup_required' ? 'cleanup' : 'other');
    } finally {
      setDeletePending(false);
    }
  }, [announce, deletePending, deleteTargetId, executeWorkspaceCommand, m, notes]);

  const retryDeletionCleanup = useCallback(async () => {
    if (deletePending) return;
    setDeletePending(true);
    try {
      await refreshWorkspace();
      setDeleteTargetId(null);
    } catch {
      setDeleteError('cleanup');
    } finally {
      setDeletePending(false);
    }
  }, [deletePending, refreshWorkspace]);

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
    async (note: NoteDto) => {
      const status = note.status === 'open' ? 'done' : 'open';
      await executeWorkspaceCommand({
        type: 'setNoteStatus',
        noteId: note.id,
        status,
      });
      announce(status === 'done' ? m.note_marked_done() : m.note_marked_open());
    },
    [announce, executeWorkspaceCommand, m],
  );

  const clearSearch = () => {
    setQuery('');
    setTag(null);
    searchRef.current?.focus();
  };

  const emptyTitle = query || tag ? m.note_empty_search_title() : m.note_empty_all_title();
  const emptyDescription =
    query || tag ? m.note_empty_search_description() : m.note_empty_all_description();
  return (
    <section className="note-screen">
      <div aria-live="polite" className="sr-only" role="status">
        {announcement}
      </div>
      <div className="note-workbar">
        <div className="note-search">
          <IconSearch aria-hidden="true" />
          <Input
            aria-label={m.note_search_label()}
            autoComplete="off"
            name="noteSearch"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={m.note_search_placeholder()}
            ref={searchRef}
            value={query}
          />
          {query || tag ? (
            <Button
              aria-label={m.note_search_clear()}
              className="note-search-clear"
              onClick={clearSearch}
              size="icon-sm"
              variant="ghost"
            >
              <IconX aria-hidden="true" />
            </Button>
          ) : null}
          <ShelfActions />
        </div>
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
      </div>
      {notes.length ? (
        <NoteList
          allTags={allTags}
          expandedId={expandedId}
          notes={notes}
          onAddAttachments={importAttachments}
          onCloseEditor={closeEditor}
          onCopy={copyNote}
          onDelete={requestDelete}
          onDirtyChange={setEditorDirty}
          onExpand={expandNote}
          onFocusAttachments={focusAttachments}
          onRemoveAttachment={removeAttachment}
          onRetryCleanup={retryCleanup}
          onSave={saveNote}
          onSetTags={setNoteTags}
          onTagFilter={filterByTag}
          onToggleStatus={toggleNoteStatus}
          copyState={copyState}
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
          onDirtyChange={setComposerDirty}
          onCreate={async (body) => {
            await executeWorkspaceCommand({ type: 'createNote', body });
            announce(m.capture_created());
          }}
          ref={captureRef}
        />
      </div>

      <AlertDialog
        open={Boolean(deleteTargetId)}
        onOpenChange={(open) => {
          if (!open && !deletePending) setDeleteTargetId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.delete_title()}</AlertDialogTitle>
            <AlertDialogDescription>{m.delete_description()}</AlertDialogDescription>
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
                void (deleteError === 'cleanup' ? retryDeletionCleanup() : deleteNote())
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
