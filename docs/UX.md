# Charon desktop UX contract

## Product posture

Charon is a dense desktop tool, not a landing page placed inside a window. It
optimizes scan speed, keyboard continuity, predictable state, and calm recovery.
Density is 6/10, visual variance is 5/10, and motion is 4/10. The interface can
feel crafted without adding decorative surfaces or delaying work.

## Visual language

Use the platform system UI font stack with optical sizing where supported,
size-specific tracking, and tighter leading only for larger headings. Do not use
Inter, gradients, glow, permanent glass, oversized marketing type, or a rounded
card grid. Tabler outline icons are the sole UI icon family, with a consistent
stroke weight. Emoji are not UI iconography.

The three themes preserve the same semantic hierarchy:

- Light uses cold off-white and silver surfaces with graphite text.
- Dark uses graphite surfaces rather than pure black, with cool light text.
- Solarized follows classic Solarized light and dark semantic relationships,
  remapped through the same roles rather than raw component colors.

One cobalt action accent communicates focus, selection, active controls, and
primary actions. Destructive, warning, and success colors remain semantic and
must not become competing brand accents. All styling uses semantic CSS tokens;
components do not use raw palette values.

Surface radius is 14px, field radius is 10px, and compact control radius is
8px. Pills are reserved for tags or compact segmented semantics, not ordinary
buttons. Borders, alignment, and spacing create hierarchy; shadows appear only
when a layer truly floats.

## Shell and layout

The main window has a 240px section rail, a flexible note work area, and an
optional contextual inspector. The rail may collapse only with an explicit
control and a restorable preference. The work area prioritizes search, note
ordering, selection, and editing. The inspector must disappear cleanly when it
has no contextual job.

Fast manual capture is a compact single-line input anchored to the Notes work
area. It names the current destination section, creates on Enter, ignores empty
input, and hands longer work to the existing full editor. Global unmodified
double Shift has no surface and never steals focus. Command plus double Shift or
the standard accelerator reveals the main window and focuses a new empty editor.

The existing rail/work-area/inspector shell remains the v1 presentation. A
future optional simple mode may collapse it into a Copper-like single-column
shelf, but it must preserve the same commands, focus semantics, and Workspace;
it is not a second capture window.

A fresh launch opens or creates the visible default Workspace in
`Documents/Charon` and focuses the existing Notes journey. If automatic
bootstrap cannot safely use that location, the empty state offers an enabled
folder chooser; it is never a disabled setup dead end.

Layouts must tolerate larger text and French strings without clipping controls.
At narrow desktop widths, the inspector closes before the work area becomes
unusable; the section rail may become an explicit overlay with preserved focus.

## Interaction states

Every flow and reusable control defines all of these states:

- loading: layout-shaped placeholders or local progress with the initiating
  control still understandable;
- empty: a specific explanation and the shortest valid next action;
- error: contextual failure, preserved user input, retry or recovery path;
- destructive: explicit scope, recoverability, and stronger confirmation only
  for permanent deletion;
- focus: a high-contrast visible ring independent of selection;
- selected: cobalt-backed or bordered state that remains distinct from focus;
- disabled: unavailable appearance plus an accessible reason when needed;
- permission-denied: affected capability, reason for permission, settings path,
  and a functional fallback.

The same coverage applies to success, external conflicts, offline update checks,
and interrupted Workspace recovery. Color alone never communicates a state.

## Keyboard contract

- Arrow keys move the active note without changing selection.
- Space toggles the active note in the ephemeral Selection.
- Shift plus arrow navigation extends a contiguous range from the selection
  anchor.
- `CmdOrCtrl+A` selects all notes in the current visible result set.
- Enter edits the active note.
- `CmdOrCtrl+C` copies the ordered selection with the default CopyPreset when
  focus is not inside editable text. Normal text copy wins inside an editor.
- Delete moves the selection to trash in one recoverable transaction.
- Escape closes the topmost surface first, preserving predictable layer order.
- Unmodified `Shift`, `Shift` captures non-empty selected text and leaves the
  source application focused. On macOS it tries public Accessibility first,
  then the disclosed bounded Copy fallback from ADR 0010. Protected, unsafe,
  malformed, blocked, timed-out, canvas-only, or empty sources do nothing.
- Command held consistently across `Shift`, `Shift` opens the main empty editor.
- `CmdOrCtrl+Shift+Space` opens the same main empty editor as the portable
  fallback.

When enhanced macOS gestures are unavailable, shortcut help exposes separate,
explicit Input Monitoring and Accessibility permission/retry actions. It names
which journey each permission enables and explains that selected text may pass
briefly through the system clipboard when direct Accessibility access fails.
It never prompts on mount and keeps the standard shortcut and manual input
usable after denial.

Commands must be reachable without relying on a pointer. Focus returns to the
logical trigger after a surface closes, and removed rows move focus to the
nearest surviving note or the empty-state action.

## Destructive and recovery behavior

Completion, trash, merge, and undo report one grouped result for the full
selection. Trash is never presented as permanent deletion. Merge always shows
the exact composite preview and destination before confirmation. Permanent
deletion is a separate trash-only command with irreversible wording.

If a command encounters an external edit or invalid Workspace state, Charon
preserves draft text, stops dependent mutations, and shows a recovery decision.
It never resolves a content conflict based only on a timestamp.

## Motion and materials

Movement is restrained but physical. Press feedback begins on pointer or key
down and targets a visible response within one frame. Direct manipulation tracks
1:1. State transitions use critically damped springs by default, remain
interruptible and reversible, and retarget from the current presentation value.
Only transform and opacity animate; input is never locked while motion settles.

Entrances and exits share a spatial path and originate from their trigger.
Gesture release may inherit measured velocity and project momentum, but
non-gesture UI has no decorative bounce. Rubber-banding is permitted only for a
real direct-manipulation need and remains visual rather than changing state.

Translucency is limited to navigation or transient floating layers where it
communicates hierarchy. It is never stacked or used as permanent decoration.
Solid semantic fallbacks preserve contrast under reduced transparency and
increased contrast.

With `prefers-reduced-motion`, springs, slides, parallax, and momentum become
instant state changes or short opacity fades. With
`prefers-reduced-transparency`, materials become solid. Increased contrast adds
clear boundaries without changing information architecture.

## Acceptance review

Any new interaction pattern is reviewed at normal speed, in slow motion, and by
reversing it mid-animation. Review includes keyboard-only use, screen-reader
announcements, larger text, EN/FR strings, all three themes, reduced-motion,
reduced-transparency, increased contrast, loading, empty, error, destructive,
focus, selected, disabled, and permission-denied states.
