import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type {
  WorkspaceCommand,
  WorkspaceCommandResult,
  WorkspaceChangedEvent,
  WorkspaceIpcError,
  WorkspaceSnapshot,
} from '@/bindings/workspace';

export type WorkspaceListener = (event: WorkspaceChangedEvent) => void;

export interface WorkspaceClient {
  snapshot(): Promise<WorkspaceSnapshot>;
  execute?(command: WorkspaceCommand): Promise<WorkspaceCommandResult>;
  subscribe(listener: WorkspaceListener): Promise<() => void>;
}

export const tauriWorkspaceClient: WorkspaceClient = {
  snapshot: () => invoke<WorkspaceSnapshot>('workspace_snapshot'),
  execute: (command) => invoke<WorkspaceCommandResult>('workspace_execute', { command }),
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
