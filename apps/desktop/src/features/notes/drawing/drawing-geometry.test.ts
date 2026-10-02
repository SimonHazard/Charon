import { describe, expect, it } from 'vitest';

import {
  DRAWING_SPACE,
  formatPathData,
  type Stroke,
} from '@/features/notes/drawing/drawing-format';
import {
  clientToDrawing,
  MAX_TRACE_POINTS,
  StrokeTrace,
  segmentDistance,
  smoothStroke,
  strokeHit,
} from '@/features/notes/drawing/drawing-geometry';
import {
  createDrawingHistory,
  drawingHistoryReducer,
  hasDrawingChanges,
} from '@/features/notes/drawing/drawing-history';

const rect = { left: 10, top: 20, width: 480, height: 300 };

describe('drawing geometry', () => {
  it('maps client positions into the logical space and clamps them', () => {
    expect(clientToDrawing(10, 20, rect, DRAWING_SPACE)).toEqual({ x: 0, y: 0 });
    expect(clientToDrawing(250, 170, rect, DRAWING_SPACE)).toEqual({ x: 480, y: 300 });
    expect(clientToDrawing(10.03, 20, rect, DRAWING_SPACE)).toEqual({ x: 0.1, y: 0 });
    expect(clientToDrawing(-50, 999, rect, DRAWING_SPACE)).toEqual({ x: 0, y: 600 });
    expect(clientToDrawing(0, 0, { ...rect, width: 0 }, DRAWING_SPACE)).toBeNull();
    // A taller box letterboxes the 16:10 space vertically (xMidYMid meet).
    expect(clientToDrawing(10, 70, { ...rect, height: 400 }, DRAWING_SPACE)).toEqual({
      x: 0,
      y: 0,
    });
  });

  it('smooths through midpoints and turns one point into a dot', () => {
    expect(formatPathData(smoothStroke([{ x: 3, y: 4 }]))).toBe('M3 4L3 4');
    expect(
      formatPathData(
        smoothStroke([
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ]),
      ),
    ).toBe('M0 0L10 0');
    expect(
      formatPathData(
        smoothStroke([
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 21, y: 10 },
        ]),
      ),
    ).toBe('M0 0Q10 0 10 5Q10 10 15.5 10L21 10');
  });

  it('drops points closer than 1.5 units and keeps live data equal to the commit', () => {
    const trace = new StrokeTrace({ x: 0, y: 0 });
    expect(trace.data()).toBe('M0 0L0 0');
    expect(trace.add({ x: 1, y: 1 })).toBe(false);
    expect(trace.add({ x: 10, y: 0 })).toBe(true);
    expect(trace.add({ x: 10, y: 10 })).toBe(true);
    expect(trace.add({ x: 21, y: 10 })).toBe(true);
    expect(trace.data()).toBe(formatPathData(trace.commands()));
    expect(trace.full).toBe(false);
    for (let index = 0; trace.points.length < MAX_TRACE_POINTS; index += 1) {
      trace.add({ x: 30 + 2 * (index % 400), y: 3 * Math.floor(index / 400) });
    }
    expect(trace.full).toBe(true);
    expect(trace.data()).toBe(formatPathData(trace.commands()));
  });

  it('measures segment distances, including crossings', () => {
    expect(
      segmentDistance({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }),
    ).toBe(0);
    expect(segmentDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 3 }, { x: 5, y: 3 })).toBe(
      3,
    );
    expect(segmentDistance({ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 3, y: 4 }, { x: 3, y: 4 })).toBe(5);
  });

  it('hits a stroke within half its width plus six units of the eraser path', () => {
    const stroke: Stroke = {
      color: 'currentColor',
      width: 4,
      opacity: null,
      commands: [
        { op: 'M', x: 100, y: 100 },
        { op: 'L', x: 200, y: 100 },
      ],
    };
    expect(strokeHit(stroke, { x: 150, y: 108 }, { x: 150, y: 108 })).toBe(true);
    expect(strokeHit(stroke, { x: 150, y: 108.5 }, { x: 150, y: 108.5 })).toBe(false);
    // A fast swipe across the stroke between two samples still erases it.
    expect(strokeHit(stroke, { x: 150, y: 50 }, { x: 150, y: 150 })).toBe(true);
    const dot: Stroke = {
      ...stroke,
      commands: [
        { op: 'M', x: 5, y: 5 },
        { op: 'L', x: 5, y: 5 },
      ],
    };
    expect(strokeHit(dot, { x: 12, y: 5 }, { x: 12, y: 5 })).toBe(true);
    expect(strokeHit(dot, { x: 40, y: 40 }, { x: 60, y: 60 })).toBe(false);
  });
});

describe('drawing history', () => {
  const a: Stroke = {
    color: 'currentColor',
    width: 2,
    opacity: null,
    commands: [{ op: 'M', x: 1, y: 1 }],
  };
  const b: Stroke = { ...a, width: 4 };
  const c: Stroke = { ...a, width: 8 };

  it('adds, erases, clears, undoes, and redoes with one entry per action', () => {
    let state = createDrawingHistory([a]);
    expect(hasDrawingChanges(state)).toBe(false);
    state = drawingHistoryReducer(state, { type: 'add', strokes: [b, c] });
    expect(state.strokes).toEqual([a, b, c]);
    state = drawingHistoryReducer(state, { type: 'erase', strokes: new Set([a, c]) });
    expect(state.strokes).toEqual([b]);
    state = drawingHistoryReducer(state, { type: 'clear' });
    expect(state.strokes).toEqual([]);
    expect(hasDrawingChanges(state)).toBe(true);
    state = drawingHistoryReducer(state, { type: 'undo' });
    expect(state.strokes).toEqual([b]);
    state = drawingHistoryReducer(state, { type: 'undo' });
    state = drawingHistoryReducer(state, { type: 'undo' });
    expect(state.strokes).toEqual([a]);
    expect(hasDrawingChanges(state)).toBe(false);
    expect(drawingHistoryReducer(state, { type: 'undo' })).toBe(state);
    state = drawingHistoryReducer(state, { type: 'redo' });
    expect(state.strokes).toEqual([a, b, c]);
    expect(state.future).toHaveLength(2);
    state = drawingHistoryReducer(state, { type: 'add', strokes: [a] });
    expect(state.future).toHaveLength(0);
    expect(drawingHistoryReducer(state, { type: 'redo' })).toBe(state);
  });

  it('ignores no-op actions so they cannot pollute undo', () => {
    const state = createDrawingHistory([]);
    expect(drawingHistoryReducer(state, { type: 'clear' })).toBe(state);
    expect(drawingHistoryReducer(state, { type: 'add', strokes: [] })).toBe(state);
    expect(drawingHistoryReducer(state, { type: 'erase', strokes: new Set([a]) })).toBe(state);
  });
});
