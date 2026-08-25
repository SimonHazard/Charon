# Testing Charon

## Local gates

Run routine source checks with:

```sh
bun run check
bun run test:e2e
bun run check:privacy
bun run test:perf
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
```

`bun run verify:release` is the consolidated candidate gate. It verifies
generated Rust-to-TypeScript bindings, formatting, lint, type safety, desktop
and site suites, static builds, Chromium and WebKit journeys, privacy
sentinels, performance budgets, workflow policy, Rust formatting, Clippy, and
Rust tests.

CI additionally runs that Rust formatting, Clippy, and test suite on macOS and
Windows through `Portability`; the routine `Quality` workflow supplies the Linux
leg. This automated coverage is not physical platform or release evidence.

## Deterministic browser fixture

Desktop E2E tests use `/?fixture=demo`, a deterministic synthetic Workspace that
produces no public media. Synthetic Notes,
Tags, Attachment names, paths, and timestamps never touch a real Workspace.
Fixture code is development-only and removed from the production bundle.

The fixture proves React behavior and layout. It cannot prove Tauri IPC,
operating-system permissions, global shortcut delivery, selected-text access,
clipboard restoration, file/folder pickers, Dock naming, window restoration, or
packaged release-artifact behavior such as the first-launch bypass and the
permission regrant that follows every unsigned update.

## Automated coverage

The current browser matrix covers:

- the unified Open/Done Note result, muted and struck Done treatment, search,
  Tag filtering, and Attachment-name search;
- direct row activation, Arrow-key focus movement, status, explicit copy, Edit,
  and confirmed per-Note irreversible Delete;
- editor first paint, Write/Preview, autosave failure preservation, Tags,
  managed Attachment metadata, and removal confirmation;
- always-visible composer, portable focus, and failure preservation;
- Preferences, Help, English/French, Light/Graphite, permission states, and
  contextual errors;
- 360px effective width, 400x480 minimum, 480x720 first run, wider restored
  windows, large collections, coarse pointers, keyboard focus/return, reduced
  motion, reduced transparency, increased contrast, and Axe;
- the localized media-free static site, absent legacy routes, exact icon
  checksums, canonical metadata, footer links, and no third-party request.

Performance gates cap desktop JavaScript at 230 KiB gzip and exercise the
shipped `filterNotes` index over 20,000 Notes with a multi-token query: the
cold scan of body, Tags, and Attachment names stays below 50 ms (measured
43.5 ms) and a warm snapshot — reconciliation plus filter plus Tag list — stays
below 20 ms (measured 10.1 ms), so an autosave never re-normalizes the corpus.
They also assert fewer than 150 rendered virtual rows. Load the same scale in
the browser with `?fixture=demo&notes=20000` against `bun run --cwd apps/desktop
dev`. Public pages reserve image dimensions and target LCP below 2.5 seconds,
INP below 200 ms, and CLS below 0.1.

## Native acceptance

Automation never upgrades a platform claim. The macOS physical matrix must
cover:

- Input Monitoring and Accessibility grant, denial, stale-state refresh, and
  Settings round-trip;
- public Accessibility selection followed only when needed by ADR 0010's
  bounded 700 ms Copy fallback, including concurrent clipboard writes;
- `CmdOrCtrl+Shift+Space`, unmodified double Shift, false positives, source
  focus preservation, and empty/unsupported selections;
- native Attachment and Workspace pickers, including cancel, invalid file,
  ownership, limits, and cleanup;
- Dock/product naming, first-run geometry, restored window geometry, and one
  main window;
- VoiceOver traversal of the drag region, search, unified virtual Note list,
  direct Note actions, editor, Tags, Attachments, Preferences, Delete dialog, and
  composer;
- normal speed, slow observation, mid-flight reversal, reduced motion,
  increased contrast, and reduced transparency.

Linux and Windows repeat the standard shortcut, composer, Workspace, copy,
Attachment, lifecycle, and installer matrices without claiming modifier-only
capture until their own native evidence passes.

## Current evidence

The 2026-08-14 Plan 019 automated pass established the unified shelf,
Light/Graphite rendering, direct confirmed Delete, non-flashing editor draft,
compact Preferences, media-free site, and the minimum `dialog:allow-open`
capability. Plan 020 then removed Note Selection and replaced its bulk flows with
direct per-Note status, copy, Edit, and Delete coverage.

The native app launched as `Charon`, but the executor could not authorize a
physical Attachment-button click through macOS assistive control. Plan 019
therefore carried one real picker click and a subjective normal-speed unfold/
fold review forward to Plan 020. This limitation is evidence, not a product
failure claim.

Earlier Plan 007, 016, and 017 results remain historical in their original plan
files and ADRs. Superseded Solarized, status-filter, wordmark, row-menu, and site-
media screenshots are not current acceptance targets.
