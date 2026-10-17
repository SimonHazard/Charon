import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useRef,
} from 'react';

import type { ShellClient } from '@/lib/ipc/shell-client';

/** Resolves true when quitting would lose nothing unsent. */
export type QuitHandler = () => Promise<boolean>;

type QuitRequestValue = {
  registerQuitHandler(handler: QuitHandler): () => void;
  /** Runs the registered draft guard; without one, nothing can be lost. */
  confirmQuit(): Promise<boolean>;
  /** An explicit Quit: exits only after the draft guard passes. */
  quit(): Promise<void>;
  /**
   * Hides Charon and returns focus to the previous application (ADR 0031). Drafts stay in place:
   * hiding never closes the window or the editor. A no-op outside the desktop shell.
   */
  hide(): void;
};

const QuitRequestContext = createContext<QuitRequestValue | null>(null);

export function QuitRequestProvider({
  children,
  client,
  enabled = true,
}: PropsWithChildren<{ client: ShellClient; enabled?: boolean }>) {
  const handlerRef = useRef<QuitHandler | null>(null);
  const registerQuitHandler = useCallback((handler: QuitHandler) => {
    handlerRef.current = handler;
    return () => {
      if (handlerRef.current === handler) handlerRef.current = null;
    };
  }, []);
  const confirmQuit = useCallback(() => handlerRef.current?.() ?? Promise.resolve(true), []);
  const quit = useCallback(async () => {
    if (await confirmQuit()) await client.quit();
  }, [client, confirmQuit]);
  const hide = useCallback(() => {
    if (enabled) void client.hide().catch(() => undefined);
  }, [client, enabled]);
  const value = useMemo(
    () => ({ registerQuitHandler, confirmQuit, quit, hide }),
    [confirmQuit, hide, quit, registerQuitHandler],
  );
  return <QuitRequestContext.Provider value={value}>{children}</QuitRequestContext.Provider>;
}

export function useQuitRequest() {
  const value = useContext(QuitRequestContext);
  if (!value) throw new Error('useQuitRequest must be used inside QuitRequestProvider');
  return value;
}
