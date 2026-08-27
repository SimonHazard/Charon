# ADR 0015: Proposed Linux and Windows selected-text capture adapters

## Status

Proposed on 2026-08-27. No Windows, Linux X11, or Linux Wayland host was
available for Plan 033. This desk research therefore makes no support claim and
cannot be accepted until the physical matrices below are completed.

## Context

Charon currently reports modifier capture and selected-text acquisition as
`Unsupported` on Windows and Linux. `PlatformCapturePort` already separates the
platform, listener state, selection state, listener lifecycle, permission
request, and selected-text acquisition. ADR 0009 requires a bounded public
accessibility path first; ADR 0010 permits at most one bounded synthetic Copy
after an explicit gesture and forbids Paste, arbitrary input injection,
clipboard-history monitoring, private APIs, OCR, and screen capture.

This ADR records feasible public mechanisms and rejects mechanisms that exceed
that ceiling. It is a proposal, not implementation or physical evidence.

## Windows options

| Concern | Public mechanism and constraint | Proposed mapping |
| --- | --- | --- |
| Passive modifier listener | `WH_KEYBOARD_LL` is a global low-level keyboard hook installed with `SetWindowsHookExW`. Microsoft requires the installing thread to run a message loop, recommends a dedicated thread with immediate handoff, and recommends chaining unhandled events with `CallNextHookEx` ([LowLevelKeyboardProc](https://learn.microsoft.com/en-us/windows/win32/winmsg/lowlevelkeyboardproc), [SetWindowsHookExW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowshookexw)). | A dedicated adapter thread observes only the events required by the platform-neutral gesture machine, never swallows them, and logs neither keycodes nor text. `start` owns hook installation and `shutdown` unhooks it. |
| Accessibility-first selection | UI Automation can return the focused element; `IUIAutomationTextPattern::GetSelection` returns the active ranges and `IUIAutomationTextRange::GetText` reads a range ([GetFocusedElement](https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nf-uiautomationclient-iuiautomation-getfocusedelement), [GetSelection](https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nf-uiautomationclient-iuiautomationtextpattern-getselection), [GetText](https://learn.microsoft.com/en-us/windows/win32/api/uiautomationclient/nf-uiautomationclient-iuiautomationtextrange-gettext)). Providers are application-dependent; custom controls need their own provider ([provider overview](https://learn.microsoft.com/en-us/windows/win32/winauto/uiauto-providersoverview)). | `selected_text` first performs a bounded focused-element/ancestor UIA query and returns only a non-empty selected range. Missing patterns, empty ranges, malformed providers, timeouts, and protected content are no-ops. |
| Bounded Copy fallback | `SendInput` synthesizes input and is restricted by UIPI to equal or lower integrity targets ([SendInput](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-sendinput)). Windows increments a clipboard sequence number whenever clipboard content changes ([Using the Clipboard](https://learn.microsoft.com/en-us/windows/win32/dataxchg/using-the-clipboard)). A clipboard can contain multiple formats and delayed rendering, so preserving only Unicode text would not preserve the pre-existing clipboard ([Clipboard Formats](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-formats), [Clipboard Operations](https://learn.microsoft.com/en-us/windows/win32/dataxchg/clipboard-operations)). | Candidate only after UIA returns no usable text: verify the foreground window is unchanged, take a bounded safe snapshot, send exactly Ctrl+C, require a new sequence number and new text before timeout, then restore only if the sequence number is still transaction-owned. A text-only snapshot is rejected. If complete bounded preservation cannot be proved, the fallback remains `Unsupported`. |
| Consent, elevation, and unsigned distribution | Microsoft documents that ordinary UI Automation cannot cross into an elevated application without UIAccess. UIAccess requires a verifiable digital signature and an installation location writable only by administrators ([UIPI/UIAccess policy](https://learn.microsoft.com/en-us/previous-versions/windows/it-pro/windows-10/security/threat-protection/security-policy-settings/user-account-control-allow-uiaccess-applications-to-prompt-for-elevation-without-using-the-secure-desktop)). ADR 0014 requires Charon to remain unsigned. | Charon does not request UIAccess or elevation. Elevated targets are a documented no-op. Preferences must disclose passive listener purpose and the possible transient clipboard fallback; exact system UX still requires host evidence. |
| Not acceptable | Posting window messages to evade UIPI, running elevated, acquiring UIAccess, swallowing keys, monitoring clipboard history, or using OCR/screen capture would widen the product boundary or conflict with ADR 0014/0010. | Remain absent. |

### Windows proposal

Propose unmodified double Shift only if the passive hook and false-positive
matrix passes on the exact unsigned release-configuration artifact. Acquisition
order is bounded UIA first, then the ADR 0010-style Copy transaction only if a
complete safe clipboard snapshot and sequence guard are proved. Elevated and
inaccessible sources remain no-ops. Until that evidence exists,
`double_shift` and `selected_text` remain `Unsupported`.

## Linux X11 options

| Concern | Public mechanism and constraint | Proposed mapping |
| --- | --- | --- |
| Passive modifier listener | XI2 defines raw device events, including delivery regardless of grab state, and XRecord can report input events not delivered to ordinary clients ([XI2 protocol](https://www.x.org/releases/current/doc/inputproto/XI2proto.txt), [XRecord library](https://www.x.org/releases/current/doc/libXtst/recordlib.pdf)). Both are X-server mechanisms, not Wayland mechanisms. | Prefer XI2 raw key events if physical evidence proves complete press/release semantics without consuming input; keep XRecord as a measured alternative. Normalize only the required Shift events into the existing gesture machine. |
| Accessibility-first selection | AT-SPI's Text interface exposes the number of active selections, the bounds of one selection, and text for a bounded range ([Atspi.Text](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/iface.Text.html)); focused state is represented by `ATSPI_STATE_FOCUSED` ([Atspi.StateType](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/enum.StateType.html)). | `selected_text` first follows a bounded focused-accessible chain and reads only an active non-empty selection. Toolkit/application coverage must be measured; unavailable or malformed providers are no-ops. |
| PRIMARY fallback | Xlib defines `PRIMARY` as a predefined selection and `XConvertSelection` as the request that asks its owner to convert it to a requested target ([Xlib selections](https://www.x.org/releases/current/doc/libX11/libX11/libX11.pdf)). | After AT-SPI returns no text, request `PRIMARY` as a bounded text target without synthesizing a key. Verify ownership/source behavior physically; do not equate `PRIMARY` with `CLIPBOARD`. |
| Synthetic Copy | XRecord documentation notes that XTest may synthesize input, but synthetic Ctrl+C is unnecessary if AT-SPI or `PRIMARY` works and would introduce clipboard preservation/race questions ([XRecord library](https://www.x.org/releases/current/doc/libXtst/recordlib.pdf)). | Not proposed for the first X11 build. Any later fallback requires a separate ADR 0010-equivalence proof. |
| Consent and disclosure | X11 exposes the above mechanisms through the X server and accessibility bus; the cited specifications do not define a Charon-specific consent prompt. Distribution, session policy, and assistive-technology enablement vary and need host evidence. | Preferences disclose passive modifier observation and selected-text scope. Runtime capability checks fail closed when XI2/XRecord, AT-SPI, or a selection owner is unavailable. |
| Not acceptable | XTest Copy without a proved complete clipboard transaction, key grabs that interfere with applications, unbounded accessibility scans, or content logging. | Remain absent. |

### Linux X11 proposal

Propose unmodified double Shift only after XI2 (or, if evidence favors it,
XRecord) passes the physical gesture matrix. Acquisition order is bounded
AT-SPI first, then a bounded `PRIMARY` request. There is no synthetic Copy in
the initial proposal. Until physical evidence exists, both capabilities remain
`Unsupported`.

## Linux Wayland options

| Concern | Public mechanism and constraint | Proposed mapping |
| --- | --- | --- |
| Ordinary-client keyboard visibility | Core Wayland sends `wl_keyboard` key events only while a client surface has keyboard focus ([wl_keyboard protocol](https://wayland.freedesktop.org/docs/html/apa.html#protocol-spec-wl_keyboard)). It therefore does not provide ordinary clients a passive global double-Shift stream. | `input_monitoring_state` and `double_shift` remain `Unsupported` on Wayland. |
| Portal shortcut | The GlobalShortcuts portal binds user-mediated shortcuts to an application session and reports activation independently of application focus ([GlobalShortcuts portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.GlobalShortcuts.html)). Its trigger grammar is modifiers plus a key identifier; examples all terminate in a non-modifier key ([Shortcuts specification](https://specifications.freedesktop.org/shortcuts/latest/)). Portal backends are desktop-selected and may differ by environment ([portal configuration](https://flatpak.github.io/xdg-desktop-portal/docs/portals.conf.html)). | A follow-up may register `Ctrl+Shift+Space` for composer focus or a separately named explicit selection-capture action. It cannot represent the double-Shift sequence. Runtime absence or refusal remains a functional visible-composer fallback. |
| Accessibility selection candidate | AT-SPI exposes selection bounds and text independently of the proposed trigger ([Atspi.Text](https://gnome.pages.gitlab.gnome.org/at-spi2-core/libatspi/iface.Text.html)). This desk research does not prove toolkit or compositor coverage in Wayland sessions. | On a portal-delivered explicit capture shortcut, try the same bounded AT-SPI-first query. Keep `selected_text` unsupported until GNOME, KDE, and wlroots physical evidence exists. |
| Clipboard/PRIMARY limitation | Core Wayland sends selection offers to the client with keyboard focus ([Wayland data-device selection](https://wayland.freedesktop.org/docs/book/Protocol.html#data-devices)). Charon is not the focused source during silent capture, so core Wayland is not a general background-selection fallback. | Do not propose a Wayland `PRIMARY` or clipboard fallback through core protocol. |
| Privileged raw input | Linux evdev exposes `/dev/input/event*` device events directly to userspace, including keyboard `EV_KEY` events ([Linux input interface](https://docs.kernel.org/6.2/input/input.html), [event codes](https://docs.kernel.org/input/event-codes.html)). Access would bypass the compositor's focus boundary and depends on device-node permissions. | Rejected for Charon: no `input`-group membership, privileged helper, or direct device monitoring. |
| Compositor-specific protocols | Non-core protocols can exist, but they are compositor-specific rather than a portable Wayland contract. Core Wayland itself exposes focused input only. | Do not ship a compositor-specific listener in the first build plan. Revisit only with a separate compatibility and privacy decision. |
| Not acceptable | evdev/input-group access, privileged helpers, virtual-keyboard input injection, compositor-private APIs, OCR, or screen capture. | Remain absent. |

### Linux Wayland proposal

Propose shortcut-only behavior through the GlobalShortcuts portal when present.
The portable action remains reveal-and-focus-composer. A distinct explicit
selection-capture shortcut may be evaluated with bounded AT-SPI, but neither it
nor selected-text acquisition is supported yet. Unmodified double Shift remains
unsupported.

## Decision proposal and `PlatformCapturePort`

This ADR proposes three separate runtime tiers rather than a single Linux or
Windows claim:

| Runtime | Proposed gesture | Proposed acquisition ladder | State before physical evidence |
| --- | --- | --- | --- |
| Windows | Unmodified double Shift through passive `WH_KEYBOARD_LL` | bounded UIA; then bounded Copy only if complete clipboard preservation is proved | `Unsupported` |
| Linux X11 | Unmodified double Shift through XI2 raw events, with XRecord only as a measured alternative | bounded AT-SPI; then bounded `PRIMARY` | `Unsupported` |
| Linux Wayland | Portal shortcut only; no double Shift | bounded AT-SPI only on an explicit capture shortcut | `Unsupported` |

Adapters feed normalized events to the existing gesture machine. They do not
persist Notes. `CaptureCoordinator` remains the owner of capability state,
listener lifecycle, duplicate suppression, and typed capture actions. No new
permission enum or dependency is accepted by this proposed ADR; each follow-up
build plan must justify exact pinned dependencies and any contract changes.

## Required physical evidence

No row was executed during Plan 033 because the required hosts were unavailable.
An unavailable row is not a failure and not evidence of support.

### Windows matrix

| Host/artifact | Cases | Result |
| --- | --- | --- |
| Windows 11, exact unsigned release-configuration artifact | Hook lifecycle and false positives; Notepad, Edge, VS Code, Word, and one UWP/WinUI app; UIA vs fallback path; rich/multi-format clipboard restoration; concurrent clipboard write; unchanged foreground guard; elevated target; IME using Shift-Shift; security-product reaction | Host unavailable — not run |

### Linux X11 matrix

| Host/artifact | Cases | Result |
| --- | --- | --- |
| Current supported X11 desktop, exact release-configuration artifact | XI2 and XRecord comparison; false positives; GTK4, Qt, Firefox, Chromium, Electron; AT-SPI vs `PRIMARY`; no selection owner; IME using Shift-Shift | Host unavailable — not run |

### Linux Wayland matrix

| Host/artifact | Cases | Result |
| --- | --- | --- |
| Current GNOME Wayland session | Portal availability/consent, composer shortcut, explicit capture shortcut candidate, GTK4/Firefox/Chromium AT-SPI | Host unavailable — not run |
| Current KDE Plasma Wayland session | Same cases with the selected KDE portal backend | Host unavailable — not run |
| Current wlroots compositor session | Portal/backend availability, shortcut behavior, explicit confirmation that ordinary clients receive no global double-Shift stream | Host unavailable — not run |

Every run must record OS/session versions, desktop and portal backend, exact app
versions, bundle SHA-256, pass/fail, acquisition path when it can be observed
without content logging, focus behavior, clipboard result, and permission or
consent UX. No selected text, clipboard content, or keycode is logged.

## Disclosure proposal

- Windows/X11: “Charon observes only the double-Shift gesture. When an app does
  not expose the selected text through accessibility, a supported fallback may
  briefly place that selection on the system clipboard. Clipboard managers may
  observe it.” Use only if the fallback is actually built and proved.
- Wayland: “Double Shift is unavailable in this session. Use the configured
  global shortcut to show Charon and focus the composer.” If a separate capture
  shortcut is later proved, name it separately instead of implying double Shift.
- Denial, missing providers, elevated Windows targets, unsupported portals, and
  inaccessible surfaces remain content-free no-ops with the visible composer
  available.

## Open questions

- Does the Windows hook remain reliable through suspend/resume, keyboard layout
  changes, remote desktop, and IMEs that assign meaning to Shift-Shift?
- Can Windows preserve every bounded pre-existing clipboard format, including
  delayed-rendered data, without retaining content or overwriting a concurrent
  writer? If not, the Copy fallback is rejected.
- What exact behavior do security products show for an unsigned executable
  installing `WH_KEYBOARD_LL`? This needs physical evidence, not prediction.
- Which Windows application families expose useful selection through UIA, and
  which fail under UIPI or protected surfaces?
- Does XI2 or XRecord give the more reliable non-consuming Shift press/release
  stream across supported X11 desktops and multiple keyboards?
- Which GTK, Qt, Gecko, Chromium, and Electron versions expose active selection
  through AT-SPI on X11 and Wayland?
- Which distributions ship a GlobalShortcuts-capable backend for GNOME, KDE,
  and wlroots sessions, and how does consent persist across unsigned updates?
- Does any supported Wayland environment offer a portable public mechanism
  that changes the focused-input conclusion? Compositor-specific behavior alone
  is insufficient.

## Follow-up build plans

1. **Windows capture adapter — effort L.** Implement the hook and UIA path,
   decide the bounded clipboard transaction from prototype evidence, add
   contract tests, then complete the Windows matrix on the exact artifact.
2. **Linux X11 capture adapter — effort L.** Prototype XI2 versus XRecord,
   implement the chosen passive listener plus AT-SPI/`PRIMARY` ladder, add
   contract tests, then complete the X11 toolkit matrix.
3. **Linux Wayland portal capture — effort M.** Integrate the GlobalShortcuts
   portal for composer focus, separately prototype explicit shortcut-bound
   AT-SPI acquisition, and complete GNOME/KDE/wlroots matrices without adding a
   double-Shift claim.

No follow-up starts until the operator provides the matching hosts and accepts,
rejects, or amends this ADR.

## Consequences if accepted

- Windows and X11 can pursue the same user gesture without pretending their
  accessibility or clipboard contracts equal macOS.
- Wayland remains honest: portable shortcut or visible composer, never a
  modifier-only claim without a future public protocol and evidence.
- Privileged input access and UIAccess are rejected, preserving unsigned local-
  only distribution and least privilege.
- Platform support remains unchanged until each exact physical matrix passes.

## Revisit when

Revisit after Windows and Linux hosts produce the required evidence, or when a
public Wayland protocol changes ordinary-client global input visibility. Any
revision must preserve ADR 0010's single bounded Copy ceiling and ADR 0014's
unsigned distribution decision.
