export type SelectionState = {
  activeId: string | null;
  anchorId: string | null;
  selectedIds: string[];
};

export type SelectionAction =
  | { type: 'reconcile'; visibleIds: readonly string[] }
  | { type: 'activate'; id: string | null }
  | { type: 'click'; id: string; visibleIds: readonly string[]; toggle: boolean; extend: boolean }
  | { type: 'move'; direction: -1 | 1; visibleIds: readonly string[]; extend: boolean }
  | { type: 'toggleActive'; visibleIds: readonly string[] }
  | { type: 'selectAllVisible'; visibleIds: readonly string[] }
  | { type: 'clear' };

export const emptySelection: SelectionState = {
  activeId: null,
  anchorId: null,
  selectedIds: [],
};

function ordered(ids: Iterable<string>, visibleIds: readonly string[]): string[] {
  const set = ids instanceof Set ? ids : new Set(ids);
  return visibleIds.filter((id) => set.has(id));
}

function range(anchorId: string, targetId: string, visibleIds: readonly string[]): string[] {
  const anchor = visibleIds.indexOf(anchorId);
  const target = visibleIds.indexOf(targetId);
  if (anchor < 0 || target < 0) return [targetId];
  const start = Math.min(anchor, target);
  const end = Math.max(anchor, target);
  return visibleIds.slice(start, end + 1);
}

export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case 'clear':
      return { ...state, anchorId: state.activeId, selectedIds: [] };
    case 'activate':
      return { ...state, activeId: action.id };
    case 'reconcile': {
      const visible = new Set(action.visibleIds);
      const activeId =
        state.activeId && visible.has(state.activeId)
          ? state.activeId
          : (action.visibleIds[0] ?? null);
      const anchorId = state.anchorId && visible.has(state.anchorId) ? state.anchorId : activeId;
      return {
        activeId,
        anchorId,
        selectedIds: ordered(state.selectedIds, action.visibleIds),
      };
    }
    case 'click': {
      if (action.extend) {
        const anchorId =
          state.anchorId && action.visibleIds.includes(state.anchorId)
            ? state.anchorId
            : (state.activeId ?? action.id);
        return {
          activeId: action.id,
          anchorId,
          selectedIds: range(anchorId, action.id, action.visibleIds),
        };
      }
      if (action.toggle) {
        const selected = new Set(state.selectedIds);
        if (selected.has(action.id)) selected.delete(action.id);
        else selected.add(action.id);
        return {
          activeId: action.id,
          anchorId: action.id,
          selectedIds: ordered(selected, action.visibleIds),
        };
      }
      return { activeId: action.id, anchorId: action.id, selectedIds: [action.id] };
    }
    case 'move': {
      if (action.visibleIds.length === 0) return emptySelection;
      const currentIndex = state.activeId ? action.visibleIds.indexOf(state.activeId) : -1;
      const nextIndex = Math.max(
        0,
        Math.min(
          action.visibleIds.length - 1,
          currentIndex < 0 ? 0 : currentIndex + action.direction,
        ),
      );
      const activeId = action.visibleIds[nextIndex] as string;
      if (!action.extend) return { ...state, activeId };
      const anchorId =
        state.anchorId && action.visibleIds.includes(state.anchorId)
          ? state.anchorId
          : (state.activeId ?? activeId);
      return { activeId, anchorId, selectedIds: range(anchorId, activeId, action.visibleIds) };
    }
    case 'toggleActive': {
      if (!state.activeId) return state;
      const selected = new Set(state.selectedIds);
      if (selected.has(state.activeId)) selected.delete(state.activeId);
      else selected.add(state.activeId);
      return {
        ...state,
        anchorId: state.activeId,
        selectedIds: ordered(selected, action.visibleIds),
      };
    }
    case 'selectAllVisible':
      return {
        activeId: state.activeId ?? action.visibleIds[0] ?? null,
        anchorId: action.visibleIds[0] ?? null,
        selectedIds: [...action.visibleIds],
      };
  }
}
