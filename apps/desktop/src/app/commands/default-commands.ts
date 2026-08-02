import type { AppCommand } from '@/app/commands/command-registry';
import type { CopyPreset } from '@/bindings/clipboard';

export function createDefaultCommands(actions: {
  openPalette(): void;
  openShortcutHelp(): void;
}): AppCommand[] {
  return [
    {
      id: 'app.command-palette',
      labelKey: 'command_palette_title',
      descriptionKey: 'command_palette_description',
      category: 'navigation',
      defaultShortcut: 'Mod+K',
      isAvailable: () => true,
      execute: actions.openPalette,
    },
    {
      id: 'app.shortcut-help',
      labelKey: 'shortcut_help_title',
      descriptionKey: 'shortcut_help_description',
      category: 'navigation',
      defaultShortcut: 'Mod+/',
      isAvailable: () => true,
      execute: actions.openShortcutHelp,
    },
  ];
}

export function createCopyCommands(actions: {
  isAvailable(): boolean;
  copyDefault(): void | Promise<void>;
  preview(): void | Promise<void>;
  copyPreset(preset: CopyPreset): void | Promise<void>;
}): AppCommand[] {
  const presets: Array<{ preset: CopyPreset; labelKey: AppCommand['labelKey'] }> = [
    { preset: 'plain', labelKey: 'command_copy_plain' },
    { preset: 'bulleted', labelKey: 'command_copy_bulleted' },
    { preset: 'numbered', labelKey: 'command_copy_numbered' },
    { preset: 'task-list', labelKey: 'command_copy_task_list' },
    { preset: 'sectioned', labelKey: 'command_copy_sectioned' },
  ];
  return [
    {
      id: 'copy.default',
      labelKey: 'command_copy_default',
      descriptionKey: 'command_copy_default_description',
      category: 'copy',
      defaultShortcut: 'Mod+C',
      isAvailable: actions.isAvailable,
      execute: actions.copyDefault,
    },
    {
      id: 'copy.preview',
      labelKey: 'command_copy_preview',
      descriptionKey: 'command_copy_preview_description',
      category: 'copy',
      defaultShortcut: 'Mod+Shift+C',
      isAvailable: actions.isAvailable,
      execute: actions.preview,
    },
    ...presets.map(({ preset, labelKey }) => ({
      id: `copy.${preset}`,
      labelKey,
      descriptionKey: 'command_copy_preset_description' as const,
      category: 'copy' as const,
      isAvailable: actions.isAvailable,
      execute: () => actions.copyPreset(preset),
    })),
  ];
}

export function createCaptureCommands(actions: {
  doubleShiftAvailable: boolean;
  openCapture(): void | Promise<void>;
}): AppCommand[] {
  return [
    {
      id: 'capture.open',
      labelKey: 'command_capture_open',
      descriptionKey: 'command_capture_open_description',
      category: 'capture',
      defaultShortcut: 'Mod+Shift+Space',
      displayShortcut: 'Mod+Shift+Space',
      allowInEditable: true,
      isAvailable: () => true,
      execute: actions.openCapture,
    },
    {
      id: 'capture.double-shift',
      labelKey: 'command_capture_double_shift',
      descriptionKey: 'command_capture_double_shift_description',
      category: 'capture',
      displayShortcut: 'Shift,Shift',
      allowInEditable: true,
      isAvailable: () => actions.doubleShiftAvailable,
      execute: actions.openCapture,
    },
  ];
}
