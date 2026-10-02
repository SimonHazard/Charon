import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

import type {
  WorkspaceChangedEvent,
  WorkspaceCommand,
  WorkspaceCommandResult,
  WorkspaceFolderChoice,
  WorkspaceIpcError,
  WorkspaceSnapshot,
} from '@/bindings/workspace';

export type WorkspaceListener = (event: WorkspaceChangedEvent) => void;

export interface WorkspaceClient {
  snapshot(): Promise<WorkspaceSnapshot>;
  bootstrap?(): Promise<WorkspaceSnapshot>;
  bootstrapDefault?(): Promise<WorkspaceSnapshot>;
  /** Picks a folder natively; React receives a single-use token, never its path. */
  chooseDirectory?(): Promise<WorkspaceFolderChoice | null>;
  chooseAttachments?(): Promise<string[]>;
  openOrCreate?(folder: WorkspaceFolderChoice): Promise<WorkspaceSnapshot>;
  execute?(command: WorkspaceCommand): Promise<WorkspaceCommandResult>;
  subscribe(listener: WorkspaceListener): Promise<() => void>;
}

export const tauriWorkspaceClient: WorkspaceClient = {
  snapshot: () => invoke<WorkspaceSnapshot>('workspace_snapshot'),
  bootstrap: () => invoke<WorkspaceSnapshot>('workspace_bootstrap'),
  bootstrapDefault: () => invoke<WorkspaceSnapshot>('workspace_bootstrap_default'),
  chooseDirectory: () => invoke<WorkspaceFolderChoice | null>('workspace_choose_directory'),
  chooseAttachments: () => invoke<string[]>('workspace_choose_attachments'),
  openOrCreate: ({ token }) => invoke<WorkspaceSnapshot>('workspace_open_or_create', { token }),
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
