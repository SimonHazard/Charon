import type { Icon } from '@tabler/icons-react';
import { IconCheck, IconSearch } from '@tabler/icons-react';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useMessages } from '@/app/providers';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';

export type CommandGroupId = 'tags' | 'notes' | 'actions' | 'appearance' | 'language' | 'newTag';

export type CommandEntry = {
  id: string;
  group: CommandGroupId;
  label: string;
  icon: Icon;
  /** Extra words the query may match, never shown. */
  keywords?: string;
  /** A trailing hint: a shortcut or a short state such as "Current". */
  hint?: string;
  checked?: boolean;
  run(): void;
};

/** Case-insensitive, accent-insensitive word-prefix or substring match. */
export function commandMatches(query: string, ...texts: (string | undefined)[]) {
  const needle = fold(query.trim());
  if (!needle) return true;
  return texts.some((text) => text !== undefined && fold(text).includes(needle));
}

function fold(value: string) {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase();
}

// A new Tag comes last, so a query that names an action or a Note runs it first.
const groupOrder: readonly CommandGroupId[] = [
  'tags',
  'notes',
  'actions',
  'appearance',
  'language',
  'newTag',
];

/**
 * The ⌘K command menu (ADR 0029): one transient dialog, never a route. It lists the Tags to
 * focus (ADR 0030), matching Notes, and the shelf's actions. The caller builds the
 * entries for the current query; a chosen entry runs once the dialog has finished closing, so
 * any focus it moves is not taken back by the dialog's focus restoration.
 */
export function CommandMenu({
  open,
  onOpenChange,
  entries: buildEntries,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  entries(query: string): CommandEntry[];
}) {
  const m = useMessages();
  const [query, setQuery] = useState('');
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const pendingRef = useRef<CommandEntry | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const optionPrefix = useId();

  const entries = useMemo(() => (open ? buildEntries(query) : []), [buildEntries, open, query]);
  const groups = useMemo(
    () =>
      groupOrder
        .map((group) => ({ group, items: entries.filter((entry) => entry.group === group) }))
        .filter(({ items }) => items.length > 0),
    [entries],
  );
  const ordered = useMemo(() => groups.flatMap(({ items }) => items), [groups]);
  const highlighted = ordered.find((entry) => entry.id === highlightedId) ?? ordered[0] ?? null;
  const optionId = (entry: CommandEntry) => `${optionPrefix}-${entry.id}`;

  useEffect(() => {
    if (open) return;
    setQuery('');
    setHighlightedId(null);
  }, [open]);

  useLayoutEffect(() => {
    if (!highlighted) return;
    document
      .getElementById(`${optionPrefix}-${highlighted.id}`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlighted, optionPrefix]);

  const choose = useCallback(
    (entry: CommandEntry) => {
      pendingRef.current = entry;
      onOpenChange(false);
    },
    [onOpenChange],
  );

  const move = (offset: number) => {
    if (!ordered.length) return;
    const index = highlighted ? ordered.indexOf(highlighted) : -1;
    const next = ordered[(index + offset + ordered.length) % ordered.length];
    if (next) setHighlightedId(next.id);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
    if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'n')) {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'p')) {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'PageDown' || event.key === 'PageUp') {
      event.preventDefault();
      move(event.key === 'PageDown' ? 5 : -5);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (highlighted) choose(highlighted);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => onOpenChange(next)}
      onOpenChangeComplete={(next) => {
        if (next) return;
        const entry = pendingRef.current;
        pendingRef.current = null;
        entry?.run();
      }}
    >
      <DialogContent className="command-dialog" data-command-menu="">
        <DialogTitle className="sr-only">{m.command_menu_title()}</DialogTitle>
        <DialogDescription className="sr-only">{m.command_menu_description()}</DialogDescription>
        <div className="command-input-row">
          <IconSearch aria-hidden="true" />
          <input
            aria-activedescendant={highlighted ? optionId(highlighted) : undefined}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-expanded="true"
            aria-label={m.command_menu_input_label()}
            autoComplete="off"
            className="command-input"
            onChange={(event) => {
              setQuery(event.target.value);
              setHighlightedId(null);
            }}
            onKeyDown={onKeyDown}
            placeholder={m.command_menu_placeholder()}
            role="combobox"
            spellCheck={false}
            value={query}
          />
        </div>
        <div className="command-list" id={listId} ref={listRef} role="listbox">
          {groups.length ? (
            groups.map(({ group, items }) => (
              // A listbox groups its options with role="group"; a fieldset would leave the listbox.
              // biome-ignore lint/a11y/useSemanticElements: ARIA listbox option groups.
              <div
                aria-labelledby={`${listId}-${group}`}
                className="command-group"
                key={group}
                role="group"
              >
                <div className="command-group-label" id={`${listId}-${group}`}>
                  {
                    {
                      tags: m.command_group_tags(),
                      notes: m.command_group_notes(),
                      actions: m.command_group_actions(),
                      appearance: m.command_group_appearance(),
                      language: m.command_group_language(),
                      newTag: m.command_group_new_tag(),
                    }[group]
                  }
                </div>
                {items.map((entry) => {
                  const EntryIcon = entry.icon;
                  return (
                    // The input owns keyboard focus (aria-activedescendant); options take clicks.
                    // biome-ignore lint/a11y/useKeyWithClickEvents: keys are handled by the combobox input.
                    <div
                      aria-checked={entry.checked === undefined ? undefined : entry.checked}
                      aria-selected={entry === highlighted}
                      className="command-item"
                      data-checked={entry.checked ? '' : undefined}
                      data-highlighted={entry === highlighted ? '' : undefined}
                      id={optionId(entry)}
                      key={entry.id}
                      onClick={() => choose(entry)}
                      onPointerMove={() => {
                        if (entry !== highlighted) setHighlightedId(entry.id);
                      }}
                      role="option"
                      tabIndex={-1}
                    >
                      <EntryIcon aria-hidden="true" />
                      <span className="command-item-label">{entry.label}</span>
                      {entry.checked ? (
                        <IconCheck aria-hidden="true" className="command-item-check" />
                      ) : entry.hint ? (
                        <span className="command-item-hint">{entry.hint}</span>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))
          ) : (
            <p className="command-empty" role="presentation">
              {m.command_menu_empty()}
            </p>
          )}
        </div>
        <div aria-hidden="true" className="command-footer">
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd>
            {m.command_menu_footer_move()}
          </span>
          <span>
            <Kbd>↵</Kbd>
            {m.command_menu_footer_run()}
          </span>
          <span>
            <Kbd>{m.shortcut_key_escape()}</Kbd>
            {m.command_menu_footer_close()}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
