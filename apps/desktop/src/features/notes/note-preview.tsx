import { Markdown, type MarkdownComponents } from '@tanstack/markdown/react';
import { useMessages } from '@/app/providers';

const components = {
  h1: ({ children }) => <h2>{children}</h2>,
  h2: ({ children }) => <h3>{children}</h3>,
  h3: ({ children }) => <h4>{children}</h4>,
  h4: ({ children }) => <h5>{children}</h5>,
  h5: ({ children }) => <h6>{children}</h6>,
  h6: ({ children }) => <h6>{children}</h6>,
  a: ({ children, href }) => (
    <span className="note-preview-link">
      {children}
      {href ? (
        <>
          {' '}
          (<span>{href}</span>)
        </>
      ) : null}
    </span>
  ),
  // Never create an image element: even a remote src must not reach the browser loader.
  img: ({ alt }) => <span className="note-preview-image">{alt}</span>,
  input: function Task({ checked }) {
    const m = useMessages();
    return (
      <input
        type="checkbox"
        checked={Boolean(checked)}
        disabled
        aria-label={checked ? m.markdown_task_done() : m.markdown_task_open()}
      />
    );
  },
} satisfies MarkdownComponents;

export function NotePreview({ body, label }: { body: string; label: string }) {
  return (
    <section aria-label={label} className="note-preview" data-testid="note-preview">
      <Markdown allowHtml={false} components={components}>
        {body}
      </Markdown>
    </section>
  );
}
