import { createContext, useContext } from 'react';

import type { Drawing } from '@/features/notes/drawing/drawing-format';

/** Copies one drawing as an image; resolves false when it could not (ADR 0033). */
export type CopyDrawingImage = (drawing: Drawing) => Promise<boolean>;

const DrawingCopyContext = createContext<CopyDrawingImage | undefined>(undefined);

/** Where the shelf can write an image to the clipboard, drawings offer Copy image. */
export const DrawingCopyProvider = DrawingCopyContext.Provider;

export function useDrawingCopy() {
  return useContext(DrawingCopyContext);
}
