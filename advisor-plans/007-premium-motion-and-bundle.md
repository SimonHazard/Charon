# Plan 007: Execute compact product Plans 016-017, then close motion and bundle gaps

> Invoke `apple-design`, `emil-design-eng`, `frontend-design`,
> `vercel-react-best-practices`, and `shadcn`. Motion is purposeful,
> interruptible, reversible, reduced-safe; never remove virtualization or
> animate layout-heavy properties.

> Product Plans 016 and 017 are authoritative. Read and execute both completely
> in order; this advisor plan only coordinates their branch detours and owns the
> later lazy-loading/bundle work.

> Drift check: `git diff --stat 7294773..HEAD -- apps/desktop/src/features/notes apps/desktop/src/features/preferences apps/desktop/src/styles apps/desktop/vite.config.ts apps/desktop/package.json apps/desktop/src-tauri/tauri.conf.json packages/theme scripts/check-performance.ts plans/README.md plans/016-refine-premium-desktop-shelf.md plans/017-align-compact-shelf-features.md`

## Status

- **Priority/Risk/Effort**: P1 / MED / XL
- **Depends on**: Plan 006
- **Category**: compact design, complete workflows, motion, performance, tests
- **Planned at**: `7294773`, 2026-08-11
- **State**: TODO

## Why and current evidence

The reference video establishes a tall utility shelf about 450px wide, while the
current native window opens at 960px and the desktop toolbar, Note rows, editor,
Attachments, Preferences, and selection actions still assume more horizontal
room. Product Plan 016 owns the 480px-first-run visual/window foundation; Product
Plan 017 owns the complete workflow fit at effective 360px and above.

This sequence matters because bundle splitting cannot hide or omit a feature to
meet the compact target. Managed Attachments stay Note-owned, metadata-only and
bounded; the bottom composer stays body-only. Only after the full compact matrix
passes may this advisor plan alter loading boundaries.

The editor expansion must still originate from the live virtualized row.
Preferences and the full editor/preview are unnecessary for the first
composer/search interaction, so they remain good lazy-boundary candidates after
Plans 016-017 establish correct loading, error, focus, and reduced-motion states.

## Commands and references

| Purpose | Command | Expected |
|---|---|---|
| Compact feature matrix | `bun run test:desktop -- note-list note-row note-editor note-actions attachment preferences workspace shell` | pass |
| Motion | `bun run test:desktop -- note-row note-editor motion preferences` | pass |
| Build/perf | `bun run build:desktop && bun run test:perf` | chunk budgets pass |
| E2E | `bun run test:e2e -- --grep "compact|attachment|editor motion|reduced motion|lazy"` | pass |
| Aggregate | `bun run check` | exit 0 |

- Motion shared layout: <https://motion.dev/docs/react-layout-animations>
- TanStack virtualizer: <https://tanstack.com/virtual/latest/docs/api/virtualizer>

Keep Motion inside desktop and preserve transform/opacity-only shared layout.
Do not use View Transitions for the interruptible editor path.

## Scope and workflow

**In scope**: coordinated execution of Product Plans 016-017, live-row
expansion/return/reversal, focus, reduced preferences, tests, lazy
editor/preview/preferences boundaries, Vite chunk report, and bundle budgets.

**Out of scope**: changing Attachment ownership/preview rules, adding composer
Attachments, new surfaces, ambient effects, glow/gradient, a new runtime,
`transition: all`, release signing, hosting, or deployment.

- Integration branch: `codex/premium-loop`
- Product branch 1: `codex/016-compact-desktop-shelf`
- Product branch 2: `codex/017-compact-feature-alignment`
- Execute each product plan's exact commits on its own branch.
- Merge Plan 016 back with:
  `git merge --no-ff codex/016-compact-desktop-shelf -m "merge: integrate compact desktop shelf"`
- Branch Plan 017 from the integrated result, then merge it back with:
  `git merge --no-ff codex/017-compact-feature-alignment -m "merge: integrate compact feature alignment"`
- Exact advisor follow-up: `perf(desktop): load compact surfaces intentionally`
- No push or pull request.

## Steps

1. After Plans 001-006, run Product Plan 016's drift check. Reconcile only live
   excerpts, commands, and non-contractual paths; stop if its locked compact
   direction would weaken Workspace, draft, focus, privacy, or Attachment rules.
2. Execute every Plan 016 step, named skill, verification, STOP condition, and
   exact commit on `codex/016-compact-desktop-shelf`.
3. Merge the clean completed Plan 016 branch into `codex/premium-loop` with the
   exact message above. Never resolve by dropping accepted product, privacy,
   generated DTO, draft, focus, or Workspace work.
4. From the integrated result, execute every Product Plan 017 step, skill,
   verification, STOP condition, and exact commit. Do not start bundle work
   until its complete compact feature matrix passes.
5. Merge completed Plan 017 into `codex/premium-loop` with the exact message.
6. Lazy-load editor/preview and Preferences; preload only on high-confidence
   idle/intent. Entry retains composer, search, summaries, contextual errors,
   and coordinators. Avoid waterfalls/tiny splits and provide local first-use
   fallback and Retry.
7. Record before/after. Enforce entry <=185 KiB gzip, lazy chunk <=140 KiB, and
   total <=230 KiB. Stop with profiling evidence rather than silently relaxing.
8. Repeat Plans 016-017's compact/native/media matrix after lazy boundaries so
   loading does not regress 400/480/520 widths, effective 360, 20 Attachments,
   editor origin, focus, reduced preferences, or first use.

## Done criteria

- [ ] Product Plan 016 is `DONE` on its exact branch and commits.
- [ ] Product Plan 017 is `DONE` on its exact branch and commits.
- [ ] Both are merged into `codex/premium-loop` with the exact messages.
- [ ] Every existing workflow fits the compact matrix without semantic loss.
- [ ] Editor originates/returns to the live row without virtualizer jump.
- [ ] Current-value reversal, exactly-once effects, and no input lock pass.
- [ ] Reduced preferences, coarse pointer, 200%, EN/FR, and long Attachment data pass.
- [ ] Intentional lazy boundaries and all chunk budgets pass.
- [ ] Tests/build/perf/E2E/aggregate pass; plan/index become `DONE` only in the
  exact advisor follow-up.

## STOP conditions

- Either Product Plan's drift or implementation would change accepted product,
  privacy, deletion, Attachment, capture, or Workspace contracts.
- A feature is hidden, removed, moved outside the single shelf, or made
  hover-only merely to fit the narrow window.
- Requires removing virtualization or animating `top`, `left`, or `height`.
- Merge resolution would drop accepted DTO, draft, focus, or durability work.
- Motion owns save/close, locks input, or cannot reverse from its live value.
- Lazy path lacks fallback/Retry; budget needs accepted feature deletion or a
  new runtime dependency.
- Raw component motion/color magic bypasses semantic contracts.

## Maintenance

Repeat the compact and bundle matrices when editor, Preferences, row actions,
Tag, Attachment, or loading-boundary behavior changes.
