import { IconEdit } from '@tabler/icons-react';
import {
  type ComponentPropsWithoutRef,
  createContext,
  isValidElement,
  type PropsWithChildren,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
} from 'react';
import { useMessages } from '@/app/providers';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { type Drawing, parseDrawingSvg } from '@/features/notes/drawing/drawing-format';
import { DrawingPaths } from '@/features/notes/drawing/drawing-paths';

export type DrawingEditRequest = {
  /**
   * Position among the editable (top-level) drawings rendered in the same
   * preview, which matches `findDrawingBlocks`.
   */
  index: number;
  drawing: Drawing;
  trigger: HTMLElement;
};

type EditDrawing = (request: DrawingEditRequest) => void;

const DrawingEditContext = createContext<EditDrawing | undefined>(undefined);
const NestedDrawingContext = createContext(false);

export function DrawingPreviewProvider({
  onEdit,
  children,
}: PropsWithChildren<{ onEdit?: EditDrawing }>) {
  return <DrawingEditContext.Provider value={onEdit}>{children}</DrawingEditContext.Provider>;
}

/**
 * Marks Preview content inside a blockquote, list item, or footnote. A drawing
 * there is shown but never edited from Preview: Charon edits and inserts only
 * top-level drawing blocks, so editing one in a container would add a copy.
 */
export function NestedDrawingScope({ children }: PropsWithChildren) {
  return <NestedDrawingContext.Provider value>{children}</NestedDrawingContext.Provider>;
}

function DrawingFigure({ drawing }: { drawing: Drawing }) {
  const m = useMessages();
  const nested = useContext(NestedDrawingContext);
  const onEdit = useContext(DrawingEditContext);
  const edit = nested ? undefined : onEdit;
  const figureRef = useRef<HTMLElement>(null);
  const { x, y, width, height } = drawing.viewBox;
  return (
    <figure className="note-drawing" data-drawing-editable={edit ? '' : undefined} ref={figureRef}>
      <svg
        aria-label={m.drawing_label()}
        height={height}
        role="img"
        viewBox={`${x} ${y} ${width} ${height}`}
        width={width}
      >
        <DrawingPaths strokes={drawing.strokes} />
      </svg>
      {edit ? (
        <Tooltip>
          <TooltipTrigger
            aria-label={m.drawing_edit()}
            className="note-drawing-edit"
            onClick={(event) => {
              const figure = figureRef.current;
              const scope = figure?.closest('.note-preview') ?? figure?.parentElement;
              const figures = [
                ...(scope?.querySelectorAll('figure.note-drawing[data-drawing-editable]') ?? []),
              ];
              edit({
                index: Math.max(0, figure ? figures.indexOf(figure) : 0),
                drawing,
                trigger: event.currentTarget,
              });
            }}
            render={<Button size="icon-sm" variant="ghost" />}
          >
            <IconEdit aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>{m.drawing_edit()}</TooltipContent>
        </Tooltip>
      ) : null}
    </figure>
  );
}

function codeText(children: ReactNode): string | null {
  if (!isValidElement<{ children?: unknown }>(children)) return null;
  return typeof children.props.children === 'string' ? children.props.children : null;
}

/**
 * Markdown `pre` override: a fenced ```svg block that passes the format v1
 * whitelist renders as a drawing re-created from validated values; every
 * other block, including an invalid or hostile `svg` block, stays code.
 */
export function DrawingAwarePre(props: ComponentPropsWithoutRef<'pre'>) {
  const attributes = props as ComponentPropsWithoutRef<'pre'> & {
    'data-lang'?: string;
    'data-meta'?: string;
  };
  const source =
    attributes['data-lang'] === 'svg' && attributes['data-meta'] === undefined
      ? codeText(props.children)
      : null;
  const drawing = useMemo(() => (source === null ? null : parseDrawingSvg(source)), [source]);
  return drawing ? <DrawingFigure drawing={drawing} /> : <pre {...props} />;
}
