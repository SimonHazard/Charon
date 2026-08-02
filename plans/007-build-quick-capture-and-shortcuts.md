# Plan 007: Build focus-preserving hybrid selection capture and shortcuts

> **Executor instructions**: This is the active, risk-first platform plan. Read
> ADRs 0006, 0008, 0009, and 0010 before touching implementation. Execute the
> native gates in order, never advertise a capability before its physical smoke
> passes, and stop on every STOP condition. Do not start Plan 008. Update the
> index to `DONE` only after every done criterion passes.
>
> **Drift check (run first)**:
> `git diff --stat c5c33fc -- AGENTS.md README.md docs plans apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/Cargo.lock apps/desktop/src-tauri/src/capture apps/desktop/src-tauri/src/ipc apps/desktop/src apps/desktop/messages apps/desktop/src-tauri/tauri.conf.json`.
> Expected branch state: commits `dd1d1dd` and `c5c33fc` exist; the uncommitted
> Plan 007 work removes the rejected capture window, adds the main Notes
> input/editor handoff and safe default Workspace, separates Input Monitoring
> from Accessibility, and contains the bounded public-AX ladder. The obsolete
> debug-only `NSLog` has been removed and the experimental 128-ancestor bound
> has been returned to 32; no pasteboard transaction exists yet. Stop if those
> diagnostics reappear or another user's overlapping change cannot be attributed
> safely.

## Status

- **Execution state**: DONE
- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: Plans 003, 004, and 005
- **Category**: direction, migration, privacy, tests
- **Branch**: `codex/007-quick-capture`
- **Replanned at**: commit `c5c33fc`, 2026-07-31
- **Permission/signing correction**: ADR 0008, 2026-08-03
- **Public-AX expansion**: ADR 0009, 2026-08-03
- **Hybrid acquisition decision**: ADR 0010, 2026-08-03, after physical
  Chrome/Codex failures and review of Tin's public implementation
- **Completed**: 2026-08-04 against the final ad-hoc debug artifact recorded in
  `docs/platform-support.md`

## Why this matters

Capture is the product's core loop. With text selected in another application,
unmodified double Shift must create one normal Workspace note without showing
Charon or stealing focus. This must work in the applications the product is for,
including static Chrome pages and Codex. Command plus double Shift must instead
reveal the existing main window with an empty editor. The portable accelerator
performs that visible journey, and manual entry remains a compact input in the
main Notes work area.

Physical evidence proved that public Accessibility selection attributes alone
cannot meet the Chrome/Codex requirement reliably. The accepted macOS contract
is therefore hybrid: use the bounded public-AX ladder first, then ADR 0010's one
synthetic source Copy transaction with a complete in-memory pasteboard snapshot,
bounded wait, and change-count-guarded restoration. This is a native adapter
change; Charon remains a Tauri application.

## Evidence and current state

- Commits `dd1d1dd` and `c5c33fc` prove the pure gesture state machine and
  establish `CaptureCoordinator`, exact native dependencies, capability DTOs,
  and the initial macOS event-tap/Accessibility adapters.
- The uncommitted worktree removes the hidden `capture` WebView, `/capture`
  route, draft form, focus restoration, and capture-window capabilities rejected
  by ADR 0006. It adds the main Notes capture input/editor event and the safe
  default Workspace from ADR 0007.
- Physical testing confirmed the portable accelerator and Command-double-Shift
  can reveal the main editor. Input Monitoring and Accessibility are separate
  TCC grants and both were observed as authorized for the corrected bundle.
- Direct AX acquisition works for TextEdit/AppKit and editable Chrome browser
  chrome. It did not create a note for static selected page text in Chrome or
  selected Codex content. Increasing the parent walk from 32 to 128 and repeated
  TCC resets did not change that result.
- The temporary content-free `NSLog` diagnostics have been removed and each AX
  candidate origin is back at ADR 0009's 32-element maximum. Do not reintroduce
  those diagnostics or deepen/broaden the AX scan further.
- Tin's public `SelectionCapture.swift` confirms the interoperable technique:
  snapshot `NSPasteboard.general`, post Command-C with public `CGEvent`, read the
  new string, then restore. Charon must implement the safer transaction in ADR
  0010 rather than copy Tin's unconditional restoration behavior.
- No framework migration, helper process, private API, OCR, screen capture, or
  extra macOS permission is needed. Do not continue permission-reset experiments
  unless a changed bundle identity specifically invalidates the existing grant.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Drift | command in the executor block | only known Plan 007 work |
| Gesture tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked capture::gesture` | all timing/modifier cases pass |
| Capture tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked capture` | coordinator, AX, pasteboard transaction, lifecycle pass |
| UI tests | `bun run test:desktop -- capture note-screen shortcut` | input/editor/help journeys pass |
| Public SDK proof | `CHARON_SDK_PATH=$(xcrun --show-sdk-path); rg -n "kAXSelectedTextMarkerRangeAttribute|kAXStringForTextMarkerRangeParameterizedAttribute|AXUIElementCopyElementAtPosition|changeCount|pasteboardItems|CGEventPost" "$CHARON_SDK_PATH/System/Library/Frameworks/ApplicationServices.framework/Frameworks/HIServices.framework/Headers" "$CHARON_SDK_PATH/System/Library/Frameworks/AppKit.framework/Headers/NSPasteboard.h" "$CHARON_SDK_PATH/System/Library/Frameworks/CoreGraphics.framework/Headers"` | all used native contracts are in public headers |
| Rust quality | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings` | exit 0 |
| Full checks | `bun run bindings:check && bun run check && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |
| Debug app | `bun run tauri:build -- --debug` | current-platform bundle succeeds |
| Signature | `codesign --verify --deep --strict --verbose=2 apps/desktop/src-tauri/target/debug/bundle/macos/Charon.app` | valid debug bundle |

## Scope

**In scope**:

- `apps/desktop/src-tauri/Cargo.toml`, generated `Cargo.lock`, and
  `tauri.conf.json`;
- minimal exact direct macOS dependencies already present transitively in the
  lockfile when required: `objc2 0.6.4`, `objc2-app-kit 0.3.2`, and
  `objc2-foundation 0.3.2`;
- removal of capture-only capability/window configuration;
- `apps/desktop/src-tauri/src/capture/**`, including splitting the current giant
  macOS file into focused listener, permission, AX, and pasteboard adapter files;
- `apps/desktop/src-tauri/src/ipc/capture.rs`, `ipc/workspace.rs`, `ipc/mod.rs`,
  and `src/lib.rs`;
- `apps/desktop/src-tauri/tests/capture_contract.rs`;
- generated `apps/desktop/src/bindings/capture.ts` and its binding check;
- desktop capture/workspace IPC clients;
- removal of the dedicated capture route, form, controller, status, and window;
- main Notes input, full-editor reveal, command registry/help, root wiring,
  localized EN/FR messages, semantic CSS, and adjacent tests;
- safe first-run default Workspace plus enabled folder chooser fallback;
- `AGENTS.md`, README, product/architecture/privacy/UX contracts, ADRs 0002,
  0006, 0008, 0009, new ADR 0010, `docs/platform-support.md`, this plan,
  affected completed/downstream plan references, and `plans/README.md`.

**Out of scope**:

- a special Quick Note entity, implicit durable section, or dedicated capture
  window;
- the deferred Copper-like simple presentation mode;
- automatic Paste, more than one synthetic Copy per explicit capture gesture,
  arbitrary key injection, clipboard polling/history, or background collection;
- restoring over a concurrent clipboard write or reading the old clipboard as a
  selection;
- private Accessibility APIs, opaque text-marker decoding, recursive tree scans,
  OCR, screen capture, bundle-specific extraction, or a privileged helper;
- auto-start, stable release signing, or distribution work from Plan 012;
- claiming enhanced Windows, X11, or Wayland capture without their own native
  adapter and physical target evidence.

## Git workflow

- Branch: `codex/007-quick-capture`
- Existing commits:
  - `test(capture): prove gesture state machine`
  - `feat(capture): add quick capture coordinator`
- Remaining commits, in order:
  1. `refactor(capture): keep capture in main workspace`
  2. `feat(macos): capture selections with bounded copy fallback`
- Keep the current Plan 007 worktree; do not reset it wholesale. Stage the first
  commit by responsibility, then complete and stage the macOS adapter, contracts,
  platform evidence, and plan status in the second commit.
- Do not push or open a pull request unless instructed.

## Steps

### Step 1: Preserve the one-surface capture product

Complete the ADR 0006/0007 work already present:

- unmodified double Shift plus one non-empty acquired selection maps to exactly
  one versioned Workspace `CreateNote` command in the active ephemeral section,
  with deterministic first-section fallback;
- empty/unavailable acquisition creates nothing and leaves Charon hidden;
- Command held consistently across double Shift opens the existing main empty
  editor and never reads selected text or pre-creates a note;
- `CmdOrCtrl+Shift+Space` performs the same editor reveal;
- manual fast capture is one compact input in the active Notes work area;
- fresh launch safely opens or creates `Documents/Charon`, tries
  `Documents/Charon Workspace` on collision, and otherwise exposes an enabled
  folder chooser without modifying unrelated directories.

Remove every capture-window route, capability, lifecycle helper, form, style,
translation, and test. React must continue to dispatch typed commands and never
read Workspace files directly. Repeated editor requests focus an existing empty
draft but never overwrite non-empty unsaved text.

**Verify**: `test ! -e apps/desktop/src/routes/capture.tsx && test ! -e apps/desktop/src-tauri/src/capture/window.rs`; run UI tests; run capture application tests for one command, deterministic destination, no mutation on failure, one editor event, dirty-draft preservation, default Workspace collisions, and listener cleanup. Commit `refactor(capture): keep capture in main workspace` only when these pass.

### Step 2: Keep gesture and permission boundaries exact

Keep the pure fake-clock gesture model at two complete taps within 300 ms.
`captureSelection` requires Command absent throughout; `openEditor` requires
Command held throughout. Reset on Command changes, another key, overlapping
Shift chords, event-tap restart, security boundary, backward time, or timeout.
Auto-repeat and holds never trigger.

Input Monitoring gates only the passive `listenOnly` event-tap listener.
Accessibility separately gates both the direct-AX acquisition and ADR 0010's
single synthetic Copy. Permission requests occur only from explicit localized
help/onboarding actions, never on mount. Command-double-Shift needs Input
Monitoring but never Accessibility.

The event-tap callback must return immediately. Route `openEditor` to the main
thread and route `captureSelection` to one serial, bounded capture worker with a
capacity-one/single-flight contract. Waiting for AX, pasteboard materialization,
Copy, or Workspace I/O must never block the Core Graphics callback or freeze the
main WebView. Shutdown stops and joins the worker and listener exactly once.

**Verify**: Gesture tests cover left/right combinations, exact 300 ms boundary,
both intents, modifier changes, Shift+letter, repeat, holds, three taps,
security/focus reset, listener restart, queue saturation, duplicate suppression,
and idempotent shutdown without wall-clock sleeps in unit tests.

### Step 3: Retain the bounded public Accessibility primary path

Split the current macOS experiment into cohesive native adapter files rather
than growing `platform/macos.rs` further. Keep unsafe FFI in small helpers with
balanced Core Foundation ownership. The direct path:

1. captures the foreground source identity;
2. builds a cycle-safe candidate chain from the focused UI element and parents;
3. performs at most one system-wide pointer hit-test and walks its parents;
4. then considers focused window and application;
5. limits each origin to 32 candidates and deduplicates the combined sequence;
6. tries `AXSelectedText`, `AXSelectedTextRange` with `AXStringForRange`, then
   `AXSelectedTextMarkerRange` with `AXStringForTextMarkerRange`;
7. rejects secure controls, wrong Core Foundation types, malformed/empty values,
   and permission failures with typed content-free outcomes.

Do not enumerate applications/windows, recurse through descendants, hard-code a
bundle identifier, or increase the ancestor bound. Remove the temporary
debug-only `NSLog`, all content or app-name diagnostics not needed for a typed
capability, and unused experimental imports. Preserve exact selected text while
trimming only to decide emptiness.

**Verify**: deterministic AX tests cover direct string, standard range, marker
range, ancestor fallback, pointer fallback, focused window/application, wrong
type, AX error, secure role, cycle, deduplication, and the exact 32-element bound.
The public SDK proof command succeeds.

### Step 4: Implement ADR 0010's safe pasteboard transaction

Add a capture-specific macOS pasteboard adapter owned by
`CaptureCoordinator`, not `ClipboardComposer`. Use public AppKit/Core Graphics
bindings and exact direct dependency pins only when needed. The production
transaction and its fake test port must implement this order:

1. Acquire the single-flight slot only after direct AX returned no text. Capture
   the unchanged non-Charon foreground process identity and reject a publicly
   identified secure text role/subrole.
2. Snapshot `NSPasteboard.general` change count and every materializable type of
   every item into owned in-memory bytes. Use explicit constants:
   `MAX_PASTEBOARD_ITEMS = 32`, `MAX_TYPES_PER_ITEM = 64`,
   `MAX_SNAPSHOT_BYTES = 64 MiB`, and `SNAPSHOT_TIMEOUT = 150 ms`. If any item or
   type cannot be represented completely within those bounds, post no event.
3. Recheck both the pasteboard change count and foreground process identity. If
   either changed, discard the snapshot and do nothing.
4. Post exactly one `kVK_ANSI_C` key-down/key-up pair with the Command flag using
   a public `CGEvent` at the HID event tap. Do not post Paste, activate Charon,
   move focus, or send a second Copy retry.
5. Wait asynchronously for a changed pasteboard count for at most
   `COPY_TIMEOUT = 500 ms`, using a production poll interval no shorter than
   10 ms. After a change, require 25 ms of stable change count before reading
   the public string type. Unit tests use a fake clock/scheduler, never sleeps.
6. Never accept the pre-gesture clipboard value. The first newly produced,
   non-empty string is the candidate note body. An unsupported/empty new payload
   still proceeds to safe restoration but creates no note.
7. Immediately before restoration, confirm that the current count is still the
   stable transaction-owned count. Restore every snapshotted item/type only in
   that case. If the count changed, skip restoration so a newer user/application
   copy is never overwritten. Treat restoration failure as a typed content-free
   warning; never claim the clipboard was preserved.
8. Release all snapshot and selected-text buffers after the typed action is
   handed to the existing Workspace command. Never persist, log, diagnose, or
   emit raw pasteboard data outside that action.

Do not add a Tauri clipboard read capability to the WebView. Native snapshot
access stays inside the macOS capture adapter. `ClipboardComposer` remains its
existing deterministic write-only product module.

**Verify**: fake transaction tests cover empty pasteboard, one/multiple rich
items, item/type/byte/time limits, complete restoration, unchanged Copy,
delayed Copy, exact timeout, same string with changed count, empty new string,
source change before post, secure field, concurrent write before restore,
restoration failure, queue overlap, and zero content in errors/logs. A test must
prove a concurrent clipboard value is never overwritten.

### Step 5: Integrate the hybrid action without duplicate notes

For `captureSelection`, the platform result is one of direct AX text, bounded
Copy text, no selection, permission denied, unsupported, or content-free
warning. The first non-empty direct result wins and must not touch the
pasteboard. Only a direct no-selection result can start the Copy fallback.

`CaptureCoordinator` returns at most one `CreateNote { body }` per gesture. The
application layer maps it to one Workspace command using active ephemeral
section context. Acquisition failure never creates a blank note. If no Workspace
or section is available, do not persist the selected text elsewhere; retain only
a content-free status for the next visible session. Duplicate native/standard
triggers remain suppressed.

Expose a content-free restoration warning in the next visible main session and
localized help, without showing a capture window or stealing source focus. Do
not include selection, pasteboard type names, source application name, or paths
in errors or diagnostics.

**Verify**: coordinator/application tests prove AX-first order, fallback only on
no-selection, one action, one Workspace command, exact body preservation,
denied/unsupported/empty no-op, duplicate suppression, missing Workspace no
content retention, warning redaction, and cleanup.

### Step 6: Make permission and privacy copy honest

Update EN/FR help and the affected contracts to explain:

- Input Monitoring observes only the double-Shift modifier sequence;
- Accessibility reads public selection data and may invoke one source Copy when
  direct access fails;
- selected text may appear briefly on the system clipboard and be observed by
  an installed clipboard manager;
- Charon restores the previous clipboard only when it can prove no concurrent
  write occurred;
- Charon never monitors clipboard history, posts Paste, or uploads content;
- the portable accelerator and manual input remain available after denial.

No permission prompt occurs on mount. Keep macOS capability claims pending until
the full debug matrix passes. Linux and Windows remain at their evidence-gated
tiers; do not imply the macOS fallback exists there.

**Verify**: `rg -n "bounded|Copy|clipboard manager|concurrent|Accessibility|Input Monitoring|Paste" AGENTS.md README.md docs apps/desktop/messages plans/007-build-quick-capture-and-shortcuts.md` shows consistent disclosure and no old blanket prohibition that contradicts ADR 0010. Translation tests pass.

### Step 7: Run the complete macOS physical acceptance matrix

Build one corrected debug bundle, record its macOS version, architecture,
bundle identifier, executable SHA-256, and signature in
`docs/platform-support.md`, then grant Input Monitoring and Accessibility to that
exact bundle. Do not repeatedly reset all TCC permissions. Reset only the exact
Charon service/bundle when a changed identity makes the existing grant invalid,
and record why.

Physically test:

- another application remains focused and Charon is hidden;
- standard accelerator reveals the main empty editor;
- Command-double-Shift reveals one empty editor without a note;
- Shift+letter, repeat, hold, mixed Shift chord, Command-state change, and three
  taps do not trigger;
- empty selection does nothing;
- TextEdit/AppKit selection creates exactly one note through direct AX without
  changing the clipboard;
- Chrome URL-field selection exercises direct AX;
- static Chrome page selection creates exactly one note, keeps Chrome focused,
  and restores a pre-existing text clipboard;
- selected Codex conversation text creates exactly one note, keeps Codex
  focused, and restores the previous clipboard;
- Safari/WebKit static text, Preview PDF text, and VS Code/Cursor editor text
  pass when installed, through either documented acquisition result;
- a pre-existing rich/multi-item pasteboard is restored exactly;
- a concurrent clipboard write is not overwritten;
- unchanged/blocked/slow Copy and a secure field create nothing;
- canvas-only or otherwise inaccessible content creates nothing;
- a clipboard manager may observe the transient selection as disclosed, while
  Charon itself retains no history;
- manual input creates one note and preserves failed text;
- restart registers one listener, one worker, and one accelerator.

Record which cases used direct AX versus Copy fallback. A passing ad-hoc debug
build is development evidence only; Plan 012 must repeat the matrix on the
stable Developer ID signed artifact.

**Verify**: `docs/platform-support.md` contains no blank or optimistic result;
every required local case is `passed` or the plan stops with an exact blocker.

### Step 8: Final verification, diff review, commits, and status

Run all commands from the command table in order. Run the complete physical
matrix after the final debug build, not an earlier binary. Re-read the entire
diff from `c5c33fc` for scope, generated-file provenance, secrets, content logs,
unsafe ownership, exact pins, platform claims, stale capture-window code, and
the `Workspace`/`CaptureCoordinator`/`ClipboardComposer` dependency direction.

Confirm no debug `NSLog`, temporary diagnostics, selected text, pasteboard
payload, private path, or permission-reset script is committed. Confirm
`Cargo.lock`, bindings, Paraglide output, and routes were generated by their
owning tools rather than hand-edited. Create the two remaining exact commits in
the Git workflow section. Only after all done criteria pass, update Plan 007 to
`DONE` in `plans/README.md` in the second commit. Do not push.

## Test plan

- Pure fake-clock gesture and duplicate-suppression tests.
- Coordinator tests with fake shortcut, permission, AX, pasteboard, clock, and
  Workspace/application ports.
- AX representation/candidate tests with bounded depth and Core Foundation type
  failures.
- Pasteboard transaction tests with complete rich snapshots, limits, timeouts,
  concurrent writes, restoration failures, and content-redaction assertions.
- UI tests for main input, editor reveal, dirty draft, permission copy, warnings,
  EN/FR, and cleanup.
- Real-filesystem tests for safe default Workspace and exactly one CreateNote.
- Dated physical macOS matrix for cross-process focus, TCC, source Copy, and
  pasteboard behavior.
- Full binding, Bun, format, clippy, Cargo, bundle, and signature gates.

## Done criteria

- [x] Unmodified double Shift creates exactly one normal note for non-empty
  selections in TextEdit, static Chrome page content, and Codex without showing
  or focusing Charon.
- [x] The direct AX ladder remains first and does not touch the pasteboard when
  it succeeds.
- [x] The Copy fallback posts exactly one Command-C only after explicit gesture,
  failed direct AX, confirmed permissions, complete snapshot, stable source, and
  stable pre-copy change count.
- [x] The complete pre-existing pasteboard is restored when safe; a concurrent
  clipboard write is never overwritten; failures are content-free.
- [x] Empty, whitespace, secure, denied, unsupported, blocked, unsafe, and timed-
  out acquisition creates nothing.
- [x] Command-double-Shift and the portable accelerator reveal one empty focused
  editor without creating a note or reading selected text.
- [x] The main Notes input creates one note in the active section and preserves
  text on failure.
- [x] No capture window, route, capability, lifecycle, or special Quick Note
  entity remains.
- [x] A fresh launch safely opens a visible default Workspace and offers an
  enabled chooser after collisions/failure.
- [x] Listener callback, serial worker, duplicate suppression, restart, and
  shutdown tests pass without leaks or UI blocking.
- [x] Only public SDK APIs are used; there is no private API, automatic Paste,
  arbitrary input, clipboard monitor/history, OCR, screen capture, unbounded AX
  traversal, privileged helper, or source-focus theft.
- [x] Permission/privacy UI discloses transient clipboard exposure and safe
  conditional restoration in EN/FR.
- [x] Linux/Windows claims remain unpromoted without physical evidence.
- [x] Bindings, targeted tests, full checks, Rust tests, fmt, clippy, final debug
  build, signature verification, complete diff review, and physical matrix pass.
- [x] The exact remaining commits exist and Plan 007 is `DONE` in
  `plans/README.md`.

## STOP conditions

- A complete bounded pasteboard snapshot cannot be created and restored with
  public AppKit APIs without risking silent data loss.
- Any test or physical race proves Charon can overwrite a clipboard value written
  after its transaction-owned Copy.
- The required selection needs private APIs, more than one Copy, automatic
  Paste, arbitrary input, OCR/screen capture, a privileged helper, reverse-
  engineered marker bytes, or an unbounded/background Accessibility scan.
- Selected text or pasteboard payload enters logs, diagnostics, temporary files,
  crash output, or a second persistence path.
- Silent capture steals focus, shows a Charon surface, creates a blank note, or
  dispatches more than one Workspace command.
- Command-double-Shift overwrites a non-empty unsaved editor draft.
- The event-tap callback or main WebView is blocked by capture timeout/work.
- The application layer bypasses the versioned Workspace command boundary.
- Automatic Workspace bootstrap would modify a non-Workspace directory or store
  note content outside the Workspace.
- macOS gesture intents cannot pass false-positive tests in the final debug
  environment.
- A Linux/Wayland/Windows hack is presented as universal support without target
  evidence.
- The full physical matrix fails twice on the same final build after one scoped
  fix; stop and report evidence rather than resetting permissions repeatedly.

## Maintenance notes

- Re-run the complete pasteboard-race and application-family matrix after macOS,
  Tauri, AppKit binding, browser, Codex, editor, clipboard-manager, permission,
  or signing changes.
- Keep the AX primary path bounded and generic. Do not add bundle-identifier
  extraction rules when the source application's Copy command already provides
  the compatibility boundary.
- Changing pasteboard item/type/byte/time limits is a privacy and data-safety
  change that requires tests and ADR 0010 review.
- Keep capture destination configurable only after evidence; v1 uses active
  ephemeral section with deterministic fallback.
- Treat simple mode as a later presentation experiment over the same commands
  and Workspace, never as another capture window.
