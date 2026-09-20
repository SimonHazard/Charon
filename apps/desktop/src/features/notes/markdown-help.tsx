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

export function MarkdownHelp({ compact = false }: { compact?: boolean }) {
  const m = useMessages();
  const word = m.markdown_help_word();
  const item = m.markdown_help_item();
  const column = m.markdown_help_column();
  const examples = [
    [m.markdown_help_heading(), `# ${word}\n## ${word}`],
    [m.markdown_help_emphasis(), `**${word}** · *${word}* · ~~${word}~~`],
    [m.markdown_help_list(), `- ${item}\n\n1. ${item}`],
    [m.markdown_help_task(), `- [ ] ${item}\n- [x] ${item}`],
    [m.markdown_help_quote(), `> ${word}`],
    [m.markdown_help_code(), `\`${word}\`\n\n\`\`\`\n${word}\n\`\`\``],
    [m.markdown_help_table(), `| ${column} | ${column} |\n| --- | --- |\n| ${word} | ${word} |`],
    [m.markdown_help_link(), `[${word}](notes.md)`],
  ];
  return (
    <Popover>
      <PopoverTrigger
        aria-label={m.markdown_help_title()}
        render={<Button size={compact ? 'icon-sm' : 'sm'} variant="ghost" />}
      >
        <IconMarkdown aria-hidden="true" />
        {compact ? null : m.markdown_help_title()}
      </PopoverTrigger>
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
        <dl>
          {examples.map(([title, source]) => (
            <div key={title}>
              <dt>{title}</dt>
              <dd>
                <pre>
                  <code>{source}</code>
                </pre>
              </dd>
            </div>
          ))}
        </dl>
        <p>{m.markdown_help_local()}</p>
      </PopoverContent>
    </Popover>
  );
}
