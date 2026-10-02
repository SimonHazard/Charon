import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconClearAll,
  IconEraser,
  IconMinus,
  IconPencil,
} from '@tabler/icons-react';
import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useMessages } from '@/app/providers';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { DrawingCanvas, type DrawingTool } from '@/features/notes/drawing/drawing-canvas';
import {
  DRAWING_MAX_PATHS,
  DRAWING_SPACE,
  type Drawing,
  type DrawingInk,
  type DrawingWidth,
  drawingInks,
  drawingWidths,
  finalizeDrawing,
  unionBox,
} from '@/features/notes/drawing/drawing-format';
import {
  createDrawingHistory,
  type DrawingHistoryAction,
  drawingHistoryReducer,
  hasDrawingChanges,
} from '@/features/notes/drawing/drawing-history';

type Messages = ReturnType<typeof useMessages>;

const inkLabel: Record<DrawingInk, (m: Messages) => string> = {
  text: (m) => m.drawing_ink_text(),
  lavender: (m) => m.drawing_ink_lavender(),
  red: (m) => m.drawing_ink_red(),
  blue: (m) => m.drawing_ink_blue(),
  green: (m) => m.drawing_ink_green(),
};

const widthLabel: Record<DrawingWidth, (m: Messages) => string> = {
  thin: (m) => m.drawing_width_thin(),
  medium: (m) => m.drawing_width_medium(),
  bold: (m) => m.drawing_width_bold(),
};

/** Icon stroke weights that depict the three line widths. */
const widthIconStroke: Record<DrawingWidth, number> = { thin: 1.25, medium: 2.25, bold: 3.5 };

const isInk = (value: unknown): value is DrawingInk => drawingInks.some((ink) => ink.id === value);
const isWidth = (value: unknown): value is DrawingWidth =>
  drawingWidths.some((width) => width.id === value);

function ToolbarButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        aria-label={label}
        onClick={onClick}
        // On the trigger, `disabled` would only silence the Tooltip; the Button must be disabled.
        render={<Button disabled={disabled} size="icon-sm" variant="ghost" />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ToggleItem({
  label,
  value,
  children,
}: {
  label: string;
  value: string;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<ToggleGroupItem aria-label={label} value={value} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export type DrawingDialogControl = {
  /** Asks before discarding unsaved strokes; returns false when there are none. */
  confirmDiscard(): boolean;
};

export type DrawingDialogProps = {
  open: boolean;
  /** The drawing being edited, or null for a new drawing. */
  initial: Drawing | null;
  onSubmit(block: string): void;
  onClose(): void;
  /** Element that regains focus after closing; null uses the default. */
  finalFocus(): HTMLElement | null;
  /** Lets the editor protect unsaved strokes when the window closes. */
  controlRef?: Ref<DrawingDialogControl>;
};

/**
 * Modal drawing session. Strokes stay local to the dialog until Insert or
 * Save hands one finished Markdown block back to the editor's draft.
 */
export function DrawingDialog({
  open,
  initial,
  onSubmit,
  onClose,
  finalFocus,
  controlRef,
}: DrawingDialogProps) {
  const m = useMessages();
  const descriptionId = useId();
  const emptyId = useId();
  const discardId = useId();
  const [history, dispatch] = useReducer(
    drawingHistoryReducer,
    initial?.strokes ?? [],
    createDrawingHistory,
  );
  const [tool, setTool] = useState<DrawingTool>('pen');
  const [ink, setInk] = useState<DrawingInk>('text');
  const [width, setWidth] = useState<DrawingWidth>('medium');
  const [confirming, setConfirming] = useState(false);
  const [tooLarge, setTooLarge] = useState(false);
  // A session mounts this dialog already open, and Base UI plays the transient entrance only
  // when `open` turns true after mount: open one layout pass later, before the first paint.
  const [entering, setEntering] = useState(true);
  useLayoutEffect(() => setEntering(false), []);
  const popupRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const restoreCancelFocusRef = useRef(false);
  const space = useMemo(
    () => (initial ? unionBox(DRAWING_SPACE, initial.viewBox) : DRAWING_SPACE),
    [initial],
  );
  const dirty = hasDrawingChanges(history);
  const empty = history.strokes.length === 0;
  const editing = initial !== null;

  useEffect(() => {
    if (confirming) keepRef.current?.focus();
  }, [confirming]);

  useImperativeHandle(
    controlRef,
    () => ({
      confirmDiscard: () => {
        if (!dirty) return false;
        setConfirming(true);
        return true;
      },
    }),
    [dirty],
  );

  useLayoutEffect(() => {
    if (confirming || !restoreCancelFocusRef.current) return;
    restoreCancelFocusRef.current = false;
    cancelRef.current?.focus();
  }, [confirming]);

  const apply = (action: DrawingHistoryAction) => {
    setTooLarge(false);
    setConfirming(false);
    dispatch(action);
  };

  const keepDrawing = () => {
    restoreCancelFocusRef.current = true;
    setConfirming(false);
  };

  const requestClose = () => {
    if (confirming) keepDrawing();
    else if (dirty) setConfirming(true);
    else onClose();
  };

  const submit = () => {
    if (editing && !dirty) {
      onClose();
      return;
    }
    const result = finalizeDrawing(history.strokes, space);
    if (!result.ok) {
      setTooLarge(result.reason === 'too-large');
      return;
    }
    onSubmit(result.block);
    onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The editor behind this modal closes on Escape; only the dialog may react.
    if (event.key === 'Escape') {
      event.stopPropagation();
      return;
    }
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.nativeEvent.isComposing) return;
    const key = event.key.toLowerCase();
    if (key === 'z' || (key === 'y' && event.ctrlKey && !event.shiftKey)) {
      event.preventDefault();
      event.stopPropagation();
      apply({ type: key === 'y' || event.shiftKey ? 'redo' : 'undo' });
    } else if (key === 'f') {
      // Search sits behind the modal; keep focus inside the drawing.
      event.stopPropagation();
    }
  };

  const inkValue = drawingInks.find((candidate) => candidate.id === ink)?.value ?? 'currentColor';
  const widthValue = drawingWidths.find((candidate) => candidate.id === width)?.value ?? 4;

  return (
    <Dialog
      disablePointerDismissal
      onOpenChange={(next) => {
        if (!next) requestClose();
      }}
      open={open && !entering}
    >
      <DialogContent
        className="drawing-dialog"
        finalFocus={() => finalFocus() ?? true}
        // Focus the surface itself: the dialog is announced and no tool Tooltip pops up.
        initialFocus={popupRef}
        onKeyDown={onKeyDown}
        ref={popupRef}
      >
        <DialogHeader>
          <DialogTitle>{m.drawing_label()}</DialogTitle>
          <DialogDescription id={descriptionId}>{m.drawing_canvas_hint()}</DialogDescription>
        </DialogHeader>
        <div className="drawing-toolbar">
          <ToggleGroup
            aria-label={m.drawing_tool_label()}
            className="drawing-toggle"
            onValueChange={(values) => {
              const next = values[0];
              if (next === 'pen' || next === 'eraser') setTool(next);
            }}
            value={[tool]}
          >
            <ToggleItem label={m.drawing_pen()} value="pen">
              <IconPencil aria-hidden="true" />
            </ToggleItem>
            <ToggleItem label={m.drawing_eraser()} value="eraser">
              <IconEraser aria-hidden="true" />
            </ToggleItem>
          </ToggleGroup>
          <ToggleGroup
            aria-label={m.drawing_ink_label()}
            className="drawing-toggle"
            onValueChange={(values) => {
              const next = values[0];
              if (!isInk(next)) return;
              setInk(next);
              setTool('pen');
            }}
            value={[ink]}
          >
            {drawingInks.map((candidate) => (
              <ToggleItem key={candidate.id} label={inkLabel[candidate.id](m)} value={candidate.id}>
                <span
                  aria-hidden="true"
                  className="drawing-swatch"
                  style={{ color: candidate.value }}
                />
              </ToggleItem>
            ))}
          </ToggleGroup>
          <ToggleGroup
            aria-label={m.drawing_width_label()}
            className="drawing-toggle"
            onValueChange={(values) => {
              const next = values[0];
              if (!isWidth(next)) return;
              setWidth(next);
              setTool('pen');
            }}
            value={[width]}
          >
            {drawingWidths.map((candidate) => (
              <ToggleItem
                key={candidate.id}
                label={widthLabel[candidate.id](m)}
                value={candidate.id}
              >
                <IconMinus aria-hidden="true" stroke={widthIconStroke[candidate.id]} />
              </ToggleItem>
            ))}
          </ToggleGroup>
          <div className="drawing-history-actions">
            <ToolbarButton
              disabled={!history.past.length}
              label={m.drawing_undo()}
              onClick={() => apply({ type: 'undo' })}
            >
              <IconArrowBackUp aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              disabled={!history.future.length}
              label={m.drawing_redo()}
              onClick={() => apply({ type: 'redo' })}
            >
              <IconArrowForwardUp aria-hidden="true" />
            </ToolbarButton>
            <ToolbarButton
              disabled={empty}
              label={m.drawing_clear()}
              onClick={() => apply({ type: 'clear' })}
            >
              <IconClearAll aria-hidden="true" />
            </ToolbarButton>
          </div>
        </div>
        <DrawingCanvas
          canAddStroke={history.strokes.length < DRAWING_MAX_PATHS}
          color={inkValue}
          describedBy={descriptionId}
          label={m.drawing_canvas_label()}
          onAddStrokes={(strokes) => apply({ type: 'add', strokes })}
          onBlocked={() => setTooLarge(true)}
          onEraseStrokes={(strokes) => apply({ type: 'erase', strokes })}
          space={space}
          strokes={history.strokes}
          tool={tool}
          width={widthValue}
        />
        {tooLarge ? (
          <p className="inline-error drawing-error" role="alert">
            {m.drawing_too_large()}
          </p>
        ) : null}
        <DialogFooter className="drawing-footer">
          {confirming ? (
            <div className="drawing-discard">
              <p id={discardId}>{m.drawing_discard_title()}</p>
              <Button
                aria-describedby={discardId}
                onClick={keepDrawing}
                ref={keepRef}
                size="sm"
                variant="outline"
              >
                {m.drawing_discard_keep()}
              </Button>
              <Button
                aria-describedby={discardId}
                onClick={onClose}
                size="sm"
                variant="destructive"
              >
                {m.drawing_discard_confirm()}
              </Button>
            </div>
          ) : (
            <>
              <Button onClick={requestClose} ref={cancelRef} variant="outline">
                {m.common_cancel()}
              </Button>
              <Button
                aria-describedby={empty ? emptyId : undefined}
                disabled={empty}
                onClick={submit}
              >
                {editing ? m.drawing_save() : m.drawing_insert()}
              </Button>
              {empty ? (
                <span className="sr-only" id={emptyId}>
                  {m.drawing_empty()}
                </span>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
