import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppProviders } from '@/app/providers';
import { WorkspaceState } from '@/components/workspace-state';
import type { WorkspaceClient } from '@/lib/ipc/workspace-client';
import { snapshot } from '@/test/workspace-fixture';

describe('compact Workspace states', () => {
  it('uses toolbar and bounded-row skeletons while loading', () => {
    const client: WorkspaceClient = {
      snapshot: () => new Promise(() => undefined),
      subscribe: async () => () => undefined,
    };
    render(
      <AppProviders workspaceClient={client}>
        <WorkspaceState>{() => <p>ready</p>}</WorkspaceState>
      </AppProviders>,
    );
    expect(screen.getByRole('status', { name: 'Loading workspace' })).toBeTruthy();
    expect(document.querySelectorAll('.workspace-loading-row')).toHaveLength(2);
    expect(screen.queryByText('ready')).toBeNull();
  });

  it('keeps a startup failure contextual with retry, chooser, and default actions', async () => {
    const issue = {
      code: 'invalid_manifest',
      messageKey: 'workspace_error_invalid_manifest',
      expectedRevision: null,
      actualRevision: null,
      recoveryLocation: null,
    } as const;
    const client: WorkspaceClient = {
      snapshot: vi.fn().mockRejectedValue(issue),
      bootstrap: vi.fn().mockRejectedValue(issue),
      bootstrapDefault: vi.fn().mockResolvedValue(snapshot()),
      chooseDirectory: vi.fn().mockResolvedValue(null),
      openOrCreate: vi.fn().mockResolvedValue(snapshot()),
      subscribe: async () => () => undefined,
    };
    render(
      <AppProviders workspaceClient={client}>
        <WorkspaceState>{() => <p>ready</p>}</WorkspaceState>
      </AppProviders>,
    );
    await waitFor(() => expect(screen.getByText(/manifest is invalid/i)).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Choose folder' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use Documents/Charon' })).toBeTruthy();
  });
});
