import { describe, expect, it, vi } from 'vitest';

import {
  availableCommands,
  executeCommand,
  formatShortcut,
  isEditableTarget,
} from '@/app/commands/command-registry';
import { createCaptureCommands } from '@/app/commands/default-commands';

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
    expect(formatShortcut('Mod+Shift,Shift', true)).toEqual(['⌘', 'Shift', 'Shift']);
  });

  it('offers an explicit permission action until native double Shift is available', () => {
    const requestPermission = vi.fn();
    const denied = createCaptureCommands({
      doubleShiftState: 'denied',
      inputMonitoringState: 'denied',
      accessibilityState: 'denied',
      selectedTextState: 'denied',
      openEditor: vi.fn(),
      requestPermission,
    });
    const permission = denied.find(
      (candidate) => candidate.id === 'capture.request-input-monitoring',
    );
    expect(permission?.helpAction).toBe(true);
    expect(permission?.isAvailable()).toBe(true);
    executeCommand(permission as NonNullable<typeof permission>, null);
    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(requestPermission).toHaveBeenCalledWith('inputMonitoring');

    const available = createCaptureCommands({
      doubleShiftState: 'available',
      inputMonitoringState: 'available',
      accessibilityState: 'available',
      selectedTextState: 'available',
      openEditor: vi.fn(),
      requestPermission,
    });
    expect(
      available
        .find((candidate) => candidate.id === 'capture.request-input-monitoring')
        ?.isAvailable(),
    ).toBe(false);
    expect(
      available.find((candidate) => candidate.id === 'capture.double-shift')?.isAvailable(),
    ).toBe(true);
    const portable = available.find((candidate) => candidate.id === 'capture.open');
    expect(portable?.defaultShortcut).toBeUndefined();
    expect(portable?.displayShortcut).toBe('Mod+Shift+Space');

    const selectionError = createCaptureCommands({
      doubleShiftState: 'available',
      inputMonitoringState: 'available',
      accessibilityState: 'available',
      selectedTextState: 'error',
      openEditor: vi.fn(),
      requestPermission,
    });
    expect(
      selectionError.find((candidate) => candidate.id === 'capture.double-shift')?.isAvailable(),
    ).toBe(false);
    expect(
      selectionError
        .find((candidate) => candidate.id === 'capture.request-accessibility')
        ?.isAvailable(),
    ).toBe(true);
  });
});
