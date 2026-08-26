import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import { NoteRow } from '@/features/notes/note-row';
import { note } from '@/test/workspace-fixture';

const renderCount = vi.hoisted(() => vi.fn());

vi.mock('@/app/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/providers')>();
  return {
    ...actual,
    useMessages: () => {
      renderCount();
      return actual.useMessages();
    },
  };
});

const allTags: readonly string[] = [];
const callbacks = {
  onCopy: vi.fn().mockResolvedValue(undefined),
  onToggleStatus: vi.fn().mockResolvedValue(undefined),
  onExpand: vi.fn(),
  onFocusAttachments: vi.fn().mockResolvedValue(undefined),
  onCloseEditor: vi.fn(),
  onTagFilter: vi.fn(),
  onDelete: vi.fn(),
  onSave: vi.fn().mockResolvedValue(undefined),
  onSetTags: vi.fn().mockResolvedValue(undefined),
  onAddAttachments: vi.fn().mockResolvedValue(undefined),
  onRemoveAttachment: vi.fn().mockResolvedValue(undefined),
  onRetryCleanup: vi.fn().mockResolvedValue(undefined),
  onDirtyChange: vi.fn(),
};

describe('NoteRow render scope', () => {
  beforeEach(() => {
    renderCount.mockClear();
  });

  it('bails out when a parent snapshot changes but the Note identity stays stable', () => {
    const stableNote = note({ id: 'stable', body: 'Untouched Note' });
    const row = (item = stableNote) => (
      <NoteRow {...callbacks} allTags={allTags} copyState={null} expanded={false} note={item} />
    );
    const view = render(<AppProviders>{row()}</AppProviders>);

    view.rerender(<AppProviders>{row()}</AppProviders>);
    expect(renderCount).toHaveBeenCalledTimes(1);

    view.rerender(<AppProviders>{row({ ...stableNote, body: 'Changed Note' })}</AppProviders>);
    expect(renderCount).toHaveBeenCalledTimes(2);
  });
});
