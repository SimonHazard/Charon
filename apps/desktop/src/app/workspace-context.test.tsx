import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import type { WorkspaceCommand, WorkspaceSnapshot } from '@/bindings/workspace';
import type { WorkspaceClient } from '@/lib/ipc/workspace-client';
import { note, snapshot } from '@/test/workspace-fixture';

function CommandHarness() {
  const workspace = useWorkspace();
  return (
    <button
      disabled={!workspace.snapshot}
      onClick={() => {
        void workspace.executeWorkspaceCommand({
          type: 'updateNote',
          noteId: 'note',
          body: 'body',
        });
        void workspace.executeWorkspaceCommand({
          type: 'setNoteTags',
          noteId: 'note',
          tags: ['Agent'],
        });
      }}
      type="button"
    >
      run
    </button>
  );
}

describe('workspace command queue', () => {
  it('serializes body and metadata writes against each acknowledged revision', async () => {
    const user = userEvent.setup();
    let current = snapshot([note({ id: 'note', body: 'initial' })]);
    const seen: WorkspaceCommand[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const client: WorkspaceClient = {
      snapshot: async () => current,
      subscribe: async () => () => undefined,
      execute: vi.fn(async (command) => {
        seen.push(command);
        if (seen.length === 1) await firstBlocked;
        current = { ...current, revision: current.revision + 1 } as WorkspaceSnapshot;
        return { snapshot: current, transactionId: `tx-${current.revision}` };
      }),
    };
    render(
      <AppProviders workspaceClient={client}>
        <CommandHarness />
      </AppProviders>,
    );
    const button = screen.getByRole('button', { name: 'run' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    await user.click(button);
    await waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]?.expectedRevision).toBe(1);
    releaseFirst?.();
    await waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]?.expectedRevision).toBe(2);
  });
});
