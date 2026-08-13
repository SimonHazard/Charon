import { IconHelp } from '@tabler/icons-react';
import { m as motion } from 'motion/react';

import { useMessages } from '@/app/providers';
import icon from '@/assets/brand/charon-icon-lavender.svg';
import wordmark from '@/assets/brand/charon-wordmark-color.svg';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PreferencesPanel } from '@/features/preferences/preferences-panel';
import { usePressFeedback } from '@/motion/press';

export function Titlebar() {
  const m = useMessages();
  const helpPress = usePressFeedback();
  return (
    <header className="titlebar" data-tauri-drag-region>
      <picture className="titlebar-brand">
        <source media="(max-width: 159px)" srcSet={icon} />
        <img
          alt={m.app_title()}
          className="titlebar-wordmark"
          height="19"
          src={wordmark}
          width="88"
        />
      </picture>
      <div className="titlebar-actions">
        <Popover>
          <Tooltip>
            <TooltipTrigger
              render={
                <PopoverTrigger
                  aria-label={m.shortcut_help_title()}
                  onKeyDown={helpPress.onKeyDown}
                  onKeyUp={helpPress.onKeyUp}
                  onPointerCancel={helpPress.onPointerCancel}
                  onPointerDown={helpPress.onPointerDown}
                  onPointerLeave={helpPress.onPointerLeave}
                  onPointerUp={helpPress.onPointerUp}
                  render={<Button size="icon-sm" variant="ghost" />}
                />
              }
            >
              <motion.span aria-hidden style={helpPress.style}>
                <IconHelp />
              </motion.span>
            </TooltipTrigger>
            <TooltipContent>{m.shortcut_help_title()}</TooltipContent>
          </Tooltip>
          <PopoverContent align="end" className="help-popover" sideOffset={4}>
            <PopoverHeader>
              <PopoverTitle>{m.capture_help_title()}</PopoverTitle>
              <PopoverDescription className="help-shortcut-list">
                <span className="help-shortcut-row">
                  <kbd>{m.capture_help_double_shift_keys()}</kbd>
                  <span>{m.capture_help_double_shift_description()}</span>
                </span>
                <span className="help-shortcut-row">
                  <kbd>{m.capture_help_composer_keys()}</kbd>
                  <span>{m.capture_help_composer_description()}</span>
                </span>
              </PopoverDescription>
            </PopoverHeader>
          </PopoverContent>
        </Popover>
        <PreferencesPanel />
      </div>
    </header>
  );
}
