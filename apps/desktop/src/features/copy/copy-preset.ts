import type { CopyPreset } from '@/bindings/clipboard';

const COPY_PRESET_STORAGE_KEY = 'charon.copy-preset';
const COPY_PRESET_STORAGE_VERSION = 1;

export const COPY_PRESETS = [
  'plain',
  'bulleted',
  'numbered',
  'task-list',
  'sectioned',
] as const satisfies readonly CopyPreset[];

export type CopyPresetMessageKey =
  | 'copy_preset_plain'
  | 'copy_preset_bulleted'
  | 'copy_preset_numbered'
  | 'copy_preset_task_list'
  | 'copy_preset_sectioned';

export const COPY_PRESET_MESSAGE_KEYS: Record<CopyPreset, CopyPresetMessageKey> = {
  plain: 'copy_preset_plain',
  bulleted: 'copy_preset_bulleted',
  numbered: 'copy_preset_numbered',
  'task-list': 'copy_preset_task_list',
  sectioned: 'copy_preset_sectioned',
};

export function isCopyPreset(value: unknown): value is CopyPreset {
  return typeof value === 'string' && COPY_PRESETS.includes(value as CopyPreset);
}

export function readCopyPreset(storage: Pick<Storage, 'getItem'> = localStorage): CopyPreset {
  const stored = storage.getItem(COPY_PRESET_STORAGE_KEY);
  if (!stored) return 'plain';
  try {
    const parsed = JSON.parse(stored) as { version?: unknown; preset?: unknown };
    return parsed.version === COPY_PRESET_STORAGE_VERSION && isCopyPreset(parsed.preset)
      ? parsed.preset
      : 'plain';
  } catch {
    return 'plain';
  }
}

export function saveCopyPreset(
  preset: CopyPreset,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(
    COPY_PRESET_STORAGE_KEY,
    JSON.stringify({ version: COPY_PRESET_STORAGE_VERSION, preset }),
  );
}
