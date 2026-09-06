import { relaunch } from '@tauri-apps/plugin-process';
import { check, type DownloadEvent } from '@tauri-apps/plugin-updater';

export type UpdateProgress =
  | { type: 'started'; totalBytes: number | null }
  | { type: 'progress'; chunkBytes: number }
  | { type: 'finished' };

export type UpdateCandidate = {
  version: string;
  notes: string;
  download(onProgress: (event: UpdateProgress) => void): Promise<void>;
  install(): Promise<void>;
  close(): Promise<void>;
};

export type UpdateClient = {
  check(): Promise<UpdateCandidate | null>;
  relaunch(): Promise<void>;
};

function normalizeProgress(event: DownloadEvent): UpdateProgress {
  if (event.event === 'Started') {
    return { type: 'started', totalBytes: event.data.contentLength ?? null };
  }
  if (event.event === 'Progress') {
    return { type: 'progress', chunkBytes: event.data.chunkLength };
  }
  return { type: 'finished' };
}

export const tauriUpdateClient: UpdateClient = {
  async check() {
    const update = await check({ timeout: 15_000 });
    if (!update) return null;
    return {
      version: update.version,
      notes: update.body?.trim() ?? '',
      download: (onProgress) => update.download((event) => onProgress(normalizeProgress(event))),
      install: () => update.install({ restartAfterInstall: false }),
      close: () => update.close(),
    };
  },
  relaunch,
};
