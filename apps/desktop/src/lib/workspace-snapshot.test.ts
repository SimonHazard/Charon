import { describe, expect, it } from 'vitest';

import { reconcileSnapshot } from '@/lib/workspace-snapshot';
import { note, snapshot } from '@/test/workspace-fixture';

const attachment = {
  id: 'attachment-brief',
  fileName: 'brief.pdf',
  relativePath: 'attachments/kept/attachment-brief.pdf',
  createdAt: '2026-08-05T10:00:00.000Z',
};

function workspace(bodies: Record<string, string>, updatedAt = '2026-08-05T10:00:00.000Z') {
  return snapshot(
    Object.entries(bodies).map(([id, body]) =>
      note({ id, body, updatedAt, tags: ['Research'], attachments: [attachment] }),
    ),
  );
}

describe('workspace snapshot reconciliation', () => {
  it('keeps the previous object for every Note the command did not touch', () => {
    const previous = workspace({ kept: 'Untouched', edited: 'Before' });
    const next = {
      ...workspace({ kept: 'Untouched', edited: 'After' }, '2026-08-05T11:00:00.000Z'),
      revision: 2,
    };
    next.notes[0] = previous.notes[0] ? { ...previous.notes[0] } : next.notes[0];

    const merged = reconcileSnapshot(previous, next);

    expect(merged.notes[0]).toBe(previous.notes[0]);
    expect(merged.notes[1]).not.toBe(previous.notes[1]);
    expect(merged.notes[1]?.body).toBe('After');
    expect(merged.revision).toBe(2);
  });

  it('keeps the previous array when the revision moves without any Note change', () => {
    const previous = workspace({ kept: 'Untouched' });
    const next = { ...workspace({ kept: 'Untouched' }), revision: 3 };

    const merged = reconcileSnapshot(previous, next);

    expect(merged.notes).toBe(previous.notes);
    expect(merged.revision).toBe(3);
  });

  it('rebuilds the array when order, membership, or metadata changes', () => {
    const previous = workspace({ first: 'One', second: 'Two' });
    const reordered = snapshot(
      [previous.notes[1], previous.notes[0]].filter((item) => item !== undefined),
    );

    expect(reconcileSnapshot(previous, reordered).notes).not.toBe(previous.notes);

    const tagged = snapshot([note({ id: 'first', body: 'One', tags: ['Research', 'Agent'] })]);
    expect(reconcileSnapshot(previous, tagged).notes[0]).not.toBe(previous.notes[0]);

    const removedAttachment = snapshot([note({ id: 'first', body: 'One', tags: ['Research'] })]);
    expect(reconcileSnapshot(previous, removedAttachment).notes[0]).not.toBe(previous.notes[0]);
  });

  it('returns the incoming Workspace when there is nothing to reconcile against', () => {
    const next = workspace({ only: 'One' });

    expect(reconcileSnapshot(null, next)).toBe(next);
  });
});
