import { IconSearch, IconX } from '@tabler/icons-react';
import { open } from '@tauri-apps/plugin-dialog';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

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
  const [tag, setTag] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<'cleanup' | 'other' | null>(null);
  const [copyState, setCopyState] = useState<{
    noteId: string;
    status: 'copied' | 'error';
    message: string;
  } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const captureRef = useRef<CaptureInputHandle>(null);

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

  const copyNote = useCallback(
    async (noteId: string) => {
      try {
        await clipboardClient.composeAndWrite({
          expectedRevision: snapshot.revision,
          noteId,
        });
        setCopyState({ noteId, status: 'copied', message: m.copy_inline_copied() });
      } catch (error) {
        const clipboardError = asClipboardError(error);
        const message =
          {
            empty_body: m.clipboard_error_empty_body(),
            invalid_request: m.clipboard_error_invalid_request(),
            permission_denied: m.clipboard_error_permission_denied(),
            platform_unavailable: m.clipboard_error_platform_unavailable(),
            workspace_unavailable: m.clipboard_error_workspace_unavailable(),
            write_failed: m.clipboard_error_write_failed(),
          }[clipboardError.code] ?? m.clipboard_error_write_failed();
        setCopyState({ noteId, status: 'error', message });
      }
    },
    [clipboardClient, m, snapshot.revision],
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
      const sourcePaths = await pickAttachments();
      if (!sourcePaths.length) return;
      await executeWorkspaceCommand({ type: 'importNoteAttachments', noteId, sourcePaths });
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
      await executeWorkspaceCommand({ type: 'deleteNote', noteId: deleteTargetId });
      setDeleteTargetId(null);
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
  }, [deletePending, deleteTargetId, executeWorkspaceCommand]);

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
    (note: NoteDto) =>
      executeWorkspaceCommand({
        type: 'setNoteStatus',
        noteId: note.id,
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
          onDirtyChange={setWorkspaceSwitchBlocked}
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
          onCreate={async (body) => {
            await executeWorkspaceCommand({ type: 'createNote', body });
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
