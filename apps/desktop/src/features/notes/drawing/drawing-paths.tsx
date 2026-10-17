import { memo } from 'react';
import {
  DRAWING_TEXT_FONT,
  type Stroke,
  strokePathData,
} from '@/features/notes/drawing/drawing-format';

const strokeKeys = new WeakMap<Stroke, number>();
let nextStrokeKey = 0;

/** Stable React key for an immutable Stroke object. */
export function strokeKey(stroke: Stroke): string {
  let key = strokeKeys.get(stroke);
  if (key === undefined) {
    nextStrokeKey += 1;
    key = nextStrokeKey;
    strokeKeys.set(stroke, key);
  }
  return String(key);
}

/**
 * Re-creates `<path>` and `<text>` elements from validated Stroke values only. Path data is
 * re-serialized from parsed numbers, never copied from source text; a label's checked content
 * becomes a text node, never markup.
 */
export const DrawingPaths = memo(function DrawingPaths({
  strokes,
  keyed = false,
}: {
  strokes: readonly Stroke[];
  keyed?: boolean;
}) {
  return strokes.map((stroke) => {
    const key = strokeKey(stroke);
    if (stroke.text) {
      return (
        <text
          data-stroke-key={keyed ? key : undefined}
          fill={stroke.color}
          fontFamily={DRAWING_TEXT_FONT}
          fontSize={stroke.text.size}
          key={key}
          style={{ whiteSpace: 'pre' }}
          x={stroke.text.x}
          y={stroke.text.y}
        >
          {stroke.text.content}
        </text>
      );
    }
    return (
      <path
        d={strokePathData(stroke)}
        data-stroke-key={keyed ? key : undefined}
        fill="none"
        key={key}
        stroke={stroke.color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity={stroke.opacity ?? undefined}
        strokeWidth={stroke.width}
      />
    );
  });
});
