# ADR 0006: Focus-preserving capture into the main Workspace

## Status

Accepted for v1. This ADR supersedes only the quick-capture-window and focus-
restoration portions of ADR 0002. ADR 0002 remains authoritative for platform
capability tiers, permission gates, and the standard accelerator. ADR 0011
preserves the one-surface and silent unmodified-capture decisions but supersedes
the active-Section fallback, Command-double-Shift, empty-editor fallback, Notes-
work-area input, and possible Copper-like mode.

## Context

The original capture contract opened a second centered window for every global
trigger. Physical testing proved that the standard accelerator can summon that
window, but the interruption is contrary to the product goal: capturing a useful
selection should not replace the application the user is currently working in.

Copper demonstrates the desired separation well: one shortcut records selected
text without taking focus, while the primary application remains the only place
for manual entry, search, organization, and editing. Charon keeps its existing
rail/work-area/inspector shell rather than copying Copper's compact visual mode.

## Decision

Charon has one application surface: the main window. It does not create or
persist a dedicated capture window.

On a proved macOS adapter:

- two complete unmodified Shift taps request the current selected text through
  ADR 0009's public Accessibility ladder and, when needed, ADR 0010's bounded
  source Copy fallback;
- when that text is non-empty, the application layer dispatches exactly one
  normal Workspace `CreateNote` command into the active section;
- when selection is empty, unavailable, denied, or only whitespace, nothing is
  created, no window is shown, and focus remains in the source application;
- holding Command consistently across the two Shift taps does not read selected
  text or create a note. It shows and focuses the main Charon window and opens
  the existing full editor with a new empty draft ready to type.

`CmdOrCtrl+Shift+Space` is the portable fallback for the second journey: reveal
the main window and open an empty editor. The visible in-app capture affordance
is a compact single-line input in the current Notes work area. Enter creates one
normal note in that section; empty input does nothing. Full Markdown editing
continues in the existing editor.

The active capture section is ephemeral UI context reported to the application
layer. If none is known, the first section in deterministic Workspace order is
used. There is no special Quick Note entity, implicit section, or persisted
Selection.

`CaptureCoordinator` owns gesture classification, capability state, permission
state, selected-text acquisition, duplicate suppression, and listener lifecycle.
It returns a typed capture action. The application layer maps that action to a
named Workspace command or main-window event; the coordinator never reads or
writes Workspace files.

An optional Copper-like compact or "simple" presentation mode is deferred. It
must reuse the same Workspace commands and main-window state rather than create
a second capture product.

ADR 0008 corrects the macOS permission gate: passive modifier observation
requires Input Monitoring, while selected-text acquisition separately requires
Accessibility.
ADR 0009 expands macOS acquisition beyond the focused editable element. ADR
0010 adds the only permitted synthetic Copy/clipboard transaction while keeping
the gesture, focus, and typed-action semantics unchanged.

## Consequences

- Ordinary double Shift is genuinely non-interrupting and has no draft-loss or
  focus-restoration problem.
- Empty, denied, timed-out, or safety-rejected selection is a no-op, so the
  gesture cannot create accidental blank notes.
- The Command-modified gesture and portable accelerator have an explicit,
  visible fallback in the existing editor.
- Background capture requires the Workspace to be open and to contain a valid
  destination section. Failure remains content-free and is surfaced only when
  the main application is next visible.
- The hidden `/capture` route, window capabilities, draft form, and related
  lifecycle contract are removed.

## Revisit when

Revisit if evidence shows users need a configurable capture destination, if an
optional simple mode is designed and tested, or if a platform gains a proved
selected-text API with different focus behavior.
