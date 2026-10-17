import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  type Box,
  formatPathData,
  type PathCommand,
  type Stroke,
  sanitizeDrawingText,
} from '@/features/notes/drawing/drawing-format';
import {
  clientToDrawing,
  type Point,
  type ShapeTool,
  StrokeTrace,
  shapeCommands,
  shapeIsTiny,
  strokeHit,
} from '@/features/notes/drawing/drawing-geometry';
import { DrawingPaths, strokeKey } from '@/features/notes/drawing/drawing-paths';

export type DrawingTool = 'pen' | 'eraser' | 'text' | ShapeTool;

export const shapeTools: readonly ShapeTool[] = ['line', 'arrow', 'rectangle', 'ellipse'];
const isShapeTool = (tool: DrawingTool): tool is ShapeTool =>
  (shapeTools as readonly string[]).includes(tool);

type Rect = { left: number; top: number; width: number; height: number };

type Gesture =
  | {
      kind: 'draw';
      pointerId: number;
      rect: Rect;
      trace: StrokeTrace;
      pieces: PathCommand[][];
      piecesData: string;
      color: string;
      width: number;
    }
  | {
      kind: 'shape';
      pointerId: number;
      rect: Rect;
      tool: ShapeTool;
      start: Point;
      commands: PathCommand[] | null;
      color: string;
      width: number;
    }
  | { kind: 'erase'; pointerId: number; rect: Rect; last: Point; hits: Set<Stroke> };

/** A label being typed: where it starts in the drawing and where its field sits on screen. */
type TextDraft = { point: Point; left: number; top: number; fontPx: number };

type DrawingCanvasProps = {
  strokes: readonly Stroke[];
  space: Box;
  tool: DrawingTool;
  color: string;
  width: number;
  /** Font size of a new label, in drawing units. */
  textSize: number;
  label: string;
  textLabel: string;
  describedBy?: string;
  /** False once the drawing holds the maximum number of strokes. */
  canAddStroke: boolean;
  onAddStrokes(strokes: Stroke[]): void;
  onEraseStrokes(strokes: ReadonlySet<Stroke>): void;
  onBlocked(): void;
};

// Pen barrel eraser buttons report button 5 and the 32 buttons bit.
const PEN_ERASER_BUTTON = 5;
const PEN_ERASER_BUTTONS = 32;

function samplesOf(event: ReactPointerEvent<SVGSVGElement>): readonly PointerEvent[] {
  const native = event.nativeEvent;
  const coalesced =
    typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [];
  return coalesced.length ? coalesced : [native];
}

/**
 * Pointer drawing surface. Ink appears on pointer down; the live stroke or shape is a path
 * mutated through a ref so pointer moves never touch React state; it commits once on pointer up
 * or cancel. The text tool opens a field at the pointer; Enter or leaving the field adds the
 * label and Escape drops it.
 */
export function DrawingCanvas({
  strokes,
  space,
  tool,
  color,
  width,
  textSize,
  label,
  textLabel,
  describedBy,
  canAddStroke,
  onAddStrokes,
  onEraseStrokes,
  onBlocked,
}: DrawingCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<SVGPathElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);
  const textCommittedRef = useRef(false);

  // Erasing hides hit marks immediately; React removes them on commit. Any
  // mark still hidden afterwards (an undo mid-gesture) becomes visible again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after each committed stroke list.
  useLayoutEffect(() => {
    if (gestureRef.current?.kind === 'erase') return;
    for (const mark of svgRef.current?.querySelectorAll('[visibility]') ?? []) {
      mark.removeAttribute('visibility');
    }
  }, [strokes]);

  const eraseAlong = (gesture: Extract<Gesture, { kind: 'erase' }>, from: Point, to: Point) => {
    for (const stroke of strokes) {
      if (gesture.hits.has(stroke) || !strokeHit(stroke, from, to)) continue;
      gesture.hits.add(stroke);
      svgRef.current
        ?.querySelector(`[data-stroke-key="${strokeKey(stroke)}"]`)
        ?.setAttribute('visibility', 'hidden');
    }
  };

  const showLive = (gesture: Extract<Gesture, { kind: 'draw' }>) => {
    liveRef.current?.setAttribute('d', gesture.piecesData + gesture.trace.data());
  };

  const finish = (pointerId: number) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== pointerId) return;
    gestureRef.current = null;
    if (gesture.kind === 'erase') {
      if (gesture.hits.size) onEraseStrokes(gesture.hits);
      return;
    }
    liveRef.current?.removeAttribute('d');
    if (gesture.kind === 'shape') {
      if (gesture.commands) {
        onAddStrokes([
          { color: gesture.color, width: gesture.width, opacity: null, commands: gesture.commands },
        ]);
      }
      return;
    }
    const pieces = [...gesture.pieces, gesture.trace.commands()];
    onAddStrokes(
      pieces.map((commands) => ({
        color: gesture.color,
        width: gesture.width,
        opacity: null,
        commands,
      })),
    );
  };

  const commitText = (value: string) => {
    const draft = textDraft;
    if (!draft || textCommittedRef.current) return;
    textCommittedRef.current = true;
    setTextDraft(null);
    const content = sanitizeDrawingText(value);
    if (!content) return;
    if (!canAddStroke) {
      onBlocked();
      return;
    }
    onAddStrokes([
      {
        color,
        width: 1,
        opacity: null,
        commands: [],
        text: { x: draft.point.x, y: draft.point.y, size: textSize, content },
      },
    ]);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (gestureRef.current) return;
    const penEraser =
      event.button === PEN_ERASER_BUTTON || (event.buttons & PEN_ERASER_BUTTONS) !== 0;
    if (event.button !== 0 && !penEraser) return;
    const svg = event.currentTarget;
    const rect = svg.getBoundingClientRect();
    const point = clientToDrawing(event.clientX, event.clientY, rect, space);
    if (!point) return;
    event.preventDefault();
    if (tool === 'text' && !penEraser) {
      if (!canAddStroke) {
        onBlocked();
        return;
      }
      const scale = Math.min(rect.width / space.width, rect.height / space.height);
      const fontPx = textSize * scale;
      // The click marks the label's vertical middle; its baseline sits a third of a size below.
      const baseline = { x: point.x, y: Math.min(space.y + space.height, point.y + textSize / 3) };
      textCommittedRef.current = false;
      setTextDraft({
        point: baseline,
        left: event.clientX - rect.left,
        top: event.clientY - rect.top - fontPx * 0.7,
        fontPx,
      });
      return;
    }
    if (tool === 'eraser' || penEraser) {
      const gesture: Extract<Gesture, { kind: 'erase' }> = {
        kind: 'erase',
        pointerId: event.pointerId,
        rect,
        last: point,
        hits: new Set(),
      };
      gestureRef.current = gesture;
      eraseAlong(gesture, point, point);
    } else {
      if (!canAddStroke) {
        onBlocked();
        return;
      }
      liveRef.current?.setAttribute('stroke', color);
      liveRef.current?.setAttribute('stroke-width', String(width));
      if (isShapeTool(tool)) {
        gestureRef.current = {
          kind: 'shape',
          pointerId: event.pointerId,
          rect,
          tool,
          start: point,
          commands: null,
          color,
          width,
        };
      } else {
        const gesture: Gesture = {
          kind: 'draw',
          pointerId: event.pointerId,
          rect,
          trace: new StrokeTrace(point),
          pieces: [],
          piecesData: '',
          color,
          width,
        };
        gestureRef.current = gesture;
        showLive(gesture);
      }
    }
    try {
      svg.setPointerCapture?.(event.pointerId);
    } catch {
      // A pointer that already ended cannot be captured; its up event still finishes.
    }
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    if (gesture.kind === 'erase') {
      for (const sample of samplesOf(event)) {
        const point = clientToDrawing(sample.clientX, sample.clientY, gesture.rect, space);
        if (!point) continue;
        eraseAlong(gesture, gesture.last, point);
        gesture.last = point;
      }
      return;
    }
    if (gesture.kind === 'shape') {
      const point = clientToDrawing(event.clientX, event.clientY, gesture.rect, space);
      if (!point) return;
      gesture.commands = shapeIsTiny(gesture.start, point)
        ? null
        : shapeCommands(gesture.tool, gesture.start, point, gesture.width, event.shiftKey);
      if (gesture.commands) liveRef.current?.setAttribute('d', formatPathData(gesture.commands));
      else liveRef.current?.removeAttribute('d');
      return;
    }
    let changed = false;
    for (const sample of samplesOf(event)) {
      const point = clientToDrawing(sample.clientX, sample.clientY, gesture.rect, space);
      if (!point || !gesture.trace.add(point)) continue;
      changed = true;
      if (gesture.trace.full) {
        // Continue seamlessly in a new path before the per-path number limit.
        gesture.pieces.push(gesture.trace.commands());
        gesture.piecesData += gesture.trace.data();
        gesture.trace = new StrokeTrace(point);
      }
    }
    if (changed) showLive(gesture);
  };

  const onPointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => finish(event.pointerId);

  const onTextKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      commitText(event.currentTarget.value);
    } else if (event.key === 'Escape') {
      // Escape drops only the label being typed; the dialog stays open.
      event.preventDefault();
      event.stopPropagation();
      textCommittedRef.current = true;
      setTextDraft(null);
      svgRef.current?.focus({ preventScroll: true });
    }
  };

  return (
    <div className="drawing-stage">
      <svg
        aria-describedby={describedBy}
        aria-label={label}
        className="drawing-canvas"
        data-tool={tool}
        onLostPointerCapture={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        ref={svgRef}
        role="img"
        viewBox={`${space.x} ${space.y} ${space.width} ${space.height}`}
      >
        <DrawingPaths keyed strokes={strokes} />
        <path
          className="drawing-live-stroke"
          fill="none"
          ref={liveRef}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {textDraft ? (
        <input
          aria-label={textLabel}
          autoComplete="off"
          // biome-ignore lint/a11y/noAutofocus: the text tool opens this field exactly where the user clicked.
          autoFocus
          className="drawing-text-input"
          maxLength={200}
          onBlur={(event) => commitText(event.currentTarget.value)}
          onKeyDown={onTextKeyDown}
          spellCheck={false}
          style={{
            left: textDraft.left,
            top: textDraft.top,
            fontSize: textDraft.fontPx,
            color: color === 'currentColor' ? undefined : color,
          }}
        />
      ) : null}
    </div>
  );
}
