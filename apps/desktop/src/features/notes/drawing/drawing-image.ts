import { type Drawing, serializeDrawing } from '@/features/notes/drawing/drawing-format';

/** Ink and paper of a copied drawing, so it reads in any chat or document it is pasted into. */
const IMAGE_INK = '#241523';
const IMAGE_PAPER = '#ffffff';
/** Pixels per drawing unit, capped so the longest side stays at most 4,096 pixels. */
const IMAGE_SCALE = 2;
const IMAGE_MAX_SIDE = 4_096;

/**
 * The drawing as a standalone SVG document for rendering: the validated drawing re-serialized,
 * text-coloured ink resolved to a fixed dark ink, on a white sheet. Never the Note's source text.
 */
export function drawingImageSvg(drawing: Drawing): string {
  const { x, y, width, height } = drawing.viewBox;
  const body = serializeDrawing(drawing)
    .split('\n')
    .slice(1, -1)
    .join('\n')
    .replaceAll('"currentColor"', `"${IMAGE_INK}"`);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}">`,
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${IMAGE_PAPER}"/>`,
    body,
    '</svg>',
  ].join('\n');
}

export function drawingImageSize(drawing: Drawing): { width: number; height: number } {
  const { width, height } = drawing.viewBox;
  const scale = Math.min(IMAGE_SCALE, IMAGE_MAX_SIDE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Renders one drawing to PNG bytes in the webview (ADR 0033). The SVG comes from validated values
 * and loads as a `data:` image, which the CSP allows and which never taints the canvas.
 */
export async function drawingToPng(drawing: Drawing): Promise<Uint8Array> {
  const image = new Image();
  image.decoding = 'async';
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(drawingImageSvg(drawing))}`;
  await image.decode();
  const { width, height } = drawingImageSize(drawing);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('canvas unavailable');
  context.drawImage(image, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('image encoding failed');
  return new Uint8Array(await blob.arrayBuffer());
}
