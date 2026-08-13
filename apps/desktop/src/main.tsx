import { Component, type ErrorInfo, type PropsWithChildren, StrictMode, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { useComposerFocus } from '@/app/composer-focus-context';
import { AppProviders } from '@/app/providers';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WorkspaceState } from '@/components/workspace-state';
import { NoteScreen } from '@/features/notes/note-screen';
import { m } from '@/paraglide/messages.js';

import './styles/app.css';

const demoMode =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('fixture') === 'demo';
const demoFixture = demoMode ? await import('@/test/demo-workspace') : null;
const demoWorkspaceClient = demoFixture?.demoWorkspaceClient;
const demoClipboardClient = demoFixture?.demoClipboardClient;

function DemoComposerBridge() {
  const composer = useComposerFocus();
  useEffect(() => {
    if (!demoMode) return;
    let requestId = 0;
    const focus = () => composer.receive({ requestId: ++requestId });
    window.addEventListener('charon:fixture-composer-focus', focus);
    return () => window.removeEventListener('charon:fixture-composer-focus', focus);
  }, [composer]);
  return null;
}

const rootElement = document.getElementById('app');

class AppErrorBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // Runtime details can contain user content, so the UI deliberately does not log them.
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="app-fatal" role="alert">
          <p>{m.app_error_description()}</p>
          <Button onClick={() => window.location.reload()}>{m.app_error_reload()}</Button>
        </main>
      );
    }
    return this.props.children;
  }
}

if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <Toaster>
          <TooltipProvider>
            <AppProviders workspaceClient={demoWorkspaceClient}>
              <DemoComposerBridge />
              <AppShell>
                <WorkspaceState>
                  {(snapshot) => (
                    <NoteScreen clipboardClient={demoClipboardClient} snapshot={snapshot} />
                  )}
                </WorkspaceState>
              </AppShell>
            </AppProviders>
          </TooltipProvider>
        </Toaster>
      </AppErrorBoundary>
    </StrictMode>,
  );
}
