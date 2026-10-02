import { IconScribble } from '@tabler/icons-react';
import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useMessages } from '@/app/providers';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DrawingDialog, type DrawingDialogControl } from '@/features/notes/drawing/drawing-dialog';
import type { DrawingEditRequest } from '@/features/notes/drawing/drawing-figure';
import {
  applyDrawingBlock,
  type Drawing,
  type DrawingTarget,
  drawingKey,
  findDrawingBlocks,
} from '@/features/notes/drawing/drawing-format';

type Session = {
  id: number;
  open: boolean;
  target: DrawingTarget;
  initial: Drawing | null;
};

type NoteDrawingOptions = {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Current draft body. */
  readBody(): string;
  /** Replaces the draft body through the editor's normal change path. */
  writeBody(body: string): void;
};

/**
 * Drawing composition is view logic: it reads the draft, edits exactly one
 * fenced block, and writes the result back through the draft reducer, so
 * autosave and every dirty guard keep their existing behavior.
 */
export function useNoteDrawing({ textareaRef, readBody, writeBody }: NoteDrawingOptions) {
  const [session, setSession] = useState<Session | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const nextIdRef = useRef(0);
  const dialogRef = useRef<DrawingDialogControl>(null);
  const openRef = useRef(false);
  const bodyRef = useRef({ readBody, writeBody });
  useLayoutEffect(() => {
    bodyRef.current = { readBody, writeBody };
  });

  const start = useCallback(
    (trigger: HTMLElement, target: DrawingTarget, initial: Drawing | null) => {
      triggerRef.current = trigger;
      nextIdRef.current += 1;
      openRef.current = true;
      setSession({ id: nextIdRef.current, open: true, target, initial });
    },
    [],
  );

  /** Draw at the Write caret, or edit the drawing block the caret is in. */
  const draw = useCallback(
    (trigger: HTMLElement) => {
      const body = bodyRef.current.readBody();
      const textarea = textareaRef.current;
      const caret = textarea?.isConnected ? textarea.selectionStart : body.length;
      const blocks = findDrawingBlocks(body);
      const index = blocks.findIndex((block) => block.start <= caret && caret <= block.end);
      const block = blocks[index];
      if (block) {
        start(
          trigger,
          { kind: 'edit', index, key: drawingKey(block.drawing), caret: block.end },
          block.drawing,
        );
      } else {
        start(trigger, { kind: 'new', caret }, null);
      }
    },
    [start, textareaRef],
  );

  /** Edit a drawing rendered in Preview. */
  const editDrawing = useCallback(
    ({ index, drawing, trigger }: DrawingEditRequest) => {
      const caret = bodyRef.current.readBody().length;
      start(trigger, { kind: 'edit', index, key: drawingKey(drawing), caret }, drawing);
    },
    [start],
  );

  /**
   * Before the window closes: an open drawing with unsaved strokes asks
   * whether to discard them, and the caller keeps the window open.
   */
  const confirmDiscard = useCallback(
    () => openRef.current && (dialogRef.current?.confirmDiscard() ?? false),
    [],
  );

  const dialog = session ? (
    <DrawingDialog
      controlRef={dialogRef}
      finalFocus={() => (triggerRef.current?.isConnected ? triggerRef.current : null)}
      initial={session.initial}
      key={session.id}
      onClose={() => {
        if (nextIdRef.current === session.id) openRef.current = false;
        setSession((current) =>
          current?.id === session.id ? { ...current, open: false } : current,
        );
      }}
      onSubmit={(block) => {
        const { readBody: read, writeBody: write } = bodyRef.current;
        const body = read();
        const next = applyDrawingBlock(body, session.target, block);
        if (next !== body) write(next);
      }}
      open={session.open}
    />
  ) : null;

  return { draw, editDrawing, dialog, confirmDiscard };
}

export function DrawButton({ onDraw }: { onDraw(trigger: HTMLElement): void }) {
  const m = useMessages();
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={m.drawing_draw()}
        className="drawing-trigger"
        onClick={(event) => onDraw(event.currentTarget)}
        render={<Button size="icon-sm" variant="ghost" />}
      >
        <IconScribble aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent>{m.drawing_draw()}</TooltipContent>
    </Tooltip>
  );
}
