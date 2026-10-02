import type { CaptureCapabilities, CaptureStatusEvent } from '@/bindings/capture';
import type { CaptureClient, CaptureStatusListener } from '@/lib/ipc/capture-client';
import type { NativePreferencesClient } from '@/lib/ipc/preferences-client';

/** Native clients whose capture statuses a test emits as Rust would. */
export function captureClients(): {
  captureClient: CaptureClient;
  preferencesClient: NativePreferencesClient;
  emitStatus(status: CaptureStatusEvent): void;
} {
  const capabilities: CaptureCapabilities = {
    platform: 'macos',
    standardShortcut: 'available',
    inputMonitoring: 'available',
    accessibility: 'available',
    doubleShift: 'available',
    selectedText: 'available',
    activeShortcut: 'CmdOrCtrl+Shift+Space',
    defaultShortcut: 'CmdOrCtrl+Shift+Space',
    shortcutOrigin: 'default',
    shortcutConfigurable: true,
    richCapture: 'experimental',
  };
  const listeners = new Set<CaptureStatusListener>();
  const preferences = {
    schemaVersion: 1,
    workspaceName: null,
    hasRememberedWorkspace: false,
    installKind: 'macos',
    backgroundMode: false,
    trayAvailability: 'available',
    backgroundActive: false,
    captureNotifications: false,
    richCapture: false,
  } as const;
  return {
    captureClient: {
      capabilities: async () => capabilities,
      open: async () => capabilities,
      requestPermission: async () => capabilities,
      setShortcut: async () => capabilities,
      composerReady: async () => undefined,
      subscribeComposerFocus: async () => () => undefined,
      subscribeStatus: async (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    preferencesClient: {
      read: async () => preferences,
      reset: async () => preferences,
      setBackgroundMode: async () => preferences,
      setCaptureNotifications: async () => preferences,
      setRichCapture: async () => preferences,
    },
    emitStatus: (status) => {
      for (const listener of listeners) listener(status);
    },
  };
}
