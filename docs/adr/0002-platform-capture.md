# ADR 0002: Platform capture capability ladder

## Status

Accepted for v1. The quick-window and focus-restoration portions are superseded
by ADR 0006. ADR 0010 supersedes the earlier no-clipboard/no-synthetic-Copy
restriction only for its bounded explicit capture transaction; the capability
ladder and permission gates remain active. ADR 0011 supersedes the configurable
shortcut catalog, the empty-editor and Command-double-Shift journeys, and
references to the old Notes input: the one portable accelerator now reveals
Charon and focuses the bottom composer, and Command-double-Shift is removed.
ADR 0015 supersedes the cross-platform shortcut values and Windows/Linux rows;
ADR 0016 supersedes physical certification as a release gate.

## Context

Charon needs capture to feel immediate without making platform claims that
Tauri's standard shortcut API cannot satisfy. `Shift`, `Shift` is a timed
sequence of modifier key events. It cannot be registered as a normal Tauri
accelerator. Selected-text acquisition also depends on operating-system
permissions and application behavior.

A normal configurable accelerator and visible in-app capture input must keep
the core journey available whenever an enhanced native adapter is absent,
denied, or fails.

## Decision

`CmdOrCtrl+Shift+Space` is the default fallback on every platform. Users may
configure another valid standard accelerator. It reveals the main window and
opens a new empty editor. The app always exposes a visible main-window input and
never claims enhanced support before the relevant smoke test passes.

| Platform | Standard support | Enhanced capture contract |
| --- | --- | --- |
| macOS 14+ | Standard global accelerator and visible fallback | Unmodified double Shift silently captures non-empty text through ADR 0009's public Accessibility ladder first, then ADR 0010's bounded source Copy fallback when needed. Command plus double Shift reveals the main empty editor. Detection requires just-in-time Input Monitoring consent; selected text separately requires Accessibility consent per ADR 0008. |
| Linux X11 | Standard global accelerator | Double Shift only if a proved native adapter passes documented smoke tests. Selected text is not promised by default. |
| Linux Wayland | Visible fallback and in-app shortcut | Do not promise modifier-only global shortcuts. Portal and compositor limitations must be explained without presenting denial as an app failure. |
| Windows | Standard global accelerator first | Double Shift and selected-text capture only after a signed-build smoke test confirms the native adapter, permissions, focus behavior, and fallback. |

`CaptureCoordinator` owns capability detection, registration, permission state,
gesture classification, selected-text acquisition, duplicate suppression, and
fallback choice. It returns typed actions consumed by the application layer;
platform adapters do not persist notes. Copy remains explicit and Charon never
injects Paste or arbitrary keystrokes into third-party applications. ADR 0010
permits exactly one synthetic platform Copy command after a completed capture
gesture, with bounded snapshot/read/conditional restoration. ADR 0006 defines
the focus-preserving action semantics. ADR 0009 defines the primary public
selected-text representations and bounded candidate chains.

## Consequences

- Every platform has a dependable capture path even when enhanced capture is
  unavailable.
- macOS 14+ is the tier-one enhanced experience; X11 and Windows claims require
  platform evidence.
- Wayland users receive an honest visible fallback instead of an unreliable
  modifier hook.
- Input Monitoring and Accessibility are requested separately and only when the
  user invokes a feature that needs each capability; permission copy discloses
  the transient clipboard compatibility fallback.
- Release notes and the public site must reflect tested capability tiers.

## Revisit when

Revisit when Wayland exposes a stable desktop portal for the required
modifier-only sequence, when Tauri gains a supported modifier-event API, or
when signed smoke-test evidence changes a platform's support tier.
