import { type PointerEvent as ReactPointerEvent, useLayoutEffect, useRef } from 'react';
import type { Box, PathCommand, Stroke } from '@/features/notes/drawing/drawing-format';
import {
  clientToDrawing,
  type Point,
  StrokeTrace,
  strokeHit,
} from '@/features/notes/drawing/drawing-geometry';
import { DrawingPaths, strokeKey } from '@/features/notes/drawing/drawing-paths';

export type DrawingTool = 'pen' | 'eraser';

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
  | { kind: 'erase'; pointerId: number; rect: Rect; last: Point; hits: Set<Stroke> };

type DrawingCanvasProps = {
  strokes: readonly Stroke[];
  space: Box;
  tool: DrawingTool;
  color: string;
  width: number;
  label: string;
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
 * Pointer drawing surface. Ink appears on pointer down; the live stroke is a
 * path mutated through a ref so pointer moves never touch React state; the
 * stroke commits once on pointer up or cancel.
 */
export function DrawingCanvas({
  strokes,
  space,
  tool,
  color,
  width,
  label,
  describedBy,
  canAddStroke,
  onAddStrokes,
  onEraseStrokes,
  onBlocked,
}: DrawingCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const liveRef = useRef<SVGPathElement>(null);
  const gestureRef = useRef<Gesture | null>(null);

  // Erasing hides hit paths immediately; React removes them on commit. Any
  // path still hidden afterwards (an undo mid-gesture) becomes visible again.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs after each committed stroke list.
  useLayoutEffect(() => {
    if (gestureRef.current?.kind === 'erase') return;
    for (const path of svgRef.current?.querySelectorAll('path[visibility]') ?? []) {
      path.removeAttribute('visibility');
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
    const pieces = [...gesture.pieces, gesture.trace.commands()];
    onAddStrokes(
      pieces.map((commands) => ({
        color: gesture.color,
        width: gesture.width,
        opacity: null,
        commands,
      })),
    );
    liveRef.current?.removeAttribute('d');
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
      liveRef.current?.setAttribute('stroke', color);
      liveRef.current?.setAttribute('stroke-width', String(width));
      showLive(gesture);
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

  return (
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
  );
}
