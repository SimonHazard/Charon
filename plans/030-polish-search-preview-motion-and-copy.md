# Plan 030: Polish search matching, Markdown preview structure, motion under reduced motion, transient feedback, and copy hygiene

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `plans/README.md`. Use the `apple-design` and `emil-design-eng` skills if
> available when judging feedback timing and motion.
>
> **Drift check (run first)**:
> `git diff --stat f2b1bbd..HEAD -- apps/desktop/src/features/notes apps/desktop/src/motion apps/desktop/src/test/setup.ts apps/desktop/src/styles/app.css apps/desktop/messages apps/desktop/src/features/preferences/preferences-context.tsx apps/desktop/src/lib/ipc/preferences-client.ts apps/desktop/src-tauri/src/preferences apps/desktop/src-tauri/src/ipc/preferences.rs apps/desktop/e2e/release.spec.ts docs/UX.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M (nine small changes)
- **Risk**: LOW (Step 7's motion decision needs the operator's feel check that Plan 020 already carries)
- **Depends on**: `plans/029-fix-accessibility-semantics-focus-and-targets.md` (shared live region from its Step 1)
- **Category**: ux / bug / tech-debt
- **Planned at**: commit `f2b1bbd`, 2026-08-17

## Why this matters

Each item is small, verified in code, and user-visible:

1. Search normalizes with `NFKC` + `toLocaleLowerCase()` only — no diacritic
   folding, so a French user typing `cafe` misses `café`, and the locale used
   is the OS locale, not the app's.
2. The hand-rolled Markdown preview emits `<li>` without a `<ul>` and collapses
   `###`–`######` to `<h4>`, so screen readers announce loose text and the
   outline is wrong (no XSS surface — the renderer produces React text
   children only — but no inline formatting either; recorded as direction).
3. `fr.json` contains zero non-breaking spaces before `? ; :` — wrong French
   typography, and at 400 px the delete confirmation can wrap a lone `?`.
4. "Copied" under a row never clears (only expand/delete of that Note clears
   it) and permanently reflows the row.
5. `usePressFeedback` hardcodes `scale.set(0.98)` and ignores reduced motion;
   it is the only element that still scales under `prefers-reduced-motion`,
   and it snaps rather than easing like every other Button. `test/setup.ts`
   stubs `matchMedia` to `matches: false` unconditionally, so no unit test can
   exercise reduced-motion paths (and `press.test.ts` asserts the bug).
6. `scrollbar-gutter: stable` exists only on `.note-list`; on Windows/Linux
   classic scrollbars, Preferences/preview/dialog content shifts when it
   overflows (FR strings do this at 400 px).
7. `note-row.tsx` sets `layout="size"` with a spring transition, but
   `MotionSystem` loads `domAnimation`, which does not include layout
   animations (`domMax` does) — the prop is inert today. Either the intended
   "unfold from the live row" spring should exist or the dead config should go.
8. Dead copy: `capture_hint`, `capture_hint_dismiss`, `note_search_placeholder`,
   `note_empty_search_description`, `capture_input_label`, `note_editor_save`
   have zero consumers (their `_flat` siblings are live); the whole
   `captureHintDismissed` vertical (context method, `PreferencesUpdate` field,
   `preferences_update` command) has no UI. Displayed capitalisation of
   note/Note, attachment/Attachment drifts within one dialog.
9. Truncated titles/filenames/tag chips have no full-text affordance
   (`docs/UX.md` promises the complete Attachment name in a keyboard tooltip);
   Enter in the composer produces no acknowledgement (dead `onCreated`), and
   `CmdOrCtrl+F` can pull focus out of an open AlertDialog.

## Current state

- `apps/desktop/src/features/notes/search.ts` — `normalizeSearchText` =
  `value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim()`;
  `search.test.ts` covers case + exact tag only.
- `apps/desktop/src/features/notes/note-preview.tsx` — `renderLine` returns
  `<h2|h3|h4>`, `.note-preview-task` div, bare `<li>`, `<br>`, `<p>`.
- `apps/desktop/messages/fr.json` — 0 × U+00A0/U+202F; e.g. `:81`
  `"Supprimer définitivement cette note ?"`, `:41` `"Tags : {tags}."`.
- `apps/desktop/src/features/notes/note-screen.tsx:112` sets `copyState`;
  clears only at `:131` (expand) and `:162` (delete). `note-row.tsx:185-196`
  renders it.
- `apps/desktop/src/motion/press.ts` (full file above in recon: `scale.set(0.98)`,
  no `useReducedMotion`); `packages/theme/src/motion.css:19-27` sets
  `--motion-press-scale: 1` and `--motion-duration-direct: 0ms` under reduced
  motion; consumers `shelf-chrome.tsx:33-43`, `preferences-panel.tsx:100-113`;
  `motion/press.test.ts:11` asserts `0.98`. `apps/desktop/src/test/setup.ts`
  stubs `matchMedia` with `matches: false`.
- `apps/desktop/src/styles/app.css:426` `.note-list { scrollbar-gutter: stable }`;
  `.preferences-popover` (`:119`, `overflow: auto`), `.note-preview` (`:681`),
  `[data-slot="alert-dialog-content"]` (`alert-dialog.tsx:34`, `overflow-y-auto`) lack it.
- `apps/desktop/src/motion/system.ts` — `LazyMotion features={domAnimation} strict`;
  `note-row.tsx:77-84` `<motion.article layout="size" transition={{ layout: surfaceTransition }}>`;
  `note-editor.tsx:197-206` editor `initial/animate/exit` opacity+scaleY;
  Plan 020 carries an operator "normal-speed unfold/fold feel" gate.
- Dead messages (verified 0 refs outside `src/paraglide`): `capture_hint`,
  `capture_hint_dismiss`, `note_search_placeholder`, `note_empty_search_description`,
  `capture_input_label`, `note_editor_save`. `preferences-context.tsx:117-125`
  `dismissCaptureHint` (no consumer); `PersistedPreferences.capture_hint_dismissed`
  (`src-tauri/src/preferences/model.rs:15`); `preferences_update` command
  (`ipc/preferences.rs:39-49`); `preferences-client.ts:17`.
- `app.css:504-510` `.note-row-title/.note-row-snippet` ellipsis; `:771-778`
  `.attachment-name`; `:556-567` `.tag-filter-chip max-width: 5.5rem`; no
  `title=` anywhere in `src/**/*.tsx`.
- `note-screen.tsx:94-99` — `window` keydown handler for `metaKey||ctrlKey` + `f`
  focuses search unconditionally.
- Vitest config: `apps/desktop/vite.config.ts` (`environment: 'jsdom'`, setup file).

Conventions: Paraglide `m.*`; EN/FR parity; Base UI Tooltip for hover/focus
help; tokens only in CSS; motion foundation is "exact and intentionally small"
(`docs/UX.md` "Motion and materials"); AGENTS.md: "Prove that a message has no
live consumer before deleting it."

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `bun run typecheck` | exit 0 |
| Unit tests | `bun run test:desktop` | pass |
| E2E Chromium | `bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |
| Perf gate | `bun run build && bun run test:perf` | median < 50 ms; gzip < 230 KiB |
| Rust (only if Step 8 removes the command) | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked && bun run bindings:check` | pass |

## Scope

**In scope**:
- `apps/desktop/src/features/notes/search.ts`, `search.test.ts`, `note-preview.tsx` (+ test), `note-screen.tsx`, `note-row.tsx`, `note-editor.tsx`, `capture-input.tsx`
- `apps/desktop/src/motion/press.ts`, `press.test.ts`, `system.ts`, `motion.test.ts`
- `apps/desktop/src/test/setup.ts`
- `apps/desktop/src/styles/app.css`, `apps/desktop/src/components/ui/alert-dialog.tsx`
- `apps/desktop/messages/en.json`, `fr.json`
- `apps/desktop/src/features/preferences/preferences-context.tsx`, `apps/desktop/src/lib/ipc/preferences-client.ts`, `apps/desktop/src-tauri/src/ipc/preferences.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/preferences/model.rs` (Step 8 only; keep the persisted field)
- `apps/desktop/e2e/release.spec.ts`, `docs/UX.md` (motion foundation note if Step 7 changes it)

**Out of scope**:
- Search performance/caching (Plan 031) — Step 1 must not add a per-note cost
  beyond the fold; land Plan 031 first if the perf gate gets close to 50 ms.
- A Markdown library (direction item; needs a privacy/XSS decision).
- Rust preferences schema change (keep `capture_hint_dismissed` persisted).

## Git workflow

- Branch: `codex/030-polish-search-preview-motion-copy`
- Commit message: `refactor(ui): polish search folding, preview structure, motion, feedback, and copy`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Diacritic-insensitive, app-locale search

`normalizeSearchText`: `value.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFKC').toLocaleLowerCase(locale)`
where `locale` is passed in (or read from `readLocale()`), then whitespace
collapse/trim as today. Apply the same fold to `exactTag` comparison. Add
`search.test.ts` cases: `café`↔`cafe`, `résumé`↔`resume`, multi-token
`"agent brief"`, and CJK width normalization. Run the perf gate after.

**Verify**: `bun run test:desktop -- search` → pass; `bun run build && bun run test:perf` → still < 50 ms (record the number).

### Step 2: Valid list and heading structure in the preview

Rewrite `NotePreview` to walk lines and group consecutive bullet/task lines
into one `<ul>` (`<li>` per bullet; task items as `<li>` with the icon and
`aria-checked`/text), map heading depth `#..######` → `h2..h6` (floor at h6),
keep `<p>` and blank-line handling. Add `note-preview.test.tsx` asserting the
DOM structure for a mixed body.

**Verify**: `bun run test:desktop -- note-preview` → pass; e2e preview assertions still pass.

### Step 3: French non-breaking spaces

In `fr.json`, replace the space before `?`, `!`, `;` with U+202F (narrow NBSP)
and before `:` with U+00A0, in every user-facing string. Add a Vitest guard
(`messages.test.ts` or in `theme-contract.test.ts` style) that reads `fr.json`
and fails on `" ?"`, `" !"`, `" ;"`, `" :"` with a plain space.

**Verify**: `bun run test:desktop -- messages` → pass; `grep -c ' ?"' apps/desktop/messages/fr.json` → 0.

### Step 4: Transient "Copied" feedback

In `note-screen.tsx`, on the `'copied'` branch, schedule `setCopyState(null)`
after ~2.5 s (clear on re-copy/unmount); keep the `'error'` branch sticky.
Also announce "Copied" through the shared live region (Plan 029 Step 1) so the
row can eventually stop reserving the line; if Plan 029 has not landed, keep
the row `<p role="status">` and only add the timeout. `e2e/release.spec.ts:82`
asserts the text appears — the timeout must exceed the assertion window.

**Verify**: `bun run test:desktop -- note-screen` → pass; Chromium e2e → pass.

### Step 5: Press feedback honours reduced motion and the token

`press.ts`: `const reduce = useReducedMotion();` return a no-op style/handlers
when `reduce`; otherwise read `--motion-press-scale` (fallback 0.98) and use
`animate(scale, target, { duration: <--motion-duration-direct> })` instead of
`.set()`. `test/setup.ts`: replace the fixed stub with a configurable helper
(`setMediaQuery(query, matches)`) defaulting to `false`. Update `press.test.ts`
to assert both branches.

**Verify**: `bun run test:desktop -- press motion` → pass.

### Step 6: Stable scrollbar gutters

Add `scrollbar-gutter: stable` to `.preferences-popover`, `.note-preview`, and
`[data-slot="alert-dialog-content"]` (via `app.css` or the component class).

**Verify**: `bun run test:desktop` → pass; visual check in the browser fixture at 400 px with FR.

### Step 7: Decide the row layout animation

Measure: switch `MotionSystem` to the async feature bundle
`features={() => import('motion/react').then((m) => m.domMax)}` (keeps
`strict`), rebuild, run `bun run test:perf` and record gzip; open the fixture
and compare the unfold/fold at normal and slow speed with the current build.
Then either (a) keep `domMax` if the spring unfold is visibly better and the
budget holds, or (b) delete `layout="size"` and `transition.layout` from
`note-row.tsx` and note in `docs/UX.md` that the row height change is
instantaneous by design while the editor content fades/scales. Record the
choice and numbers in the status row. Do not leave inert config.

**Verify**: `bun run test:perf` → within budget; Chromium e2e "folds immediately while its content exits" → pass.

### Step 8: Delete dead copy and the unreachable capture-hint plumbing

Delete the six dead keys from `en.json` and `fr.json`; rename the surviving
`*_flat` keys to drop the suffix (update every consumer; grep first). Remove
`dismissCaptureHint` and the `captureHintDismissed` client field/method,
`preferences_update` command from `lib.rs`/`ipc/preferences.rs`, and the
`preferencesClient.update` method — **keep** `capture_hint_dismissed` in the
Rust `PersistedPreferences` (schema v1 stays v1) with a comment "reserved,
unused since Plan 030". Regenerate bindings if `PreferencesUpdate` is removed.
Normalize displayed capitalisation: lowercase common nouns in user-facing
strings ("note", "attachment", "workspace") in both locales; keep the
`AGENTS.md` capitalised vocabulary for code/docs only. Update
`note-screen.test.tsx:91` if it references `.capture-hint`.

**Verify**: `bun run typecheck && bun run test:desktop` → pass; `bun run bindings:check` → exit 0; `cargo test ... --locked` → pass; grep for each deleted key → 0 outside `src/paraglide`.

### Step 9: Small interaction gaps

- Wrap `.attachment-name` and `.tag-filter-chip` in the existing Base UI
  Tooltip carrying the full text (keyboard-reachable), and give `.note-row-title`
  a `title` attribute when truncated (or a Tooltip if cheap).
- Composer: on successful create, `announce(m.capture_created())` (add EN/FR)
  through the shared live region (Plan 029) — no visual pulse unless the
  operator asks.
- `CmdOrCtrl+F` handler: return early when `document.querySelector('[role="alertdialog"][data-open]')`
  (or the Base UI open attribute) exists.

**Verify**: `bun run test:desktop` → pass; Chromium e2e → pass.

## Test plan

- New/updated unit tests: search (4), preview (1), fr typography guard (1),
  press (2), note-screen copied timeout (1).
- E2E: existing suite green; add a check that Cmd/Ctrl+F while the delete
  dialog is open leaves focus inside the dialog.
- Perf gate after Steps 1 and 7.

## Done criteria

- [ ] `café` matches `cafe`; search uses the app locale
- [ ] Preview emits `<ul>`-wrapped `<li>` and `h2..h6`
- [ ] `fr.json` has no breaking space before `? ! ; :`; guard test exists
- [ ] "Copied" auto-clears; press feedback is a no-op under reduced motion and eases otherwise; `setup.ts` supports media-query overrides
- [ ] `scrollbar-gutter: stable` on the three containers
- [ ] Row layout animation either works (`domMax`) or its config is removed; decision recorded
- [ ] Dead message keys and unreachable capture-hint plumbing removed; `_flat` suffix gone
- [ ] Truncated attachment names/tags have tooltips; Cmd/Ctrl+F respects open dialogs; create is announced
- [ ] `bun run typecheck && bun run test:desktop`, Chromium e2e, and `bun run test:perf` pass
- [ ] `plans/README.md` status row for 030 updated

## STOP conditions

- Step 1 pushes the 20k search median over 40 ms → stop after Step 1 and
  hand over to Plan 031 first (do not raise the threshold).
- Step 7's `domMax` breaks the "folds immediately" e2e or exceeds 230 KiB gzip →
  choose option (b) and record it; do not ship both.
- A "dead" key turns out to be resolved dynamically via a Rust `messageKey`
  (grep `messages/en.json` keys against `src-tauri/src/**/*.rs`) — keep it.

## Maintenance notes

- Direction (not planned): a real inline Markdown renderer for Preview (bold,
  italic, code, links) needs an ADR-level privacy/XSS decision; the current
  renderer has no HTML sink and should stay that way until then.
- Any new transient feedback should go through the shared live region and
  auto-clear; errors stay sticky.
