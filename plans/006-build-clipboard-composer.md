# Plan 006: Build the ClipboardComposer and fast Markdown copy workflows

> **Executor instructions**: Follow every step and verification gate. Stop on
> any STOP condition. Update this plan's row in `plans/README.md` when done.
>
> **Drift check (run first)**: inspect note commands, selection ordering,
> `apps/desktop/src-tauri/src/ipc`, and clipboard plugin registration. The expected state has
> a disabled copy placeholder and no clipboard history, polling, formatting, or
> direct plugin calls from React. Stop if another copy path already exists.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/005-deliver-note-management-workflow.md`
- **Category**: direction, tests
- **Planned at**: unborn `main` (no commit), 2026-07-30

## Why this matters

Charon's differentiator is turning a loose selection of prompt ideas into clean
agent-ready Markdown with almost no ceremony. Formatting inside rows would
duplicate edge cases and make clipboard behavior hard to test. A deep,
deterministic ClipboardComposer gives every menu, shortcut, and future export
the same exact output without reading clipboard history or injecting input.

## Current state

- Note selections are stable ordered IDs and Workspace snapshots supply section
  and Markdown data.
- The selection bar has a disabled copy action.
- The Tauri clipboard plugin is installed with minimal registration, but no
  app-owned command composes or writes data.
- Product presets are `plain`, `bulleted`, `numbered`, `task-list`, and
  `sectioned`. Copy is explicit and never auto-pastes into another app.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Rust tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked clipboard` | all composer/adapter tests pass |
| UI tests | `bun run test:desktop -- clipboard copy` | all copy workflow tests pass |
| Bindings | `bun run bindings:check` | exit 0, no generated diff |
| Quality | `bun run check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | exit 0 |

## Suggested executor toolkit

- Use `improve-codebase-architecture` to keep formatting policy inside one
  module rather than spreading it across toolbar, row, and shortcut handlers.
- Use `shadcn` for popover, dropdown, button-group, kbd, tooltip, and toast.

## Scope

**In scope**:

- `apps/desktop/src-tauri/src/clipboard/mod.rs`, `model.rs`, `composer.rs`, `adapter.rs`,
  `error.rs`
- `apps/desktop/src-tauri/src/ipc/clipboard.rs`,
  `apps/desktop/src-tauri/src/ipc/mod.rs`, `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src-tauri/capabilities/default.json`
- `apps/desktop/src-tauri/tests/clipboard_contract.rs`
- `apps/desktop/src/bindings/clipboard.ts` (generated), `scripts/check-bindings.ts`
- `apps/desktop/src/lib/ipc/clipboard-client.ts`
- `apps/desktop/src/features/copy/copy-menu.tsx`, `copy-preview-dialog.tsx`,
  `copy-preset.ts`, `copy-actions.ts`
- `apps/desktop/src/features/notes/selection-bar.tsx`, `note-row.tsx`
- `apps/desktop/src/app/commands/default-commands.ts`
- `apps/desktop/messages/en.json`, `apps/desktop/messages/fr.json`
- Tests beside these frontend files

**Out of scope**:

- Clipboard monitoring/history, automatic paste, synthetic keystrokes, selected
  text capture, HTML/rich clipboard payloads, cloud templates, AI rewriting,
  and changing note status as an implicit side effect of ordinary copy.

## Git workflow

- Branch: `codex/006-clipboard-composer`
- Commits: `feat(core): add clipboard composer`,
  `feat(copy): add fast markdown copy workflows`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Define deterministic composition rules

Create public typed models `ComposeRequest`, `CopyPreset`, `ComposeOptions`, and
`ComposedClipboard`. Input notes include stable ID, section name, Markdown body,
and explicit selection order. Output includes plain Markdown, note count, and a
short preview; no HTML.

Implement exact rules in `composer.rs`:

- Normalize CRLF to LF and trim only outer blank lines.
- `plain`: note bodies joined by one blank line.
- `bulleted`: each logical note is one top-level `- ` item; indent every
  continuation line by two spaces without damaging fenced code blocks.
- `numbered`: same continuation rule with `1.`, `2.`, and so on.
- `task-list`: `- [ ] ` plus continuation indentation.
- `sectioned`: group in first-seen section order, render `## <section>` once,
  preserve selection order within each section, and join bodies cleanly.
- Empty bodies are omitted and reported in the result. If every body is empty,
  return a typed validation error and do not touch the clipboard.
- Preserve Unicode, Markdown links, fenced code, and nested lists.

**Verify**: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked clipboard::composer` -> golden tests for all presets, multiline/fences, Unicode, empties, and newline normalization pass.

### Step 2: Add a write-only clipboard adapter and IPC command

Define an internal `ClipboardWriter` implemented by the Tauri clipboard plugin
and a memory adapter for tests. The deep operation is compose then write; React
does not receive a clipboard handle. Expose `clipboard_compose_and_write` and
`clipboard_preview` commands with generated DTOs. Map permission/platform
failures to typed codes and never log copied content.

Grant only clipboard write permission for `main` and later `capture` windows.
Do not grant read or clipboard-monitor permissions. Ensure the command validates
that requested IDs are present in the passed/current Workspace snapshot and
uses the selected order.

**Verify**: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked clipboard::adapter` -> success, denied write, empty input, and no-write-on-compose-error pass; `rg -n "clipboard.*read|read.*clipboard" apps/desktop/src-tauri/capabilities` -> no matches.

### Step 3: Build preview, presets, and one-keystroke actions

Implement a shadcn copy menu with five localized presets, remembered default,
and preview dialog. The main Copy button uses the default immediately; its menu
changes preset or opens preview. One note can copy from its row menu; a selection
copies in selection order. On success, show a compact toast with item count and
preset. On failure, preserve selection and show a specific retry action.

Register app commands:

- `copy.default` on Cmd/Ctrl+C only when focus is outside editable controls and
  at least one note is selected.
- `copy.preview` on Cmd/Ctrl+Shift+C.
- Optional preset-specific commands visible in the palette but without crowded
  default shortcuts.

Native text selection inside textarea/input retains normal browser copy. Never
override it.

**Verify**: `bun run test:desktop -- copy-menu copy-actions` -> row copy, ordered bulk
copy, preset persistence, native editable copy, preview, success/error toasts,
and EN/FR pluralization pass.

### Step 4: Add explicit copy-and-complete as a separate command

If `docs/PRODUCT.md` lists copy-and-complete, expose it as an explicitly named
command, never the default Copy behavior. First compose and write. Only after a
successful clipboard write, submit one batch `set-status(done)` Workspace
command. If status update fails, report that copy succeeded but completion did
not and offer retry; never claim an atomic boundary across the OS clipboard and
filesystem.

If the product contract does not list it, omit this step and note the deferral in
Maintenance notes rather than expanding scope.

**Verify**: `bun run test:desktop -- copy-and-complete` -> clipboard failure causes no
mutation; mutation failure keeps clipboard success and exposes retry; success
runs exactly one batch mutation.

## Test plan

- Rust golden fixtures for every preset and Markdown edge case.
- Adapter contract tests prove write-only behavior and no content logging.
- UI tests cover focus gating, selection order, preset persistence, preview,
  native copy, localized results, and partial copy-and-complete failure if used.
- Manual smoke copies each preset into a plain-text editor and two agent chat
  composers without automatic paste.
- Verification: all commands in the table exit 0.

## Done criteria

- [ ] Five presets produce deterministic, documented Markdown.
- [ ] Clipboard access is write-only and composed content never reaches logs.
- [ ] Cmd/Ctrl+C respects editable fields and selection order.
- [ ] Preview and direct copy use the same Rust composer.
- [ ] UI never imports the Tauri clipboard plugin directly.
- [ ] Copy does not implicitly mutate notes.
- [ ] Bindings, Rust tests, frontend tests, lint, and typecheck pass.
- [ ] This plan's row in `plans/README.md` is `DONE`.

## STOP conditions

- Clipboard write permission requires granting read/history access.
- Correct list formatting would require executing or rendering user Markdown.
- A UI request introduces a second formatting implementation.
- Cmd/Ctrl+C cannot reliably distinguish editable focus after two scoped fixes.
- Tests or logs reveal raw note content outside explicit golden fixtures.

## Maintenance notes

- Preset output is a user-facing compatibility contract. Add golden fixtures
  before changing whitespace or prefixes.
- Keep the writer replaceable for tests, but do not create a generic clipboard
  service with unused read/history methods.
