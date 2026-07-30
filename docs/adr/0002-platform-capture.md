# ADR 0002: Platform capture capability ladder

## Status

Accepted for v1.

## Context

Charon needs capture to feel immediate without making platform claims that
Tauri's standard shortcut API cannot satisfy. `Shift`, `Shift` is a timed
sequence of modifier key events. It cannot be registered as a normal Tauri
accelerator. Selected-text acquisition also depends on operating-system
permissions and application behavior.

A normal configurable accelerator and visible in-app capture command must keep
the core journey available whenever an enhanced native adapter is absent,
denied, or fails.

## Decision

`CmdOrCtrl+Shift+Space` is the default fallback on every platform. Users may
configure another valid standard accelerator. The app always exposes visible
capture and an in-app shortcut, and never claims enhanced support before the
relevant smoke test passes.

| Platform | Standard support | Enhanced capture contract |
| --- | --- | --- |
| macOS 14+ | Standard global accelerator and visible fallback | Double Shift and selected-text capture after just-in-time Accessibility consent. Denial falls back without blocking manual capture. |
| Linux X11 | Standard global accelerator | Double Shift only if a proved native adapter passes documented smoke tests. Selected text is not promised by default. |
| Linux Wayland | Visible fallback and in-app shortcut | Do not promise modifier-only global shortcuts. Portal and compositor limitations must be explained without presenting denial as an app failure. |
| Windows | Standard global accelerator first | Double Shift and selected-text capture only after a signed-build smoke test confirms the native adapter, permissions, focus behavior, and fallback. |

`CaptureCoordinator` owns capability detection, registration, permission state,
selected-text acquisition, quick-window lifecycle, focus restoration, and
fallback choice. Platform adapters report capabilities; they do not persist
notes. Copy remains explicit and Charon never injects paste keystrokes into
third-party applications.

## Consequences

- Every platform has a dependable capture path even when enhanced capture is
  unavailable.
- macOS 14+ is the tier-one enhanced experience; X11 and Windows claims require
  platform evidence.
- Wayland users receive an honest visible fallback instead of an unreliable
  modifier hook.
- Accessibility permission is requested only when the user invokes a feature
  that needs it.
- Release notes and the public site must reflect tested capability tiers.

## Revisit when

Revisit when Wayland exposes a stable desktop portal for the required
modifier-only sequence, when Tauri gains a supported modifier-event API, or
when signed smoke-test evidence changes a platform's support tier.
