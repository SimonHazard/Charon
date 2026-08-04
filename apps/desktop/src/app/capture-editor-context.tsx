import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import type { CaptureEditorRequest } from '@/bindings/capture';

type CaptureEditorContextValue = {
  request: CaptureEditorRequest | null;
  receive(request: CaptureEditorRequest): void;
  consume(requestId: number): void;
};

const CaptureEditorContext = createContext<CaptureEditorContextValue | null>(null);

export function CaptureEditorProvider({ children }: PropsWithChildren) {
  const [request, setRequest] = useState<CaptureEditorRequest | null>(null);
  const consume = useCallback((requestId: number) => {
    setRequest((current) => (current?.requestId === requestId ? null : current));
  }, []);
  const value = useMemo(() => ({ request, receive: setRequest, consume }), [consume, request]);
  return <CaptureEditorContext.Provider value={value}>{children}</CaptureEditorContext.Provider>;
}

export function useCaptureEditor() {
  const value = useContext(CaptureEditorContext);
  if (!value) throw new Error('useCaptureEditor must be used inside CaptureEditorProvider');
  return value;
}
