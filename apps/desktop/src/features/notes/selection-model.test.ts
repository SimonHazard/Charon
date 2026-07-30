import { describe, expect, it } from 'vitest';

import { emptySelection, selectionReducer } from '@/features/notes/selection-model';

const visible = ['a', 'b', 'c', 'd'];

describe('selection model', () => {
  it('keeps focus separate from selection and supports toggle', () => {
    const focused = selectionReducer(emptySelection, { type: 'activate', id: 'b' });
    expect(focused.selectedIds).toEqual([]);
    const selected = selectionReducer(focused, { type: 'toggleActive', visibleIds: visible });
    expect(selected).toEqual({ activeId: 'b', anchorId: 'b', selectedIds: ['b'] });
  });

  it('extends ordered ranges with keyboard movement in both directions', () => {
    const anchored = selectionReducer(emptySelection, {
      type: 'click',
      id: 'c',
      visibleIds: visible,
      toggle: false,
      extend: false,
    });
    const down = selectionReducer(anchored, {
      type: 'move',
      direction: 1,
      visibleIds: visible,
      extend: true,
    });
    expect(down.selectedIds).toEqual(['c', 'd']);
    const up = selectionReducer(down, {
      type: 'move',
      direction: -1,
      visibleIds: visible,
      extend: true,
    });
    expect(up.selectedIds).toEqual(['c']);
  });

  it('supports click, modifier toggle, shift click, and select all visible', () => {
    const one = selectionReducer(emptySelection, {
      type: 'click',
      id: 'b',
      visibleIds: visible,
      toggle: false,
      extend: false,
    });
    const toggled = selectionReducer(one, {
      type: 'click',
      id: 'd',
      visibleIds: visible,
      toggle: true,
      extend: false,
    });
    expect(toggled.selectedIds).toEqual(['b', 'd']);
    const extended = selectionReducer(one, {
      type: 'click',
      id: 'd',
      visibleIds: visible,
      toggle: false,
      extend: true,
    });
    expect(extended.selectedIds).toEqual(['b', 'c', 'd']);
    expect(
      selectionReducer(one, { type: 'selectAllVisible', visibleIds: ['b', 'd'] }).selectedIds,
    ).toEqual(['b', 'd']);
  });

  it('reconciles filters, deleted anchors, and empty lists', () => {
    const selected = { activeId: 'c', anchorId: 'b', selectedIds: ['a', 'b', 'c'] };
    expect(selectionReducer(selected, { type: 'reconcile', visibleIds: ['a', 'c'] })).toEqual({
      activeId: 'c',
      anchorId: 'c',
      selectedIds: ['a', 'c'],
    });
    expect(selectionReducer(selected, { type: 'reconcile', visibleIds: [] })).toEqual(
      emptySelection,
    );
  });
});
