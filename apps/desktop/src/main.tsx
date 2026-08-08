import { Component, type ErrorInfo, type PropsWithChildren, StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { AppProviders } from '@/app/providers';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/toast';
import { TooltipProvider } from '@/components/ui/tooltip';
import { WorkspaceState } from '@/components/workspace-state';
import { NoteScreen } from '@/features/notes/note-screen';
import { m } from '@/paraglide/messages.js';

import './styles/app.css';

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
            <AppProviders>
              <AppShell>
                <WorkspaceState>{(snapshot) => <NoteScreen snapshot={snapshot} />}</WorkspaceState>
              </AppShell>
            </AppProviders>
          </TooltipProvider>
        </Toaster>
      </AppErrorBoundary>
    </StrictMode>,
  );
}
