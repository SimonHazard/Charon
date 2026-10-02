import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

/** A successful selected-text capture: the new Note's random id and when it arrived. */
export type CaptureAcknowledgement = { noteId: string; at: number };

type CaptureAcknowledgementContextValue = {
  acknowledgement: CaptureAcknowledgement | null;
  publish(acknowledgement: CaptureAcknowledgement): void;
  consume(acknowledgement: CaptureAcknowledgement): void;
};

const CaptureAcknowledgementContext = createContext<CaptureAcknowledgementContextValue | null>(
  null,
);

export function CaptureAcknowledgementProvider({ children }: PropsWithChildren) {
  const [acknowledgement, setAcknowledgement] = useState<CaptureAcknowledgement | null>(null);
  // A later success replaces an earlier one that the shelf has not shown yet.
  const publish = useCallback((next: CaptureAcknowledgement) => setAcknowledgement(next), []);
  const consume = useCallback((handled: CaptureAcknowledgement) => {
    setAcknowledgement((current) => (current === handled ? null : current));
  }, []);
  const value = useMemo(
    () => ({ acknowledgement, publish, consume }),
    [acknowledgement, consume, publish],
  );
  return (
    <CaptureAcknowledgementContext.Provider value={value}>
      {children}
    </CaptureAcknowledgementContext.Provider>
  );
}

export function useCaptureAcknowledgement() {
  const value = useContext(CaptureAcknowledgementContext);
  if (!value) {
    throw new Error('useCaptureAcknowledgement must be used inside CaptureAcknowledgementProvider');
  }
  return value;
}
