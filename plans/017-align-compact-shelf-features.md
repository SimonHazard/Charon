# Plan 017: Align every Charon workflow inside the compact shelf

> **Executor instructions**: Follow this plan step by step after Plan 016 is
> DONE. Invoke `apple-design`, `web-design-guidelines`, `vercel-react-best-practices`,
> `emil-design-eng`, and `shadcn` before implementation. Read the full accepted
> product, architecture, privacy, UX, ADR 0011, and Plan 016 contracts. Preserve
> the exact meanings of `Workspace`, `CaptureCoordinator`, `ClipboardComposer`,
> `Selection`, `Tag`, and `Attachment`. Use Base UI's `render` composition API,
> semantic tokens, Tabler outline icons, and Paraglide strings only. This plan
> aligns existing functionality; it does not invent a broader product. Stop on
> every STOP condition instead of hiding a feature or weakening a contract.
>
> **Drift check (run first)**:
> `git diff --stat 7294773..HEAD -- README.md docs/PRODUCT.md docs/ARCHITECTURE.md docs/PRIVACY.md docs/UX.md docs/TESTING.md apps/desktop/src apps/desktop/messages apps/desktop/e2e apps/desktop/scripts/capture-site-media.ts apps/site/public/media packages/theme/src plans/README.md`
> Plan 016 is expected to change compact presentation files. Compare its final
> state with the feature map and Current state evidence below. Stop if a durable
> domain command, DTO, Attachment ownership rule, copy shape, deletion guarantee,
> or platform capability changed without an accepted ADR.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: `plans/016-refine-premium-desktop-shelf.md`
- **Category**: direction, correctness, tests, accessibility
- **Planned at**: commit `7294773`, 2026-08-11

## Why this matters

A narrow shelf is successful only if it remains the complete product. Charon
must fit search, Open/Done, Selection, status changes, Markdown editing, Tags,
managed Attachments, `Copy as Markdown`, irreversible Delete, Workspace states,
Preferences, capture permissions, EN/FR, and accessibility into a 400-520px
working width. Hiding difficult states or sending them to another window would
make the visual refinement a regression.

The highest-risk area is managed Attachments. The reference video uses image
thumbnails and lets files appear in a composer, but Charon's accepted model is
safer and more explicit: an Attachment is owned by an existing Note, Rust copies
it into the Workspace, and the UI displays safe metadata without arbitrary
preview. This plan makes that flow compact and first-class without introducing
pre-Note staging, thumbnail decoding, external paths, upload, or another window.

## Feature map

Every existing job has one compact home. Treat this table as the information
architecture; do not move a job elsewhere to make layout easier.

| Job | Compact home | Required compact behavior |
| --- | --- | --- |
| Search body, Tags, Attachment names | Full-width top search row | Clear action stays reachable; no-result state keeps composer visible |
| Open/Done | Second toolbar row | One Base UI ToggleGroup with counts; no sliding decoration |
| Enter/exit Selection | Second toolbar row | Select action becomes a contextual selection bar without horizontal scroll |
| Bulk status/copy/Delete | Context bar above the list or composer | Count plus icon/text actions; Delete remains unmistakable; keyboard commands remain |
| Scan a Note | Bounded virtualized row | Derived title, preview, quiet Tags, Attachment count, status, Actions |
| Edit Markdown | Expanded live Note row | Write/Preview, autosave state, close, errors; no second window |
| Edit Tags | Expanded Note, stacked section | Chips wrap; add input remains usable; limits/errors are local |
| Manage Attachments | Expanded Note, stacked section | Generic file icon, safe filename, pending/error, add/remove; no thumbnails |
| Copy as Markdown | Row Actions and Selection bar | Primary row-menu item; completion/error local; local-path disclosure remains available |
| Permanently delete Notes | Selection bar plus count-specific AlertDialog | Dialog fits 400px; no undo claim; cleanup retry remains contextual |
| Preferences | Gear-anchored Popover | Appearance, language, folder, capture states; scrolls within 400x480 |
| Capture help/permissions | Help Popover and Preferences Capture section | Permission states/actions visible; long disclosure progressively revealed |
| Workspace loading/empty/error/recovery | Main shelf region | Layout-shaped progress or local recovery; composer/chooser priority preserved |
| Manual capture | Anchored body-only composer | Input persists on failure; shortcut focus is immediate; no Attachment queue |

## Non-negotiable Attachment interpretation

- A collapsed row displays only paperclip/count metadata. It may expose safe
  filenames to assistive technology but does not render thumbnails.
- Clicking the Attachment count expands the same Note and focuses its Attachment
  section. It does not open a preview, file browser, or another panel.
- Adding an Attachment starts only from an existing Note's editor or row Actions
  item and uses the explicit native picker already owned by Rust/application
  commands.
- Pending import shows the validated display filename when available, a local
  progress state, and a disabled initiating action while that one intent runs.
  If the current command DTO cannot expose progress safely, show bounded
  indeterminate local progress; do not fake percentages or add an IPC stream in
  this plan.
- The list supports 20 Attachments and long Unicode basenames without horizontal
  product scrolling. Each row truncates visually but keeps the complete safe
  name in its accessible label/Tooltip.
- Removal always uses the existing filename-specific irreversible confirmation
  and cleanup-retry contract.
- No Attachment bytes, source path, thumbnail, MIME preview, upload action,
  cross-Note sharing, drag/drop, or “open externally” action is added.
- The composer remains body-only. Adding Attachments before Note creation would
  require a new ADR and atomic ownership design and is a STOP condition here.

## Current state

- `apps/desktop/src/features/notes/note-screen.tsx:133-139` owns the explicit
  file picker result and dispatches `importNoteAttachments` with transient source
  paths to Rust.
- `apps/desktop/src/features/notes/note-screen.tsx:296-334` renders all bulk
  actions inline in one potentially overflowing row.
- `apps/desktop/src/features/notes/note-screen.tsx:356-399` already connects the
  virtual list to save, Tags, Attachment import/removal, copy, status, and
  Selection commands. Preserve these callbacks and command counts.
- `apps/desktop/src/features/notes/note-row.tsx:94-212` renders the status,
  derived body text, up to three Tag chips, Attachment count, row Actions, edit
  action, and expanded editor as one Note article.
- `apps/desktop/src/features/notes/note-row.tsx:169-186` correctly places
  `Copy as Markdown` before `Add attachment` in the row Actions menu.
- `apps/desktop/src/features/notes/note-editor.tsx:174-231` renders Write/Preview
  inside a Motion section with autosave state and focusable close action.
- `apps/desktop/src/features/notes/note-editor.tsx:233-319` renders Tags and
  Attachments side by side at wide widths; the compact target must stack them.
- `apps/desktop/src/features/notes/note-editor.tsx:277-318` already uses generic
  file metadata, pending import, add action, filenames, remove actions, empty
  state, and local import error. Do not replace it with media previews.
- `apps/desktop/src/features/notes/note-editor.tsx:321-367` already owns
  filename-specific removal confirmation and deletion-cleanup retry.
- `apps/desktop/src/features/preferences/preferences-panel.tsx:121-245` contains
  four complete groups but their repeated icons, paragraphs, and horizontal rows
  need compact progressive disclosure.
- `apps/desktop/e2e/release.spec.ts:7-89` covers the main journeys once, but not
  the compact combinatorics, Attachment limits/failures, full selection bar,
  or Preferences overflow.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Drift | `git diff --stat 7294773..HEAD -- README.md docs/PRODUCT.md docs/ARCHITECTURE.md docs/PRIVACY.md docs/UX.md docs/TESTING.md apps/desktop/src apps/desktop/messages apps/desktop/e2e apps/desktop/scripts/capture-site-media.ts apps/site/public/media packages/theme/src plans/README.md` | Plan 016 changes reconciled; no unexplained domain drift |
| Targeted desktop | `bun run test:desktop -- note-screen note-list note-row note-editor capture-input preferences-panel workspace-state selection-model search motion` | all targeted tests pass |
| Typecheck | `bun run --cwd apps/desktop typecheck` | exit 0 |
| Browser | `bun run test:e2e` | compact journeys pass in Chromium and WebKit |
| Accessibility | `bun run test:a11y` | zero serious/critical violations |
| Performance | `bun run test:perf` | search, DOM, render, and bundle budgets pass |
| Privacy | `bun run check:privacy` | no content/source-path/secret leak |
| Aggregate frontend | `bun run check` | lint, typecheck, desktop/site tests pass |
| Rust regression | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | all native/domain tests pass unchanged |
| Final release gate | `bun run verify:release` | every automated gate passes twice |
| No arbitrary preview | `rg -n "createObjectURL|FileReader|readAsDataURL|<img|asset:" apps/desktop/src/features/notes` | no new Attachment-preview path; approved static brand/media uses excluded |
| No pre-Note Attachment state | `rg -n "attachment|sourcePath|sourcePaths" apps/desktop/src/features/notes/capture-input.tsx` | no matches |
| Diff | `git diff --check && git status --short` | no whitespace errors; only in-scope files changed |

## Suggested executor toolkit

- `apple-design`: immediate feedback, focus restoration, editor reversal,
  destructive agency, progressive disclosure, and reduced preferences.
- `web-design-guidelines`: keyboard, screen-reader, target size, reflow, errors,
  dialog, and high-contrast review at compact widths.
- `vercel-react-best-practices`: preserve memoized rows, virtual bounds, stable
  callbacks, and avoid per-row or per-frame state.
- `emil-design-eng`: inspect every compact action/state before and after; keep
  motion purposeful and control hierarchy precise.
- `shadcn`: use the existing Base UI Button, ToggleGroup, DropdownMenu,
  AlertDialog, Popover, Tooltip, Tabs, Badge, Field, InputGroup, and Skeleton
  patterns. Never introduce Radix `asChild` or overwrite local primitives.

## Scope

**In scope**:

- `docs/UX.md`, `docs/TESTING.md`
- `apps/desktop/src/styles/app.css`
- Existing used UI primitives under `apps/desktop/src/components/ui/**`
- `apps/desktop/src/components/workspace-state.tsx`
- `apps/desktop/src/components/titlebar.tsx` only for feature/help fit missed by Plan 016
- `apps/desktop/src/features/notes/**`
- `apps/desktop/src/features/preferences/preferences-panel.tsx`
- Tests beside changed components/helpers
- `apps/desktop/messages/{en,fr}.json` and generated Paraglide output only via
  the owning generator
- `apps/desktop/e2e/release.spec.ts` and existing deterministic media fixture
- `apps/desktop/scripts/capture-site-media.ts`
- Existing real-app outputs under `apps/site/public/media/`
- `plans/README.md` after all done criteria pass

**Out of scope**:

- Rust domain/IPC, persisted Workspace schema, commands/DTOs, Attachment limits
  or ownership, external paths, copy shape, deletion guarantees, capture
  adapters, shortcuts, updater, release workflows, or platform claims
- Composer Attachments, thumbnails/previews, drag/drop, external open/execute,
  Attachment upload, sharing, or a cross-Note asset library
- Another window, route, navigation rail, full-screen editor, sidebar, sheet,
  or persistent inspector
- Removing virtualization, changing 20,000-Note support, or adding per-row hover
  state in React
- Site redesign/copy changes; only refresh the existing real app media after the
  compact matrix passes
- New font, icon family, UI/state/motion library, raw component colors, or
  platform-specific React layout

## Git workflow

- Branch: `codex/017-compact-feature-alignment`
- Commits, in order:
  1. `docs(ux): map every workflow to the compact shelf`
  2. `refactor(ui): align search selection and workspace states`
  3. `refactor(editor): fit tags and attachments in the shelf`
  4. `refactor(ui): align preferences copy and delete flows`
  5. `test(desktop): prove the complete compact feature matrix`
- Use Bun only for JavaScript/TypeScript and Cargo only for Rust verification.
- Do not push or open a pull request unless separately authorized.

## Steps

### Step 1: Freeze the compact feature map

Extend `docs/UX.md` with the Feature map and Non-negotiable Attachment
interpretation from this plan. Specify the following layout thresholds:

- 400-439px: essential row content, Attachment count, and icon actions with
  localized Tooltips; Tag chips may collapse to an accessible count.
- 440-519px: normal target; up to two quiet Tag chips and Attachment count.
- 520px and above: same single column with more breathing room, never a second
  product column.
- Effective 360px at 200%: controls may stack and metadata may collapse, but no
  action, error, disclosure, or composer is clipped.

Preserve all keyboard, privacy, irreversible deletion, focus, contextual error,
and platform capability language. Do not edit PRODUCT, ARCHITECTURE, PRIVACY, or
ADR 0011 unless implementation reveals an actual contract change; that is a
STOP condition, not permission to widen scope.

**Verify**: `rg -n "400|440|520|360|Attachment|body-only|thumbnail|feature map" docs/UX.md`
finds the complete compact contract and `git diff --check -- docs/UX.md` passes.

### Step 2: Align search, status, Selection, and bulk actions

Keep Plan 016's search and Open/Done rows. Replace horizontal scrolling in
selection actions with a compact contextual action bar that contains:

- selected count as text;
- one status action appropriate to the current filter;
- `Copy as Markdown`;
- irreversible Delete;
- Cancel/exit Selection.

At 400px these may be icon controls with localized Tooltips, except the count
and destructive semantics must remain unambiguous. Preserve the keyboard
contract: arrows move active Note, Space toggles Selection, Shift extends,
`CmdOrCtrl+A` selects visible results, Delete opens confirmation, Escape exits
the topmost state. Native text editing shortcuts still win in fields.

Reconcile Selection after search/status changes and keep focus on the nearest
surviving Note or composer. Search/body/Tag/Attachment-name matching and exact
Tag filtering stay unchanged.

**Verify**: `bun run test:desktop -- note-screen selection-model search note-list`
passes with new 400px selection-bar and focus-reconciliation tests; E2E sees no
horizontal product scroll.

### Step 3: Align collapsed Note actions and metadata

Use Plan 016's bounded row surface and preserve `NoteRow` memoization. The
status ring and row activation remain the primary geometry. Keep the Actions
menu and hover/focus pencil inside the trailing region; both remain visible on
coarse pointer and keyboard focus.

`Copy as Markdown` remains first in Actions. `Add attachment` follows and opens
the same Note before invoking the picker. The paperclip count focuses the
Attachment section after expansion. Do not add another copy button, preview
button, thumbnail, or Attachment flyout.

Visually truncate long titles, Tags, and filenames without truncating accessible
names. Selected, active, focus, Open/Done, pending, warning, and error states
must not depend on color alone.

**Verify**: `bun run test:desktop -- note-row note-list note-screen` passes for
fine/coarse pointer, keyboard focus, action ordering, Attachment focus, metadata
collapse, and accessible full names.

### Step 4: Make the editor, Tags, and Attachments compact and complete

Keep the virtual `<li>` as sole owner of Y translation. Use one nested Motion
surface keyed by Note ID; opening/closing begins at the current row presentation
value, uses transform/opacity only, remains interruptible, and never locks input
or duplicates save/import commands.

Inside the editor:

1. Use one compact header with Write/Preview first, local save state
   subordinate, and Close last.
2. Give textarea/preview one calm full-width plane. Keep system monospace only
   for Markdown writing.
3. Stack Tags above Attachments at all target widths. Use whitespace and one
   separator at most; no nested cards.
4. Let Tag chips wrap. The input keeps at least 10rem when space allows and a
   full row when it does not. All validation remains local and input-preserving.
5. Render Attachment rows as generic file icon, `minmax(0, 1fr)` safe filename,
   and 44px effective remove action. Full safe name is available through the
   accessible label and keyboard Tooltip.
6. Keep Add attachment visible in the section header. During import, expose
   local pending state and disable only duplicate import intent, not the editor.
7. Keep empty, import error, retry/choose-another, removal confirmation,
   cleanup-required retry, and 20-item overflow behavior in the same section.
8. Focus the Attachment heading/list after the row's paperclip count or Actions
   add command expands the Note.

If progress cannot be observed through the existing command contract, use an
indeterminate layout-stable state. Do not create fake percentages or new IPC.

**Verify**: `bun run test:desktop -- note-editor note-row draft-controller motion`
passes, including long Unicode filenames, 20 rows, import failure, removal
cleanup retry, rapid open/close reversal, exactly-once commands, and focus
return at 400px.

### Step 5: Fit copy and irreversible deletion without weakening them

Keep `Copy as Markdown` available from one row and the ordered Selection bar.
Completion and failure remain contextual. Any local-path disclosure required by
the accepted privacy contract must be reachable by keyboard and assistive
technology without permanently occupying every row.

Constrain AlertDialog to `min(24rem, calc(100vw - 1rem))` or an equivalent
semantic size. At 400px and effective 360px, title, exact Note count, no-undo
statement, external-backup boundary link/copy, cleanup error, Cancel, and Delete
must reflow without horizontal scrolling. Attachment removal uses the same
compact dialog system and names the safe filename.

Do not add typed confirmation, undo, recoverable Trash, toast-only failure, or
automatic focus dismissal.

**Verify**: component/E2E tests cover one/many copy, copy failure, Delete
cancel/confirm/failure/cleanup retry, Attachment removal, focus return, and 400px
dialog reflow.

### Step 6: Fit Preferences, capture permissions, and Workspace states

Keep Preferences anchored to the gear, no wider than the shelf viewport, with
viewport-bounded height, internal scrolling, and `overscroll-behavior: contain`.
Use concise group labels for Appearance, Language, Notes folder, and Capture.
Remove decorative heading icons; keep semantic state/action icons where they add
meaning.

Keep theme/language ToggleGroups; folder basename, Choose, Use default, and
dirty-draft warning; portable shortcut; macOS Input Monitoring and Accessibility
states/actions; and the Linux/Windows fallback. Move long explanations into
keyboard-accessible information Tooltips without hiding state, purpose, action,
or privacy meaning.

Restyle Workspace loading with compact toolbar/row skeletons. Keep no Workspace,
empty, error, conflict, migration, and recovery actions contextual in the main
shelf region. The composer remains visible whenever the Workspace is valid and
manual creation is safe. Durable failures remain inline, not transient toasts.

**Verify**: `bun run test:desktop -- preferences-panel workspace-state shell`
passes at 400x480, EN/FR, permission denied, loading/error, dirty draft, and
keyboard-only operation with no clipping or trap.

### Step 7: Add the complete compact matrix

Extend deterministic tests for:

- 400x480, 440x680, 480x720, 520x720, 720x480, and effective 360px at 200%;
- Solarized/Light/Dark and EN/FR;
- fine pointer, coarse pointer, keyboard only, reduced motion, reduced
  transparency, and increased contrast;
- loading, no Workspace, Workspace error/recovery, empty Open/Done/search,
  normal Note, Tags, Attachment count, Selection, copy failure, composer failure,
  dirty/saving/save-error editor, 20 Attachments, long filenames, import failure,
  removal confirmation/cleanup retry, Preferences denied/error, and Note Delete;
- fewer than 150 rendered rows in the 20,000-Note fixture;
- zero serious/critical Axe violations in every major state.

Tests assert user outcomes, command counts, roles, names, focus, state,
announcements, geometry, and overflow. Do not assert arbitrary Tailwind class
strings or invoke real Tauri from browser fixtures.

**Verify**: targeted unit, E2E, Axe, performance, privacy, and aggregate commands
all pass once before media regeneration.

### Step 8: Regenerate real media and complete manual review

Update the existing capture script only enough to frame the real compact app.
Regenerate the existing Solarized shelf, Dark editor, and interaction video used
by the site. Use only synthetic fixture content. Do not redesign Astro or build a
fake UI.

Review the real Tauri app at the size/theme/locale/state matrix from Step 7.
Inspect normal speed, 0.25x, and mid-flight reversal. Use VoiceOver on macOS for
titlebar, search, status, virtual Notes, Selection, editor, Tags, Attachments,
Preferences, Delete, errors, and composer. Record dated evidence paths and open
issues in `docs/TESTING.md`.

Acceptance questions, all answered yes:

- Does the app read as a narrow capture shelf beside another task?
- Is every existing feature reachable without horizontal product scrolling?
- Do Attachments remain useful with names/counts while never implying preview or upload?
- Is one primary action obvious in every state?
- Are focus, Selection, Open/Done, pending, warning, and error distinct without color alone?
- Can editor/transient motion be interrupted without duplicate effects?
- Do 400px, effective 360px, French, and 20 Attachments remain operable?

**Verify**: refreshed media passes site references and privacy scans; the dated
manual matrix has no unchecked P1 row.

### Step 9: Run final gates and close the plan

Run, in order, from clean processes:

1. targeted desktop tests;
2. `bun run check`;
3. `bun run build:desktop`;
4. `bun run test:e2e`;
5. `bun run test:a11y`;
6. `bun run test:perf`;
7. `bun run check:privacy`;
8. the no-preview/no-pre-Note-Attachment scans;
9. `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked`;
10. `bun run verify:release` twice.

Review the entire diff for source paths, hardcoded strings, raw colors,
unsupported platform claims, privacy, deletion, stale media, virtualizer
ownership, and unrelated user work. Only then set Plan 017 to `DONE`.

## Test plan

- Toolbar and Selection: search/status/Tag filter, counts, keyboard model,
  contextual action bar, focus reconciliation, no horizontal scroll.
- Rows: derived text, metadata collapse, Attachment focus, Actions ordering,
  fine/coarse pointer, focus/selected/status distinction, virtual bound.
- Editor: Write/Preview, autosave, reversal, Tags, 20 Attachments, long names,
  import pending/error, removal confirmation/cleanup retry, exactly-once effects.
- Copy/Delete: one/many deterministic copy, disclosure, failure, Note count,
  cancel/confirm/cleanup, focus return.
- Preferences/Workspace: all groups and capability states, chooser/dirty draft,
  loading/empty/error/recovery, compact overflow.
- Whole app: all target widths, 200%, EN/FR, themes, accessibility preferences,
  Axe, privacy, performance, real compact media, native VoiceOver review.

## Done criteria

- [ ] `docs/UX.md` maps every accepted job to one compact home.
- [ ] Every existing workflow is reachable and operable from effective 360px upward.
- [ ] Selection and bulk actions never require horizontal scrolling.
- [ ] Collapsed Notes preserve status, content, Actions, Tags summary, and Attachment count.
- [ ] Attachment count focuses the same Note's metadata-only Attachment section.
- [ ] Editor stacks Tags and Attachments, handles 20 long filenames, and preserves all failure/destructive states.
- [ ] No thumbnail, arbitrary preview, source path, upload, drag/drop, cross-Note asset, or composer Attachment exists.
- [ ] Copy remains deterministic and explicit; local managed-path disclosure remains reachable.
- [ ] Note and Attachment deletion confirmations fit 400px and preserve exact irreversible scope/retry.
- [ ] Preferences, capture permissions, Workspace states, errors, and composer fit 400x480 without a trap or clipped action.
- [ ] Focus, Selection, status, pending, warning, error, and disabled states are distinct without color alone.
- [ ] Virtualization, <150 rendered rows, search, bundle, and privacy budgets pass.
- [ ] Unit, E2E, Axe, performance, privacy, Cargo, and two release gates pass.
- [ ] Real compact media is regenerated from synthetic data and manually approved.
- [ ] Only in-scope files changed and Plan 017 is `DONE` in `plans/README.md`.

## STOP conditions

Stop and report back if:

- Plan 016 is not DONE or its compact geometry has unresolved overflow.
- Any accepted feature can fit only by removing it, moving it to another window,
  or hiding required state/action/disclosure from keyboard, touch, or assistive
  technology.
- Composer Attachments, thumbnails, arbitrary preview, external paths, upload,
  or a new Attachment DTO/IPC stream appears necessary.
- A persistence, privacy, deletion, shortcut/platform, static-site, or cross-app
  change would require an ADR.
- Compact editor motion needs virtual-row animation, height/top/left/grid
  animation, input lock, or a longer fade to hide a transform jump.
- Any user-facing string would be hardcoded outside Paraglide.
- A serious/critical Axe issue, content/source-path privacy leak, 20,000-Note
  regression, horizontal scroll, clipped French action, or flaky release gate
  remains after two evidence-backed attempts.
- A new route, window, UI library, font, icon family, state library, or animation
  dependency appears necessary.

## Maintenance notes

- Review every future feature at 480px first and effective 360px second.
- Keep Attachment bytes and previews out of React. Safe metadata is the compact
  UI contract; Rust remains the file authority.
- A future request for composer Attachments needs an ADR that defines temporary
  ownership, atomic Note creation/import, cancellation cleanup, crash recovery,
  limits, and privacy before UI work starts.
- Preserve one compact home per job. Adding a second panel/window to escape
  layout pressure is product expansion, not responsive design.
- Refresh real site media whenever compact row/editor/Attachment presentation
  materially changes; never rebuild the UI in Astro.
