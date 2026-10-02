import { IconHelp } from '@tabler/icons-react';
import { useId, useRef } from 'react';
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
import { formatShortcut } from '@/lib/shortcut-label';

export function WindowDragRegion() {
  return <div aria-hidden="true" className="window-drag-region" data-tauri-drag-region />;
}

export function ShelfActions() {
  const m = useMessages();
  const notesTitleId = useId();
  const helpPopupRef = useRef<HTMLDivElement>(null);
  const { capabilities } = useNativePreferences();
  const isMacos =
    capabilities?.platform === 'macos' || (!capabilities && navigator.platform.startsWith('Mac'));
  const keyLabels = {
    shift: m.shortcut_key_shift(),
    space: m.shortcut_key_space(),
    home: m.shortcut_key_home(),
    end: m.shortcut_key_end(),
    pageUp: m.shortcut_key_page_up(),
    pageDown: m.shortcut_key_page_down(),
    escape: m.shortcut_key_escape(),
  };
  const noteKey = (accelerator: string) =>
    formatShortcut(
      accelerator,
      capabilities?.platform ?? (isMacos ? 'macos' : 'unknown'),
      keyLabels,
    );
  const noteShortcuts = [
    [[noteKey('CmdOrCtrl+C')], m.note_shortcut_copy()],
    [[noteKey('CmdOrCtrl+S')], m.note_shortcut_save()],
    [[noteKey('Home'), noteKey('End')], m.note_shortcut_home_end()],
    [[noteKey('PageUp'), noteKey('PageDown')], m.note_shortcut_page()],
    [[noteKey('Esc')], m.note_shortcut_clear_search()],
  ] as const;
  const shortcutLabel = capabilities
    ? capabilities.activeShortcut
      ? formatShortcut(capabilities.activeShortcut, capabilities.platform, keyLabels)
      : m.capture_portal_shortcut()
    : formatShortcut(
        isMacos ? 'CmdOrCtrl+Shift+Space' : 'Alt+Shift+Space',
        isMacos ? 'macos' : 'unknown',
        keyLabels,
      );
  return (
    <div className="shelf-actions">
      <Popover>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                aria-label={m.shortcut_help_title()}
                className="shelf-action-button"
                render={<Button size="icon-sm" variant="ghost" />}
              />
            }
          >
            <IconHelp aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent>{m.shortcut_help_title()}</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          className="help-popover"
          // Help scrolls in a short window; open at its title, not at the last control.
          initialFocus={helpPopupRef}
          ref={helpPopupRef}
          sideOffset={8}
        >
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
                <kbd>{shortcutLabel}</kbd>
                <span>{m.capture_help_composer_description()}</span>
              </span>
            </PopoverDescription>
          </PopoverHeader>
          <section aria-labelledby={notesTitleId} className="help-shortcut-section">
            <h3 className="help-shortcut-title" id={notesTitleId}>
              {m.shortcut_help_notes_title()}
            </h3>
            <div className="help-shortcut-list">
              {noteShortcuts.map(([keys, description]) => (
                <span className="help-shortcut-row" key={keys.join(' ')}>
                  <span className="help-shortcut-keys">
                    {keys.map((key) => (
                      <kbd key={key}>{key}</kbd>
                    ))}
                  </span>
                  <span>{description}</span>
                </span>
              ))}
            </div>
          </section>
          <MarkdownHelp />
        </PopoverContent>
      </Popover>
      <PreferencesPanel />
    </div>
  );
}
