# Plan 019: Simplify the unified Note shelf

## Status

REJECTED: Selection interaction replaced by ADR 0013 and Plan 020

## Operator direction

On 2026-08-13 the operator rejected the Open/Done filter, Solarized theme, row
Actions menu, current composer wording, and flashing editor transition. They
also reported that Attachment import did not open. ADR 0012 accepts the
replacement contract before implementation.

On 2026-08-14 the operator removed the in-shelf wordmark and placed Help and
Preferences directly after the search input, retaining only a minimal native
drag region above the shelf.

The same day, the operator requested a repository-wide cleanup and polish pass.
That follow-up removes proven dead UI exports, messages, assets, scripts,
dependencies, and the abandoned parallel advisor-plan queue while preserving
accepted ADRs and completed product plans as historical evidence.

On 2026-08-15 the operator asked to align the Tag field typography and height,
give the Write/Preview control more room and a restrained Lavender active state,
remove the redundant visible clear-Selection icon, and make editor collapse
begin immediately instead of waiting for its content exit. Escape remains the
compact Selection-clear path required by the keyboard contract.

Later that day, the operator rejected Selection itself for the current product.
ADR 0013 and Plan 020 replace that interaction with direct per-Note actions.
This plan remains historical evidence and its outstanding native checks carry
forward to Plan 020.

## Baseline and drift check

- Branch: `codex/019-simplify-unified-shelf`
- Baseline: `8bdcda1`
- Intended commit: `refactor(ui): simplify the unified note shelf`
- Drift check:

```sh
git status --short
git rev-parse --short HEAD
rg -n "solarized|status-segment|DropdownMenu|importAttachments|closedDraft" \
  apps/desktop packages/theme docs README.md
```

STOP if overlapping user changes exist, ADR 0012 is not accepted, or the
implementation would weaken the Workspace, Attachment, clipboard, deletion,
capture, or local-only contracts.

## Work

1. Reconcile product, architecture, privacy, UX, testing, and plan contracts
   with ADR 0012.
2. Remove Solarized from the shared theme contract and Preferences, make Light
   the safe default, and normalize the stored legacy value.
3. Replace status filters with one searchable result and express Done directly
   on each Note without relying on color alone.
4. Replace the row Actions menu with direct Edit and confirmed Delete. Preserve
   ordered range Selection and its contextual bulk commands.
5. Initialize editor drafts before paint and add one interruptible shared-layout
   unfold/fold treatment with reduced-motion behavior.
6. Grant only `dialog:allow-open`, invoke the native picker from the explicit
   editor control, and keep Rust as Attachment filesystem authority.
7. Replace composer wording with conventional localized copy and simplify the
   Light/Graphite shelf surfaces around Charon's Prune, Lavender, and Cream roles.
8. Update unit, contract, E2E, localization, accessibility, privacy, Bun, and
   Cargo verification. Review the rendered desktop at compact width and fix
   remaining hierarchy, focus, clipping, motion, and destructive-flow issues.
9. Remove unused component variants, translations, motion helpers, brand/media
   copies, scripts, and dependencies; collapse plan tracking to the one official
   queue; refresh README, AGENTS, launch, testing, and architecture guidance.

## Verification

Run in order:

```sh
bun run check
bun run test
bun run test:e2e
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
git diff --check
```

The 2026-08-15 automated pass is green: 73 desktop tests, 32 Chromium/WebKit
journeys, 74 Rust unit tests plus the contract suites, privacy and workflow
checks, performance budgets, formatting, Clippy, bindings, and production
builds. The compact shelf was also reviewed at its native 480x720 first-run
size. The native checks below remain outstanding.

Native acceptance must additionally prove the Attachment picker and direct
Delete confirmation in the packaged macOS app. Automated completion may be
marked `AWAITING OPERATOR` until that physical check is supplied.

## Done criteria

- No Solarized option, token map, default, or current-app test remains.
- Search returns Open and Done Notes together; Done is checked, muted, and
  struck through.
- No per-row catch-all menu remains; the trash control opens the count-specific
  irreversible confirmation.
- Shift range Selection and contextual bulk commands still pass.
- Opening the editor shows the current body on its first paint and the row
  unfolds/folds without input locks or fixed keyframes.
- The editor Attachment button opens the permitted native chooser and imported
  files still pass Rust validation and ownership tests.
- EN/FR strings remain Paraglide-owned, and the full automated gate passes.
- The repository has one plan queue, no known orphan UI module or brand/media
  asset, and manifests contain no dependency without a live build or runtime
  consumer.
