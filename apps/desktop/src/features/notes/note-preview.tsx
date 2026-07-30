import { IconSquare, IconSquareCheck } from '@tabler/icons-react';
import type { ReactNode } from 'react';

function renderLine(line: string, index: number): ReactNode {
  const heading = /^(#{1,6})\s+(.*)$/u.exec(line);
  if (heading) {
    const level = heading[1]?.length ?? 1;
    const content = heading[2] ?? '';
    if (level === 1) return <h2 key={index}>{content}</h2>;
    if (level === 2) return <h3 key={index}>{content}</h3>;
    return <h4 key={index}>{content}</h4>;
  }
  const task = /^\s*[-*]\s+\[([ xX])\]\s+(.*)$/u.exec(line);
  if (task) {
    const TaskIcon = task[1]?.toLowerCase() === 'x' ? IconSquareCheck : IconSquare;
    return (
      <div className="note-preview-task" key={index}>
        <TaskIcon aria-hidden="true" />
        <span>{task[2]}</span>
      </div>
    );
  }
  const bullet = /^\s*[-*]\s+(.*)$/u.exec(line);
  if (bullet) return <li key={index}>{bullet[1]}</li>;
  if (line.trim() === '') return <br key={index} />;
  return <p key={index}>{line}</p>;
}

export function NotePreview({ body, label }: { body: string; label: string }) {
  return (
    <section aria-label={label} className="note-preview" data-testid="note-preview">
      {body.split(/\r?\n/u).map(renderLine)}
    </section>
  );
}
