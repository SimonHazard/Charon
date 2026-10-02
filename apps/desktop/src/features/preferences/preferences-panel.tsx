import { isThemePreference, themePreferences } from '@charon/theme/theme-contract';
import {
  IconAlertCircle,
  IconCircleCheck,
  IconDeviceDesktop,
  IconDownload,
  IconExternalLink,
  IconInfoCircle,
  IconMoon,
  IconRefresh,
  IconSettings,
  IconSun,
  IconX,
} from '@tabler/icons-react';
import { openUrl } from '@tauri-apps/plugin-opener';
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';

import { useMessages, usePreferences } from '@/app/providers';
import { useQuitRequest } from '@/app/quit-request-context';
import { useWorkspace } from '@/app/workspace-context';
import type {
  CapabilityState,
  CaptureCapabilities,
  CapturePermissionKind,
} from '@/bindings/capture';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNativePreferences } from '@/features/preferences/preferences-context';
import { useUpdates } from '@/features/updates/update-context';
import { formatShortcut } from '@/lib/shortcut-label';
import {
  acceleratorFromKeyboardEvent,
  heldModifiers,
  lastFunctionKey,
} from '@/lib/shortcut-recorder';

const RELEASES_URL = 'https://github.com/SimonHazard/Charon/releases/latest';
const REPOSITORY_URL = 'https://github.com/SimonHazard/Charon';
const CONTRIBUTING_URL = 'https://github.com/SimonHazard/Charon/blob/main/CONTRIBUTING.md';
const themeIcons = { system: IconDeviceDesktop, light: IconSun, dark: IconMoon } as const;

/**
 * A longer explanation is never Tooltip-only (docs/UX.md): this Popover opens on hover, click,
 * tap, Enter or Space, and closes with Escape, returning focus to its trigger.
 */
function InfoToggletip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className="preferences-info-button"
        delay={350}
        openOnHover
        render={<Button size="icon-xs" variant="ghost" />}
      >
        <IconInfoCircle aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="preferences-info-popover" side="left" sideOffset={8}>
        <p>{children}</p>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The one user-chosen reveal-and-focus-composer accelerator (ADR 0025): Change records the next
 * key combination and Rust validates, registers, and stores it; Reset restores the platform
 * default. Wayland shows the portal's assignment and where to change it.
 */
function ComposerShortcut({
  capabilities,
  stateIcon,
}: {
  capabilities: CaptureCapabilities;
  stateIcon: (state: CapabilityState) => ReactNode;
}) {
  const m = useMessages();
  const native = useNativePreferences();
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState<string[]>([]);
  const [unsupported, setUnsupported] = useState(false);
  const recorderRef = useRef<HTMLSpanElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);
  const { platform } = capabilities;
  const label = (accelerator: string) =>
    formatShortcut(accelerator, platform, {
      shift: m.shortcut_key_shift(),
      space: m.shortcut_key_space(),
    });
  const shortcutError = native.shortcutErrorKey
    ? ((m as unknown as Record<string, (() => string) | undefined>)[native.shortcutErrorKey]?.() ??
      m.capture_error_unknown())
    : null;

  useEffect(() => {
    if (recording) recorderRef.current?.focus();
  }, [recording]);

  // Return focus to Change once the recorder or Reset button has gone and Change is enabled.
  useEffect(() => {
    if (recording || native.pendingShortcut || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    changeRef.current?.focus();
  });

  const startRecording = () => {
    setHeld([]);
    setUnsupported(false);
    setRecording(true);
  };

  const stopRecording = (restoreFocus: boolean) => {
    restoreFocusRef.current = restoreFocus;
    setRecording(false);
  };

  const choose = async (shortcut: string | null) => {
    restoreFocusRef.current = true;
    await native.setShortcut(shortcut);
    setRecording(false);
  };

  // Feedback begins on key down: held modifiers show at once, and a complete combination is sent.
  const record = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    const modified = event.metaKey || event.ctrlKey || event.altKey;
    if (event.key === 'Tab' && !modified) return;
    event.preventDefault();
    // Escape cancels recording only; Preferences stays open.
    event.stopPropagation();
    if (event.key === 'Escape' && !modified && !event.shiftKey) {
      stopRecording(true);
      return;
    }
    if (event.repeat || native.pendingShortcut) return;
    const recorded = acceleratorFromKeyboardEvent(event.nativeEvent, platform);
    if (recorded.kind === 'pending') {
      setUnsupported(false);
      setHeld(heldModifiers(event.nativeEvent, platform));
    } else if (recorded.kind === 'unsupported') {
      setHeld([]);
      setUnsupported(true);
    } else {
      setUnsupported(false);
      setHeld(recorded.value.split('+'));
      void choose(recorded.value);
    }
  };

  const release = (event: ReactKeyboardEvent<HTMLSpanElement>) => {
    if (native.pendingShortcut || unsupported) return;
    setHeld(heldModifiers(event.nativeEvent, platform));
  };

  return (
    <div className="preferences-shortcut">
      <div className="preferences-shortcut-row">
        <span className="preferences-row-title">
          {m.preferences_portable_shortcut()}
          <InfoToggletip label={m.preferences_portable_details()}>
            {m.preferences_portable_description()}
          </InfoToggletip>
        </span>
        <kbd>
          {capabilities.activeShortcut
            ? label(capabilities.activeShortcut)
            : m.capture_portal_shortcut()}
        </kbd>
        {stateIcon(capabilities.standardShortcut)}
      </div>
      {capabilities.standardShortcut === 'denied' ||
      capabilities.standardShortcut === 'error' ||
      capabilities.standardShortcut === 'unsupported' ? (
        <p className="preferences-inline-warning">{m.capture_error_shortcut_registration()}</p>
      ) : null}
      {capabilities.shortcutConfigurable ? (
        recording ? (
          // biome-ignore lint/a11y/useSemanticElements: a key recorder accepts no text; a native input would start IME composition and offer autofill.
          <span
            aria-label={m.preferences_shortcut_recording()}
            aria-live="polite"
            className="preferences-shortcut-recorder"
            data-unsupported={unsupported ? '' : undefined}
            onBlur={() => stopRecording(false)}
            onKeyDown={record}
            onKeyUp={release}
            ref={recorderRef}
            role="textbox"
            tabIndex={0}
          >
            {unsupported
              ? m.preferences_shortcut_unsupported_key({
                  lastFunctionKey: lastFunctionKey(platform),
                })
              : held.length
                ? label(held.join('+'))
                : m.preferences_shortcut_recording()}
          </span>
        ) : (
          <div className="preferences-shortcut-actions">
            <Button
              disabled={native.pendingShortcut}
              onClick={startRecording}
              ref={changeRef}
              size="sm"
              variant="outline"
            >
              {m.preferences_shortcut_change()}
            </Button>
            {capabilities.shortcutOrigin === 'custom' ? (
              <Button
                disabled={native.pendingShortcut}
                onClick={() => void choose(null)}
                size="sm"
                variant="ghost"
              >
                {m.preferences_shortcut_reset()}
              </Button>
            ) : null}
          </div>
        )
      ) : capabilities.shortcutOrigin === 'desktop' ? (
        <p className="preferences-permission-help">{m.capture_error_shortcut_not_configurable()}</p>
      ) : null}
      {capabilities.shortcutOrigin === 'defaultAfterFailure' ? (
        <p className="preferences-inline-warning">{m.preferences_shortcut_fallback()}</p>
      ) : null}
      {capabilities.shortcutConfigurable && platform === 'macos' ? (
        <p className="preferences-permission-help">{m.preferences_shortcut_conflict_hint()}</p>
      ) : null}
      {shortcutError && !recording ? (
        <p className="preferences-inline-warning" role="alert">
          {shortcutError}
        </p>
      ) : null}
    </div>
  );
}

export function PreferencesPanel() {
  const m = useMessages();
  const appearance = usePreferences();
  const workspace = useWorkspace();
  const native = useNativePreferences();
  const updates = useUpdates();
  const quitRequest = useQuitRequest();
  const [open, setOpen] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [aboutLinkFailed, setAboutLinkFailed] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reviewRef = useRef<HTMLButtonElement>(null);

  const chooseWorkspace = async () => {
    if ((await workspace.chooseWorkspace()) === 'success') await native.refresh();
  };

  const switchToDefaultWorkspace = async () => {
    if (await workspace.openDefaultWorkspace()) await native.refresh();
  };

  // The webview never navigates: an exact, capability-scoped URL goes to the default browser only
  // after an explicit click, and a failure stays local and retryable.
  const openAboutLink = async (url: string) => {
    setAboutLinkFailed(false);
    try {
      await openUrl(url);
    } catch {
      setAboutLinkFailed(true);
    }
  };

  const stateLabel = (state: CapabilityState) => {
    const labels = {
      available: m.preferences_state_available(),
      experimental: m.preferences_state_experimental(),
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

  const backgroundAvailable = native.preferences.trayAvailability === 'available';
  const backgroundActive = native.preferences.backgroundActive;
  const backgroundError = native.backgroundErrorKey
    ? ((m as unknown as Record<string, (() => string) | undefined>)[
        native.backgroundErrorKey
      ]?.() ?? m.preferences_error_unknown())
    : null;

  // Capture notifications follow double Shift: they are offered only where it can create a Note.
  const notificationsOffered =
    native.capabilities !== null &&
    native.capabilities.doubleShift !== 'unsupported' &&
    native.capabilities.selectedText !== 'unsupported';
  const notificationsEnabled = native.preferences.captureNotifications;
  const notificationsError = native.notificationsErrorKey
    ? ((m as unknown as Record<string, (() => string) | undefined>)[
        native.notificationsErrorKey
      ]?.() ?? m.preferences_error_unknown())
    : null;

  // Formatted capture exists only where the Copy fallback runs (macOS, ADR 0026).
  const richCaptureEnabled = native.preferences.richCapture;
  const richCaptureError = native.richCaptureErrorKey
    ? ((m as unknown as Record<string, (() => string) | undefined>)[
        native.richCaptureErrorKey
      ]?.() ?? m.preferences_error_unknown())
    : null;

  const updateBusy =
    updates.status === 'checking' ||
    updates.status === 'downloading' ||
    updates.status === 'installing';
  const updateProgress =
    updates.totalBytes && updates.downloadedBytes > 0
      ? Math.min(100, Math.round((updates.downloadedBytes / updates.totalBytes) * 100))
      : null;

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
        <InfoToggletip label={detailsLabel}>{description}</InfoToggletip>
        <span className="preferences-state">{stateLabel(state)}</span>
      </div>
      {state !== 'available' && state !== 'experimental' && state !== 'unsupported' ? (
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
    <>
      {/* The install dialog lives outside the Popover subtree, so its focus trap and the Popover's
          outside-press logic no longer race; Preferences stays open behind it to show progress. */}
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (!next && updateDialogOpen) return;
          setOpen(next);
        }}
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                aria-label={m.navigation_settings()}
                ref={triggerRef}
                className="shelf-action-button"
                render={<Button size="icon-sm" variant="ghost" />}
              />
            }
          >
            <IconSettings aria-hidden="true" />
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
                if (isThemePreference(value)) appearance.setTheme(value);
              }}
              value={[appearance.theme]}
            >
              {themePreferences.map((theme) => {
                const Icon = themeIcons[theme];
                return (
                  <Tooltip key={theme}>
                    <TooltipTrigger
                      render={<ToggleGroupItem aria-label={m[`theme_${theme}`]()} value={theme} />}
                    >
                      <Icon aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent>{m[`theme_${theme}`]()}</TooltipContent>
                  </Tooltip>
                );
              })}
            </ToggleGroup>
          </section>

          <section className="preferences-group">
            <h2>
              <label htmlFor="preferences-language">{m.preferences_language()}</label>
            </h2>
            <Select
              items={{ en: m.locale_english(), fr: m.locale_french() }}
              onValueChange={(value) => {
                if (value === 'en' || value === 'fr') appearance.setLocale(value);
              }}
              value={appearance.locale}
            >
              <SelectTrigger id="preferences-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectItem value="en">{m.locale_english()}</SelectItem>
                <SelectItem value="fr">{m.locale_french()}</SelectItem>
              </SelectContent>
            </Select>
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
            <p>{m.preferences_workspace_switch_hint()}</p>
            {workspace.workspaceSwitchError ? (
              <div className="preferences-error" role="alert">
                <p className="preferences-inline-warning">
                  {(m as unknown as Record<string, (() => string) | undefined>)[
                    workspace.workspaceSwitchError.messageKey
                  ]?.() ?? m.workspace_error_unknown()}
                </p>
                <Button
                  aria-label={m.preferences_workspace_dismiss_error()}
                  onClick={workspace.dismissWorkspaceSwitchError}
                  size="icon-xs"
                  variant="ghost"
                >
                  <IconX aria-hidden="true" />
                </Button>
              </div>
            ) : null}
            {workspace.isWorkspaceSwitchBlocked ? (
              <p className="preferences-inline-warning">
                {m.preferences_workspace_draft_blocked()}
              </p>
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
                <ComposerShortcut capabilities={native.capabilities} stateIcon={stateIcon} />
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
                    {native.capabilities.inputMonitoring === 'denied' ||
                    native.capabilities.accessibility === 'denied' ? (
                      <p className="preferences-permission-help">
                        {m.preferences_permission_regrant_help()}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="preferences-permissions">
                    <p>
                      {native.capabilities.doubleShift === 'experimental'
                        ? m.capture_experimental_description()
                        : m.preferences_platform_fallback()}
                    </p>
                    <div className="preferences-row-title">
                      <span>{m.capture_double_shift_status()}</span>
                      <span className="preferences-state">
                        {stateLabel(native.capabilities.doubleShift)}
                      </span>
                    </div>
                    <div className="preferences-row-title">
                      <span>{m.capture_selection_status()}</span>
                      <span className="preferences-state">
                        {stateLabel(native.capabilities.selectedText)}
                      </span>
                    </div>
                  </div>
                )}
                {notificationsOffered ? (
                  <fieldset className="preferences-notifications">
                    <legend className="preferences-row-title">
                      {m.preferences_notifications()}
                    </legend>
                    <p id="preferences-notifications-description">
                      {m.preferences_notifications_description()}
                    </p>
                    <div className="preferences-update-actions">
                      <Button
                        aria-describedby="preferences-notifications-description preferences-notifications-unverified"
                        aria-pressed={notificationsEnabled}
                        disabled={native.pendingNotifications}
                        onClick={() => void native.setCaptureNotifications(!notificationsEnabled)}
                        size="sm"
                        variant={notificationsEnabled ? 'default' : 'outline'}
                      >
                        {notificationsEnabled
                          ? m.preferences_notifications_disable()
                          : m.preferences_notifications_enable()}
                      </Button>
                    </div>
                    {/* Persistent, not Tooltip-only: the OS permission cannot be observed (ADR 0024). */}
                    <p
                      className="preferences-permission-help"
                      id="preferences-notifications-unverified"
                    >
                      {m.preferences_notifications_unverified()}
                    </p>
                    {notificationsError ? (
                      <p className="preferences-inline-warning" role="alert">
                        {notificationsError}
                      </p>
                    ) : null}
                  </fieldset>
                ) : null}
                {native.capabilities.richCapture !== 'unsupported' ? (
                  <fieldset
                    aria-labelledby="preferences-rich-capture-title"
                    className="preferences-notifications preferences-rich-capture"
                  >
                    <legend className="preferences-row-title">
                      <span id="preferences-rich-capture-title">
                        {m.preferences_rich_capture()}
                      </span>
                      <span className="preferences-state" id="preferences-rich-capture-state">
                        {stateLabel(native.capabilities.richCapture)}
                      </span>
                    </legend>
                    {/* Persistent, not Tooltip-only: it discloses the extra clipboard read. */}
                    <p id="preferences-rich-capture-description">
                      {m.preferences_rich_capture_description()}
                    </p>
                    <div className="preferences-update-actions">
                      <Button
                        aria-describedby="preferences-rich-capture-state preferences-rich-capture-description"
                        aria-pressed={richCaptureEnabled}
                        disabled={native.pendingRichCapture}
                        onClick={() => void native.setRichCapture(!richCaptureEnabled)}
                        size="sm"
                        variant={richCaptureEnabled ? 'default' : 'outline'}
                      >
                        {richCaptureEnabled
                          ? m.preferences_rich_capture_disable()
                          : m.preferences_rich_capture_enable()}
                      </Button>
                    </div>
                    {richCaptureError ? (
                      <p className="preferences-inline-warning" role="alert">
                        {richCaptureError}
                      </p>
                    ) : null}
                  </fieldset>
                ) : null}
              </>
            ) : null}
            {native.errorKey ? (
              <div className="preferences-error" role="alert">
                <p className="preferences-inline-warning">
                  {native.errorKey === 'capture_error_settings_open_failed'
                    ? m.capture_error_settings_open_failed()
                    : m.preferences_error()}
                </p>
                {native.errorKey !== 'capture_error_settings_open_failed' ? (
                  <Button onClick={() => void native.refresh()} size="sm" variant="outline">
                    {m.common_retry()}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>

          {native.capabilities ? (
            <section className="preferences-group" aria-labelledby="preferences-background-title">
              <h2 id="preferences-background-title">{m.preferences_background()}</h2>
              <p id="preferences-background-description">
                {!backgroundAvailable
                  ? m.preferences_background_unavailable()
                  : native.capabilities.platform === 'macos'
                    ? m.preferences_background_description_macos()
                    : m.preferences_background_description_windows()}
              </p>
              <div className="preferences-update-actions">
                <Button
                  aria-describedby="preferences-background-description"
                  aria-pressed={backgroundActive}
                  disabled={native.pendingBackground || !backgroundAvailable}
                  onClick={() => void native.setBackgroundMode(!backgroundActive)}
                  size="sm"
                  variant={backgroundActive ? 'default' : 'outline'}
                >
                  {backgroundActive
                    ? m.preferences_background_disable()
                    : m.preferences_background_enable()}
                </Button>
                {backgroundActive ? (
                  <Button onClick={() => void quitRequest.quit()} size="sm" variant="ghost">
                    {m.tray_quit()}
                  </Button>
                ) : null}
              </div>
              {backgroundError ? (
                <p className="preferences-inline-warning" role="alert">
                  {backgroundError}
                </p>
              ) : backgroundAvailable &&
                native.preferences.backgroundMode &&
                !backgroundActive &&
                !native.pendingBackground ? (
                <p className="preferences-inline-warning">
                  {m.preferences_error_tray_unavailable()}
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="preferences-group">
            <h2>{m.preferences_updates()}</h2>
            <p>{m.update_privacy_description()}</p>
            <div className="preferences-update-actions">
              <Button
                aria-pressed={updates.enabled}
                disabled={updateBusy}
                onClick={() => updates.setEnabled(!updates.enabled)}
                size="sm"
                variant={updates.enabled ? 'default' : 'outline'}
              >
                {updates.enabled ? m.update_disable_checks() : m.update_enable_checks()}
              </Button>
              {updates.enabled ? (
                <Button
                  disabled={updateBusy}
                  onClick={() => void updates.checkNow()}
                  size="sm"
                  variant="ghost"
                >
                  <IconRefresh aria-hidden="true" />
                  {m.update_check_now()}
                </Button>
              ) : null}
            </div>

            {updates.status === 'checking' ? (
              <p aria-live="polite" role="status">
                {m.update_checking()}
              </p>
            ) : null}
            {updates.status === 'noUpdate' ? (
              <p aria-live="polite" role="status">
                {m.update_none_available()}
              </p>
            ) : null}
            {updates.status === 'error' ? (
              <div className="preferences-error" role="alert">
                <p className="preferences-inline-warning">{m.update_error()}</p>
                <Button onClick={() => void updates.checkNow()} size="sm" variant="outline">
                  {m.common_retry()}
                </Button>
              </div>
            ) : null}
            {updates.status === 'available' && updates.version ? (
              <div className="preferences-update-available" role="status">
                <p>{m.update_available({ version: updates.version })}</p>
                {updates.canSelfUpdate ? (
                  <Button
                    onClick={() => setUpdateDialogOpen(true)}
                    ref={reviewRef}
                    size="sm"
                    variant="outline"
                  >
                    <IconDownload aria-hidden="true" />
                    {m.update_review()}
                  </Button>
                ) : (
                  <>
                    <p>{m.update_manual_install_description()}</p>
                    <Button onClick={() => void openUrl(RELEASES_URL)} size="sm" variant="outline">
                      <IconExternalLink aria-hidden="true" />
                      {m.update_open_releases()}
                    </Button>
                  </>
                )}
              </div>
            ) : null}
            {updates.status === 'downloading' ? (
              <p aria-live="polite" role="status">
                {updateProgress === null
                  ? m.update_downloading()
                  : m.update_downloading_progress({ progress: updateProgress })}
              </p>
            ) : null}
            {updates.status === 'downloaded' ? (
              <div className="preferences-update-available" role="status">
                {updates.closesToInstall ? (
                  <>
                    <p>{m.update_windows_close_notice()}</p>
                    {updates.restartBlocked ? (
                      <p className="preferences-inline-warning">{m.update_install_blocked()}</p>
                    ) : null}
                    <Button
                      disabled={updates.restartBlocked}
                      onClick={() => void updates.install()}
                      size="sm"
                      variant="outline"
                    >
                      {m.update_close_and_install()}
                    </Button>
                  </>
                ) : (
                  <p>
                    {updates.restartBlocked ? m.update_install_blocked() : m.update_installing()}
                  </p>
                )}
              </div>
            ) : null}
            {updates.status === 'installing' ? (
              <p aria-live="polite" role="status">
                {m.update_installing()}
              </p>
            ) : null}
            {updates.status === 'ready' ? (
              <div className="preferences-update-available" role="status">
                <p>
                  {updates.restartBlocked
                    ? m.update_restart_blocked()
                    : m.update_ready_to_restart()}
                </p>
                <Button
                  disabled={updates.restartBlocked}
                  onClick={() => void updates.restart()}
                  size="sm"
                  variant="outline"
                >
                  {m.update_restart()}
                </Button>
              </div>
            ) : null}
          </section>

          <section className="preferences-group" aria-labelledby="preferences-about-title">
            <h2 id="preferences-about-title">{m.preferences_about()}</h2>
            <p>{m.preferences_about_version({ version: __CHARON_VERSION__ })}</p>
            <p>{m.preferences_about_open_source()}</p>
            <div className="preferences-update-actions">
              <Button
                aria-describedby="preferences-about-links"
                onClick={() => void openAboutLink(REPOSITORY_URL)}
                size="sm"
                variant="ghost"
              >
                <IconExternalLink aria-hidden="true" />
                {m.preferences_about_repository()}
              </Button>
              <Button
                aria-describedby="preferences-about-links"
                onClick={() => void openAboutLink(CONTRIBUTING_URL)}
                size="sm"
                variant="ghost"
              >
                <IconExternalLink aria-hidden="true" />
                {m.preferences_about_contributing()}
              </Button>
            </div>
            <p id="preferences-about-links">{m.preferences_about_links()}</p>
            {aboutLinkFailed ? (
              <p className="preferences-inline-warning" role="alert">
                {m.preferences_about_open_failed()}
              </p>
            ) : null}
          </section>
        </PopoverContent>
      </Popover>

      <AlertDialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <AlertDialogContent finalFocus={() => reviewRef.current ?? triggerRef.current}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.update_install_title({ version: updates.version ?? '' })}
            </AlertDialogTitle>
            <AlertDialogDescription>{m.update_install_description()}</AlertDialogDescription>
          </AlertDialogHeader>
          {native.capabilities?.platform === 'macos' ? (
            <p className="preferences-inline-warning">{m.update_macos_regrant_notice()}</p>
          ) : null}
          {updates.closesToInstall ? (
            <p className="preferences-inline-warning">{m.update_windows_close_notice()}</p>
          ) : null}
          {updates.notes ? <p className="update-release-notes">{updates.notes}</p> : null}
          {updates.restartBlocked ? (
            <p className="preferences-inline-warning">{m.update_install_blocked()}</p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            {updates.status === 'downloaded' && updates.closesToInstall ? (
              <AlertDialogAction
                disabled={updates.restartBlocked}
                onClick={() => void updates.install()}
              >
                {m.update_close_and_install()}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                disabled={updates.restartBlocked}
                onClick={() => void updates.download()}
              >
                {m.update_download_install()}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
