# Charon agent guide

These rules apply to the entire repository. A narrower `AGENTS.md` may add rules
for a subtree but may not weaken product, privacy, persistence, deletion, or
platform contracts without an accepted ADR.

## Required reading

Before changing anything, read in this order:

1. `README.md`
2. `docs/PRODUCT.md`
3. `docs/ARCHITECTURE.md`
4. `docs/PRIVACY.md`
5. `docs/UX.md` for desktop work or `docs/SITE.md` for site work
6. every ADR relevant to the change, especially ADR 0011 for product work
7. `plans/README.md`, then the complete current plan

Use the accepted vocabulary exactly. `Workspace` is the durable filesystem,
transaction, migration, conflict, and recovery boundary. `CaptureCoordinator`
owns shortcuts, native permissions, selected-text acquisition, ADR 0010's
bounded capture-specific Copy transaction, and composer-focus fallback.
`ClipboardComposer` owns the deterministic `Copy as Markdown` format and
explicit clipboard writes. `Selection` is ordered, ephemeral, reconciled to the
current Open or Done result, and never persisted. `Tag` is flat Note metadata.
`Attachment` is one managed bounded regular-file copy owned by one Note.

## Toolchain and dependency rules

- Use Bun only for JavaScript and TypeScript commands. Do not use npm, pnpm,
  yarn, or another JavaScript package manager.
- Use root Bun scripts when they exist. Application packages own their runtime
  dependencies and configs.
- Use Cargo for Rust commands, formatting, linting, and tests.
- Pin every dependency exactly. Do not use caret, tilde, `latest`, floating Git
  revisions, or unreviewed transitive overrides. Reconcile changes with the
  fixed version ledger in `plans/README.md`.
- Commit generated files only when the owning tool and plan require them. Never
  hand-edit `bun.lock`, `Cargo.lock`, Paraglide output, `ts-rs` bindings,
  generated routes, build artifacts, or coverage output. Regenerate them with
  the pinned tool and include source changes in the same commit.
- Use Base UI's `render` composition API. Do not introduce Radix `asChild`.
- Style exclusively with semantic theme tokens. Do not place raw palette values,
  component-specific magic motion values, or cross-theme conditionals in
  product components.
- All user-facing desktop strings go through Paraglide. Do not hardcode English
  or French copy in React or Rust UI responses.

## Architecture rules

- React never reads or writes Workspace files or Attachment bytes directly. It
  dispatches versioned commands and consumes `ts-rs` DTO snapshots and domain
  events from Rust.
- Keep the dependency direction UI to application commands to domain modules to
  adapters, never the reverse.
- Prefer the three deep modules: `Workspace`, `CaptureCoordinator`, and
  `ClipboardComposer`. Do not add entity-per-repository, wrapper-per-command, or
  generic service layers.
- Use real-filesystem and in-memory Workspace adapters as the two persistence
  seams. New seams need a distinct platform or testing reason.
- The active model is one flat Note collection. Do not restore hierarchy,
  manual ordering, multiple product destinations, or compatibility wrappers for
  removed entities without a new accepted ADR.
- A Note has at most 16 Tags. After trimming, each Tag contains 1-48 Unicode
  scalar values and no control or line-break character. Preserve first-entered
  spelling and order with case-insensitive uniqueness. Do not add Tag IDs,
  nesting, colors, a global registry, management surface, or navigation.
- Adding an Attachment is an explicit file-picker command owned by Rust. A Note
  has at most 20 Attachments of at most 100 MiB each. Accept only a regular non-
  symlink file outside the Workspace, copy it into
  `attachments/<note-id>/<attachment-id>[.<safe-extension>]`, persist only its
  UUID, validated display basename, generated managed relative path, and
  creation timestamp, and never persist the external source path, execute,
  preview arbitrary formats, adopt unexpected files, upload, or share files
  across Notes.
- Desktop and site never import each other. Only `@charon/theme` is shared. Do
  not create shared React components, translations, assets, native types, or
  Motion helpers.
- `@charon/theme` exports semantic CSS variables, theme names, and motion and
  radius contracts only. It has no framework, localization, chart, asset, or
  native dependency.
- Astro stays static and uses real application screenshots and video. Do not
  build fake UI from styled rectangles or add accounts, forms, analytics, a
  CMS, server adapter, or runtime API.

## Product, privacy, deletion, and platform rules

- Preserve local-only behavior: no account, sync, analytics, telemetry, crash
  upload, content upload, or undisclosed network access.
- Copying is explicit. `Copy as Markdown` deterministically emits Note bodies,
  optional Tags, and optional safe names plus canonical absolute paths to
  managed Attachment copies. It never reads or copies Attachment bytes, uploads,
  pastes, or changes Note state. Disclose that local paths enter the clipboard.
- Never add automatic Paste or arbitrary keystroke injection into a third-party
  application. ADR 0010 permits exactly one synthetic platform Copy after an
  explicit selected-text capture gesture, inside its bounded snapshot, change-
  count, timeout, disclosure, and restoration contract; no other input
  injection is permitted.
- Delete is an explicitly confirmed irreversible batch command and its concise
  confirmation names the Note count. After successful commit, neither active
  files nor normal completed Charon transaction backups retain deleted Markdown
  or managed Attachment bytes. A bounded incomplete crash record exists only
  until deterministic startup finish or rollback and cleanup. Disclose that OS
  snapshots, external backups, and synced histories are outside the guarantee.
- Preserve schema v1 active Note bodies byte-exactly. Stage a bounded recovery
  record, move already-trashed v1 bodies to visible user-owned plain Markdown
  under `legacy-trash-v1/`, retain explanatory and original-manifest metadata,
  then remove the recovery record after convergence. Never silently restore,
  hide, destroy, or merge archived content with an existing path.
- Treat unmodified `Shift`, `Shift` as a native modifier-event sequence, not a
  normal Tauri accelerator. Keep `CmdOrCtrl+Shift+Space` as the portable reveal-
  and-focus-bottom-composer fallback and keep the composer always visible.
- Do not synthesize input or claim modifier-only capture on Linux or Windows
  until the required native and signed-build smoke test passes.
- Do not promote any platform capability until its required native or signed-
  build smoke test passes.

## UI and motion rules

- Use Tabler outline icons and semantic tokens only. Do not use emoji for UI
  iconography, Inter, gradients, glow, permanent glass, or generic rounded card
  grids.
- Solarized is the first-run default; Light and Dark remain choices. Map the
  approved Charon Prune, Lavender, and Cream primitives through semantic roles.
- The desktop is one single-column shelf with wordmark and Preferences, search,
  Open/Done, one virtualized Note stack, and an always-visible bottom composer.
  Do not add a persistent navigation rail or product route.
- Use the `apple-design` skill for desktop gestures, motion, or irreversible-
  action interaction changes.
- Feedback begins on pointer or key down. Motion must remain interruptible,
  reversible, and retarget from the current presentation value without locking
  input.
- Expanded Note shared layout starts from the live row, uses only transform and
  opacity, and becomes a crossfade or static swap under reduced motion.
- Reject `transition: all`, gesture state implemented with timers, animation
  input locks, raw scroll listeners, and fixed keyframe timelines for
  interruptible behavior.
- Provide reduced-motion, reduced-transparency, and increased-contrast behavior
  with every pattern. Keep Motion's React runtime inside `apps/desktop`; shared
  theme exports only CSS custom properties and preference defaults.
- Every flow covers loading, empty, error, destructive, focus, selected,
  disabled, and permission-denied states. Failures remain contextual, content-
  free, input-preserving, and actionable even though there is no generic Error
  destination.

## ADR gate

ADR 0011 governs the rapid-capture shelf, flat schema v2, managed Attachments,
irreversible deletion, shortcut reduction, Solarized default, and rejected chart
surface. Create and accept another ADR before changing persistence, local-only
privacy, deletion guarantees, shortcut or platform support, static-site
boundary, or cross-app sharing. Update all affected contracts and plans in the
same change.

## Plan preflight and completion

Before implementation:

- Read the complete current plan and its dependencies.
- Run its drift check and compare the result with the planned baseline.
- Stop on every stated STOP condition rather than improvising.
- Confirm the worktree does not contain overlapping user changes.

Before completion:

- Add or update tests and documentation required by the plan.
- Run every plan-specific verification in order.
- Run `bun run check` and `cargo test` when the scaffold exists or the current
  plan explicitly provides those commands. A documentation-only plan that says
  not to invent runtime commands takes precedence.
- Review the complete diff for scope, generated files, secrets, vocabulary,
  privacy, and architectural direction.
- Update the current plan status in `plans/README.md` only after its done
  criteria pass.
- Use the exact branch and commit message specified by the plan. Do not push or
  open a pull request unless instructed.
