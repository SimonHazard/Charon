# Platform capture support

Runtime capability reporting is authoritative. Charon never turns a successful
build into a selected-text support claim. Under ADR 0016, physical application
matrices are optional troubleshooting tools rather than release gates.

## Current state

| Platform | Composer | Double Shift | Selected-text capture | Status |
| --- | --- | --- | --- | --- |
| macOS 14+ on Apple Silicon (`arm64`) | visible composer; `Cmd+Shift+Space` fallback by default, user-changeable | implemented | public Accessibility ladder, then ADR 0010 bounded Copy; opt-in experimental formatting of the Copy fallback's HTML (ADR 0026) | implemented; ad-hoc releases (ADR 0027) require a first-launch bypass and may need both permissions granted again after each update |
| Windows | visible composer; `Alt+Shift+Space` by default, user-changeable | implemented | focused UI Automation selection only | experimental; no UIAccess, elevation, or synthetic Copy |
| Linux X11 | visible composer; `Alt+Shift+Space` by default, user-changeable | implemented with XI2 | focused AT-SPI, then bounded PRIMARY | experimental; local X11 only |
| Linux Wayland | visible composer; portal shortcut, `Alt+Shift+Space` requested | unavailable by design | no double-Shift acquisition | composer fallback only; portal availability depends on the desktop |

Workspace persistence, path containment, managed Attachment storage, and
`Copy as Markdown` path composition are separator- and Windows-verbatim-prefix-
agnostic. Build portability does not imply native capture support.

AppImage, NSIS, and macOS installations can self-update. deb, rpm, and MSI
installations must download the new package from GitHub Releases and install it
the same way.

Linux packages need glibc 2.35 or newer: Ubuntu 22.04, Debian 12 and later.
The release workflow builds them on Ubuntu 22.04 and fails if the binary needs a
newer glibc symbol.

## Background mode and tray

The opt-in background mode of ADR 0023 is off by default. Cargo enables Tauri's
`tray-icon` feature only for macOS and Windows targets, so Linux binaries
neither compile nor load an AppIndicator library.

| Platform | Background mode | Close with background mode on | Native evidence |
| --- | --- | --- | --- |
| macOS 14+ (`arm64`) | available; one menu bar icon (the app icon, not a template image) whose click shows Open Charon and Quit Charon | hides (as without it); the Dock icon stays | compiled on Apple Silicon; the icon, menu, and Quit paths are not yet observed natively (operator to verify) |
| Windows | available; one notification area icon (may sit in the overflow); left click reveals, right click shows Open Charon and Quit Charon | hides; the taskbar entry goes with the window | not built or run on Windows (operator to verify) |
| Linux X11 and Wayland | unavailable in this release; Preferences says so and the toggle is disabled | quits (unchanged) | no tray is created; revisit after a StatusNotifier spike |

Closing hides Charon on Windows only while the icon exists. If the icon cannot
be shown, background mode stays off and Preferences says so. Quit from the icon,
from Preferences, or with `Cmd+Q` on macOS is draft-safe: an open editor saves
first, and composer text, a failed save, or a drawing with unsaved strokes
keeps Charon running and revealed.

## Capture notifications

The opt-in capture notification of ADR 0024 is off by default and offered
wherever double Shift can create a Note. It is shown from Rust through the
official `tauri-plugin-notification` 2.4.0 (backend `notify-rust` 4.18.1), with
the fixed text "Charon" / "Note captured.", at most once every 2 s and only
while the main window is not focused. On every desktop the plugin reports the
permission as granted without asking the OS and returns before delivery, so
Charon never shows a permission state for it and ignores delivery failures.

| Platform | Backend and attribution | Click | Native evidence |
| --- | --- | --- | --- |
| macOS 14+ (`arm64`) | `mac-notification-sys` (the deprecated `NSUserNotificationCenter` API); a bundled app posts as `dev.simonhazard.charon`, while `tauri dev` posts as Terminal | platform default (activates Charon at most); no Note opens | compiled on Apple Silicon; display, attribution, lock-screen behaviour, and the System Settings off switch are not yet observed (operator to verify) |
| Windows | WinRT toast (`tauri-winrt-notification` 0.8.1) under the app identifier, only for an installed build; a development build shows PowerShell's name and icon | platform default; no Note opens | not built or run on Windows (operator to verify) |
| Linux X11 and Wayland | freedesktop notification service over the local D-Bus session bus (`zbus`) | none | not run on Linux; without a notification daemon nothing appears and nothing fails visibly (operator to verify on GNOME and KDE) |

Wayland makes no double-Shift claim, so it never offers the toggle.

## Composer shortcut

ADR 0025 lets the user replace the one reveal-and-focus-composer accelerator in
Preferences and reset it to the default; double Shift stays fixed. Charon
registers the new accelerator through the official
`tauri-plugin-global-shortcut` 2.3.2 before releasing the previous one, so a
refusal keeps the previous one active. Letters follow physical key positions.

| Platform | Default | Conflict detection | Native evidence |
| --- | --- | --- | --- |
| macOS 14+ (`arm64`) | `Cmd+Shift+Space` | none: `RegisterEventHotKey` accepts combinations the system or other apps use (`Cmd+Space`, `Cmd+Shift+3` returned `Ok` in the spike), so Preferences says Charon cannot detect every conflict; keys up to F20 | runtime change, no-op, refusal, and reset observed through the plugin in `tauri dev`; a real key press of the new combination and relaunch persistence not yet observed (operator to verify) |
| Windows | `Alt+Shift+Space` | `RegisterHotKey` reports a combination another app holds; Charon shows the conflict and keeps the previous shortcut | not built or run on Windows (operator to verify) |
| Linux X11 | `Alt+Shift+Space` | `XGrabKey` `BadAccess` reports a held combination; same handling | not run on Linux (operator to verify) |
| Linux Wayland | portal-assigned (`Alt+Shift+Space` requested) | not applicable: the desktop owns the trigger; Preferences shows it and says to change it in the desktop's keyboard settings | unchanged |

## macOS evidence and limits

Published macOS installers target Apple Silicon (`arm64`) only, starting with
v0.1.3. Intel Macs are outside the supported release target and do not receive a
macOS updater artifact; v0.1.0 and v0.1.1 Intel installations must reinstall
manually. macOS 14 remains the minimum supported operating-system version.

Development testing established the following behavior on the macOS adapter:

- Input Monitoring gates the passive double-Shift listener; Accessibility
  separately gates selected-text acquisition.
- Input Monitoring state uses the dedicated IOKit check/request APIs so an
  Accessibility grant cannot be misreported as an Input Monitoring grant or
  hide the action that registers Charon in the system list.
- Direct Accessibility selection worked in native text controls and editable
  Chromium fields.
- Static Chromium/Electron content required ADR 0010's bounded Copy fallback.
- The fallback snapshots the clipboard, posts exactly one Copy to the unchanged
  foreground application, accepts only newly produced text before timeout, and
  restores only while the transaction still owns the clipboard.
- Empty, secure, canvas-only, protected, timed-out, denied, or concurrently
  changed input creates no Note.
- Charon never posts Paste, reads clipboard history, logs selected content, or
  steals focus.
- With the opt-in formatted capture (ADR 0026), the Copy fallback also reads
  the new payload's HTML once and keeps Markdown only when it matches the plain
  text. Conversion is measured at a p95 of about 11 ms for a 1 MiB selection in
  a release build on Apple Silicon; which applications offer HTML, how often
  parity passes, and whether the Markdown helps are not yet observed natively
  (operator to verify). Direct Accessibility captures stay plain text.
  Windows UI Automation formatting and X11 `text/html` are not implemented:
  ADR 0026 records them as research notes only.
- Closing the window hides Charon instead of quitting, so double Shift stays
  armed; the Dock icon or `Cmd+Shift+Space` reveals it and `Cmd+Q` quits and
  stops capture. `Cmd+Q` is the app menu's own Quit item, which runs the same
  draft guard as the icon's Quit; the Dock menu's Quit and logging out
  terminate at once (Tauri 2.11 exposes no hook for AppKit's terminate path).
  Capturing while Charon is still the frontmost application creates nothing.
  Background mode only adds a menu bar icon with Open and Quit.

macOS releases use Tauri's ad-hoc identity (ADR 0027). Each build's designated
requirement is its `cdhash`, so each update appears to TCC as a new
application and macOS may ask again for Input Monitoring and Accessibility.
The install dialog warns before the update, and Preferences offers both
permission actions plus help for an old entry that still looks enabled. ADR
0018 documents a free stable self-signed identity that would keep grants
across updates; it is not used (see `docs/RELEASING.md`).

## Windows implementation

ADR 0015 accepts a passive `WH_KEYBOARD_LL` double-Shift listener and bounded UI
Automation selection. Charon does not request UIAccess or elevation. Elevated,
protected, missing, empty, and timed-out sources are no-ops.

This implementation is UIA-only and never invokes Ctrl+C. Normal user
reports determine application coverage after release without weakening the
privacy boundary.

## Linux implementation

On X11, ADR 0015 accepts XI2 raw Shift events, bounded AT-SPI selection, then a
bounded `PRIMARY` request. The first version has no synthetic Copy and no
privileged input access.

On Wayland, an ordinary unfocused client cannot observe a portable global
modifier-only sequence. Charon therefore never advertises double Shift there.
It requests `Alt+Shift+Space` through the GlobalShortcuts portal and displays the
actual assignment, including subsequent changes. Charon does not rebind it; a
shortcut chosen in an X11 session is kept but not applied there. Activation requests reveal and
composer focus through Tauri. The compositor may restrict foreground activation;
this remains a native compatibility limit, not a guarantee from a portal test.
Portal absence, refusal, or session closure leaves the visible composer functional.
The X11 global-shortcut plugin is not initialized on Wayland.

Selection requests have a 500 ms result deadline and a 1 MiB UTF-8 ceiling.
Windows additionally caps UIA text at 262,144 UTF-16 units and 32 ancestors;
AT-SPI caps the requested range at 262,144 characters. Excess is rejected rather
than silently truncated. A stalled provider can retain at most one worker per
adapter; late results are discarded. Restart Charon to recover a permanently
stalled provider or failed listener.

AT-SPI retains only the last focused accessible-object reference from focus-state
events, never application trees or background text. Its read budget is 200 ms.
Before reading, it checks the source process, focused state, and password role.
Without an accessible provider, PRIMARY remains available. PRIMARY requires the
owner and focused window to expose matching process IDs, stable focus and owner,
and a complete UTF8_STRING response. Incremental transfers and missing process
metadata are unsupported. Some applications therefore remain composer-only.

## Validation evidence

The development change was compiled as a full Tauri application on Linux and
cross-checked for Windows GNU. Xvfb tests cover XI2 listener startup, PRIMARY
round-trip, timeout, foreign owner rejection, focus, and clipboard ownership.
Private D-Bus tests cover AT-SPI bounds/protected fields and portal assignment,
activation, denial, session cleanup, and key changes. These are automated API
checks, not live Windows application or Wayland compositor certification.

## Reporting compatibility problems

Useful reports contain the Charon version, OS and desktop/session version,
source application, expected and actual behavior, and whether focus or clipboard
state changed. Never include selected text, clipboard contents, Note content, or
Workspace paths.

The architecture decision is [ADR 0015](adr/0015-linux-windows-capture-adapters.md).
Release policy is [ADR 0016](adr/0016-pragmatic-side-project-delivery.md).
