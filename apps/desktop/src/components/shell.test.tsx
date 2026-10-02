import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AppProviders } from '@/app/providers';
import type { CaptureCapabilities } from '@/bindings/capture';
import type { PreferencesSnapshot } from '@/bindings/preferences';
import { AppShell } from '@/components/app-shell';
import { ShelfActions } from '@/components/shelf-chrome';
import type { CaptureClient } from '@/lib/ipc/capture-client';
import type { NativePreferencesClient } from '@/lib/ipc/preferences-client';

function platformClients(
  platform: CaptureCapabilities['platform'],
  activeShortcut = platform === 'windows' || platform === 'linuxX11' || platform === 'linuxWayland'
    ? 'Alt+Shift+Space'
    : 'CmdOrCtrl+Shift+Space',
) {
  const capabilities: CaptureCapabilities = {
    platform,
    standardShortcut: 'available',
    inputMonitoring: platform === 'macos' ? 'denied' : 'unsupported',
    accessibility: platform === 'macos' ? 'denied' : 'unsupported',
    doubleShift: platform === 'macos' ? 'denied' : 'unsupported',
    selectedText: platform === 'macos' ? 'denied' : 'unsupported',
    activeShortcut,
    defaultShortcut: platform === 'macos' ? 'CmdOrCtrl+Shift+Space' : 'Alt+Shift+Space',
    shortcutOrigin: platform === 'linuxWayland' ? 'desktop' : 'default',
    shortcutConfigurable: platform !== 'linuxWayland',
    richCapture: platform === 'macos' ? 'experimental' : 'unsupported',
  };
  const captureClient: CaptureClient = {
    capabilities: async () => capabilities,
    open: async () => capabilities,
    requestPermission: async () => capabilities,
    setShortcut: async () => capabilities,
    composerReady: async () => undefined,
    subscribeComposerFocus: async () => () => undefined,
    subscribeStatus: async () => () => undefined,
  };
  const preferences: PreferencesSnapshot = {
    schemaVersion: 1,
    workspaceName: null,
    hasRememberedWorkspace: false,
    installKind: 'unknown',
    backgroundMode: false,
    trayAvailability: platform === 'macos' || platform === 'windows' ? 'available' : 'unavailable',
    backgroundActive: false,
    captureNotifications: false,
    richCapture: false,
  };
  const preferencesClient: NativePreferencesClient = {
    read: async () => preferences,
    reset: async () => preferences,
    setBackgroundMode: async () => preferences,
    setCaptureNotifications: async () => preferences,
    setRichCapture: async () => preferences,
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
    expect(screen.getByText('⌘ + ⇧ + Space').tagName).toBe('KBD');
    const notes = screen.getByRole('region', { name: 'Notes' });
    expect(within(notes).getByRole('heading', { name: 'Notes' })).toBeTruthy();
    expect(
      within(notes)
        .getAllByText(/^(⌘ \+ C|⌘ \+ S|Home|End|Page Up|Page Down|Esc)$/u)
        .map((key) => [key.tagName, key.textContent]),
    ).toEqual(
      ['⌘ + C', '⌘ + S', 'Home', 'End', 'Page Up', 'Page Down', 'Esc'].map((key) => ['KBD', key]),
    );
    expect(within(notes).getByText(/Managed local attachment paths are included/)).toBeTruthy();
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

  it('shows the portable fallback and registered Alt shortcut on Windows', async () => {
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
    expect(await screen.findByText('Alt + Shift + Space')).toBeTruthy();
    expect(screen.queryByText(/Ctrl \+ Shift \+ Space/)).toBeNull();
    expect(screen.getByText('Ctrl + C').tagName).toBe('KBD');
    expect(screen.getByText('Ctrl + S').tagName).toBe('KBD');
    expect(screen.queryByText('Shift Shift')).toBeNull();
    expect(screen.getByText(/Selected-text capture is not claimed/)).toBeTruthy();
  });

  it('shows the registered Alt shortcut on Linux X11', async () => {
    const user = userEvent.setup();
    const native = platformClients('linuxX11');
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
      >
        <ShelfActions />
      </AppProviders>,
    );

    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(await screen.findByText('Alt + Shift + Space')).toBeTruthy();
  });

  it.each([
    ['macos', 'Cmd+Ctrl+N', '⌘ + ⌃ + N'],
    ['windows', 'Super+Alt+F9', 'Win + Alt + F9'],
    ['linuxX11', 'Ctrl+Alt+Shift+7', 'Ctrl + Alt + Shift + 7'],
  ] as const)(
    'shows the chosen composer shortcut in Help on %s',
    async (platform, active, label) => {
      const user = userEvent.setup();
      const native = platformClients(platform, active);
      render(
        <AppProviders
          captureClient={native.captureClient}
          preferencesClient={native.preferencesClient}
        >
          <ShelfActions />
        </AppProviders>,
      );

      await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
      expect((await screen.findByText(label)).tagName).toBe('KBD');
      expect(screen.queryByText(/Shift \+ Space|⇧ \+ Space/)).toBeNull();
    },
  );

  it('shows the portal fallback when Wayland has not assigned a shortcut', async () => {
    const user = userEvent.setup();
    const native = platformClients('linuxWayland', '');
    render(
      <AppProviders
        captureClient={native.captureClient}
        preferencesClient={native.preferencesClient}
      >
        <ShelfActions />
      </AppProviders>,
    );

    await user.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(await screen.findByText('System shortcut')).toBeTruthy();
  });
});
