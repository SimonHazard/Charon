import { IconMarkdown } from '@tabler/icons-react';
import { useMessages } from '@/app/providers';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { m as messages } from '@/paraglide/messages.js';

type Messages = typeof messages;

export type MarkdownHelpEntry = { id: string; title: string; source: string; hint?: string };

/**
 * Copyable examples the safe Preview renders exactly as described; `markdown-help.test.tsx`
 * renders every source through `NotePreview` and is the contract between the two.
 */
export function markdownHelpExamples(m: Messages): MarkdownHelpEntry[] {
  const word = m.markdown_help_word();
  const item = m.markdown_help_item();
  const column = m.markdown_help_column();
  return [
    {
      id: 'heading',
      title: m.markdown_help_heading(),
      source: `# ${word}\n## ${word}`,
      hint: m.markdown_help_heading_hint(),
    },
    {
      id: 'emphasis',
      title: m.markdown_help_emphasis(),
      source: `**${word}**\n*${word}*\n~~${word}~~`,
    },
    {
      id: 'breaks',
      title: m.markdown_help_breaks(),
      source: `${word}\\\n${word}\n\n${word}`,
      hint: m.markdown_help_breaks_hint({ marker: '\\' }),
    },
    {
      id: 'list',
      title: m.markdown_help_list(),
      source: `- ${item}\n  - ${item}\n\n1. ${item}\n2. ${item}`,
      hint: m.markdown_help_list_hint(),
    },
    {
      id: 'task',
      title: m.markdown_help_task(),
      source: `- [ ] ${item}\n- [x] ${item}`,
      hint: m.markdown_help_task_hint(),
    },
    { id: 'quote', title: m.markdown_help_quote(), source: `> ${word}` },
    {
      id: 'code',
      title: m.markdown_help_code(),
      source: `\`${word}\`\n\n\`\`\`\n${word}\n\`\`\``,
    },
    {
      id: 'table',
      title: m.markdown_help_table(),
      source: `| ${column} | ${column} |\n| --- | --- |\n| ${word} | ${word} |`,
    },
    { id: 'divider', title: m.markdown_help_divider(), source: '---' },
    {
      id: 'link',
      title: m.markdown_help_link(),
      source: `[${word}](notes.md)`,
      hint: m.markdown_help_link_hint(),
    },
  ];
}

/** Syntax the Preview deliberately does not render, with what it shows instead. */
export function markdownHelpUnsupported(m: Messages): MarkdownHelpEntry[] {
  const word = m.markdown_help_word();
  return [
    {
      id: 'html',
      title: m.markdown_help_html(),
      source: `<b>${word}</b>`,
      hint: m.markdown_help_html_hint(),
    },
    {
      id: 'image',
      title: m.markdown_help_image(),
      source: `![${word}](image.png)`,
      hint: m.markdown_help_image_hint(),
    },
  ];
}

function MarkdownHelpList({ entries }: { entries: MarkdownHelpEntry[] }) {
  return (
    <dl>
      {entries.map((entry) => (
        <div key={entry.id}>
          <dt>{entry.title}</dt>
          <dd>
            <pre>
              <code>{entry.source}</code>
            </pre>
            {entry.hint ? <p className="markdown-help-hint">{entry.hint}</p> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function MarkdownHelp({ compact = false }: { compact?: boolean }) {
  const m = useMessages();
  return (
    <Popover>
      {compact ? (
        // Icon-only beside Write/Preview, so it repeats its name in a Tooltip, like ShelfActions.
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                aria-label={m.markdown_help_title()}
                render={<Button size="icon-sm" variant="ghost" />}
              />
            }
          >
            <IconMarkdown aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>{m.markdown_help_title()}</TooltipContent>
        </Tooltip>
      ) : (
        <PopoverTrigger
          aria-label={m.markdown_help_title()}
          render={<Button size="sm" variant="ghost" />}
        >
          <IconMarkdown aria-hidden="true" />
          {m.markdown_help_title()}
        </PopoverTrigger>
      )}
      <PopoverContent
        align="end"
        className="markdown-help"
        sideOffset={8}
        onKeyDown={(event) => {
          if (event.key === 'Escape') event.stopPropagation();
        }}
      >
        <PopoverHeader>
          <PopoverTitle>{m.markdown_help_title()}</PopoverTitle>
          <PopoverDescription>{m.markdown_help_description()}</PopoverDescription>
        </PopoverHeader>
        <MarkdownHelpList entries={markdownHelpExamples(m)} />
        <h3 className="markdown-help-subtitle">{m.markdown_help_unsupported()}</h3>
        <MarkdownHelpList entries={markdownHelpUnsupported(m)} />
        <p>{m.markdown_help_local()}</p>
        <p>{m.drawing_help()}</p>
      </PopoverContent>
    </Popover>
  );
}
