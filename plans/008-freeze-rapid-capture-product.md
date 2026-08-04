# Plan 008: Refound Charon around rapid capture

> **Executor instructions**: Follow this documentation and decision plan before
> changing product code. Run every verification command and confirm the expected
> result before continuing. Stop on every STOP condition rather than filling in
> an unstated product decision. When done, update this plan's row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 9beb3fe..HEAD -- AGENTS.md README.md docs plans`
> The planned baseline is commit `9beb3fe`. If a newer accepted ADR already
> changes Workspace deletion, shortcut support, or the single-surface product
> model, compare it with the decisions below and stop on a contradiction.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: Plans 001 through 007
- **Category**: direction, migration, docs
- **Planned at**: commit `9beb3fe`, 2026-08-04

## Why this matters

Charon currently implements a broad note-management product while its primary
job is much narrower: select useful text, press Shift twice, and receive one
local note that can later be enriched, tagged, given local Attachments, or copied
as an agent-ready Markdown prompt. Product and persistence contracts still
require Sections, Merge, Trash, Undo, CopyPresets, an Insights boundary,
multiple routes, and a large shortcut catalog. Removing those behaviors without
first accepting one replacement decision would create schema ambiguity, unsafe
deletion, and contradictory documentation.

This plan freezes the smaller product before implementation. It also makes the
irreversible deletion semantics explicit: Charon must not present a Trash
workflow, but a completed permanent delete must not leave a Charon-owned
recoverable copy in normal transaction backups.

## Current state

- `docs/PRODUCT.md:19-75` defines Workspace, Section, Note, Selection,
  CopyPreset, Merge, and recoverable Delete as durable product concepts.
- `docs/UX.md:24-70` requires a 240px section rail plus Notes, Settings, and
  Insights-style navigation; `apps/desktop/src/components/section-rail.tsx`
  implements those surfaces.
- `apps/desktop/src-tauri/src/workspace/model.rs:17-93` persists `sections`,
  `sectionId`, `sortKey`, and `trashedAt` in schema v1.
- The same schema has no Tag or Attachment metadata, and Workspace storage has
  no Note-owned Attachment directory or import/delete transaction.
- `apps/desktop/src-tauri/src/workspace/command.rs:19-105` exposes section CRUD,
  move, reorder, trash, restore, merge, batch variants, and undo.
- `apps/desktop/src-tauri/src/workspace/recovery.rs:11-13,80-125,351-371`
  stores full previous and next note bodies for as many as 20 transactions and
  up to 30 days. The existing non-undoable permanent delete therefore still has
  a Charon-owned recovery copy after success.
- `docs/adr/0002-platform-capture.md` and `docs/adr/0006-focus-preserving-capture.md`
  make Command-double-Shift and an empty full editor part of the capture ladder.
- `docs/adr/0003-experimental-charts.md` permits Insights even though the new
  product explicitly rejects that surface.
- `docs/adr/0007-default-local-workspace.md` already provides a safe visible
  default at `Documents/Charon` and an explicit directory chooser. Preserve
  that decision because transparent Markdown and agent interoperability benefit
  from a discoverable location.
- The branch is `codex/007-quick-capture`, the worktree was clean during
  planning, and the next previous plan had not started.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Drift | `git diff --stat 9beb3fe..HEAD -- AGENTS.md README.md docs plans` | reviewed output or no output |
| Contract terms | `rg -n "Section|CopyPreset|Merge|Trash|Insights|Command-double-Shift|command palette" AGENTS.md README.md docs --glob '*.md'` | matches only in historical/superseded ADR context |
| Decision links | `rg -n "ADR 0011|0011-rapid-capture" AGENTS.md README.md docs plans/README.md` | all affected contracts link the new ADR |
| Scope | `git diff --name-only` | only `AGENTS.md`, `README.md`, `docs/**`, and `plans/**` |

## Suggested executor toolkit

- Use `improve` only to review plan completeness; do not use it to implement
  later source plans.
- Use `apple-design` when rewriting the interaction and destructive-action
  contracts. Simplicity must preserve agency, feedback, and accessible failure
  recovery.
- Use the accepted vocabulary `Workspace`, `CaptureCoordinator`,
  `ClipboardComposer`, and ephemeral `Selection` exactly.

## Scope

**In scope**:

- `docs/adr/0011-rapid-capture-product.md` (create)
- Status/cross-reference updates in `docs/adr/0001-local-workspace.md`,
  `0002-platform-capture.md`, `0003-experimental-charts.md`,
  `0005-fluid-desktop-motion.md`, `0006-focus-preserving-capture.md`, and
  `0007-default-local-workspace.md`
- `README.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/PRIVACY.md`,
  `docs/UX.md`, `docs/SITE.md`, `docs/platform-support.md`
- `AGENTS.md`
- `plans/README.md` status only after all done criteria pass

**Out of scope**:

- Any file under `apps/`, `packages/`, `scripts/`, or either lockfile
- Migrating an existing Workspace, copying brand assets, changing tokens,
  deleting dependencies, or redesigning React in this plan
- Promoting double Shift on Linux or Windows without native signed-build proof
- Removing typed contextual failure and recovery states

## Git workflow

- Branch: `codex/008-rapid-capture-contracts`
- Commit: `docs: refound Charon around rapid capture`
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Accept ADR 0011 as the replacement product decision

Create `docs/adr/0011-rapid-capture-product.md` with status `Accepted`. It must
record these decisions without leaving implementation details ambiguous:

1. Charon's primary job is one non-empty selected-text gesture to one ordinary
   local note, plus one always-visible manual composer.
2. A Workspace remains one local directory and the persistence, transaction,
   migration, conflict, and recovery boundary. Rust remains the filesystem and
   domain authority; React never reads note files directly.
3. The active model becomes one flat collection of Notes. A Note has stable
   UUID, Markdown body, `open|done` status, created/updated timestamps, an
   optional completion timestamp, an ordered set of Tags, and zero or more
   Note-owned Attachments. There is no Section, move, manual reorder, Merge,
   Trash, or persisted Selection.
4. Tags are optional short text labels stored directly on a Note. They are
   searched and rendered as quiet chips, with case-insensitive uniqueness while
   preserving first-entered spelling and order. There is no color taxonomy,
   nesting, global tag registry, tag-management route, or tag sidebar.
5. Adding an Attachment is an explicit file-picker action. Rust copies a
   bounded regular file into `attachments/<note-id>/` inside the Workspace and
   persists only safe display metadata plus a generated relative path. It never
   persists the external source path, follows a symlink, executes content,
   previews arbitrary formats, uploads, or creates a cross-Note asset library.
   Removing an Attachment or its Note permanently removes the managed file
   through the same transaction and completed-backup cleanup contract as Delete.
6. Selection remains ordered, ephemeral, reconciled to the current Open or Done
   result, and exists only for bulk status, `Copy as Markdown`, and permanent Delete.
7. `ClipboardComposer` remains the explicit clipboard-write boundary but loses
   CopyPreset UI and exposes one `Copy as Markdown` format. It emits each Note's
   Markdown body followed, only when present, by deterministic Tags and
   Attachments sections. Attachment entries contain safe display names and
   canonical absolute paths to the managed Workspace copies so local agents can
   address them. Charon never reads or copies Attachment bytes, uploads, pastes,
   or changes Note state; the explicit action discloses that local paths enter
   the system clipboard.
8. Delete is an explicitly confirmed, irreversible batch command. After a
   successful commit, neither active files nor normal Charon transaction backups
   retain the deleted Markdown or managed Attachment bytes. A crash may retain
   a bounded incomplete recovery record only until startup deterministically
   finishes or rolls back it, then removes it. OS snapshots, external backup
   tools, and synced folders remain outside Charon's erasure guarantee and must
   be disclosed.
9. Schema v1 migration preserves every active Note and never silently destroys
   legacy Trash content. The implementation plan owns a visible/plain-Markdown
   legacy archive and a pre-migration backup; the ADR must name that exception
   and its user-owned cleanup path. Migrated active Notes begin with empty Tags
   and Attachments.
10. The desktop has one single-column shelf, no persistent left rail and no
   Notes/Settings/Insights routes. Search and Open/Done filters are top chrome;
   the manual composer is anchored at the bottom. A hover/focus pencil expands
   a Note into a large Markdown editor with Write/Preview, Tag editing, and an
   Attachment list/import action in the same surface. Each collapsed Note has
   one compact Actions button whose primary item is `Copy as Markdown`.
11. Solarized is the first-run default. Light and Dark remain available. Charon's
   approved prune/lavender/cream brand primitives are mapped through semantic
   theme roles rather than raw component values.
12. The visible shortcut set is intentionally small: unmodified double Shift
    where proved, `CmdOrCtrl+Shift+Space` as the portable reveal-and-focus-
    composer fallback, `CmdOrCtrl+F`, Enter, Space, `CmdOrCtrl+A`, Delete, and
    Escape where their context is unambiguous. Remove Command-double-Shift,
    route navigation shortcuts, command palette, reorder, move, merge, and copy
    preset shortcuts.
13. macOS keeps ADRs 0008-0010 exactly for proven selected-text acquisition.
    Linux and Windows keep the safe standard accelerator and visible composer;
    Charon does not synthesize platform-specific input or claim modifier-only
    capture until the existing evidence gates pass.
14. `Documents/Charon` remains the default because visible Markdown is a core
    product property. A compact Preferences surface exposes the current folder
    and an explicit chooser, remembers only a successfully validated choice,
    and never stores note content in preferences.
15. Removing a generic Error page does not remove error handling. Failures stay
    contextual, content-free, input-preserving, and actionable where the failed
    operation occurred.

State precisely which paragraphs of ADRs 0001, 0002, 0003, 0006, and 0007 are
superseded and which privacy/capture invariants remain in force.

**Verify**: `rg -n "^## (Status|Context|Decision|Consequences|Migration|Revisit when)" docs/adr/0011-rapid-capture-product.md` returns all required headings; the Decision section contains all 15 decisions.

### Step 2: Rewrite the product, architecture, privacy, UX, and site contracts

Make the current contract documents describe only the accepted smaller product:

- `docs/PRODUCT.md`: rewrite users/jobs/domain/journeys/non-goals around capture,
  manual create, search, Open/Done, selection, permanent Delete, agent-ready copy,
  inline enrichment, Tags, managed Attachments, `Copy as Markdown`, themes,
  folder choice, recovery, and permission denial.
- `docs/ARCHITECTURE.md`: remove Section routing, CopyPreset grammar, Merge,
  Trash, generic Undo, command-palette view state, and Insights. Preserve the
  three named modules, flat schema v2 direction, typed IPC, real/in-memory seams,
  local files, Note-owned Attachment transaction rules, and app-to-theme-to-site
  dependency boundaries.
- `docs/PRIVACY.md`: add exact permanent-deletion limits and legacy migration
  archive behavior. Document that Attachment source paths are not persisted,
  imported bytes stay local, and explicit `Copy as Markdown` places managed
  absolute paths—but never file bytes—on the clipboard. Keep ADR 0010's capture
  clipboard disclosure unchanged.
- `docs/UX.md`: replace the rail shell with the single shelf and document an
  ASCII layout showing wordmark/preferences, search plus Open/Done, note stack,
  Tag chips, paperclip count, Actions button, selection/Delete state,
  shared-element editor expansion, Attachment controls, and bottom composer.
  Define hover, focus, keyboard, reduced-motion, large-text, empty, loading,
  import/error/destructive, and permission-denied states.
- `docs/SITE.md`: replace obsolete Sections/Merge/Insights/CopyPreset claims
  with the one-gesture-to-one-note story and approved brand direction.
- `docs/platform-support.md`: remove Command-double-Shift claims and specify the
  portable shortcut focuses the bottom composer.

The UX contract must state that Delete always opens one concise irreversible
confirmation naming the count; successful deletion returns focus to the nearest
surviving note or composer. It must also state that the editor expansion uses
transform/opacity-based shared layout, starts from the live row, is reversible,
does not lock input, and becomes a crossfade/static swap under reduced motion.

**Verify**: Contract terms command has no current-contract matches for removed concepts; `rg -n "Solarized|Open|Done|Tags|Attachments|Copy as Markdown|permanent|Documents/Charon|ClipboardComposer|CaptureCoordinator" README.md docs/*.md` confirms the replacement concepts are present.

### Step 3: Align repository instructions and roadmap language

Update `AGENTS.md` so future agents are not instructed to rebuild removed
features. Preserve Bun/Cargo, exact pins, Paraglide, semantic tokens, local-only
privacy, Workspace authority, platform gates, Base UI composition, Tabler icons,
and Apple-style motion rules. Replace the destructive contract with confirmed
permanent batch deletion and its no-completed-backup rule. Replace
`CopyPreset` with the one deterministic `Copy as Markdown` contract, including
Tags and managed Attachment paths. Add the bounded local Attachment invariant.
Remove the Insights feature boundary and section vocabulary.

Update `README.md` to describe Charon in one sentence as the rapid local capture
shelf for AI-agent users, list the smaller journeys, keep truthful platform
support, and link ADR 0011. Do not claim Linux/Windows double Shift.

Mark ADR 0003 superseded and record Insights as intentionally rejected, not
deferred. Mark only the affected portions of the other ADRs superseded so ADRs
0008-0010 remain authoritative.

**Verify**: Decision links command passes; removed vocabulary occurs only in
historical context explicitly labelled superseded or rejected.

### Step 4: Review the complete documentation diff

Read every modified file in full. Confirm there is exactly one answer for:

- what a Note contains;
- how Tags stay lightweight instead of becoming hierarchy;
- where Attachment bytes live, how they are imported/removed, and which paths
  enter the clipboard only after an explicit action;
- what Delete guarantees and does not guarantee;
- how legacy Trash content survives migration;
- where the default Workspace lives and how another folder is chosen;
- which shortcut works on each platform;
- what the single desktop surface contains;
- which brand and theme is the default;
- why contextual errors remain although the generic error surface is removed.

**Verify**: Scope command lists only allowed files; `git diff --check` exits 0.

## Test plan

- Documentation link and vocabulary checks from the command table.
- Manual contradiction review across ADR 0011, PRODUCT, ARCHITECTURE, PRIVACY,
  UX, SITE, platform support, README, and AGENTS.
- No runtime commands are invented for this documentation-only plan.

## Done criteria

- [ ] ADR 0011 is accepted and records all 15 decisions.
- [ ] Current contracts describe only the rapid-capture shelf.
- [ ] Tags, managed Attachments, and `Copy as Markdown` have one precise contract.
- [ ] Permanent deletion and recovery-record cleanup are precise.
- [ ] Legacy active and trashed content has a no-loss migration contract.
- [ ] Solarized is default and the approved brand primitives are authoritative.
- [ ] macOS capture privacy remains unchanged; other platforms retain honest fallbacks.
- [ ] `Documents/Charon` remains the visible safe default with explicit choice.
- [ ] AGENTS and README no longer direct later work toward removed features.
- [ ] Only documentation and plan files changed; diff and link checks pass.
- [ ] This plan is `DONE` in `plans/README.md`.

## STOP conditions

- The operator does not accept confirmation before irreversible deletion.
- A no-loss schema v1 migration cannot be described without silently restoring,
  deleting, or hiding legacy Trash content.
- Attachment storage would require persisting fragile external source paths,
  following symlinks, automatic upload, or React filesystem access.
- Another accepted ADR conflicts with flat Notes, the shortcut reduction, or
  the no-completed-backup deletion guarantee.
- The desired cross-platform claim requires synthetic input or an unproved
  modifier-only global listener on Linux or Windows.
- Any contract change weakens local-only privacy or React-to-Rust authority.

## Maintenance notes

- ADR 0011 is the gate for Plans 009-012. Do not implement around it.
- Historical ADRs remain useful evidence; mark superseded clauses instead of
  deleting their record.
- If product scope expands later, demand evidence before reintroducing routes,
  hierarchy, configurable shortcut catalogs, or analytics-style surfaces.
- Tags are an explicit flat Note field, not permission to restore Section,
  nested labels, color-management UI, or a second navigation destination.
