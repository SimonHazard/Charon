import { useCallback, useEffect, useRef, useState } from 'react';

import type { WorkspaceCommandDraft } from '@/app/workspace-context';
import type { AttachmentSources, NoteDto, WorkspaceCommandResult } from '@/bindings/workspace';
import type { AttachmentIntakeClient } from '@/lib/ipc/attachment-intake-client';

/** Matches `workspace::MAX_ATTACHMENTS_PER_NOTE`. */
export const MAX_ATTACHMENTS_PER_NOTE = 20;

/** The Note a drop or paste goes to: an existing one, or a new Note named after its files. */
export type IntakeTarget = { noteId: string } | 'new';

export type IntakeOutcome =
  | { status: 'attached'; noteId: string; count: number; created: boolean }
  | { status: 'too-many' }
  | { status: 'failed'; noteId: string | null };

/** The Note row or open editor under a point of the main window, or a new Note. */
export function intakeTargetAt(x: number, y: number): IntakeTarget {
  const element = document.elementFromPoint(x, y);
  const noteId = element?.closest<HTMLElement>('[data-note-id]')?.dataset.noteId;
  return noteId ? { noteId } : 'new';
}

/** The Note whose open editor holds focus receives a paste; anywhere else creates a Note. */
export function pasteTarget(): IntakeTarget {
  const noteId = document.activeElement
    ?.closest<HTMLElement>('[data-note-editor]')
    ?.getAttribute('data-note-editor');
  return noteId ? { noteId } : 'new';
}

/**
 * Files dropped on the shelf or pasted into it (ADR 0032). A drop on a
 * Note row, or a paste inside an open editor, adds the files to that Note; anywhere else creates
 * one Note named after the files, in the focused Tag. Both go through the existing Attachment
 * import, so every Attachment rule and the transaction contract still apply.
 */
export function useAttachmentIntake({
  client,
  notes,
  focusedTag,
  executeWorkspaceCommand,
  onOutcome,
}: {
  client: AttachmentIntakeClient;
  notes: readonly NoteDto[];
  focusedTag: string | null;
  executeWorkspaceCommand(command: WorkspaceCommandDraft): Promise<WorkspaceCommandResult>;
  onOutcome(outcome: IntakeOutcome): void;
}) {
  const [dropTarget, setDropTarget] = useState<IntakeTarget | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const latest = useRef({ executeWorkspaceCommand, focusedTag, onOutcome });
  latest.current = { executeWorkspaceCommand, focusedTag, onOutcome };

  // One drop or paste at a time: each sequence creates its Note, if any, and imports into the
  // exact id that creation returned before the next one reads the Notes.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const run = useCallback(
    async (target: IntakeTarget, sources: AttachmentSources) => {
      const {
        executeWorkspaceCommand: execute,
        focusedTag: tag,
        onOutcome: report,
      } = latest.current;
      if (!sources.tokens.length) return;
      // Tokens that never reach an import are forgotten now, with any temporary copy.
      const discard = () => client.discard(sources.tokens).catch(() => undefined);
      const existing =
        target === 'new' ? null : notesRef.current.find((note) => note.id === target.noteId);
      if (sources.tokens.length + (existing?.attachments.length ?? 0) > MAX_ATTACHMENTS_PER_NOTE) {
        await discard();
        report({ status: 'too-many' });
        return;
      }
      let noteId = existing?.id ?? null;
      let created = false;
      try {
        if (!noteId) {
          const names = sources.fileNames.filter((name) => name.trim());
          const result = await execute({
            type: 'createNote',
            body: names.length ? names.join('\n') : '…',
            tags: tag ? [tag] : [],
          });
          notesRef.current = result.snapshot.notes;
          noteId = result.createdNoteId;
          if (!noteId) throw new Error('created Note id missing');
          created = true;
        }
        const result = await execute({
          type: 'importNoteAttachments',
          noteId,
          sourceTokens: sources.tokens,
        });
        notesRef.current = result.snapshot.notes;
        report({ status: 'attached', noteId, count: sources.tokens.length, created });
      } catch {
        await discard();
        report({ status: 'failed', noteId });
      }
    },
    [client],
  );

  const attach = useCallback(
    (target: IntakeTarget, sources: AttachmentSources) => {
      const next = queue.current.then(() => run(target, sources));
      queue.current = next.catch(() => undefined);
      return next;
    },
    [run],
  );

  useEffect(() => {
    let active = true;
    const stops: (() => void)[] = [];
    const keep = (stop: () => void) => {
      if (active) stops.push(stop);
      else stop();
    };
    void client
      .subscribeDrag((event) => {
        setDropTarget(event.over ? intakeTargetAt(event.x, event.y) : null);
      })
      .then(keep)
      .catch(() => undefined);
    void client
      .subscribeDrop((event) => {
        setDropTarget(null);
        void attach(intakeTargetAt(event.x, event.y), event.sources);
      })
      .then(keep)
      .catch(() => undefined);
    return () => {
      active = false;
      for (const stop of stops) stop();
    };
  }, [attach, client]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      // Text keeps the native paste; only files or an image go through Rust.
      if (!event.clipboardData?.types.includes('Files')) return;
      if (document.querySelector('[role="dialog"][data-open], [role="alertdialog"][data-open]')) {
        return;
      }
      event.preventDefault();
      const target = pasteTarget();
      void client
        .paste()
        .then((sources) => attach(target, sources))
        .catch(() => latest.current.onOutcome({ status: 'failed', noteId: null }));
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [attach, client]);

  return { dropTarget };
}
