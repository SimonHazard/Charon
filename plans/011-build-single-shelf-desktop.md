# Plan 011: Build the single-shelf desktop experience

> **Executor instructions**: Invoke `frontend-design`, `apple-design`,
> `vercel-react-best-practices`, and `shadcn` before implementation. Use Base
> UI's `render` composition API, never Radix `asChild`. Follow every gate and
> STOP condition. All user-facing strings go through Paraglide. Update the plan
> index only after the visual and automated done criteria pass.
>
> **Drift check (run first)**:
> `git diff --stat 9beb3fe..HEAD -- apps/desktop/src apps/desktop/messages apps/desktop/package.json apps/desktop/vite.config.ts package.json bun.lock plans/README.md`
> If Plan 010's generated DTOs or theme contract differ from the Current state
> assumptions, reconcile names without restoring removed features.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: MED
- **Depends on**: `plans/009-integrate-brand-and-solarized-system.md`, `plans/010-simplify-workspace-and-copy-domain.md`
- **Category**: direction, tech-debt, perf, tests
- **Planned at**: commit `9beb3fe`, 2026-08-04

## Why this matters

The current shell devotes permanent space to navigation, Sections, Settings,
Stats, status chrome, a command palette, large shortcut help, and modal
workflows. The requested product should feel like one fast shelf: search and
Open/Done at the top, Notes in the middle, and capture at the bottom. Enrichment
must grow naturally from the Note instead of sending the user into another
screen or a generic dialog. Tags, Attachments, and agent-ready copy are useful
only if they remain contextual and do not rebuild a navigation-heavy knowledge
manager.

This plan removes navigation architecture that no longer has a second
destination, keeps virtualization for large local collections, and implements a
shared-element editor expansion with immediate, interruptible feedback.

## Current state

- `apps/desktop/src/components/app-shell.tsx:7-30` composes a 240px rail,
  titlebar, work area, optional inspector, and permanent footer.
- `apps/desktop/src/components/section-rail.tsx:25-78` links Notes, Settings,
  Stats, and every Section with counts.
- `apps/desktop/src/routes/**` plus generated `routeTree.gen.ts` use TanStack
  Router for a product that will have one surface.
- `apps/desktop/src/app/commands/command-provider.tsx:49-191` adds a global
  command registry, cmdk palette, broad hotkey catalog, and shortcut dialog.
- `apps/desktop/src/features/notes/note-screen.tsx` coordinates search, status,
  trash, sections, merge, move, undo, copy presets, modal edit, and selection.
- `apps/desktop/src/features/notes/note-list.tsx` already virtualizes rows with
  `@tanstack/react-virtual`; retain that performance seam.
- `apps/desktop/src/features/notes/note-editor.tsx` already has autosave,
  draft-loss handling, Write/Preview, and localized status. Reuse its tested
  draft controller but change the presentation.
- `apps/desktop/src/features/notes/capture-input.tsx` already creates on Enter
  and preserves failed input, but labels a Section and sits below the old shell.
- Plan 009 defines the Charon brand tokens and crossing-line signature; Plan 010
  supplies flat Notes, Tags, managed Attachments, and `Copy as Markdown`.

## Target layout

```text
┌──────────────────────────────────────────────────────────────┐
│ [CHARON wordmark]                              [?] [settings] │
│ [ Search notes…                         ] [ Open | Done ]     │
│                                                    [Select]  │
│  │ note body preview   [tag] [tag]  2 files   ○   ···  edit  │
│  │ note body preview                         ●   ···  edit  │
│  │ ┌──────────────── expanded editor ────────────────┐       │
│  │ │ [Write | Preview]                              │       │
│  │ │ large Markdown textarea / safe preview         │       │
│  │ │ Tags [agent] [research] [+]                    │       │
│  │ │ Attachments  brief.pdf  screenshot.png  [+]    │       │
│  │ └────────────────────────────────────────────────┘       │
│  …                                                           │
│ [ Capture a note…                                      ↑ ]  │
└──────────────────────────────────────────────────────────────┘
```

In selection mode, status circles become selection controls and the top-right
Select action becomes `Delete N` plus Cancel. Default filter is Open. There is
no All or Trash filter.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| UI tests | `bun run test:desktop -- shell note-screen note-list note-editor capture-input selection search tags attachments copy` | all targeted tests pass |
| Typecheck | `bun run --cwd apps/desktop typecheck` | exit 0 |
| Bundle | `bun run build:desktop` | exit 0, one app surface |
| Removed surface scan | `rg -n "SectionRail|/stats|/settings|CommandDialog|command-palette|MergeDialog|TrashView|CopyPreset|reorder|moveOpen" apps/desktop/src apps/desktop/messages` | no current-product matches |
| Dependency scan | `bun pm ls` plus `rg` per removed dependency | no unused direct dependency retained |
| Quality | `bun run check` | exit 0 |

## Design rules

- Bloom is inspiration for calm density, top filtering, bottom composition, and
  scan rhythm only. Do not copy its brand, component geometry, or project cards.
- Use the approved vector wordmark at usable widths and the icon under 160px.
- Use system UI text and system monospace for Markdown. No additional font.
- Build one visually continuous shelf. Notes are rows separated by rhythm and
  hairlines, not a grid of rounded cards.
- Spend visual distinctiveness on the lavender crossing line: it begins at the
  newly created Note, marks active/selected state, and becomes the origin edge
  of the expanded editor. Remove any secondary decoration competing with it.
- No gradients, glow, emoji icons, generic bento, oversized heading, permanent
  glass, or shadow on non-floating rows.
- Use only semantic theme tokens; no raw palette value in product components.
- Tag chips and Attachment metadata are subordinate row information, not rounded
  cards or a second visual system. Tags use one semantic treatment, never
  user-configurable colors.

## Scope

**In scope**:

- `apps/desktop/src/main.tsx`, app providers, single-surface root
- `apps/desktop/src/components/{app-shell,titlebar,workspace-state}.tsx`
- Remove obsolete `section-rail.tsx`, route files, generated route tree, command
  palette/registry files, and tests that exist only for removed behavior
- `apps/desktop/src/features/notes/**` rewritten for flat shelf behavior
- `apps/desktop/src/features/copy/**` rewritten for one explicit `Copy as
  Markdown` action
- Existing UI components under `apps/desktop/src/components/ui/**` only when
  used by the shelf/editor/confirmation/preferences trigger
- `apps/desktop/src/styles/app.css`, motion helpers/tests
- `apps/desktop/messages/en.json`, `fr.json`, generated Paraglide output only
  through its owning generator
- `apps/desktop/package.json`, `vite.config.ts`, root `package.json`, `bun.lock`
- Desktop tests beside the rewritten files

**Out of scope**:

- Native preferences or folder persistence, permission flows, capture adapter
  changes, static site, release workflows
- Removing `@tanstack/react-virtual`, Workspace typed state, Motion, Base UI,
  Tabler, Tailwind, Paraglide, or clipboard explicit-write behavior
- Drag reorder, Sections, projects, due dates, rich WYSIWYG, AI processing,
  automatic paste, another window, a Tag manager/color picker, Attachment
  previews, drag/drop, execution, upload, or cross-Note asset library

## Git workflow

- Branch: `codex/011-single-shelf-desktop`
- Commits: `refactor(ui): collapse Charon into one note shelf`,
  `feat(notes): expand notes into the markdown editor`,
  `feat(notes): add tags attachments and markdown actions`,
  `chore(desktop): remove obsolete navigation dependencies`
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Collapse routing and shell to one surface

Render one application root directly from `main.tsx`. Remove TanStack Router,
generated routes, Notes/Settings/Stats navigation, rail overlay, inspector slot,
route-specific generic Error components, and permanent local-only footer. Keep a
real root error boundary that renders the smallest contextual recovery action;
do not suppress runtime failures.

Build a compact titlebar/header with approved responsive wordmark, a capture
help trigger, and a settings trigger that Plan 012 will populate. On macOS,
preserve native window drag regions and traffic-light clearance. On Windows and
Linux, preserve conventional window interaction and minimum size. The main
content owns one scroll viewport; titlebar and bottom composer remain stable.

The header and bottom composer may use a restrained transient material only
where content scrolls underneath. Reduced transparency makes them solid.

**Verify**: shell tests find one main landmark, no navigation landmark, no rail,
no app route links, one stable scroll viewport, and responsive wordmark/icon at
720px minimum and 200% zoom.

### Step 2: Build the top search and two-state status filter

Compose one top workbar:

- immediate search input with `CmdOrCtrl+F`, clear action, and 120ms maximum
  derivation debounce only if measurement proves it necessary;
- exclusive Open/Done segmented control with Open as first-run/default state;
- small visible counts inside accessible labels only when they aid orientation;
- Select action that enters explicit selection mode.

Search covers Markdown bodies, Tag labels, and Attachment display names in the
current status only. Clicking a Tag chip applies one exact removable Tag filter
inside the same workbar; it does not navigate or open a second surface. Typing
`#` does not introduce a hidden query language. Clearing search clears text and
the active Tag but keeps the current Open/Done filter. Empty states use one
direct sentence and focus the bottom composer (Open empty) or offer the Open
filter (Done empty). No All, Section, Trash, Tag route, or Insights state exists.

Feedback begins on pointer/key down. The segmented indicator retargets from its
live position using the shared surface spring; reduced motion swaps instantly
with a short opacity acknowledgement.

**Verify**: tests cover Open default, Done, body/Tag/Attachment-name search,
exact Tag-chip filter, clear, no results, counts, keyboard focus, EN/FR, rapid
filter reversal, and reduced motion.

### Step 3: Rebuild virtualized Note rows for status, copy, edit, and selection

Keep `@tanstack/react-virtual` with dynamic measurement and stable Note IDs.
Rows display a concise Markdown-derived first line and at most a restrained body
preview; never invent a title field. Show up to three quiet Tag chips plus an
overflow count and a Tabler paperclip/count only when Attachments exist. Tag
chips are keyboard buttons that apply the exact filter from Step 2. Default
sorting comes from the Workspace snapshot and updating a body, Tags, or
Attachments does not reorder it.

Pointer/focus row actions are:

- status circle: mark Open as Done or Done as Open;
- compact Actions button: open a Base UI menu with `Copy as Markdown` first and
  `Add attachment` second;
- pencil: expand the Note editor;
- row activation/Enter: expand the editor.

`Copy as Markdown` dispatches the one ClipboardComposer action from Plan 010 and
gives restrained inline `Copied` feedback without a normal-path toast. A copy
error stays attached to the menu/action and offers Retry. `Add attachment`
expands the editor if needed, then invokes its explicit file picker; it never
starts a drag/drop listener or reads a file in React. Do not add a preset submenu.

On hover actions may fade in, but they must also appear on `:focus-within` and be
keyboard reachable. Touch/coarse-pointer layouts keep actions visible. Icon-only
buttons use Tabler outline icons, localized accessible names, and at least 32px
visual/44px effective hit targets.

In selection mode, replace status circles with checkboxes while preserving row
content and focus. Click/Space toggles selection; Shift+Arrow extends from the
anchor; `CmdOrCtrl+A` selects the current visible result; Escape exits selection
mode. Selection is reconciled on filter/search/snapshot change.

**Verify**: note-list tests keep rendered DOM rows under 150 for a 20,000-Note
fixture, dynamic row measurement remains stable, Tag/paperclip metadata and the
Actions menu are accessible, copy has exact success/failure behavior, keyboard
selection works, and hover-only actions remain available via focus/coarse pointer.

### Step 4: Expand editing from the live Note instead of opening a generic modal

Reuse `draft-controller.ts` and Markdown preview. Replace `NoteEditor`'s generic
Dialog presentation with a shared-element expansion tied to the source row's
stable Note ID:

- pencil/Enter press feedback begins immediately;
- the row becomes or anchors a large editor surface inside the list workspace;
- Motion shared layout uses transform/opacity from the live presentation value;
- the lavender crossing line on the row becomes the editor's origin edge;
- the source row's content remains the spatial anchor and focus does not jump
  through a separate route;
- Write/Preview remains an exclusive switch; textarea is large, resizable only
  within safe bounds, and uses system monospace;
- a compact Tag field below the body turns Enter or comma into one chip, strips
  one optional leading `#`, trims input, and rejects duplicates/limits inline;
  Backspace on an empty field focuses then removes the last chip, while each
  chip has an accessible remove action;
- Tag suggestions are derived ephemerally from Tags in the current Workspace
  snapshot and filtered locally; choosing a suggestion only writes the current
  Note and never creates a registry, route, or color preference;
- an Attachments region lists safe display names in creation order with a
  Tabler file icon and permanent Remove action; it does not render file content;
- `Add attachment` opens the native multi-file picker, forwards selected paths
  to the typed Workspace command, shows an indeterminate pending state, disables
  only duplicate import submission, and preserves the editor/body/Tags on
  cancel or failure;
- removing an Attachment opens a concise confirmation naming the file and
  stating it cannot be undone; cleanup-required behavior matches Note Delete;
- autosave preserves the existing 650ms behavior, saves on external blur, and
  never closes/changes state from an animation callback;
- Escape closes only after clear dirty-draft handling; successful save returns
  focus to the same row/pencil;
- rapid open/close/reopen retargets without input lock or duplicate save;
- reduced motion uses a static replacement or short crossfade.

Body autosave, Tag writes, and Attachment mutations must share the serialized
Workspace command queue from Plan 010 so one stale revision cannot overwrite
another. Rebase only acknowledged server state; preserve the unsaved body and
Tag input across refresh/conflict. React may hold picker paths only until the
native import command resolves and must never log or persist them.

Do not animate height, top/left, grid tracks, or virtual-row positioning
directly. If Motion shared layout conflicts with virtualizer transforms, use a
nested motion surface or origin-anchored overlay within the list viewport. Do
not remove virtualization or accept transform jumps as a workaround.

**Verify**: editor tests cover mouse, Enter, hover/focus pencil, write/preview,
Tag add/remove/duplicate/limits/suggestions, Attachment picker cancel/import/
limit/failure/remove-confirm/cleanup retry, autosave interleaving, source-path
redaction, save failure with preserved draft, external update conflict, Escape,
focus return, rapid reversal mid-animation, exactly-once effects, virtual scroll,
and reduced motion.

### Step 5: Anchor the fast composer at the bottom

Rewrite `CaptureInput` without Section. It stays visible at the bottom, accepts
one-line capture, creates on Enter, ignores empty/whitespace-only input, clears
only after a successful command, and preserves/focuses failed text with one
inline retry state. The arrow button is secondary to Enter but fully accessible.

After create, the new Note appears at the top of Open results and the lavender
crossing line performs one restrained arrival response using transform/opacity.
Do not display a success toast for the normal fast path. Reduced motion shows a
static line/focus acknowledgement. The composer remains usable while status is
Done; creating switches to Open only after success.

**Verify**: capture-input tests cover Enter, click, empty, double submit,
failure/retry, Done-to-Open success, focus, long text bounds, EN/FR, and reduced
motion.

### Step 6: Add concise selection actions and irreversible confirmation

When selection mode has at least one Note, replace Select with `Delete N`,
status action for the opposite status where meaningful, `Copy as Markdown`, and
Cancel. Bulk copy uses visible Selection order and includes each Note's Tags and
managed Attachment paths through Plan 010's single canonical format.
Do not add a floating bulk-action tray, Merge, Move, preset menu, or Undo.

Delete opens one concise AlertDialog naming the Note count and stating that the
action cannot be undone. Confirm dispatches one `DeleteNotes` command. While
pending, prevent only duplicate destructive submission; other animation must
not lock input. Success clears selection and focuses the nearest surviving Note
or composer. `deletion_cleanup_required` must state that the Notes are removed
but cleanup could not be verified and offer Retry; it must never claim complete
deletion early.

**Verify**: selection tests cover one/many, canonical bulk Markdown copy with
Tags/Attachments, cancel, confirm, command failure, cleanup-required retry,
focus restoration, Delete key, accessible name, and no Trash/Undo affordance.

### Step 7: Remove obsolete frontend dependencies and generated surfaces

After imports are gone, remove direct dependencies used only by the old
architecture. Expected candidates, each requiring an `rg` proof before removal:

- `@tanstack/react-router`, `@tanstack/router-plugin`;
- `@tanstack/react-hotkeys`;
- `cmdk`;
- `zod` if still unused;
- JavaScript Tauri plugin packages with no frontend import;
- UI source components used only by removed command/merge/trash/section flows.

Keep `@tanstack/react-virtual`, `@base-ui/react`, `@tabler/icons-react`, Motion,
React, Tailwind, Paraglide, and the minimal utilities still imported. Do not
remove a dependency merely because `rg` misses generated/config usage. Update
manifests with exact pins and regenerate `bun.lock` through `bun install`; never
hand-edit it. Remove the router Vite plugin and generated route tree.

**Verify**: Dependency scan proves every direct dependency has a source/config
consumer; `bun install --frozen-lockfile` succeeds after the intentional lockfile
update; typecheck/build/Quality pass.

### Step 8: Run a visual and interaction critique

Launch the real desktop dev build. Review Solarized, Light, and Dark at 960x640,
800x600, minimum 720x480, and 200% zoom. Test keyboard only, pointer, coarse
pointer emulation, EN/FR, reduced motion/transparency, increased contrast,
loading, empty, search-empty, save error, destructive pending/failure, selected,
focus, disabled, Tag overflow/validation, Attachment empty/importing/error/
cleanup-required, copy success/error, and permission-denied placeholder.

Play editor/filter/selection transitions at normal speed and 0.25x, reverse them
mid-flight, and confirm input remains responsive. Remove one nonfunctional visual
accessory before accepting the pass.

**Verify**: all command-table checks pass twice from clean processes; record the
manual matrix in the plan completion note or `docs/UX.md` if the contract asks.

## Test plan

- Component/integration tests for single shell, body/Tag/Attachment search,
  virtual rows, selection, status, `Copy as Markdown`, managed Attachments,
  permanent Delete, composer, and editor.
- Motion tests for first-frame feedback, shared origin, interruption,
  exactly-once effects, focus return, and reduced preferences.
- 20,000-Note fixture for DOM/browsing performance.
- EN/FR and all-theme state tests with no raw component colors.
- Manual real-window review at required sizes/preferences.

## Done criteria

- [ ] Desktop renders one shelf with no rail, app routes, inspector, or footer.
- [ ] Search plus Open/Done is the entire persistent top workbar; an exact Tag
  filter appears only contextually after chip activation.
- [ ] Bottom composer creates a Note on Enter and preserves failed input.
- [ ] Notes expose only status, quiet Tag/Attachment metadata, one Actions menu,
  edit, and explicit selection actions.
- [ ] Actions offers canonical `Copy as Markdown` and contextual Attachment import.
- [ ] Editor expands from the live Note, remains interruptible, keeps Preview,
  edits Tags, and manages Attachment metadata without rendering file content.
- [ ] Permanent Delete has one concise confirmation and no Trash/Undo UI.
- [ ] Virtualized 20,000-Note list stays bounded and keyboard accessible.
- [ ] Obsolete routes, command palette, broad hotkeys, components, and direct
  dependencies are removed with a regenerated lockfile.
- [ ] All themes, locales, accessibility preferences, tests, typecheck, build,
  and quality checks pass.
- [ ] This plan is `DONE` in `plans/README.md`.

## STOP conditions

- Plans 009 or 010 are incomplete or DTO/token contracts differ materially.
- Editor expansion requires removing virtualization, animating layout-heavy
  properties, locking input, or accepting visible transform jumps.
- A removed route/dependency is still required by a live product path.
- Permanent Delete UI can report success before Workspace cleanup is proved.
- React would need to read Attachment bytes, persist/log source paths, preview
  arbitrary content, or bypass the typed Workspace command.
- Any visible string is hardcoded outside Paraglide.
- Bloom inspiration starts reproducing its branding or proprietary layout.

## Maintenance notes

- Keep advanced behavior contextual. A second permanent destination is the only
  reason to reconsider routing or persistent navigation.
- Keep Tags and Attachments subordinate to the Note. A tag registry/sidebar,
  color model, drag/drop surface, preview engine, or asset library is a product
  expansion, not polish for this plan.
- Preserve the virtualizer/editor nested-transform boundary in performance
  review; it is easy to regress with decorative layout animation.
- The preferences trigger is intentionally minimal here; Plan 012 supplies its
  content without creating a Settings route.
