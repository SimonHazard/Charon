import { Markdown, type MarkdownComponents } from '@tanstack/markdown/react';
import { useMessages } from '@/app/providers';
import {
  DrawingAwarePre,
  type DrawingEditRequest,
  DrawingPreviewProvider,
  NestedDrawingScope,
} from '@/features/notes/drawing/drawing-figure';

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
  // Validated drawings are re-created as svg/path elements; anything else stays code.
  pre: DrawingAwarePre,
  // Drawings in quotes, list items, and footnotes render without an Edit button.
  blockquote: ({ children }) => (
    <blockquote>
      <NestedDrawingScope>{children}</NestedDrawingScope>
    </blockquote>
  ),
  li: ({ children, ...props }) => (
    <li {...props}>
      <NestedDrawingScope>{children}</NestedDrawingScope>
    </li>
  ),
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

export function NotePreview({
  body,
  label,
  onEditDrawing,
}: {
  body: string;
  label: string;
  onEditDrawing?(request: DrawingEditRequest): void;
}) {
  return (
    <section aria-label={label} className="note-preview" data-testid="note-preview">
      <DrawingPreviewProvider onEdit={onEditDrawing}>
        {/* Front matter off: a leading `---` is a divider, so no Note text is ever hidden. */}
        <Markdown allowHtml={false} components={components} frontmatter={false}>
          {body}
        </Markdown>
      </DrawingPreviewProvider>
    </section>
  );
}
