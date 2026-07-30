import { describe, expect, it } from 'vitest';

import { closedDraft, draftReducer, hasUnsavedDraft } from '@/features/notes/draft-controller';

describe('draft controller', () => {
  it('preserves rejected text and clears dirty state only after success', () => {
    const opened = draftReducer(closedDraft, { type: 'open', noteId: 'note', body: 'old' });
    const changed = draftReducer(opened, { type: 'change', value: 'new' });
    const failed = draftReducer(changed, {
      type: 'failed',
      errorKey: 'workspace_error_stale_revision',
    });
    expect(failed.value).toBe('new');
    expect(hasUnsavedDraft(failed)).toBe(true);
    expect(draftReducer(failed, { type: 'saved', body: 'new' }).status).toBe('idle');
  });

  it('reverts only the current draft', () => {
    const changed = draftReducer(
      draftReducer(closedDraft, { type: 'open', noteId: 'note', body: 'original' }),
      { type: 'change', value: 'changed' },
    );
    expect(draftReducer(changed, { type: 'revert' }).value).toBe('original');
  });
});
