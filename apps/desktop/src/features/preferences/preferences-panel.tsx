import {
  IconAlertCircle,
  IconCheck,
  IconCircleCheck,
  IconInfoCircle,
  IconSettings,
} from '@tabler/icons-react';
import { m as motion } from 'motion/react';

import { useMessages, usePreferences } from '@/app/providers';
import { useWorkspace } from '@/app/workspace-context';
import type { CapabilityState, CapturePermissionKind } from '@/bindings/capture';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNativePreferences } from '@/features/preferences/preferences-context';
import { usePressFeedback } from '@/motion/press';

export function PreferencesPanel() {
  const m = useMessages();
  const appearance = usePreferences();
  const workspace = useWorkspace();
  const native = useNativePreferences();
  const press = usePressFeedback();

  const chooseWorkspace = async () => {
    if ((await workspace.chooseWorkspace()) === 'success') await native.refresh();
  };

  const switchToDefaultWorkspace = async () => {
    if (await workspace.openDefaultWorkspace()) await native.refresh();
  };

  const stateLabel = (state: CapabilityState) => {
    const labels = {
      available: m.preferences_state_available(),
      denied: m.preferences_state_denied(),
      unsupported: m.preferences_state_unsupported(),
      error: m.preferences_state_error(),
    };
    return labels[state];
  };

  const stateIcon = (state: CapabilityState) =>
    state === 'available' ? (
      <IconCircleCheck aria-hidden="true" className="capability-state-icon" data-state={state} />
    ) : (
      <IconAlertCircle aria-hidden="true" className="capability-state-icon" data-state={state} />
    );

  const permissionRow = (
    permission: CapturePermissionKind,
    state: CapabilityState,
    label: string,
    description: string,
    detailsLabel: string,
  ) => (
    <div className="preferences-permission-row">
      <div className="preferences-row-title">
        {stateIcon(state)}
        <span>{label}</span>
        <Tooltip>
          <TooltipTrigger
            aria-label={detailsLabel}
            className="preferences-info-button"
            render={<Button size="icon-xs" variant="ghost" />}
          >
            <IconInfoCircle aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent align="start" side="left" sideOffset={8}>
            <p>{description}</p>
          </TooltipContent>
        </Tooltip>
        <span className="preferences-state">{stateLabel(state)}</span>
      </div>
      {state !== 'available' && state !== 'unsupported' ? (
        <Button
          disabled={native.pendingPermission !== null}
          onClick={() => void native.requestPermission(permission)}
          size="sm"
          variant="outline"
        >
          {m.preferences_permission_open()}
        </Button>
      ) : null}
    </div>
  );

  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              aria-label={m.navigation_settings()}
              className="shelf-action-button"
              onKeyDown={press.onKeyDown}
              onKeyUp={press.onKeyUp}
              onPointerCancel={press.onPointerCancel}
              onPointerDown={press.onPointerDown}
              onPointerLeave={press.onPointerLeave}
              onPointerUp={press.onPointerUp}
              render={<Button size="icon-sm" variant="ghost" />}
            />
          }
        >
          <motion.span aria-hidden style={press.style}>
            <IconSettings />
          </motion.span>
        </TooltipTrigger>
        <TooltipContent>{m.navigation_settings()}</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="preferences-popover" sideOffset={8}>
        <PopoverHeader className="preferences-heading">
          <PopoverTitle>{m.preferences_title()}</PopoverTitle>
          <PopoverDescription>{m.preferences_description()}</PopoverDescription>
        </PopoverHeader>

        <section className="preferences-group">
          <h2>{m.preferences_appearance()}</h2>
          <ToggleGroup
            aria-label={m.theme_menu_label()}
            className="preferences-toggle"
            onValueChange={(values) => {
              const value = values[0];
              if (value === 'light' || value === 'dark') {
                appearance.setTheme(value);
              }
            }}
            value={[appearance.theme]}
          >
            {(['light', 'dark'] as const).map((theme) => (
              <ToggleGroupItem aria-label={m[`theme_${theme}`]()} key={theme} value={theme}>
                {appearance.theme === theme ? (
                  <IconCheck aria-hidden="true" className="preferences-choice-icon" />
                ) : null}
                {m[`theme_${theme}`]()}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>

        <section className="preferences-group">
          <h2>{m.preferences_language()}</h2>
          <ToggleGroup
            aria-label={m.locale_menu_label()}
            className="preferences-toggle"
            onValueChange={(values) => {
              const value = values[0];
              if (value === 'en' || value === 'fr') appearance.setLocale(value);
            }}
            value={[appearance.locale]}
          >
            {(['en', 'fr'] as const).map((locale) => (
              <ToggleGroupItem key={locale} value={locale}>
                {appearance.locale === locale ? (
                  <IconCheck aria-hidden="true" className="preferences-choice-icon" />
                ) : null}
                {locale === 'en' ? m.locale_english() : m.locale_french()}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </section>

        <section className="preferences-group">
          <h2>{m.preferences_workspace()}</h2>
          <div className="preferences-workspace-row">
            <div className="preferences-workspace-copy">
              <strong className="preferences-workspace-name">
                {native.preferences.workspaceName ?? m.preferences_workspace_default()}
              </strong>
              <p>{m.preferences_workspace_local()}</p>
            </div>
            <Button
              disabled={workspace.isChoosingWorkspace || workspace.isWorkspaceSwitchBlocked}
              onClick={() => void chooseWorkspace()}
              size="sm"
              variant="outline"
            >
              {m.preferences_workspace_choose()}
            </Button>
          </div>
          {workspace.isWorkspaceSwitchBlocked ? (
            <p className="preferences-inline-warning">{m.preferences_workspace_draft_blocked()}</p>
          ) : null}
          <Button
            disabled={workspace.isChoosingWorkspace || workspace.isWorkspaceSwitchBlocked}
            onClick={() => void switchToDefaultWorkspace()}
            size="sm"
            variant="ghost"
          >
            {m.workspace_use_default()}
          </Button>
        </section>

        <section className="preferences-group">
          <h2>{m.preferences_capture()}</h2>
          {native.loading ? (
            <p aria-live="polite" role="status">
              {m.preferences_loading()}
            </p>
          ) : null}
          {native.capabilities ? (
            <>
              <div className="preferences-shortcut-row">
                <span className="preferences-row-title">
                  {m.preferences_portable_shortcut()}
                  <Tooltip>
                    <TooltipTrigger
                      aria-label={m.preferences_portable_details()}
                      className="preferences-info-button"
                      render={<Button size="icon-xs" variant="ghost" />}
                    >
                      <IconInfoCircle aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent align="start" side="left" sideOffset={8}>
                      <p>{m.preferences_portable_description()}</p>
                    </TooltipContent>
                  </Tooltip>
                </span>
                <kbd>
                  {native.capabilities.platform === 'macos'
                    ? m.preferences_shortcut_macos()
                    : m.preferences_shortcut_other()}
                </kbd>
                {stateIcon(native.capabilities.standardShortcut)}
              </div>
              {native.capabilities.standardShortcut === 'error' ||
              native.capabilities.standardShortcut === 'unsupported' ? (
                <p className="preferences-inline-warning">
                  {m.capture_error_shortcut_registration()}
                </p>
              ) : null}
              {native.capabilities.platform === 'macos' ? (
                <div className="preferences-permissions">
                  {permissionRow(
                    'inputMonitoring',
                    native.capabilities.inputMonitoring,
                    m.capture_input_monitoring_action(),
                    m.capture_input_monitoring_description(),
                    m.capture_input_monitoring_details(),
                  )}
                  {permissionRow(
                    'accessibility',
                    native.capabilities.accessibility,
                    m.capture_accessibility_action(),
                    m.capture_accessibility_description(),
                    m.capture_accessibility_details(),
                  )}
                </div>
              ) : (
                <p>{m.preferences_platform_fallback()}</p>
              )}
            </>
          ) : null}
          {native.errorKey ? (
            <div className="preferences-error" role="alert">
              <p className="preferences-inline-warning">{m.preferences_error()}</p>
              <Button onClick={() => void native.refresh()} size="sm" variant="outline">
                {m.common_retry()}
              </Button>
            </div>
          ) : null}
        </section>
      </PopoverContent>
    </Popover>
  );
}
