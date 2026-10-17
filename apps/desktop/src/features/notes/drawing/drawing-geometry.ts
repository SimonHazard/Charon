import {
  type Box,
  formatPathData,
  type PathCommand,
  roundCoordinate,
  type Stroke,
  strokeCoordinates,
  textBox,
} from '@/features/notes/drawing/drawing-format';

export type Point = { x: number; y: number };

export const MIN_POINT_DISTANCE = 1.5;
export const ERASER_REACH = 6;
/** Keeps one stroke well below the 20,000-number path limit (4 per point). */
export const MAX_TRACE_POINTS = 4_000;

type ClientRect = { left: number; top: number; width: number; height: number };

/**
 * Maps a client position into the logical space of an SVG whose viewBox is
 * `space`, using the default `xMidYMid meet` fit, and clamps it to the space.
 */
export function clientToDrawing(
  clientX: number,
  clientY: number,
  rect: ClientRect,
  space: Box,
): Point | null {
  if (!(rect.width > 0 && rect.height > 0)) return null;
  const scale = Math.min(rect.width / space.width, rect.height / space.height);
  const offsetX = (rect.width - space.width * scale) / 2;
  const offsetY = (rect.height - space.height * scale) / 2;
  const x = space.x + (clientX - rect.left - offsetX) / scale;
  const y = space.y + (clientY - rect.top - offsetY) / scale;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: roundCoordinate(Math.min(space.x + space.width, Math.max(space.x, x))),
    y: roundCoordinate(Math.min(space.y + space.height, Math.max(space.y, y))),
  };
}

const midpoint = (a: Point, b: Point): Point => ({
  x: roundCoordinate((a.x + b.x) / 2),
  y: roundCoordinate((a.y + b.y) / 2),
});

/** Quadratic curves through midpoints; one point becomes a round dot. */
export function smoothStroke(points: readonly Point[]): PathCommand[] {
  const [first] = points;
  if (!first) return [];
  const last = points[points.length - 1] ?? first;
  const commands: PathCommand[] = [{ op: 'M', x: first.x, y: first.y }];
  for (let index = 1; index < points.length - 1; index += 1) {
    const control = points[index] ?? first;
    const end = midpoint(control, points[index + 1] ?? control);
    commands.push({ op: 'Q', cx: control.x, cy: control.y, x: end.x, y: end.y });
  }
  commands.push({ op: 'L', x: last.x, y: last.y });
  return commands;
}

/**
 * Incremental pen trace. Points closer than 1.5 units to the previous kept
 * point are dropped, and the live path data is extended rather than rebuilt
 * so pointer moves stay cheap on long strokes.
 */
export class StrokeTrace {
  readonly points: Point[];
  private prefix: string;

  constructor(start: Point) {
    this.points = [start];
    this.prefix = formatPathData([{ op: 'M', x: start.x, y: start.y }]);
  }

  get full(): boolean {
    return this.points.length >= MAX_TRACE_POINTS;
  }

  get last(): Point {
    return this.points[this.points.length - 1] as Point;
  }

  add(point: Point): boolean {
    const previous = this.last;
    if (Math.hypot(point.x - previous.x, point.y - previous.y) < MIN_POINT_DISTANCE) return false;
    this.points.push(point);
    const count = this.points.length;
    if (count >= 3) {
      const control = this.points[count - 2] as Point;
      const end = midpoint(control, point);
      this.prefix += formatPathData([
        { op: 'Q', cx: control.x, cy: control.y, x: end.x, y: end.y },
      ]);
    }
    return true;
  }

  data(): string {
    const last = this.last;
    return this.prefix + formatPathData([{ op: 'L', x: last.x, y: last.y }]);
  }

  commands(): PathCommand[] {
    return smoothStroke(this.points);
  }
}

function distanceToSegmentSquared(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  const x = a.x + t * dx - p.x;
  const y = a.y + t * dy - p.y;
  return x * x + y * y;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = cross(c, d, a);
  const d2 = cross(c, d, b);
  const d3 = cross(a, b, c);
  const d4 = cross(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  if (segmentsIntersect(a, b, c, d)) return 0;
  return Math.sqrt(
    Math.min(
      distanceToSegmentSquared(a, c, d),
      distanceToSegmentSquared(b, c, d),
      distanceToSegmentSquared(c, a, b),
      distanceToSegmentSquared(d, a, b),
    ),
  );
}

type Sampled = {
  values: number[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};
const sampledCache = new WeakMap<Stroke, Sampled>();

function sampled(stroke: Stroke): Sampled {
  let entry = sampledCache.get(stroke);
  if (!entry) {
    const values = strokeCoordinates(stroke);
    const bounds = {
      minX: Number.POSITIVE_INFINITY,
      minY: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      maxY: Number.NEGATIVE_INFINITY,
    };
    for (let index = 0; index < values.length; index += 2) {
      const x = values[index] ?? 0;
      const y = values[index + 1] ?? 0;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
    entry = { values, bounds };
    sampledCache.set(stroke, entry);
  }
  return entry;
}

/** Shapes drawn by dragging (ADR 0033); each is an ordinary stroked path. */
export type ShapeTool = 'line' | 'arrow' | 'rectangle' | 'ellipse';

const point = (x: number, y: number): Point => ({ x: roundCoordinate(x), y: roundCoordinate(y) });

/**
 * Path commands for a shape dragged from `start` to `end`. `constrain` (Shift) snaps lines to
 * 45° steps and makes rectangles square and ellipses round. Arrowheads scale with the width.
 */
export function shapeCommands(
  tool: ShapeTool,
  start: Point,
  end: Point,
  width: number,
  constrain = false,
): PathCommand[] {
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  if (constrain && (tool === 'line' || tool === 'arrow')) {
    const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    const length = Math.hypot(dx, dy);
    dx = Math.cos(angle) * length;
    dy = Math.sin(angle) * length;
  } else if (constrain) {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * side;
    dy = Math.sign(dy || 1) * side;
  }
  const tip = point(start.x + dx, start.y + dy);
  const origin = point(start.x, start.y);
  if (tool === 'line') {
    return [
      { op: 'M', ...origin },
      { op: 'L', ...tip },
    ];
  }
  if (tool === 'arrow') {
    const angle = Math.atan2(dy, dx);
    const head = Math.min(Math.max(12, width * 3.5), Math.max(6, Math.hypot(dx, dy) * 0.6));
    const spread = Math.PI / 7;
    const left = point(
      tip.x - head * Math.cos(angle - spread),
      tip.y - head * Math.sin(angle - spread),
    );
    const right = point(
      tip.x - head * Math.cos(angle + spread),
      tip.y - head * Math.sin(angle + spread),
    );
    return [
      { op: 'M', ...origin },
      { op: 'L', ...tip },
      { op: 'M', ...left },
      { op: 'L', ...tip },
      { op: 'L', ...right },
    ];
  }
  if (tool === 'rectangle') {
    return [
      { op: 'M', ...origin },
      { op: 'L', ...point(tip.x, origin.y) },
      { op: 'L', ...tip },
      { op: 'L', ...point(origin.x, tip.y) },
      { op: 'L', ...origin },
    ];
  }
  // An ellipse inside the dragged box: eight quadratic arcs whose control points sit on the
  // circumscribed octagon, within 1% of the true curve.
  const cx = (origin.x + tip.x) / 2;
  const cy = (origin.y + tip.y) / 2;
  const rx = Math.abs(tip.x - origin.x) / 2;
  const ry = Math.abs(tip.y - origin.y) / 2;
  const step = Math.PI / 4;
  const reach = 1 / Math.cos(step / 2);
  const commands: PathCommand[] = [{ op: 'M', ...point(cx + rx, cy) }];
  for (let index = 0; index < 8; index += 1) {
    const middle = (index + 0.5) * step;
    const next = (index + 1) * step;
    const control = point(cx + rx * reach * Math.cos(middle), cy + ry * reach * Math.sin(middle));
    const endPoint = point(cx + rx * Math.cos(next), cy + ry * Math.sin(next));
    commands.push({ op: 'Q', cx: control.x, cy: control.y, x: endPoint.x, y: endPoint.y });
  }
  return commands;
}

/** True when a shape is too small to be anything but a slip of the pointer. */
export function shapeIsTiny(start: Point, end: Point): boolean {
  return Math.hypot(end.x - start.x, end.y - start.y) < 3;
}

function boxHit(box: Box, from: Point, to: Point, reach: number): boolean {
  const left = box.x - reach;
  const top = box.y - reach;
  const right = box.x + box.width + reach;
  const bottom = box.y + box.height + reach;
  const inside = (p: Point) => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  if (inside(from) || inside(to)) return true;
  const corners: Point[] = [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
  return corners.some(
    (corner, index) => segmentDistance(from, to, corner, corners[(index + 1) % 4] ?? corner) === 0,
  );
}

/**
 * True when the eraser path from `from` to `to` passes within
 * `width / 2 + 6` units of the stroke's sampled polyline, or through a label's box.
 */
export function strokeHit(stroke: Stroke, from: Point, to: Point): boolean {
  if (stroke.text) return boxHit(textBox(stroke.text), from, to, ERASER_REACH);
  const reach = stroke.width / 2 + ERASER_REACH;
  const { values, bounds } = sampled(stroke);
  if (
    values.length < 2 ||
    Math.min(from.x, to.x) > bounds.maxX + reach ||
    Math.max(from.x, to.x) < bounds.minX - reach ||
    Math.min(from.y, to.y) > bounds.maxY + reach ||
    Math.max(from.y, to.y) < bounds.minY - reach
  ) {
    return false;
  }
  let previous: Point = { x: values[0] ?? 0, y: values[1] ?? 0 };
  if (values.length === 2) return segmentDistance(from, to, previous, previous) <= reach;
  for (let index = 2; index < values.length; index += 2) {
    const next: Point = { x: values[index] ?? 0, y: values[index + 1] ?? 0 };
    if (segmentDistance(from, to, previous, next) <= reach) return true;
    previous = next;
  }
  return false;
}
