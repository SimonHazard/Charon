# ADR 0013: Direct Note actions without Selection

## Status

Accepted on 2026-08-15 after operator review of the unified shelf.

## Context

ADR 0011 introduced an ordered ephemeral `Selection` so a compact shelf could
offer bulk status changes, multi-Note `Copy as Markdown`, and batch permanent
Delete. ADR 0012 kept that interaction after making status and the most common
row actions direct.

In use, Selection adds a second interaction mode to a small personal capture
tool. A plain row click does not open the Note, modifier and range gestures need
their own visual state, and the contextual toolbar moves the shelf before the
user can act. The operator has asked to remove the feature for now. It may be
reconsidered later from observed need, but it is not dormant v1 scaffolding.

This changes the desktop interaction, command shape, clipboard composition, and
deletion wording. It does not change the schema, Workspace durability,
Attachment ownership, capture contract, local-only privacy boundary, or the
irreversible cleanup guarantee.

## Decision

1. Charon has no Note `Selection` state, selected-row presentation, range or
   modifier selection gesture, contextual Selection toolbar, or bulk Note
   command in v1. React does not persist or retain a hidden selection model.
2. A collapsed Note is activated directly. Clicking its main row surface,
   pressing Enter, or pressing Space while that surface has focus expands the
   Note from its live position. Arrow keys move focus between visible Notes
   without creating product state.
3. Status, `Copy as Markdown`, Edit, and permanent Delete are explicit per-Note
   controls. They remain keyboard reachable and visible without hover on coarse
   pointers. Delete while the main row surface has focus opens the same direct
   per-Note confirmation.
4. `ClipboardComposer` accepts exactly one immutable Note and its resolved
   Attachment metadata. It preserves the Note body without inventing a heading,
   then emits optional Tags and managed Attachment names and canonical paths in
   the existing deterministic form. The explicit action keeps the local-path
   disclosure and changes only the system clipboard.
5. Workspace status and permanent-Delete application commands address exactly
   one Note. Permanent Delete confirms that one Note, commits one bounded
   Workspace transaction, and retains the cleanup, recovery, and external-
   backup disclosure accepted by ADR 0011.
6. The Selection-specific Space, Shift-range, `CmdOrCtrl+A`, and batch Delete
   shortcuts are removed. Native text selection shortcuts continue to work in
   editable controls. `CmdOrCtrl+F`, direct control activation, editor Escape,
   selected-text capture, and the portable composer shortcut remain unchanged.
7. Historical accepted ADRs and completed plans remain evidence of the former
   design. Reintroducing Note Selection or another bulk interaction requires a
   new accepted ADR and current implementation plan; no unused compatibility
   layer remains in code or current contracts.

This ADR supersedes ADR 0011 Decisions 6, 7 only where it accepts multiple Note
composition, 8 only where it defines batch Delete and count-specific wording,
and 12 only where shortcuts exist for Selection. It supersedes ADR 0012
Decisions 1 and 2 only where they reconcile Selection or retain contextual bulk
commands. The remaining decisions of both ADRs stay authoritative.

## Consequences

- Every visible Note action now has one direct target and immediate scope.
- Clicking a row opens it instead of entering a latent mode; focus remains a
  browser-native interaction state rather than durable or ephemeral domain
  data.
- Multi-Note copy, bulk status changes, and batch Delete are unavailable. Users
  repeat the direct action when they need it on several Notes.
- IPC, Rust domain methods, localization, tests, and documentation become
  singular and no longer carry Selection-only branches.
- The clipboard and permanent-delete privacy guarantees remain unchanged for
  the one Note addressed by each explicit action.

## Revisit when

Revisit only if observed repeated workflows justify bulk interaction strongly
enough to offset its mode, toolbar, accessibility, and compact-layout costs. A
new proposal must define ordering, focus, filtering reconciliation, destructive
scope, and clipboard output rather than reviving the removed implementation by
default.
