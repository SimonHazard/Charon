import { HotkeysProvider, type RegisterableHotkey, useHotkeys } from '@tanstack/react-hotkeys';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  type AppCommand,
  availableCommands,
  executeCommand,
  formatShortcut,
} from '@/app/commands/command-registry';
import { createDefaultCommands } from '@/app/commands/default-commands';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Kbd, KbdGroup } from '@/components/ui/kbd';
import { m } from '@/paraglide/messages.js';

type CommandContextValue = {
  commands: readonly AppCommand[];
  execute(id: string, target?: EventTarget | null): boolean;
  register(commands: readonly AppCommand[]): () => void;
};

const CommandContext = createContext<CommandContextValue | null>(null);

export function CommandProvider({ children }: PropsWithChildren) {
  return (
    <HotkeysProvider defaultOptions={{ hotkey: { preventDefault: true, stopPropagation: true } }}>
      <CommandRuntime>{children}</CommandRuntime>
    </HotkeysProvider>
  );
}

function CommandRuntime({ children }: PropsWithChildren) {
  const [registered, setRegistered] = useState<readonly AppCommand[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const registrations = useRef(0);
  const defaults = useMemo(
    () =>
      createDefaultCommands({
        openPalette: () => setPaletteOpen(true),
        openShortcutHelp: () => setHelpOpen(true),
      }),
    [],
  );
  const commands = useMemo(() => [...defaults, ...registered], [defaults, registered]);
  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  const register = useCallback((next: readonly AppCommand[]) => {
    const registrationId = ++registrations.current;
    const tagged = next.map((command) => ({ ...command, registrationId }));
    setRegistered((current) => [...current, ...tagged]);
    return () => {
      setRegistered((current) =>
        current.filter(
          (command) =>
            (command as AppCommand & { registrationId?: number }).registrationId !== registrationId,
        ),
      );
    };
  }, []);

  const execute = useCallback((id: string, target: EventTarget | null = null) => {
    const command = commandsRef.current.find((candidate) => candidate.id === id);
    return command ? executeCommand(command, target) : false;
  }, []);

  useHotkeys(
    commands
      .filter((command) => command.defaultShortcut)
      .map((command) => ({
        hotkey: command.defaultShortcut as RegisterableHotkey,
        callback: (event: KeyboardEvent) => {
          execute(command.id, event.target);
        },
        options: {
          enabled: command.isAvailable(),
          ignoreInputs: !command.allowInEditable,
          meta: { name: command.id },
        },
      })),
    { conflictBehavior: 'error' },
  );

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const message = (key: AppCommand['labelKey']) =>
    (m as unknown as Record<string, () => string>)[key]?.() ?? key;
  const visibleCommands = availableCommands(commands);

  return (
    <CommandContext.Provider value={{ commands, execute, register }}>
      {children}
      <CommandDialog
        description={m.command_palette_description()}
        onOpenChange={setPaletteOpen}
        open={paletteOpen}
        title={m.command_palette_title()}
      >
        <Command>
          <CommandInput placeholder={m.command_palette_placeholder()} />
          <CommandList>
            <CommandEmpty>{m.command_palette_empty()}</CommandEmpty>
            <CommandGroup heading={m.command_palette_group()}>
              {visibleCommands.map((command) => (
                <CommandItem
                  key={command.id}
                  onSelect={() => {
                    execute(command.id);
                    setPaletteOpen(false);
                  }}
                >
                  <span>{message(command.labelKey)}</span>
                  {command.defaultShortcut ? (
                    <CommandShortcut>
                      {formatShortcut(command.defaultShortcut, isMac).join(' ')}
                    </CommandShortcut>
                  ) : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </CommandDialog>
      <Dialog onOpenChange={setHelpOpen} open={helpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{m.shortcut_help_title()}</DialogTitle>
            <DialogDescription>{m.shortcut_help_description()}</DialogDescription>
          </DialogHeader>
          <div className="shortcut-help-list">
            {visibleCommands
              .filter((command) => command.defaultShortcut)
              .map((command) => (
                <div className="shortcut-help-row" key={command.id}>
                  <span>{message(command.labelKey)}</span>
                  <KbdGroup>
                    {formatShortcut(command.defaultShortcut as string, isMac).map((key) => (
                      <Kbd key={key}>{key}</Kbd>
                    ))}
                  </KbdGroup>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>
    </CommandContext.Provider>
  );
}

export function useCommandRegistry() {
  const value = useContext(CommandContext);
  if (!value) throw new Error('useCommandRegistry must be used inside CommandProvider');
  return value;
}

export function useCommandRegistration(commands: readonly AppCommand[]) {
  const { register } = useCommandRegistry();
  useEffect(() => register(commands), [commands, register]);
}
