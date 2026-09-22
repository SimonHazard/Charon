import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspace, WorkspaceProvider } from '@/app/workspace-context';
import type { CaptureCapabilities } from '@/bindings/capture';
import { NativePreferencesProvider } from '@/features/preferences/preferences-context';
import type { CaptureClient } from '@/lib/ipc/capture-client';
import type { NativePreferencesClient } from '@/lib/ipc/preferences-client';
import { snapshot, workspaceClient } from '@/test/workspace-fixture';
import type { UpdateCandidate, UpdateClient } from './update-client';
import { UpdateProvider, useUpdates } from './update-context';

function candidate(overrides: Partial<UpdateCandidate> = {}): UpdateCandidate {
  return {
    version: '0.1.0',
    notes: 'Small factual release notes.',
    download: vi.fn(async (onProgress) => {
      onProgress({ type: 'started', totalBytes: 100 });
      onProgress({ type: 'progress', chunkBytes: 40 });
      onProgress({ type: 'progress', chunkBytes: 60 });
      onProgress({ type: 'finished' });
    }),
    install: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function client(result: UpdateCandidate | null = null): UpdateClient {
  return {
    check: vi.fn().mockResolvedValue(result),
    relaunch: vi.fn().mockResolvedValue(undefined),
  };
}

const captureCapabilities: CaptureCapabilities = {
  platform: 'macos',
  standardShortcut: 'available',
  inputMonitoring: 'available',
  accessibility: 'available',
  doubleShift: 'available',
  selectedText: 'available',
  activeShortcut: 'CmdOrCtrl+Shift+Space',
};

function nativeClients(installKind: string): {
  captureClient: CaptureClient;
  preferencesClient: NativePreferencesClient;
} {
  return {
    captureClient: {
      capabilities: vi.fn().mockResolvedValue(captureCapabilities),
      open: vi.fn().mockResolvedValue(captureCapabilities),
      requestPermission: vi.fn().mockResolvedValue(captureCapabilities),
      composerReady: vi.fn().mockResolvedValue(undefined),
      subscribeComposerFocus: vi.fn().mockResolvedValue(() => undefined),
      subscribeStatus: vi.fn().mockResolvedValue(() => undefined),
    },
    preferencesClient: {
      read: vi.fn().mockResolvedValue({
        schemaVersion: 1,
        workspaceName: null,
        hasRememberedWorkspace: false,
        installKind,
      }),
      reset: vi.fn(),
    },
  };
}

function Harness() {
  const updates = useUpdates();
  const workspace = useWorkspace();
  return (
    <div>
      <output>{updates.status}</output>
      <output>{String(updates.canSelfUpdate)}</output>
      <output>{updates.version}</output>
      <output>{updates.downloadedBytes}</output>
      <button onClick={() => updates.setEnabled(true)} type="button">
        enable
      </button>
      <button onClick={() => void updates.checkNow()} type="button">
        check
      </button>
      <button onClick={() => void updates.downloadAndInstall()} type="button">
        install
      </button>
      <button onClick={() => void updates.restart()} type="button">
        restart
      </button>
      <button onClick={() => workspace.setWorkspaceSwitchBlocked(true)} type="button">
        dirty
      </button>
      <button onClick={() => workspace.setWorkspaceSwitchBlocked(false)} type="button">
        clean
      </button>
    </div>
  );
}

function renderUpdates(updateClient: UpdateClient, installKind = 'unknown') {
  const native = nativeClients(installKind);
  return render(
    <WorkspaceProvider client={workspaceClient(snapshot())}>
      <NativePreferencesProvider
        captureClient={native.captureClient}
        enabled
        preferencesClient={native.preferencesClient}
      >
        <UpdateProvider client={updateClient} enabled>
          <Harness />
        </UpdateProvider>
      </NativePreferencesProvider>
    </WorkspaceProvider>,
  );
}

describe('signed update flow', () => {
  beforeEach(() => localStorage.clear());

  it('does not make a request while update checks are disabled', async () => {
    const updateClient = client();
    renderUpdates(updateClient);
    await Promise.resolve();
    expect(updateClient.check).not.toHaveBeenCalled();
    expect(screen.getByText('idle')).toBeTruthy();
  });

  it('checks only after opt-in and reports no update', async () => {
    const updateClient = client();
    renderUpdates(updateClient);
    await userEvent.click(screen.getByRole('button', { name: 'enable' }));
    await waitFor(() => expect(screen.getByText('noUpdate')).toBeTruthy());
    expect(updateClient.check).toHaveBeenCalledTimes(1);
  });

  it('downloads with progress, installs explicitly, and waits for clean drafts to restart', async () => {
    const available = candidate();
    const updateClient = client(available);
    renderUpdates(updateClient);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'enable' }));
    await waitFor(() => expect(screen.getByText('available')).toBeTruthy());
    expect(screen.getByText('0.1.0')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'install' }));
    await waitFor(() => expect(screen.getByText('ready')).toBeTruthy());
    expect(available.download).toHaveBeenCalledTimes(1);
    expect(available.install).toHaveBeenCalledTimes(1);
    expect(screen.getByText('100')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'dirty' }));
    await user.click(screen.getByRole('button', { name: 'restart' }));
    expect(updateClient.relaunch).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'clean' }));
    await user.click(screen.getByRole('button', { name: 'restart' }));
    expect(updateClient.relaunch).toHaveBeenCalledTimes(1);
  });

  it('keeps rejected checks and signature or download failures contextual', async () => {
    const rejectedClient: UpdateClient = {
      check: vi.fn().mockRejectedValue(new Error('offline')),
      relaunch: vi.fn(),
    };
    const first = renderUpdates(rejectedClient);
    await userEvent.click(screen.getByRole('button', { name: 'enable' }));
    await waitFor(() => expect(screen.getByText('error')).toBeTruthy());
    first.unmount();
    localStorage.clear();

    const invalid = candidate({ download: vi.fn().mockRejectedValue(new Error('signature')) });
    renderUpdates(client(invalid));
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'enable' }));
    await waitFor(() => expect(screen.getByText('available')).toBeTruthy());
    await user.click(screen.getByRole('button', { name: 'install' }));
    await waitFor(() => expect(screen.getByText('error')).toBeTruthy());
    expect(invalid.install).not.toHaveBeenCalled();
  });

  it.each(['deb', 'rpm', 'msi'])(
    'disables self-install for %s installations while retaining update checks',
    async (installKind) => {
      const updateClient = client(candidate());
      renderUpdates(updateClient, installKind);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'enable' }));
      await waitFor(() => expect(screen.getByText('available')).toBeTruthy());
      expect(screen.getByText('false')).toBeTruthy();
      await user.click(screen.getByRole('button', { name: 'install' }));
      expect(screen.getByText('available')).toBeTruthy();
      expect(updateClient.check).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['appimage', 'nsis', 'macos', 'unknown'])(
    'allows self-install for %s installations',
    async (installKind) => {
      const updateClient = client(candidate());
      renderUpdates(updateClient, installKind);
      const user = userEvent.setup();
      await user.click(screen.getByRole('button', { name: 'enable' }));
      await waitFor(() => expect(screen.getByText('available')).toBeTruthy());
      expect(screen.getByText('true')).toBeTruthy();
    },
  );
});
