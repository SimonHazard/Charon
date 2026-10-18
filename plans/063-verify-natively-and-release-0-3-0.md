# Plan 063: Verify natively and release 0.3.0

## Goal

Confirm on real machines what no automated test covers, from the v0.2.0 queue
and from the 2026-10-17 work (ADRs 0028-0033), then release it as `0.3.0`.

## Current state (2026-10-18)

- v0.3.0 shipped on 2026-10-17 (#68). The operator's macOS pass on
  2026-10-18 ticked permissions, design, command menu, focused Tag, hiding,
  files, and drawings except one finding, fixed in 0.3.1 (ADR 0035); the
  background mode, notification, shortcut, formatted capture, and VoiceOver
  checks remain. Run them, and the rest, against 0.3.1.

Earlier state (2026-10-17):

- `main` is v0.2.0 (`714fdab`, #67). The 0.3.0 work is implemented and
  prepared for release (the four manifests, `Cargo.lock`, `bun.lock`,
  `release-notes.md`, and the site's version copy say 0.3.0) on the branch
  `codex/v0.3`, whose pull request to `main` is open.
- Automated checks passed locally on 2026-10-17: `bun run check` (Biome with
  no warning, TypeScript, 467 Vitest tests, site, release scripts, message
  keys), all Playwright journeys (Chromium and WebKit, site included),
  `bindings:check`, `ipc:check`, `check:privacy`, `check:workflows`,
  `cargo fmt`, Clippy and the Rust suite on macOS, and, in a
  `rust:1.91.0-bookworm` container, Clippy and the Rust suite on Linux plus
  Clippy for `x86_64-pc-windows-gnu`.
- `bun run test:perf`: the JS budget passes at 260 KiB; its 20k-Note cold
  search median measures about 51 ms against the 50 ms limit on this Mac with
  Bun 1.4.2, and v0.2.0 measures the same, so it is not a regression (CI does
  not run this script). Re-measure with the pinned Bun 1.3.12 before deciding
  whether the limit or the index needs work.
- Nothing below needs a reinstall loop: use `bun run tauri:dev` for the
  shell-level checks, and one release build for permission and updater checks.

## Native checks

Mark each line with the platform and result in the pull request body.

### Design system (ADR 0028)

- [ ] macOS: the traffic lights sit inside the 28px strip above search, the
      strip drags the window, and no title text shows.
- [ ] Light, Dark, and System on macOS, Windows, and Linux: canvas, grain,
      Note cards, composer glass and shadow, glass Popovers and dialogs.
- [ ] Reduced transparency and increased contrast (macOS Accessibility
      settings): solid surfaces, outlines, no grain.
- [ ] WebKitGTK and WebView2 render the glass, the grain, and the 22px
      composer radius without artefacts.

### Command menu and focused Tag (ADRs 0029-0030)

- [ ] `Cmd+K` / `Ctrl+K` opens and closes the menu; it never opens over the
      Delete confirmation or the drawing dialog.
- [ ] Focus a Tag, quit, relaunch: the focus is remembered.
- [ ] With a focused Tag, a double-Shift capture (macOS, then Windows/X11)
      creates a Note carrying that Tag.

### Hiding (ADR 0031)

- [ ] macOS: closing the window, Escape at the root, the menu's Hide Charon,
      and the composer shortcut while Charon is frontmost all hide Charon and
      put the previous app in front; the shortcut, the Dock, and a second
      launch bring it back with the composer focused.
- [ ] Windows with background mode: the same paths hide the window and the
      previous app regains focus; without background mode the window
      minimizes. Linux: minimizes.

### Files (ADR 0032)

- [ ] Drag files from Finder / Explorer / a file manager onto a Note row and
      onto empty shelf space; the target highlight follows the pointer.
- [ ] Copy files in Finder / Explorer and paste with focus in an open editor
      and with focus on the shelf.
- [ ] Paste a screenshot (`Cmd+Ctrl+Shift+4`, `Win+Shift+S`): one PNG
      Attachment; the temporary folder `charon-pasted` is empty afterwards.
- [ ] Paste two screenshots in quick succession on the shelf: two Notes, each
      holding its own image. Paste a screenshot into a Note that already has
      20 Attachments: refused, and `charon-pasted` is empty at once.
- [ ] Linux X11 and Wayland: file paste through `text/uri-list`.

### Drawings (ADR 0033)

- [ ] Shapes and labels with a mouse, a trackpad, and a pen; French accents
      in a label.
- [ ] Copy image from the dialog and from Preview, then paste into ChatGPT,
      Claude, and a document: dark ink on white.
- [ ] The row Copy of a Note that is only a drawing pastes the image, not
      SVG source (ADR 0035, from the 2026-10-18 macOS check).
- [ ] New drawing with strokes, then Quit from the tray (and close the window
      on Windows and Linux without background mode): Charon stays open and
      the drawing asks to discard or keep.

### Owed from v0.2.0

- [ ] macOS: double-Shift capture acknowledgement, background-mode menu bar
      icon (Open, Quit with a dirty draft), capture notification text and
      rate limit, formatted capture from Safari, Mail, and Notes.
- [ ] macOS: changing, resetting, and refusing the composer shortcut; a stored
      shortcut that no longer registers falls back with a warning.
- [ ] Windows: an update installed by NSIS keeps drafts and reopens Charon.
- [ ] VoiceOver pass over the shelf, the command menu, and Preferences.

## Release steps

1. Run `bun run verify:release` (Playwright needs `bunx playwright install
   chromium webkit` once for 1.64.1) and fix what fails. Fold native findings
   into the code, the ADRs, or `docs/platform-support.md` before committing.
2. Push native fixes to `codex/v0.3` (no assistant trailer) and merge the pull
   request only on green CI and the operator's go: the merge publishes 0.3.0.
3. After the release, move this plan's outcome to
   `docs/IMPLEMENTATION_HISTORY.md` and delete it.

## Done when

Every native check is ticked or recorded as a known limit in
`docs/platform-support.md`, CI is green, and v0.3.0 is published.
