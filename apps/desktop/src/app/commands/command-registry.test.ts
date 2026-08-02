import { describe, expect, it, vi } from 'vitest';

import {
  availableCommands,
  executeCommand,
  formatShortcut,
  isEditableTarget,
} from '@/app/commands/command-registry';

const command = (overrides = {}) => ({
  id: 'notes.test',
  labelKey: 'notes_title' as const,
  descriptionKey: 'notes_description' as const,
  category: 'notes' as const,
  isAvailable: () => true,
  execute: vi.fn(),
  ...overrides,
});

describe('command registry', () => {
  it('suppresses ordinary commands in editable targets', () => {
    const textarea = document.createElement('textarea');
    const candidate = command();
    expect(isEditableTarget(textarea)).toBe(true);
    expect(executeCommand(candidate, textarea)).toBe(false);
    expect(candidate.execute).not.toHaveBeenCalled();
  });

  it('allows explicitly scoped editor commands and filters availability', () => {
    const textarea = document.createElement('textarea');
    const candidate = command({ allowInEditable: true });
    expect(executeCommand(candidate, textarea)).toBe(true);
    expect(candidate.execute).toHaveBeenCalledTimes(1);
    expect(availableCommands([candidate, command({ isAvailable: () => false })])).toEqual([
      candidate,
    ]);
  });

  it('formats the platform modifier without leaking the hotkeys package', () => {
    expect(formatShortcut('Mod+Shift+K', true)).toEqual(['⌘', 'Shift', 'K']);
    expect(formatShortcut('Mod+K', false)).toEqual(['Ctrl', 'K']);
    expect(formatShortcut('CmdOrCtrl+Shift+Space', false)).toEqual(['Ctrl', 'Shift', 'Space']);
    expect(formatShortcut('Shift,Shift', true)).toEqual(['Shift', 'Shift']);
  });
});
