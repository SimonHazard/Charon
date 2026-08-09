import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import type { CaptureComposerRequest } from '@/bindings/capture';

type ComposerFocusContextValue = {
  request: CaptureComposerRequest | null;
  receive(request: CaptureComposerRequest): void;
  consume(requestId: number): void;
};

const ComposerFocusContext = createContext<ComposerFocusContextValue | null>(null);

export function ComposerFocusProvider({ children }: PropsWithChildren) {
  const [request, setRequest] = useState<CaptureComposerRequest | null>(null);
  const consume = useCallback((requestId: number) => {
    setRequest((current) => (current?.requestId === requestId ? null : current));
  }, []);
  const value = useMemo(() => ({ request, receive: setRequest, consume }), [consume, request]);
  return <ComposerFocusContext.Provider value={value}>{children}</ComposerFocusContext.Provider>;
}

export function useComposerFocus() {
  const value = useContext(ComposerFocusContext);
  if (!value) throw new Error('useComposerFocus must be used inside ComposerFocusProvider');
  return value;
}
