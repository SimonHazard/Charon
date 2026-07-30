import type { AppCommand } from '@/app/commands/command-registry';

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
