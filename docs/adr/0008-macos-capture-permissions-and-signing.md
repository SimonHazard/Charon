# ADR 0008: macOS capture permissions and signing identity

## Status

Accepted for v1.

## Context

The Plan 007 physical smoke test proved that the previous single-permission
model was incorrect. macOS exposes two independent protected capabilities:

- a passive session `CGEventTap` that observes global modifier events requires
  Input Monitoring, represented by the public
  `CGPreflightListenEventAccess` and `CGRequestListenEventAccess` APIs;
- querying the foreground Accessibility tree for selected text requires
Accessibility, represented by `AXIsProcessTrusted` and
`AXIsProcessTrustedWithOptions`. ADR 0009 defines the primary public direct,
range, and text-marker representations used after authorization. ADR 0010 also
uses that consent for one disclosed synthetic Copy fallback when the primary
path returns no text.

Tauri's global-shortcut plugin remains appropriate for the portable accelerator,
but its shortcut model requires one non-modifier key and cannot represent a
double-Shift sequence. The native adapter therefore remains necessary.

The failed debug bundle was only linker-signed ad hoc: its code-signing
identifier did not match the configured `CFBundleIdentifier`, its `Info.plist`
was not bound, and no stable Apple signing identity was installed. TCC decisions
cannot be treated as durable release evidence for such a rebuildable identity.

## Decision

Charon models Input Monitoring and Accessibility as separate capability states.
It checks both without prompting on launch.

- `CmdOrCtrl+Shift+Space` uses Tauri's Rust global-shortcut plugin and requires
  neither enhanced permission.
- Command-double-Shift requires Input Monitoring only. It never reads selected
  text.
- Unmodified double Shift requires Input Monitoring to detect the gesture and
  Accessibility to read the selected text or invoke ADR 0010's bounded Copy
  fallback. Without both, it creates nothing.

Shortcut help exposes localized, explicit actions for each missing permission.
Input Monitoring is requested with `CGRequestListenEventAccess`; Accessibility
is requested with `AXIsProcessTrustedWithOptions`. After either system flow,
Charon re-preflights the capability and starts exactly one listener only after
Input Monitoring is confirmed. Denial remains a usable state with the standard
accelerator and main Notes input.

The event-tap listener stays session-scoped, passive (`listenOnly`), and
observes only flags and key events needed by the pure gesture machine. It never
suppresses, rewrites, posts, records, persists, or logs keyboard events. The
separate capture transaction may post exactly one Command-C pair only after a
completed explicit gesture and only under ADR 0010; the listener callback never
blocks to acquire text or post input.

Tauri debug bundles use an explicit ad-hoc bundle signature so the complete app
bundle, configured identifier, and `Info.plist` are bound consistently. Ad-hoc
TCC grants remain build-specific and must be re-granted after a changed build.
A macOS capability is not promoted to release-supported until the same matrix
passes with the stable Developer ID signature required by Plan 012.

ADR 0008 corrects the permission and evidence portions of ADRs 0002 and 0006.
ADR 0009 broadens direct selected-text compatibility without another
permission. ADR 0010 later permits only its bounded synthetic Copy fallback and
supersedes this ADR's earlier blanket synthetic-input prohibition accordingly.

## Consequences

- macOS shows two honest, purpose-specific permission steps instead of one
  misleading Accessibility toggle.
- Command-double-Shift can work without access to selected text.
- Silent selection capture remains gesture-bound and fails closed when neither
  the direct path nor the bounded Copy transaction can complete safely.
- Development rebuilds may require permission reset/regrant; signed release
  validation remains a separate hard gate.
- Tauri owns the portable accelerator and bundle configuration, while the small
  macOS adapter owns only capabilities Tauri cannot express.

## Revisit when

Revisit if Apple provides a public modifier-sequence registration API, Tauri's
shortcut model supports modifier-only sequences, or a supported macOS release
changes the public TCC APIs. Any listener replacement must remain passive; any
selection fallback must satisfy ADR 0010 and the same false-positive, focus,
privacy, clipboard-race, and signed-build matrix.
