import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

/** The shelf's two search-trailing transient surfaces, which the command menu can open. */
export type ShelfSurface = 'help' | 'preferences';

type ShelfSurfaceRequest = { surface: ShelfSurface; requestId: number };

type ShelfSurfaceContextValue = {
  request: ShelfSurfaceRequest | null;
  open(surface: ShelfSurface): void;
  consume(requestId: number): void;
};

const ShelfSurfaceContext = createContext<ShelfSurfaceContextValue | null>(null);

export function ShelfSurfaceProvider({ children }: PropsWithChildren) {
  const [request, setRequest] = useState<ShelfSurfaceRequest | null>(null);
  const nextIdRef = useRef(0);
  const open = useCallback((surface: ShelfSurface) => {
    nextIdRef.current += 1;
    setRequest({ surface, requestId: nextIdRef.current });
  }, []);
  const consume = useCallback((requestId: number) => {
    setRequest((current) => (current?.requestId === requestId ? null : current));
  }, []);
  const value = useMemo(() => ({ request, open, consume }), [consume, open, request]);
  return <ShelfSurfaceContext.Provider value={value}>{children}</ShelfSurfaceContext.Provider>;
}

export function useShelfSurface() {
  const value = useContext(ShelfSurfaceContext);
  if (!value) throw new Error('useShelfSurface must be used inside ShelfSurfaceProvider');
  return value;
}
