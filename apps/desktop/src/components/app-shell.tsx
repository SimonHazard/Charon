import type { PropsWithChildren } from 'react';
import { Titlebar } from '@/components/titlebar';

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="desktop-shell">
      <Titlebar />
      <main className="work-area" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
