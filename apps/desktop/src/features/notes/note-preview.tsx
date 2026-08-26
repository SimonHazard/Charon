import { IconSquare, IconSquareCheck } from '@tabler/icons-react';
import { createElement, type ReactNode } from 'react';

const headingPattern = /^(#{1,6})\s+(.*)$/u;
const taskPattern = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/u;
const bulletPattern = /^\s*[-*]\s+(.*)$/u;

function renderNonListLine(line: string, index: number): ReactNode {
  const heading = headingPattern.exec(line);
  if (heading) {
    const sourceLevel = heading[1]?.length ?? 1;
    const previewLevel = Math.min(sourceLevel + 1, 6);
    return createElement(`h${previewLevel}`, { key: index }, heading[2] ?? '');
  }
  if (line.trim() === '') return <br key={index} />;
  return <p key={index}>{line}</p>;
}

function renderListItem(line: string, index: number): ReactNode | null {
  const task = taskPattern.exec(line);
  if (task) {
    const checked = task[1]?.toLowerCase() === 'x';
    const TaskIcon = checked ? IconSquareCheck : IconSquare;
    return (
      <li className="note-preview-task" key={index}>
        {/* biome-ignore lint/a11y/useSemanticElements: Safe Markdown tasks expose a read-only checkbox with visible text and icon. */}
        <span aria-checked={checked} aria-readonly="true" role="checkbox" tabIndex={0}>
          <TaskIcon aria-hidden="true" />
          <span>{task[2]}</span>
        </span>
      </li>
    );
  }
  const bullet = bulletPattern.exec(line);
  return bullet ? <li key={index}>{bullet[1]}</li> : null;
}

function renderBody(body: string): ReactNode[] {
  const lines = body.split(/\r?\n/u);
  const blocks: ReactNode[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? '';
    const firstItem = renderListItem(line, index);
    if (!firstItem) {
      blocks.push(renderNonListLine(line, index));
      index += 1;
      continue;
    }

    const start = index;
    const items = [firstItem];
    index += 1;
    while (index < lines.length) {
      const item = renderListItem(lines[index] ?? '', index);
      if (!item) break;
      items.push(item);
      index += 1;
    }
    blocks.push(<ul key={`list-${start}`}>{items}</ul>);
  }
  return blocks;
}

export function NotePreview({ body, label }: { body: string; label: string }) {
  return (
    <section aria-label={label} className="note-preview" data-testid="note-preview">
      {renderBody(body)}
    </section>
  );
}
