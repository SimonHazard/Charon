import { memo } from 'react';
import { type Stroke, strokePathData } from '@/features/notes/drawing/drawing-format';

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
 * Re-creates `<path>` elements from validated Stroke values only. Path data is
 * re-serialized from parsed numbers, never copied from source text.
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
