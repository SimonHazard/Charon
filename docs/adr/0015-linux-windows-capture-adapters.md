# ADR 0015: Linux and Windows selected-text capture adapters

## Status

Accepted on 2026-09-05. Implemented experimentally on 2026-09-21 for Windows
and Linux X11. Windows and X11 remain `Experimental` while ordinary use
establishes coverage; Wayland remains without a modifier-only capture claim.

## Context

At acceptance, Charon implemented passive double-Shift selected-text capture on
macOS while Windows and Linux exposed only the visible composer and a
conventional global shortcut. The implementation described by this ADR now
ships experimentally on Windows and Linux X11. Cross-platform capture must
preserve ADR 0010's bounded Copy ceiling:
no Paste, arbitrary input injection, private APIs, OCR, screen capture,
clipboard-history monitoring, privileged helper, or content logging.

Public platform research found viable Windows and X11 mechanisms, but core
Wayland does not expose a global modifier-only stream to an ordinary unfocused
client. ADR 0016 makes live use the compatibility feedback loop rather than a
pre-release physical certification programme.

## Decision

| Runtime | Capture gesture | Acquisition | Composer shortcut |
| --- | --- | --- | --- |
| macOS | existing double Shift | existing Accessibility ladder, then ADR 0010 bounded Copy | `Cmd+Shift+Space` |
| Windows | double Shift through `WH_KEYBOARD_LL` | bounded UI Automation; bounded Copy only if the complete ADR 0010-equivalent transaction is implementable | `Alt+Shift+Space` |
| Linux X11 | double Shift through XI2 raw events, with XRecord only as a measured fallback | bounded AT-SPI, then bounded X11 `PRIMARY`; no synthetic Copy | `Alt+Shift+Space` |
| Linux Wayland | no global modifier-only gesture | none from double Shift; bounded AT-SPI may be attempted only from an explicit shortcut | `Alt+Shift+Space` through the available portal/global-shortcut path |

All native adapters emit only normalized Shift press/release events to the
existing gesture machine. They never swallow keys or persist Notes.
`CaptureCoordinator` continues to own listener lifecycle, duplicate suppression,
capability state, acquisition bounds, and composer-focus fallback.

### Windows

Use a dedicated thread and the public `WH_KEYBOARD_LL` hook. It immediately
hands relevant Shift state to the gesture machine, chains unhandled input with
`CallNextHookEx`, and unhooks on shutdown. UI Automation reads only a bounded
active selection from the focused element or a bounded ancestor chain.

Ordinary UI Automation cannot cross into elevated applications without
UIAccess. Charon remains unsigned, requests neither UIAccess nor elevation, and
treats elevated, protected, empty, malformed, and timed-out targets as no-ops.

A Ctrl+C fallback is allowed only if it snapshots every bounded clipboard
format, guards the foreground window and clipboard sequence, emits exactly one
Copy, accepts only newly produced text, and restores only while the transaction
still owns the clipboard. A text-only snapshot is insufficient; without the
complete contract the Windows build ships UIA-only.

References: [LowLevelKeyboardProc](https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelkeyboardproc),
[UI Automation focus](https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nf-uiautomationclient-iuiautomation-getfocusedelement),
[UI Automation selection](https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nf-uiautomationclient-iuiautomationtextpattern-getselection),
[SendInput and UIPI](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput).

### Linux X11

Prefer XI2 raw events for the passive Shift stream. XRecord remains an option
only if implementation evidence shows it is smaller or more reliable. Read a
bounded focused selection through AT-SPI, then request the X11 `PRIMARY`
selection as a bounded text target. `PRIMARY` is not treated as `CLIPBOARD`, and
the first implementation never synthesizes Ctrl+C.

Missing accessibility buses, providers, selection owners, or timeouts are
content-free no-ops. Charon never uses XTest Copy, key grabs that interfere with
other applications, or direct `/dev/input` access.

References: [XI2 protocol](https://www.x.org/releases/current/doc/inputproto/XI2proto.txt),
[AT-SPI Text](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/iface.Text.html),
[Xlib selections](https://www.x.org/releases/current/doc/libX11/libX11/libX11.pdf).

### Linux Wayland

Core Wayland delivers keyboard events to the focused surface and therefore
cannot implement Charon's global double Shift. The GlobalShortcuts portal can
deliver a conventional user-mediated shortcut, so Wayland uses
`Alt+Shift+Space` to reveal Charon and focus the composer. Portal absence or
refusal leaves the visible composer available without retry loops.

No evdev/input-group access, privileged helper, compositor-private listener,
virtual-keyboard injection, background clipboard access, OCR, or screen capture
is accepted. A future portable public protocol requires an ADR amendment.

References: [Wayland keyboard protocol](https://wayland.freedesktop.org/docs/html/apa.html#protocol-spec-wl_keyboard),
[GlobalShortcuts portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html),
[shortcuts specification](https://specifications.freedesktop.org/shortcuts/latest/).

## Validation and support wording

Deterministic gesture, lifecycle, capability, timeout, clipboard, and privacy
tests remain required. Compilation on the target GitHub runners is part of the
normal release build. Physical application matrices are optional troubleshooting
tools, not release gates.

Windows and X11 are labelled experimental after implementation. User reports
should include OS/session, source application, expected and actual behavior,
focus changes, and whether the clipboard changed, but never selected content or
clipboard contents. Wayland never advertises double Shift.

## Consequences

- macOS behavior remains unchanged.
- Windows and X11 can share the memorable gesture without pretending their text
  acquisition coverage equals macOS.
- Wayland remains useful through a conventional shortcut and visible composer,
  with no misleading modifier-only claim.
- Some applications and elevated/protected surfaces will produce no capture;
  this is an accepted safe failure and a candidate for later patch releases.

## Revisit when

Revisit if the selected public APIs prove broadly unreliable, a maintained
dependency materially widens the binary or network surface, or Wayland gains a
portable public modifier-sequence mechanism. Every revision must preserve ADR
0010's Copy boundary and ADR 0014's unsigned distribution posture.
