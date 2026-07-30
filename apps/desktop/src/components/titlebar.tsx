import { IconMenu2 } from '@tabler/icons-react';
import { m as motion } from 'motion/react';

import { useMessages } from '@/app/providers';
import { LocaleMenu } from '@/components/locale-menu';
import { ThemeMenu } from '@/components/theme-menu';
import { Button } from '@/components/ui/button';
import { usePressFeedback } from '@/motion/press';

export function Titlebar({ onOpenRail }: { onOpenRail(): void }) {
  const m = useMessages();
  const railPress = usePressFeedback();
  return (
    <header className="titlebar">
      <Button
        aria-label={m.navigation_open()}
        className="rail-trigger"
        onKeyDown={railPress.onKeyDown}
        onKeyUp={railPress.onKeyUp}
        onClick={onOpenRail}
        onPointerCancel={railPress.onPointerCancel}
        onPointerDown={railPress.onPointerDown}
        onPointerLeave={railPress.onPointerLeave}
        onPointerUp={railPress.onPointerUp}
        size="icon-sm"
        variant="ghost"
      >
        <motion.span aria-hidden style={railPress.style}>
          <IconMenu2 />
        </motion.span>
      </Button>
      <strong className="titlebar-name">{m.app_title()}</strong>
      <div className="titlebar-actions">
        <ThemeMenu />
        <LocaleMenu />
      </div>
    </header>
  );
}
