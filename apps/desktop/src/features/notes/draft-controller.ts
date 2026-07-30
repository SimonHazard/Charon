export type DraftState = {
  noteId: string | null;
  original: string;
  value: string;
  status: 'idle' | 'dirty' | 'saving' | 'error';
  errorKey: string | null;
};

export type DraftAction =
  | { type: 'open'; noteId: string; body: string }
  | { type: 'change'; value: string }
  | { type: 'saving' }
  | { type: 'saved'; body: string }
  | { type: 'failed'; errorKey: string }
  | { type: 'revert' }
  | { type: 'close' };

export const closedDraft: DraftState = {
  noteId: null,
  original: '',
  value: '',
  status: 'idle',
  errorKey: null,
};

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case 'open':
      return {
        noteId: action.noteId,
        original: action.body,
        value: action.body,
        status: 'idle',
        errorKey: null,
      };
    case 'change':
      return {
        ...state,
        value: action.value,
        status: action.value === state.original ? 'idle' : 'dirty',
        errorKey: null,
      };
    case 'saving':
      return { ...state, status: 'saving', errorKey: null };
    case 'saved':
      return {
        ...state,
        original: action.body,
        value: action.body,
        status: 'idle',
        errorKey: null,
      };
    case 'failed':
      return { ...state, status: 'error', errorKey: action.errorKey };
    case 'revert':
      return { ...state, value: state.original, status: 'idle', errorKey: null };
    case 'close':
      return closedDraft;
  }
}

export function hasUnsavedDraft(state: DraftState): boolean {
  return state.value !== state.original;
}
