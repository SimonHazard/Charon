import { IconHelp } from '@tabler/icons-react';
import { m as motion } from 'motion/react';
import { useMessages } from '@/app/providers';
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
import { MarkdownHelp } from '@/features/notes/markdown-help';
import { useNativePreferences } from '@/features/preferences/preferences-context';
import { PreferencesPanel } from '@/features/preferences/preferences-panel';
import { usePressFeedback } from '@/motion/press';

export function WindowDragRegion() {
  return <div aria-hidden="true" className="window-drag-region" data-tauri-drag-region />;
}

export function ShelfActions() {
  const m = useMessages();
  const { capabilities } = useNativePreferences();
  const helpPress = usePressFeedback();
  const isMacos =
    capabilities?.platform === 'macos' || (!capabilities && navigator.platform.startsWith('Mac'));
  return (
    <div className="shelf-actions">
      <Popover>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                aria-label={m.shortcut_help_title()}
                className="shelf-action-button"
                onBlur={helpPress.onBlur}
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
        <PopoverContent align="end" className="help-popover" sideOffset={8}>
          <PopoverHeader>
            <PopoverTitle>{m.capture_help_title()}</PopoverTitle>
            <PopoverDescription className="help-shortcut-list">
              {capabilities?.doubleShift === 'available' ||
              capabilities?.doubleShift === 'experimental' ||
              capabilities?.platform === 'macos' ? (
                <span className="help-shortcut-row">
                  <kbd>{m.capture_help_double_shift_keys()}</kbd>
                  <span>
                    {capabilities?.doubleShift === 'experimental'
                      ? m.capture_experimental_description()
                      : m.capture_help_double_shift_description()}
                  </span>
                </span>
              ) : (
                <span className="help-shortcut-row">
                  <span>{m.preferences_platform_fallback()}</span>
                </span>
              )}
              <span className="help-shortcut-row">
                <kbd>
                  {capabilities?.platform === 'linuxWayland'
                    ? capabilities.activeShortcut || m.capture_portal_shortcut()
                    : isMacos
                      ? m.preferences_shortcut_macos()
                      : m.preferences_shortcut_other()}
                </kbd>
                <span>{m.capture_help_composer_description()}</span>
              </span>
            </PopoverDescription>
          </PopoverHeader>
          <MarkdownHelp />
        </PopoverContent>
      </Popover>
      <PreferencesPanel />
    </div>
  );
}
