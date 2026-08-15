# Plan 020: Remove Note Selection

## Status

AWAITING OPERATOR: Playwright sandbox approval, native Attachment picker, and packaged motion feel

## Operator direction

On 2026-08-15 the operator rejected the Note Selection feature for the current
product and asked to remove it completely, including the plans, README, and
current documentation that describe it. ADR 0013 accepts direct per-Note
actions before implementation. Historical ADRs and completed plans remain
unchanged as decision evidence.

This plan also carries forward Plan 019's unperformed native Attachment-picker
click and normal-speed unfold/fold review. It does not weaken either gate.

## Baseline and drift check

- Branch: `codex/020-remove-selection`
- Baseline: `e1e63c5`
- Intended commit: `refactor(ui): remove note selection`
- Drift check:

```sh
git status --short
git rev-parse --short HEAD
rg -n "Selection|selection|selectedIds|bulk|noteIds|deleteNotes|setNoteStatus" \
  AGENTS.md README.md apps/desktop docs plans/README.md
```

STOP if overlapping user changes exist, ADR 0013 is not accepted, or the
implementation would weaken the Workspace, Attachment, clipboard, deletion,
capture, or local-only contracts.

## Work

1. Replace the ephemeral Selection reducer, contextual toolbar, selection
   styling, modifier gestures, and global Selection shortcuts with direct row
   activation and browser-native focus movement.
2. Put status, `Copy as Markdown`, Edit, and confirmed permanent Delete on each
   Note row with localized accessible names, contextual copy feedback, and the
   existing managed-path disclosure.
3. Make status, clipboard, and deletion commands singular across React, typed
   IPC, Rust domain modules, generated bindings, and failure handling; remove
   multi-Note composition and batch-only branches.
4. Delete proven-unused Selection modules, messages, styles, fixtures, and
   tests. Add proportionate direct-action, keyboard, clipboard, deletion,
   compact-width, and reduced-motion coverage.
5. Amend the current README, product, architecture, privacy, UX, testing,
   platform, agent, and plan contracts through ADR 0013. Preserve historical
   accepted ADRs and completed plans as written.
6. Run the repository verification in order, review the complete diff for dead
   consumers and generated files, then commit and push the dedicated branch.

## Verification

Run in order:

```sh
bun run check
bun run test
bun run test:e2e
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
git diff --check
```

Native acceptance must still prove the Attachment picker in the packaged macOS
app and the normal-speed editor unfold/fold feel. Automated completion may be
marked `AWAITING OPERATOR` until that physical evidence is supplied.

### Evidence on 2026-08-15

- `bun run check` and the separate `bun run test` pass: 20 desktop files / 68
  tests, plus the static Astro checks and build.
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked`
  passes: 73 Rust unit tests and every non-ignored contract test.
- Bindings, production builds, privacy, performance, workflows, Cargo format,
  Cargo Clippy, and `git diff --check` pass. The performance sample reports a
  184,306-byte desktop JavaScript gzip bundle and a 16.96 ms median 20k search.
- Compact 400px in-app browser review passes in Light and Graphite: all direct
  Note actions are reachable at 44 by 44 CSS pixels, the shelf has no horizontal
  overflow, and editor collapse begins immediately while its content exits.
- `bun run test:e2e` could not start its local Playwright server inside the
  sandbox (`listen EPERM` on `127.0.0.1:1420`). The required outside-sandbox
  retry was rejected because the approval service had reached its usage limit;
  this is an environment blocker, not a failing assertion.
- Packaged macOS Attachment-picker and normal-speed motion checks remain
  operator gates carried forward from Plan 019.

## Done criteria

- No current code, generated DTO, message, style, test, README, or current
  contract exposes Note Selection or a bulk Note action.
- A Note opens from one direct row activation; Arrow keys move focus and Delete
  targets the focused Note without a hidden selection model.
- Status, copy, Edit, and confirmed permanent Delete operate on exactly one Note
  and stay reachable at compact width with pointer, keyboard, and coarse input.
- Copy preserves the existing single-Note deterministic Markdown, Attachment-
  path disclosure, clipboard-only effect, and contextual failure behavior.
- Permanent Delete preserves confirmation, bounded transaction recovery,
  completed-backup cleanup, and external-backup disclosure.
- EN/FR localization, accessibility, Light/Graphite, compact layout, reduced
  motion, privacy checks, Bun tests, E2E, and Cargo tests pass.
