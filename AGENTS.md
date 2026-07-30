# Charon agent guide

These rules apply to the entire repository. A narrower `AGENTS.md` may add rules
for a subtree but may not weaken product, privacy, persistence, or platform
contracts without an accepted ADR.

## Required reading

Before changing anything, read in this order:

1. `README.md`
2. `docs/PRODUCT.md`
3. `docs/ARCHITECTURE.md`
4. `docs/PRIVACY.md`
5. `docs/UX.md` for desktop work or `docs/SITE.md` for site work
6. every ADR relevant to the change
7. `plans/README.md`, then the complete current plan

Use the accepted vocabulary exactly. `Workspace` is the durable domain,
transaction, filesystem, migration, conflict, and recovery boundary.
`CaptureCoordinator` owns shortcuts, native permissions, selected-text capture,
and quick-window fallback. `ClipboardComposer` owns deterministic CopyPreset
formatting and explicit clipboard writes. `Selection` is ordered, ephemeral, and
never persisted.

## Toolchain and dependency rules

- Use Bun only for JavaScript and TypeScript commands. Do not use npm, pnpm,
  yarn, or another JavaScript package manager.
- Use the root Bun scripts when they exist. App packages own their runtime
  dependencies and configs.
- Use Cargo for Rust commands, formatting, linting, and tests.
- Pin every dependency exactly. Do not use caret, tilde, `latest`, floating Git
  revisions, or unreviewed transitive overrides. Reconcile changes with the
  fixed version ledger in `plans/README.md`.
- Commit generated files only when the owning tool and plan require them. Never
  hand-edit `bun.lock`, `Cargo.lock`, Paraglide output, `ts-rs` bindings, generated
  routes, build artifacts, or coverage output. Regenerate them with the pinned
  tool and include source changes in the same commit.
- Use Base UI's `render` composition API. Do not introduce Radix `asChild`.
- Style exclusively with semantic theme tokens. Do not place raw palette values,
  component-specific magic motion values, or cross-theme conditionals in
  product components.
- All user-facing desktop strings go through Paraglide. Do not hardcode English
  or French copy in React or Rust UI responses.

## Architecture rules

- React never reads or writes Workspace files directly. It dispatches versioned
  commands and consumes `ts-rs` DTO snapshots and domain events from Rust.
- Keep the dependency direction UI to application commands to domain modules to
  adapters, never the reverse.
- Prefer the three deep modules: `Workspace`, `CaptureCoordinator`, and
  `ClipboardComposer`. Do not add entity-per-repository, wrapper-per-command, or
  generic service layers.
- Use real-filesystem and in-memory Workspace adapters as the two persistence
  seams. New seams need a distinct platform or testing reason.
- Desktop and site never import each other. Only `@charon/theme` is shared.
  Do not create shared React components, translations, native types, or Motion
  helpers.
- `@charon/theme` exports semantic CSS variables, theme names, and motion and
  radius contracts only. It has no framework, localization, chart, or native
  dependency.
- Astro stays static and uses real application screenshots and video. Do not
  build fake UI from styled rectangles or add accounts, forms, analytics, a CMS,
  server adapter, or runtime API.
- TanStack Charts remains behind the optional Insights feature flag and a local
  adapter. TanStack types never enter persistence, IPC, or the core domain.

## Product, privacy, and platform rules

- Preserve local-only behavior: no account, sync, analytics, telemetry, crash
  upload, content upload, or undisclosed network access.
- Copying is explicit. Never add automatic paste or keystroke injection into a
  third-party application.
- Delete means recoverable trash. Permanent deletion is a separate confirmed
  command. Merge requires preview and confirmation and trashes sources in the
  same recoverable transaction that creates the composite.
- Treat `Shift`, `Shift` as a native modifier-event sequence, not a normal Tauri
  accelerator. Keep `CmdOrCtrl+Shift+Space`, visible capture, and the in-app
  shortcut as fallbacks.
- Do not promote a platform capability until its required native or signed-build
  smoke test passes.

## UI and motion rules

- Use Tabler outline icons and semantic tokens only. Do not use emoji for UI
  iconography, Inter, gradients, glow, permanent glass, or generic rounded card
  grids.
- Use the `apple-design` skill for desktop gestures or motion changes.
- Feedback begins on pointer or key down. Motion must remain interruptible,
  reversible, and retarget from the current presentation value without locking
  input.
- Reject `transition: all`, gesture state implemented with timers, animation
  input locks, raw scroll listeners, and fixed keyframe timelines for
  interruptible behavior.
- Animate transform and opacity only. Provide reduced-motion,
  reduced-transparency, and increased-contrast behavior with every pattern.
- Keep Motion's React runtime inside `apps/desktop`; shared theme exports only
  CSS custom properties and preference defaults.
- Every flow covers loading, empty, error, destructive, focus, selected,
  disabled, and permission-denied states.

## ADR gate

Create and accept an ADR before changing persistence, local-only privacy,
shortcut or platform support, the experimental chart boundary, the static-site
boundary, or the cross-app sharing rule. Update all affected contracts and plans
in the same change.

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
  plan explicitly provides those commands. A documentation-only pre-scaffold
  plan must not invent manifests merely to make them runnable.
- Review the complete diff for scope, generated files, secrets, vocabulary, and
  architectural direction.
- Update the current plan status in `plans/README.md` only after its done criteria
  pass.
- Use the exact branch and commit message specified by the plan. Do not push or
  open a pull request unless instructed.
