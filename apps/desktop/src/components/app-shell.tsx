import type { PropsWithChildren } from 'react';
import { WindowDragRegion } from '@/components/shelf-chrome';
import { useNativePreferences } from '@/features/preferences/preferences-context';

export function AppShell({ children }: PropsWithChildren) {
  const { capabilities } = useNativePreferences();
  const isWindows = capabilities
    ? capabilities.platform === 'windows'
    : navigator.platform.startsWith('Win');
  return (
    <div className="desktop-shell" data-native-titlebar={isWindows || undefined}>
      {isWindows ? null : <WindowDragRegion />}
      <main className="work-area" id="main-content" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
