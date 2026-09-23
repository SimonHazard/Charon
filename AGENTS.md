# Charon agent guide

These rules apply to the whole repository. A narrower `AGENTS.md` may add
constraints but may not weaken accepted product, privacy, persistence,
deletion, or platform contracts without an accepted ADR.

## Read before changing

Read, in order:

1. `README.md`
2. `docs/PRODUCT.md`
3. `docs/ARCHITECTURE.md`
4. `docs/PRIVACY.md`
5. `docs/UX.md` for desktop work or `docs/SITE.md` for site work
6. relevant ADRs, especially ADR 0011 and its ADR 0012 and ADR 0013 amendments
7. `plans/README.md`, then the complete current plan

Run the plan drift check and stop on its STOP conditions. Confirm that the
worktree contains no overlapping user changes before editing.

Use the vocabulary exactly:

- `Workspace` is the durable filesystem, transaction, migration, conflict, and
  recovery boundary.
- `CaptureCoordinator` owns shortcuts, native permissions, selected-text
  acquisition, ADR 0010's bounded Copy transaction, and composer-focus fallback.
- `ClipboardComposer` owns deterministic `Copy as Markdown` composition and the
  explicit clipboard write.
- `Tag` is flat Note metadata.
- `Attachment` is one bounded managed regular-file copy owned by one Note.

## Product and privacy invariants

- Keep Charon local-only: no account, sync, analytics, telemetry, crash upload,
  content upload, or undisclosed network access.
- Copy only after an explicit action. `Copy as Markdown` emits Note bodies,
  optional Tags, and optional safe names plus canonical paths to managed
  Attachment copies. It never reads Attachment bytes, uploads, pastes, or
  changes Note state. Disclose that local paths enter the clipboard.
- Never add automatic Paste or arbitrary keystroke injection. ADR 0010 permits
  exactly one synthetic platform Copy after an explicit selected-text capture
  gesture, inside its bounded snapshot, change-count, timeout, disclosure, and
  restoration contract.
- Delete is confirmed, irreversible, and targets one explicit Note. After commit, active
  files and normal completed Charon backups retain neither deleted Markdown nor
  managed Attachment bytes. Disclose the external backup and OS-snapshot limit.
- Preserve schema v1 active bodies byte-exactly. Keep already-trashed v1 bodies
  visible under `legacy-trash-v1/`; never silently restore, merge, hide, or
  destroy them.
- Treat unmodified `Shift`, `Shift` as a native modifier sequence. Keep
  `Cmd+Shift+Space` on macOS and `Alt+Shift+Space` on Windows/Linux as the
  reveal-and-focus-composer fallback. Never claim an unimplemented capability;
  new Windows/X11 adapters begin as experimental and Wayland never claims
  double Shift. Charon ships without paid signing under ADR 0014; macOS
  releases use the stable self-signed identity of ADR 0018, and a release must
  never fall back to ad-hoc. Never reintroduce a Developer ID, notarization,
  or paid-certificate gate.
- The only permitted desktop network request is the default-off Tauri update
  check accepted by ADR 0016. It sends no user content or stable identifier,
  verifies signed artifacts, installs only after explicit action, and defers
  restart while a draft is dirty.

## Architecture

- React dispatches versioned commands and consumes typed snapshots/events. It
  never reads or writes Workspace files or Attachment bytes directly.
- Keep dependency direction: UI -> application commands -> domain modules ->
  adapters.
- Prefer the three deep modules: `Workspace`, `CaptureCoordinator`, and
  `ClipboardComposer`. Do not add generic services, entity repositories,
  wrapper-per-command layers, or compatibility abstractions for removed
  features.
- The active model is one flat Note collection. Do not restore Sections,
  hierarchy, manual order, Move, Merge, Trash, multiple destinations, or
  Note Selection or bulk Note commands without an accepted ADR.
- A Note has at most 16 Tags. Each trimmed Tag has 1-48 Unicode scalar values,
  no control/line-break character, first-entered spelling and order, and case-
  insensitive uniqueness. No Tag IDs, colors, nesting, registry, or management
  surface.
- A Note has at most 20 Attachments of at most 100 MiB. The explicit picker may
  return transient source paths to the command boundary; Rust accepts only a
  regular non-symlink file outside the Workspace, copies it under
  `attachments/<note-id>/`, and persists no external source path. Never execute,
  preview arbitrary formats, adopt unknown files, upload, or share them across
  Notes.
- Desktop and site import only `@charon/theme`, never each other. The theme
  package contains semantic CSS variables, theme names, motion, and radius
  contracts only.
- Astro remains static. The current public site is a media-free holding page
  with no client runtime. If product media returns, it must come from the real
  app, never styled fake UI.

## UI and motion

- Light is the first-run default; Graphite is the dark choice. Use semantic
  roles mapped from Charon Prune, Lavender, and Cream. Product components never
  contain raw palette values or theme conditionals.
- Keep one single-column shelf: minimal drag region; search with trailing Help
  and Preferences; one virtualized unified Note stack with direct per-Note
  actions; always-visible bottom composer. No navigation rail or product routes.
- Use Tabler outline icons and the platform system font. No emoji UI, Inter,
  gradients, glow, permanent glass, decorative rails, card grids, or decorative
  list entrances.
- All desktop copy goes through Paraglide. Keep wording plain and put displayed
  key combinations in semantic `kbd` markup.
- Use `apple-design` for desktop gestures, motion, or irreversible interactions.
  Feedback begins on pointer/key down. Motion is interruptible, reversible, and
  never locks input.
- The expanded Note starts from the live row and animates transform and opacity
  only. Reduced motion uses a crossfade or static swap. Transient surfaces also
  provide reduced-transparency and increased-contrast fallbacks.
- Reject `transition: all`, timer-modeled gestures, fixed keyframes for rapidly
  triggered UI, raw scroll listeners, and animation input locks.
- Every flow covers loading, empty, error, destructive, focus, active,
  disabled, and permission-denied states. Failures stay contextual, content-
  free, input-preserving, and actionable.

## Toolchain and hygiene

- Use Bun only for JavaScript/TypeScript and Cargo for Rust. Prefer root scripts.
- Pin dependencies exactly. Manifests and generated lockfiles are authoritative.
- Never hand-edit `bun.lock`, `Cargo.lock`, Paraglide output, `ts-rs` bindings,
  build artifacts, or coverage output.
- Keep `apps/desktop/src-tauri/target` small: it passes 10 GB within a few
  Tauri builds, `debug/` holding the bulk. Delete `target/debug` once a debug
  session ends, and clear the whole `target/` when no build, test, or app run
  is using it. Both are regenerable and neither is tracked.
- Use Base UI's `render` API; do not introduce Radix `asChild`.
- Prove that a file, export, asset, script, message, or dependency has no live
  consumer before deleting it. Delete obsolete paths instead of leaving future-
  facing scaffolding.
- Accepted ADRs and `docs/IMPLEMENTATION_HISTORY.md` are durable history. Keep
  only active work in `plans/`; remove a completed plan after its unique
  decisions and live references have migrated. Do not create a parallel
  advisory-plan tree.

## Completion

- Add or update proportionate tests and documentation.
- Run the current plan's verification in order, then `bun run check` and
  `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` when
  applicable.
- Review the complete diff for scope, generated files, secrets, vocabulary,
  privacy, architecture, and unrelated user changes.
- Update plan status only after its done criteria pass.
- Use the plan's exact branch and commit message. Push, publish, deploy, tag, or
  open a pull request only when the operator explicitly authorizes it.
