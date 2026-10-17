import {
  IconDeviceDesktop,
  IconEyeOff,
  IconFileText,
  IconHash,
  IconHelp,
  IconLanguage,
  IconListDetails,
  IconMoon,
  IconPencilPlus,
  IconPlus,
  IconSearch,
  IconSettings,
  IconSun,
} from '@tabler/icons-react';
import { useCallback } from 'react';

import type { AppLocale } from '@/app/locale';
import { useMessages, usePreferences } from '@/app/providers';
import { useShelfSurface } from '@/app/shelf-surface-context';
import type { NoteDto } from '@/bindings/workspace';
import { type CommandEntry, commandMatches } from '@/features/commands/command-menu';
import { noteHeadline } from '@/features/notes/note-row';
import type { NoteIndex } from '@/features/notes/search';

/** Matching Notes the menu lists at most, so a large shelf never floods it. */
const MAX_NOTE_RESULTS = 6;
/** Matches `workspace::MAX_TAG_SCALARS`; longer text is never offered as a new Tag. */
const MAX_TAG_SCALARS = 48;

export function isValidTagText(value: string) {
  const tag = value.trim();
  return (
    tag.length > 0 &&
    [...tag].length <= MAX_TAG_SCALARS &&
    // biome-ignore lint/suspicious/noControlCharactersInRegex: Tags refuse every control character.
    !/[\u0000-\u001f\u007f-\u009f]/u.test(tag)
  );
}

/**
 * Builds the command menu entries for one query (ADR 0029): the Tags to focus, with a new Tag
 * when the query names none (ADR 0030), matching Notes, shelf actions,
 * appearance, and language.
 */
export function useShelfCommands({
  notes,
  allTags,
  focusedTag,
  index,
  onFocusTag,
  onOpenNote,
  onNewNote,
  onNewDrawing,
  onSearch,
  onHide,
}: {
  notes: readonly NoteDto[];
  allTags: readonly string[];
  focusedTag: string | null;
  index: NoteIndex;
  onFocusTag(tag: string | null): void;
  onOpenNote(noteId: string): void;
  onNewNote(): void;
  onNewDrawing?(): void;
  onSearch(): void;
  onHide(): void;
}) {
  const m = useMessages();
  const { theme, locale, setTheme, setLocale } = usePreferences();
  const shelfSurface = useShelfSurface();

  return useCallback(
    (query: string): CommandEntry[] => {
      const entries: CommandEntry[] = [];
      const text = query.trim();

      if (focusedTag && commandMatches(text, m.command_tag_clear())) {
        entries.push({
          id: 'tag-clear',
          group: 'tags',
          label: m.command_tag_clear(),
          icon: IconListDetails,
          run: () => onFocusTag(null),
        });
      }
      for (const tag of allTags) {
        if (!commandMatches(text, tag, m.command_tag_focus({ tag }))) continue;
        entries.push({
          id: `tag-${tag}`,
          group: 'tags',
          label: m.command_tag_focus({ tag }),
          icon: IconHash,
          checked: tag === focusedTag,
          run: () => onFocusTag(tag),
        });
      }
      const typedTag = text.replace(/^#/u, '').trim();
      if (
        typedTag &&
        isValidTagText(typedTag) &&
        !allTags.some((tag) => tag.toLocaleLowerCase() === typedTag.toLocaleLowerCase())
      ) {
        entries.push({
          id: 'tag-new',
          group: 'newTag',
          label: m.command_tag_new({ tag: typedTag }),
          icon: IconHash,
          run: () => onFocusTag(typedTag),
        });
      }

      if (text) {
        const drawingLabel = m.drawing_label();
        for (const note of index
          .filter(notes, { query: text, tag: null })
          .slice(0, MAX_NOTE_RESULTS)) {
          entries.push({
            id: `note-${note.id}`,
            group: 'notes',
            label: noteHeadline(note.body, drawingLabel).title || m.note_untitled(),
            icon: IconFileText,
            run: () => onOpenNote(note.id),
          });
        }
      }

      const actions: CommandEntry[] = [
        {
          id: 'action-new-note',
          group: 'actions',
          label: m.command_new_note(),
          icon: IconPlus,
          run: onNewNote,
        },
        ...(onNewDrawing
          ? [
              {
                id: 'action-new-drawing',
                group: 'actions' as const,
                label: m.command_new_drawing(),
                icon: IconPencilPlus,
                run: onNewDrawing,
              },
            ]
          : []),
        {
          id: 'action-search',
          group: 'actions',
          label: m.command_search_notes(),
          icon: IconSearch,
          run: onSearch,
        },
        {
          id: 'action-help',
          group: 'actions',
          label: m.command_open_help(),
          icon: IconHelp,
          run: () => shelfSurface.open('help'),
        },
        {
          id: 'action-preferences',
          group: 'actions',
          label: m.command_open_preferences(),
          icon: IconSettings,
          run: () => shelfSurface.open('preferences'),
        },
        {
          id: 'action-hide',
          group: 'actions',
          label: m.command_hide(),
          icon: IconEyeOff,
          hint: m.shortcut_key_escape(),
          run: onHide,
        },
      ];
      entries.push(...actions.filter((entry) => commandMatches(text, entry.label)));

      const appearance: CommandEntry[] = [
        {
          id: 'theme-system',
          group: 'appearance',
          label: m.command_theme_system(),
          keywords: m.theme_system(),
          icon: IconDeviceDesktop,
          checked: theme === 'system',
          run: () => setTheme('system'),
        },
        {
          id: 'theme-light',
          group: 'appearance',
          label: m.command_theme_light(),
          keywords: m.theme_light(),
          icon: IconSun,
          checked: theme === 'light',
          run: () => setTheme('light'),
        },
        {
          id: 'theme-dark',
          group: 'appearance',
          label: m.command_theme_dark(),
          keywords: m.theme_dark(),
          icon: IconMoon,
          checked: theme === 'dark',
          run: () => setTheme('dark'),
        },
      ];
      entries.push(
        ...appearance.filter((entry) =>
          commandMatches(text, entry.label, entry.keywords, m.command_group_appearance()),
        ),
      );

      const languages: [AppLocale, string][] = [
        ['en', m.command_language_en()],
        ['fr', m.command_language_fr()],
      ];
      for (const [value, label] of languages) {
        if (!commandMatches(text, label, m.command_group_language())) continue;
        entries.push({
          id: `language-${value}`,
          group: 'language',
          label,
          icon: IconLanguage,
          checked: locale === value,
          run: () => setLocale(value),
        });
      }
      return entries;
    },
    [
      allTags,
      focusedTag,
      index,
      locale,
      m,
      notes,
      onFocusTag,
      onHide,
      onNewDrawing,
      onNewNote,
      onOpenNote,
      onSearch,
      setLocale,
      setTheme,
      shelfSurface,
      theme,
    ],
  );
}
