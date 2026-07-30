import { type PropsWithChildren, useState } from 'react';

import { useMessages } from '@/app/providers';
import { SectionRail } from '@/components/section-rail';
import { Titlebar } from '@/components/titlebar';

export const shellLayout = {
  railWidth: 240,
  mobileBreakpoint: 760,
} as const;

export function AppShell({
  children,
  inspector,
}: PropsWithChildren<{ inspector?: React.ReactNode }>) {
  const m = useMessages();
  const [railOpen, setRailOpen] = useState(false);

  return (
    <div className="desktop-shell">
      <Titlebar onOpenRail={() => setRailOpen(true)} />
      <SectionRail mobileOpen={railOpen} onMobileOpenChange={setRailOpen} />
      <main className="work-area" id="main-content" tabIndex={-1}>
        {children}
      </main>
      {inspector ? <aside className="context-inspector">{inspector}</aside> : null}
      <footer className="status-region" role="status">
        {m.status_local_only()}
      </footer>
    </div>
  );
}
