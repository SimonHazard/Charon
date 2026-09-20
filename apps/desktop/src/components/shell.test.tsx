import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AppProviders } from '@/app/providers';
import type { CaptureCapabilities } from '@/bindings/capture';
import { AppShell } from '@/components/app-shell';
import { ShelfActions } from '@/components/shelf-chrome';
import type { CaptureClient } from '@/lib/ipc/capture-client';
import type { NativePreferencesClient } from '@/lib/ipc/preferences-client';

function platformClients(platform: CaptureCapabilities['platform']) {
  const capabilities: CaptureCapabilities = {
    platform,
    standardShortcut: 'available',
    inputMonitoring: platform === 'macos' ? 'denied' : 'unsupported',
    accessibility: platform === 'macos' ? 'denied' : 'unsupported',
    doubleShift: platform === 'macos' ? 'denied' : 'unsupported',
    selectedText: platform === 'macos' ? 'denied' : 'unsupported',
    activeShortcut: 'CmdOrCtrl+Shift+Space',
  };
  const captureClient: CaptureClient = {
    capabilities: async () => capabilities,
    open: async () => capabilities,
    requestPermission: async () => capabilities,
    composerReady: async () => undefined,
    subscribeComposerFocus: async () => () => undefined,
    subscribeStatus: async () => () => undefined,
  };
  const preferencesClient: NativePreferencesClient = {
    read: async () => ({
      schemaVersion: 1,
      workspaceName: null,
      hasRememberedWorkspace: false,
    }),
    reset: async () => ({
      schemaVersion: 1,
      workspaceName: null,
      hasRememberedWorkspace: false,
    }),
  };
  return { captureClient, preferencesClient };
}

describe('single shelf shell', () => {
  it('renders one main landmark without navigation, rail, inspector, or footer', () => {
    render(
      <AppProviders>
        <AppShell>
          <p>content</p>
        </AppShell>
      </AppProviders>,
    );
    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(document.querySelector('.section-rail')).toBeNull();
    expect(document.querySelector('.context-inspector')).toBeNull();
    expect(document.querySelector('footer')).toBeNull();
  });

  it('keeps native drag chrome compact and opens ordinary Help as an anchored Popover', async () => {
    const user = userEvent.setup();
    const native = platformClients('macos');
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
      >
        <AppShell>
          <ShelfActions />
        </AppShell>
      </AppProviders>,
    );

    const dragRegion = document.querySelector('.window-drag-region');
    expect(dragRegion?.getAttribute('data-tauri-drag-region')).not.toBeNull();
    expect(dragRegion?.children).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Keyboard shortcuts' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(await screen.findByText('Capture text')).toBeTruthy();
    expect(screen.getByText('Shift Shift').tagName).toBe('KBD');
    expect(screen.getByText('⌘ + Shift + Space').tagName).toBe('KBD');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('uses the native Windows title bar without reserving a second drag region', async () => {
    const native = platformClients('windows');
    render(
      <AppProviders {...native}>
        <AppShell>
          <p>content</p>
        </AppShell>
      </AppProviders>,
    );
    await waitFor(() =>
      expect(document.querySelector('.desktop-shell')?.hasAttribute('data-native-titlebar')).toBe(
        true,
      ),
    );
    expect(document.querySelector('.window-drag-region')).toBeNull();
  });

  it('shows the portable fallback and Ctrl shortcut on Windows', async () => {
    const user = userEvent.setup();
    const native = platformClients('windows');
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
      >
        <ShelfActions />
      </AppProviders>,
    );

    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(await screen.findByText('Ctrl + Shift + Space')).toBeTruthy();
    expect(screen.queryByText('Shift Shift')).toBeNull();
    expect(screen.getByText(/Selected-text capture is not claimed/)).toBeTruthy();
  });
});
