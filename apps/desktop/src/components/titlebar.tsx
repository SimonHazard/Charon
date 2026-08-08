import { IconHelp, IconSettings } from '@tabler/icons-react';
import { m as motion } from 'motion/react';

import { useMessages, usePreferences } from '@/app/providers';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePressFeedback } from '@/motion/press';

export function Titlebar() {
  const m = useMessages();
  const preferences = usePreferences();
  const helpPress = usePressFeedback();
  const settingsPress = usePressFeedback();
  return (
    <header className="titlebar" data-tauri-drag-region>
      <picture className="titlebar-brand" aria-label={m.app_title()}>
        <source media="(max-width: 159px)" srcSet={icon} />
        <img alt="" className="titlebar-wordmark" src={wordmark} />
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
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={m.navigation_settings()}
            onKeyDown={settingsPress.onKeyDown}
            onKeyUp={settingsPress.onKeyUp}
            onPointerCancel={settingsPress.onPointerCancel}
            onPointerDown={settingsPress.onPointerDown}
            onPointerLeave={settingsPress.onPointerLeave}
            onPointerUp={settingsPress.onPointerUp}
            render={<Button size="icon-sm" variant="ghost" />}
          >
            <motion.span aria-hidden style={settingsPress.style}>
              <IconSettings />
            </motion.span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuLabel>{m.theme_menu_label()}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => preferences.setTheme('solarized')}>
                {m.theme_solarized()}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => preferences.setTheme('light')}>
                {m.theme_light()}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => preferences.setTheme('dark')}>
                {m.theme_dark()}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel>{m.locale_menu_label()}</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => preferences.setLocale('en')}>
                {m.locale_english()}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => preferences.setLocale('fr')}>
                {m.locale_french()}
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
