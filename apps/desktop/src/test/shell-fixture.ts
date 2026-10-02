import { vi } from 'vitest';

import type { ShellClient } from '@/lib/ipc/shell-client';

/** A shell client whose tray quit requests a test emits as Rust would. */
export function shellClients() {
  const listeners = new Set<() => void>();
  const shellClient = {
    setLabels: vi.fn<ShellClient['setLabels']>().mockResolvedValue(undefined),
    quit: vi.fn<ShellClient['quit']>().mockResolvedValue(undefined),
    cancelQuit: vi.fn<ShellClient['cancelQuit']>().mockResolvedValue(undefined),
    subscribeQuitRequest: vi.fn<ShellClient['subscribeQuitRequest']>(async (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }),
  } satisfies ShellClient;
  return {
    shellClient,
    requestQuit: () => {
      for (const listener of listeners) listener();
    },
  };
}
