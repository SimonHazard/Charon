import { IconHelp } from '@tabler/icons-react';
import { m as motion } from 'motion/react';

import { useMessages } from '@/app/providers';
import icon from '@/assets/brand/charon-icon-lavender.svg';
import wordmark from '@/assets/brand/charon-wordmark-color.svg';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { PreferencesPanel } from '@/features/preferences/preferences-panel';
import { usePressFeedback } from '@/motion/press';

export function Titlebar() {
  const m = useMessages();
  const helpPress = usePressFeedback();
  return (
    <header className="titlebar" data-tauri-drag-region>
      <picture className="titlebar-brand">
        <source media="(max-width: 159px)" srcSet={icon} />
        <img alt={m.app_title()} className="titlebar-wordmark" src={wordmark} />
      </picture>
      <div className="titlebar-actions">
        <AlertDialog>
          <AlertDialogTrigger
            aria-label={m.shortcut_help_title()}
            onKeyDown={helpPress.onKeyDown}
            onKeyUp={helpPress.onKeyUp}
            onPointerCancel={helpPress.onPointerCancel}
            onPointerDown={helpPress.onPointerDown}
            onPointerLeave={helpPress.onPointerLeave}
            onPointerUp={helpPress.onPointerUp}
            render={<Button size="icon-sm" variant="ghost" />}
          >
            <motion.span aria-hidden style={helpPress.style}>
              <IconHelp />
            </motion.span>
          </AlertDialogTrigger>
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{m.capture_help_title()}</AlertDialogTitle>
              <AlertDialogDescription>{m.capture_help_description()}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{m.common_close()}</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <PreferencesPanel />
      </div>
    </header>
  );
}
