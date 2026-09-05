# Platform capture support

Runtime capability reporting is authoritative. Charon never turns a successful
build into a selected-text support claim. Under ADR 0016, physical application
matrices are optional troubleshooting tools rather than release gates.

## Current state

| Platform | Composer | Double Shift | Selected-text capture | Status |
| --- | --- | --- | --- | --- |
| macOS 14+ | visible composer; `Cmd+Shift+Space` fallback | implemented | public Accessibility ladder, then ADR 0010 bounded Copy | implemented; unsigned releases require first-launch bypass and permission regrant |
| Windows | visible composer; `Alt+Shift+Space` target | not yet implemented | not yet implemented | unsupported until the accepted ADR 0015 adapter ships, then experimental |
| Linux X11 | visible composer; `Alt+Shift+Space` target | not yet implemented | not yet implemented | unsupported until the accepted ADR 0015 adapter ships, then experimental |
| Linux Wayland | visible composer; `Alt+Shift+Space` portal target | unavailable by design | no double-Shift acquisition | composer fallback only; portal availability depends on the desktop |

Workspace persistence, path containment, managed Attachment storage, and
`Copy as Markdown` path composition are separator- and Windows-verbatim-prefix-
agnostic. Build portability does not imply native capture support.

## macOS evidence and limits

Development testing established the following behavior on the macOS adapter:

- Input Monitoring gates the passive double-Shift listener; Accessibility
  separately gates selected-text acquisition.
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

## Accepted Windows direction

ADR 0015 accepts a passive `WH_KEYBOARD_LL` double-Shift listener and bounded UI
Automation selection. Charon does not request UIAccess or elevation. Elevated,
protected, missing, empty, and timed-out sources are no-ops.

A Ctrl+C fallback may ship only if it preserves the complete bounded clipboard
transaction defined by ADR 0010. Otherwise Windows remains UIA-only. Normal user
reports determine application coverage after release without weakening the
privacy boundary.

## Accepted Linux direction

On X11, ADR 0015 accepts XI2 raw Shift events, bounded AT-SPI selection, then a
bounded `PRIMARY` request. The first version has no synthetic Copy and no
privileged input access.

On Wayland, an ordinary unfocused client cannot observe a portable global
modifier-only sequence. Charon therefore never advertises double Shift there.
It uses `Alt+Shift+Space` through the available GlobalShortcuts portal to reveal
and focus the composer; portal absence leaves the visible composer functional.

## Reporting compatibility problems

Useful reports contain the Charon version, OS and desktop/session version,
source application, expected and actual behavior, and whether focus or clipboard
state changed. Never include selected text, clipboard contents, Note content, or
Workspace paths.

The architecture decision is [ADR 0015](adr/0015-linux-windows-capture-adapters.md).
Release policy is [ADR 0016](adr/0016-pragmatic-side-project-delivery.md).
