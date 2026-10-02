import type { Stroke } from '@/features/notes/drawing/drawing-format';

/** Snapshots share Stroke objects, so undo depth costs references only. */
export type DrawingHistory = {
  initial: readonly Stroke[];
  strokes: readonly Stroke[];
  past: readonly (readonly Stroke[])[];
  future: readonly (readonly Stroke[])[];
};

export type DrawingHistoryAction =
  | { type: 'add'; strokes: readonly Stroke[] }
  | { type: 'erase'; strokes: ReadonlySet<Stroke> }
  | { type: 'clear' }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 500;

export function createDrawingHistory(strokes: readonly Stroke[]): DrawingHistory {
  return { initial: strokes, strokes, past: [], future: [] };
}

function commit(state: DrawingHistory, strokes: readonly Stroke[]): DrawingHistory {
  if (strokes === state.strokes) return state;
  return {
    ...state,
    strokes,
    past: [...state.past, state.strokes].slice(-HISTORY_LIMIT),
    future: [],
  };
}

export function drawingHistoryReducer(
  state: DrawingHistory,
  action: DrawingHistoryAction,
): DrawingHistory {
  switch (action.type) {
    case 'add':
      return action.strokes.length ? commit(state, [...state.strokes, ...action.strokes]) : state;
    case 'erase': {
      const remaining = state.strokes.filter((stroke) => !action.strokes.has(stroke));
      return remaining.length === state.strokes.length ? state : commit(state, remaining);
    }
    case 'clear':
      return state.strokes.length ? commit(state, []) : state;
    case 'undo': {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        strokes: previous,
        past: state.past.slice(0, -1),
        future: [state.strokes, ...state.future],
      };
    }
    case 'redo': {
      const [next, ...future] = state.future;
      if (!next) return state;
      return { ...state, strokes: next, past: [...state.past, state.strokes], future };
    }
    default: {
      const unexpected: never = action;
      return unexpected;
    }
  }
}

/** Unsaved means the visible strokes differ from what the session opened with. */
export function hasDrawingChanges(state: DrawingHistory): boolean {
  return state.strokes !== state.initial;
}
