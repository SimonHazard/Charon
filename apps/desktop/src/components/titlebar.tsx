import { IconKeyboard, IconMenu2 } from '@tabler/icons-react';
import { m as motion } from 'motion/react';

import { useCommandRegistry } from '@/app/commands/command-provider';
import { useMessages } from '@/app/providers';
import { LocaleMenu } from '@/components/locale-menu';
import { ThemeMenu } from '@/components/theme-menu';
import { Button } from '@/components/ui/button';
import { usePressFeedback } from '@/motion/press';

export function Titlebar({ onOpenRail }: { onOpenRail(): void }) {
  const m = useMessages();
  const commands = useCommandRegistry();
  const railPress = usePressFeedback();
  const helpPress = usePressFeedback();
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
        <Button
          aria-label={m.shortcut_help_title()}
          onClick={() => commands.execute('app.shortcut-help')}
          onKeyDown={helpPress.onKeyDown}
          onKeyUp={helpPress.onKeyUp}
          onPointerCancel={helpPress.onPointerCancel}
          onPointerDown={helpPress.onPointerDown}
          onPointerLeave={helpPress.onPointerLeave}
          onPointerUp={helpPress.onPointerUp}
          size="icon-sm"
          variant="ghost"
        >
          <motion.span aria-hidden style={helpPress.style}>
            <IconKeyboard />
          </motion.span>
        </Button>
        <ThemeMenu />
        <LocaleMenu />
      </div>
    </header>
  );
}
