# Platform capture support

Runtime capability reporting is authoritative. Charon never turns a successful
build into a selected-text support claim. Under ADR 0016, physical application
matrices are optional troubleshooting tools rather than release gates.

## Current state

| Platform | Composer | Double Shift | Selected-text capture | Status |
| --- | --- | --- | --- | --- |
| macOS 14+ on Apple Silicon (`arm64`) | visible composer; `Cmd+Shift+Space` fallback | implemented | public Accessibility ladder, then ADR 0010 bounded Copy | implemented; unsigned releases require first-launch bypass and permission regrant |
| Windows | visible composer; `Alt+Shift+Space` | implemented | focused UI Automation selection only | experimental; no UIAccess, elevation, or synthetic Copy |
| Linux X11 | visible composer; `Alt+Shift+Space` | implemented with XI2 | focused AT-SPI, then bounded PRIMARY | experimental; local X11 only |
| Linux Wayland | visible composer; portal shortcut, `Alt+Shift+Space` requested | unavailable by design | no double-Shift acquisition | composer fallback only; portal availability depends on the desktop |

Workspace persistence, path containment, managed Attachment storage, and
`Copy as Markdown` path composition are separator- and Windows-verbatim-prefix-
agnostic. Build portability does not imply native capture support.

AppImage, NSIS, and macOS installations can self-update. deb, rpm, and MSI
installations must download the new package from GitHub Releases and install it
the same way.

## macOS evidence and limits

The next published macOS installers target Apple Silicon (`arm64`) only. Intel
Macs are outside the supported release target and do not receive a macOS updater
artifact. macOS 14 remains the minimum supported operating-system version.

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

Because macOS releases use an ad-hoc identity, each build can appear as a new
application to TCC. Users may need to grant Input Monitoring and Accessibility
again after every update. This is a disclosed cost of unsigned distribution.

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
actual assignment, including subsequent changes. Activation requests reveal and
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
