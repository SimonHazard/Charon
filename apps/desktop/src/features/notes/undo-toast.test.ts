import { describe, expect, it, vi } from 'vitest';

import { createUndoHandler } from '@/features/notes/undo-toast';

describe('undo toast', () => {
  it('executes undo exactly once under rapid repeated input', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const action = vi.fn(() => gate);
    const undo = createUndoHandler(action);
    undo();
    undo();
    undo();
    expect(action).toHaveBeenCalledTimes(1);
    release?.();
    await gate;
  });
});
