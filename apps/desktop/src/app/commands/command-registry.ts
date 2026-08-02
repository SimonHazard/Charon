import type { m } from '@/paraglide/messages.js';

export type CommandCategory =
  | 'navigation'
  | 'notes'
  | 'selection'
  | 'copy'
  | 'capture'
  | 'workspace';
export type CommandMessageKey = keyof typeof m;

export type AppCommand = {
  id: string;
  labelKey: CommandMessageKey;
  descriptionKey: CommandMessageKey;
  category: CommandCategory;
  defaultShortcut?: string;
  displayShortcut?: string;
  destructive?: boolean;
  allowInEditable?: boolean;
  helpOnly?: boolean;
  helpAction?: boolean;
  isAvailable(): boolean;
  execute(): void | Promise<void>;
};

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable ||
    Boolean(target.closest('[contenteditable="true"]'))
  );
}

export function availableCommands(commands: readonly AppCommand[]): AppCommand[] {
  return commands.filter((command) => command.isAvailable());
}

export function executeCommand(command: AppCommand, target: EventTarget | null): boolean {
  if (!command.isAvailable()) return false;
  if (!command.allowInEditable && isEditableTarget(target)) return false;
  void Promise.resolve(command.execute()).catch(() => undefined);
  return true;
}

export function formatShortcut(shortcut: string, isMac: boolean): string[] {
  return shortcut.split(/[+,]/).map((rawPart) => {
    const part = rawPart.trim();
    if (part !== 'Mod' && part !== 'CmdOrCtrl') return part;
    return isMac ? '⌘' : 'Ctrl';
  });
}
