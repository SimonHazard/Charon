import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type {
  WorkspaceChangedEvent,
  WorkspaceIpcError,
  WorkspaceSnapshot,
} from '@/bindings/workspace';

export type WorkspaceListener = (event: WorkspaceChangedEvent) => void;

export interface WorkspaceClient {
  snapshot(): Promise<WorkspaceSnapshot>;
  subscribe(listener: WorkspaceListener): Promise<() => void>;
}

export const tauriWorkspaceClient: WorkspaceClient = {
  snapshot: () => invoke<WorkspaceSnapshot>('workspace_snapshot'),
  subscribe: async (listener) => {
    const unlisten = await listen<WorkspaceChangedEvent>('workspace://changed', (event) =>
      listener(event.payload),
    );
    return unlisten;
  },
};

export function asWorkspaceError(error: unknown): WorkspaceIpcError {
  if (error && typeof error === 'object' && 'code' in error && 'messageKey' in error) {
    return error as WorkspaceIpcError;
  }
  return {
    code: 'unknown',
    messageKey: 'workspace_error_unknown',
    expectedRevision: null,
    actualRevision: null,
    recoveryLocation: null,
  };
}
