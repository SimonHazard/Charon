import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AppProviders } from '@/app/providers';
import { WorkspaceProvider } from '@/app/workspace-context';
import { shellLayout } from '@/components/app-shell';
import { WorkspaceState } from '@/components/workspace-state';
import type { WorkspaceClient } from '@/lib/ipc/workspace-client';
import { Route as IndexRoute } from '@/routes/index';

describe('shell states', () => {
  it('keeps the root redirect in the shell verification boundary', () => {
    expect(IndexRoute.options.beforeLoad).toBeTypeOf('function');
  });

  it('renders the loading state while the snapshot is pending', () => {
    const client: WorkspaceClient = {
      snapshot: () => new Promise(() => undefined),
      subscribe: async () => () => undefined,
    };
    render(
      <AppProviders>
        <WorkspaceProvider client={client}>
          <WorkspaceState>{() => null}</WorkspaceState>
        </WorkspaceProvider>
      </AppProviders>,
    );
    expect(screen.getByRole('status', { name: 'Loading workspace' })).toBeTruthy();
  });

  it('renders the no-workspace empty state', async () => {
    const client: WorkspaceClient = {
      snapshot: async () => Promise.reject({ code: 'not_open', messageKey: 'x' }),
      subscribe: async () => () => undefined,
    };
    render(
      <AppProviders>
        <WorkspaceProvider client={client}>
          <WorkspaceState>{() => null}</WorkspaceState>
        </WorkspaceProvider>
      </AppProviders>,
    );
    expect(await screen.findByText('Choose a workspace')).toBeTruthy();
  });

  it('renders a blocking error when no valid snapshot exists', async () => {
    const client: WorkspaceClient = {
      snapshot: async () => Promise.reject({ code: 'io', messageKey: 'workspace_error_io' }),
      subscribe: async () => () => undefined,
    };
    render(
      <AppProviders>
        <WorkspaceProvider client={client}>
          <WorkspaceState>{() => null}</WorkspaceState>
        </WorkspaceProvider>
      </AppProviders>,
    );
    expect(await screen.findByText('Workspace unavailable')).toBeTruthy();
    expect(screen.getByText(/local files could not be read or written/i)).toBeTruthy();
  });

  it('defines the 760px rail handoff and fixed 240px desktop rail', () => {
    expect(shellLayout).toEqual({ railWidth: 240, mobileBreakpoint: 760 });
  });
});
