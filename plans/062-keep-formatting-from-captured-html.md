# Plan 062: Keep the formatting of captured text when the source offers it (opt-in, macOS Copy fallback first)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 242d51e -- apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/src/capture apps/desktop/src-tauri/src/ipc/capture.rs apps/desktop/src-tauri/src/ipc/preferences.rs apps/desktop/src-tauri/src/preferences apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/tests apps/desktop/src/bindings apps/desktop/src/lib/ipc apps/desktop/src/features/preferences apps/desktop/messages docs AGENTS.md README.md && git status --short -- apps/desktop docs AGENTS.md README.md`
> (without `..HEAD` the diff includes uncommitted edits). Expected drift, by
> earlier plans: the operator's uncommitted macOS permission work
> (`capture/coordinator.rs`, `capture/error.rs`, `macos/mod.rs`,
> `macos/permissions.rs`, `tests/capture_contract.rs`,
> `tests/ipc_error_contract.rs`, `preferences-panel.tsx`, messages,
> `docs/UX.md`), ADR 0018 work (`AGENTS.md`, `docs/PRIVACY.md`,
> `docs/platform-support.md`), **045** (`capture/model.rs`, `ipc/capture.rs`,
> `tests/capture_contract.rs`, bindings, messages, docs), **039** (`lib.rs`),
> **038/040/041/047/052** (`preferences-panel.tsx`, messages, `docs/UX.md`,
> `AGENTS.md`), **050/051** (`docs/UX.md`, `AGENTS.md`), and backlog plans
> D/E/F (`preferences/model.rs`, `ipc/preferences.rs`, `capture/model.rs`,
> `coordinator.rs`) if they landed first. The macOS files
> `capture/platform/macos/pasteboard.rs` and `accessibility.rs` are not
> touched by any queued plan: any drift there is a STOP.

## Status

- **Priority**: P3
- **Effort**: L (spike + macOS implementation); Windows/X11 are research only here
- **Risk**: HIGH (widens ADR 0010's clipboard read; content fidelity; new parser dependency)
- **Depends on**: none hard. Plan 045 edits the same capture success path; land after it to avoid conflicts.
- **Category**: direction
- **Planned at**: commit `242d51e` plus the operator's uncommitted working tree, 2026-09-23

## Why this matters

Captured Notes are plain text today, so links, lists, headings, emphasis, and
code blocks selected in a web page or an Electron app arrive flattened, and an
agent reading `Copy as Markdown` loses structure the user saw.
`docs/FEATURE_BACKLOG.md` ("Conserver le formatage du texte capturé") asks to
keep formatting where a source exposes it, with plain text as the
deterministic fallback, no extra content read, no network, and bounded
access. On macOS, ADR 0010's bounded Copy fallback already makes the source
application write its normal clipboard payload — which for Chromium/Electron
usually includes HTML — but invariant 5 lets Charon read only the text
representation. This plan measures what each platform really exposes, then
(if approved) amends ADR 0010 narrowly and converts that HTML to Markdown in
Rust, keeping plain text whenever anything is uncertain.

## Current state

- ADR 0010 (`docs/adr/0010-bounded-copy-selection-fallback.md`), invariants
  this plan must amend or keep:
  - (1) the Copy transaction runs only "after a valid completed capture
    gesture … and a failed direct-AX acquisition" — **kept**: formatting never
    triggers a Copy by itself.
  - (5) "It reads only the new text representation needed for the note. The
    exact selected body is retained; trimming is used only to reject empty
    content. Captured text and pasteboard payloads never enter logs, errors,
    diagnostics, disk caches, telemetry, or IPC except the existing typed
    create-note action." — **amended** to allow one bounded HTML
    representation from the same transaction-owned change count, converted
    in memory.
  - (6)/(7) restoration and release of temporary values — **kept**.
- `docs/PRIVACY.md:74-77`: the fallback "invokes the unchanged foreground
  application's normal Copy command once, reads only a newly produced text
  value, and restores the complete snapshot only when no concurrent clipboard
  write occurred." `AGENTS.md`: "ADR 0010 permits exactly one synthetic
  platform Copy after an explicit selected-text capture gesture, inside its
  bounded snapshot, change-count, timeout, disclosure, and restoration
  contract."
- macOS acquisition, `apps/desktop/src-tauri/src/capture/platform/macos/mod.rs:77-92`
  (`selected_text`) and `:108-117`:

```rust
fn acquire_hybrid(
    direct: impl FnOnce() -> Result<AxSelection, CaptureError>,
    fallback: impl FnOnce() -> CapturedSelection,
) -> Result<CapturedSelection, CaptureError> {
    match direct()? {
        AxSelection::Text(body) => Ok(CapturedSelection::from_body(body)),
        AxSelection::Secure => Ok(CapturedSelection::default()),
        AxSelection::NoSelection => Ok(fallback()),
    }
}
```

- `capture/platform/macos/accessibility.rs:209-235` reads only plain strings
  (`AXSelectedText`, `AXSelectedTextRange`+`AXStringForRange`,
  `AXSelectedTextMarkerRange`+`AXStringForTextMarkerRange`). Direct-AX
  captures (native text fields, editable Chromium fields, usually Safari) stay
  plain in this plan.
- `capture/platform/macos/pasteboard.rs`:
  - constants `:16-23` (`MAX_PASTEBOARD_ITEMS = 32`, `MAX_TYPES_PER_ITEM = 64`,
    `MAX_SNAPSHOT_BYTES = 64 MiB`, `SNAPSHOT_TIMEOUT_MS = 150`,
    `COPY_TIMEOUT_MS = 500`, `COPY_STABILITY_MS = 25`);
  - `trait PasteboardPort` `:71-92` (`read_string`, `restore_if_unchanged`, …);
  - `capture_with_port` `:109-159`; the relevant tail:

```rust
    let body = port.read_string().filter(|value| !value.trim().is_empty());
    let warning = match port.restore_if_unchanged(stable_count, &snapshot) {
        RestoreOutcome::Restored => None,
        RestoreOutcome::Changed | RestoreOutcome::Failed => {
            Some(CaptureWarning::ClipboardNotRestored)
        }
    };
    CapturedSelection { body, warning }
```

  - `SystemPasteboardPort::read_string` `:364-369` uses
    `stringForType(NSPasteboardTypeString)`; `read_item_type` `:316-345` is
    the bounded `dataForType` + byte-limit pattern to copy.
  - `#[cfg(test)] mod tests` from `:393`: `FakePasteboardPort` with
    `.selection_at(at_ms, count, Some("…"))`; first test at `:593`
    (`empty_and_rich_multi_item_snapshots_restore_completely`). These tests
    compile only on macOS.
- `objc2-app-kit 0.3.2` (already a macOS dependency with the `NSPasteboard`
  feature): `NSPasteboardTypeHTML` (`src/generated/NSPasteboard.rs:46`),
  `NSPasteboardTypeRTF` (`:36`), `NSPasteboard::dataForType` (`:459`).
- Windows: `capture/platform/windows/selection.rs:53-80` reads
  `IUIAutomationTextPattern::GetSelection` → `GetText` (plain, capped at
  `MAX_SELECTION_BYTES / 4` UTF-16 units). X11:
  `capture/platform/linux/x11.rs:219-245` converts `PRIMARY` to
  `UTF8_STRING` only; AT-SPI `linux/atspi.rs:245-256` calls
  `GetSelection`/`GetText`. `capture/platform/bounded.rs:7-8`:
  `SELECTION_TIMEOUT = 500 ms`, `MAX_SELECTION_BYTES = 1 MiB`
  (module compiled only for Windows, Linux, and tests: `platform/mod.rs:8-9`).
- Capture model: `capture/model.rs:87-100` `CapturedSelection { body, warning }`;
  `coordinator.rs:161-185` turns a non-blank body into
  `CaptureAction::CreateNote { body, warning }`. Workspace note limit
  `workspace/model.rs:13` `MAX_NOTE_BYTES = 10 MiB`.
- `tauri-plugin-clipboard-manager 2.3.2` has no HTML read (`src/desktop.rs`:
  `write_text`, `write_image`, `read_text`, `write_html`, `clear`,
  `read_image`) and belongs to the `ClipboardComposer` side anyway; ADR 0010
  keeps capture pasteboard access inside `CaptureCoordinator`.
- Converter candidate: `htmd` 0.5.5 (Apache-2.0, "A turndown.js inspired HTML
  to Markdown converter", <https://github.com/letmutex/htmd>), dependencies
  `html5ever ^0.38`, `markup5ever_rcdom ^0.38`, `phf ^0.13.1`. `Cargo.lock`
  already contains `html5ever 0.38.0`, `markup5ever 0.38.0`, `phf 0.13.1`;
  new crates would be `htmd` and `markup5ever_rcdom`. Builder API per README:
  `HtmlToMarkdown::builder().skip_tags(vec![…]).add_handler(vec![…], |handlers, element| …).build()`,
  options include `heading_style`. **Do not** use `html2md` (GPL-3.0).
- Markdown safety downstream: `docs/UX.md:219-224` — Preview keeps raw HTML
  disabled, shows link destinations as inert text, and images as alt text
  only, without resource requests.
- Rust toolchain: `rust-version = "1.91.0"` (`apps/desktop/src-tauri/Cargo.toml:11`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Rust | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |
| Focused | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked formatting` | pass |
| Lockfile refresh (once) | `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml` | exit 0 |
| Audit | `cargo install --locked cargo-audit && cargo audit --file apps/desktop/src-tauri/Cargo.lock` | no new advisory |
| Bindings/IPC/messages | `bun run bindings:generate && bun run bindings:check && bun run ipc:check && bun run messages:check` | exit 0 |
| Full | `bun run check` | exit 0 |
| Native (macOS) | `bun run tauri:dev` | see Steps 1 and 10 |

## Scope

**In scope**:
- `docs/adr/NNNN-formatted-selected-text-capture.md` (create); status note in `docs/adr/0010-bounded-copy-selection-fallback.md`
- `apps/desktop/src-tauri/Cargo.toml`, `Cargo.lock` (generated only)
- `apps/desktop/src-tauri/src/capture/{mod.rs,formatting.rs (create),coordinator.rs,model.rs}`
- `apps/desktop/src-tauri/src/capture/platform/macos/{mod.rs,pasteboard.rs}`
- `apps/desktop/src-tauri/src/ipc/{capture.rs,preferences.rs}`, `apps/desktop/src-tauri/src/lib.rs` (invoke list only)
- `apps/desktop/src-tauri/src/preferences/{mod.rs,model.rs}`
- `apps/desktop/src-tauri/tests/{capture_contract.rs,preferences_contract.rs}`
- generated bindings; `apps/desktop/src/lib/ipc/preferences-client.ts`
- `apps/desktop/src/features/preferences/{preferences-context.tsx,preferences-panel.tsx,preferences-panel.test.tsx}`
- Test fakes and fixtures that implement `NativePreferencesClient` or build `CaptureCapabilities`/`PreferencesSnapshot` literals (add the new members only; TypeScript will list them): `apps/desktop/src/components/shell.test.tsx`, `apps/desktop/src/features/notes/note-editor.test.tsx`, `apps/desktop/src/features/updates/update-context.test.tsx`
- `apps/desktop/messages/{en.json,fr.json}`
- `docs/PRIVACY.md`, `docs/PRODUCT.md`, `docs/UX.md`, `docs/ARCHITECTURE.md`, `docs/platform-support.md`, `docs/FEATURE_BACKLOG.md`, `README.md`, `AGENTS.md`

**Out of scope**:
- Triggering ADR 0010's Copy when direct AX already returned text, just to get
  formatting (would widen invariant 1 and clipboard exposure).
- AX attributed strings, RTF, WebArchive, images, or any second pasteboard
  item; only `public.html` of the new payload.
- Windows UIA formatting and X11 `text/html`/AT-SPI attributes (Step 1
  measures them; implementation is a later plan).
- `ClipboardComposer`, `Copy as Markdown`, the manual composer, Markdown
  preview, and Workspace storage format.
- Any network, resource fetching, CSS evaluation, or JavaScript.

## Git workflow

- Branch: `codex/062-formatted-capture`
- Commits: `docs(adr): allow bounded HTML formatting from the capture Copy fallback`,
  `feat(capture): convert bounded selection HTML to Markdown`,
  `feat(macos): read the fallback HTML representation when enabled`,
  `feat(preferences): add the formatted capture setting`,
  `docs: document formatted capture limits`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Decision gate — draft the ADR and get operator approval (no code)

`ls docs/adr`, take the next free number, create
`docs/adr/NNNN-formatted-selected-text-capture.md` (`Proposed — pending the
Step 1 spike`). Decision draft:
1. Opt-in, default off, labelled experimental, native preference.
2. When enabled, and only when ADR 0010's Copy fallback already ran, the macOS
   adapter may read one `public.html` representation (≤ 1 MiB) from the same
   transaction-owned change count, before restoration, in addition to the
   plain text. Nothing else on the pasteboard is read.
3. The HTML is converted in memory by a deterministic Rust converter with no
   network, no resource resolution, no script or style evaluation; images,
   media, forms, and embedded objects are dropped; links keep only `http`,
   `https`, and `mailto` destinations.
4. Content parity: the Markdown is used only if the letters and digits of
   the HTML's visible text nodes equal those of the plain text (case-
   insensitive). Otherwise — or on size, depth, node-count, time, encoding, or
   empty-result failure — the exact plain text is used, as today.
5. HTML and intermediate values never enter logs, errors, disk, IPC, or
   diagnostics; only the resulting Markdown body goes through the existing
   create-note action.
6. Direct-AX captures, Windows, X11, and Wayland remain plain text until
   separate evidence and a follow-up decision.
7. Amends ADR 0010 invariant 5 only; invariants 1-4, 6, 7 unchanged. Amends
   PRIVACY, PRODUCT, UX, ARCHITECTURE, AGENTS.

Operator questions (recommendation): approve ADR + spike [required]; opt-in
default off [yes]; `htmd` dependency (Apache-2.0) vs a hand-written subset
converter [decide after spike]; never trigger Copy for formatting [yes];
macOS fallback only for now [yes].

**Verify**: only the ADR file is new. **STOP and wait for the operator.**

### Step 1: Spike on a throwaway branch — go/no-go

Branch `spike/formatted-capture`; never merged. Instrumentation must be
content-free: print only booleans, counts, type **names**, byte sizes, and
durations with `eprintln!` behind `#[cfg(debug_assertions)]`.

1. macOS (`bun run tauri:dev`, the operator's own test text): in
   `capture_with_port`, after the stable change count, log the pasteboard
   type names of the new payload and the `public.html` byte size; in
   `acquire_hybrid`, log which path produced the body (direct AX / Copy
   fallback / none). Add a prototype `html_to_markdown` (Step 4 algorithm,
   `htmd` for conversion) and log `parity: bool`, `elapsed_us`, and whether
   the Markdown differs from the plain text. With the prototype enabled, the
   created Note body is the Markdown so the operator can judge fidelity
   inside Charon (their own Workspace; nothing leaves the machine).
   Sources: Chrome static page with a link, list, heading, and code block;
   Chrome textarea; Codex; another Electron app (Slack, VS Code, or
   Discord if installed); Safari page; Notes.app; TextEdit (rich); Terminal.
   Five selections per source minimum.
2. macOS AX probe (measurement only): for the direct-AX sources, whether
   `AXAttributedStringForTextMarkerRange` / `AXAttributedStringForRange`
   return a value (bool) — for a later decision.
3. Windows (optional, if hardware exists): in a throwaway probe, for the
   selection range, whether `UIA_FontWeightAttributeId`,
   `UIA_IsItalicAttributeId`, `UIA_StyleIdAttributeId` return a mixed
   sentinel or a value, and how many `TextUnit_Format` runs a typical
   selection has, in Edge, Chrome, Word, Notepad.
4. X11 (optional, no Charon code): with text selected, run
   `xclip -selection primary -t TARGETS -o` in Firefox, Chromium, gedit,
   LibreOffice Writer; record whether `text/html` is offered.
5. Record `cargo tree -i htmd`, new crates, license of each new crate,
   `cargo audit`, MSRV compatibility with 1.91.0, and release size delta.

Go criteria (all): on macOS the Copy-fallback path offers `public.html` for
at least two of Chrome static pages, Codex, or another Electron app; parity
passes on ≥ 80 % of those selections; p95 conversion < 20 ms at the 1 MiB
cap; the operator judges the Markdown better than plain text on most
samples; no new crate has a copyleft license or an open advisory.

**Verify**: report the table and recommendation; **STOP and wait**. No-go →
`BLOCKED: spike no-go (<reason>)`. Delete the spike branch either way.

### Step 2: Accept the ADR with evidence

Status `Accepted on <date> by operator decision`; add the spike table;
record the converter choice. Add to ADR 0010 `## Status`: "ADR NNNN amends
invariant 5 for an opt-in bounded HTML read on macOS."

**Verify**: `grep -n "Accepted on" docs/adr/NNNN-formatted-selected-text-capture.md` → 1.

### Step 3: Dependency

Add `htmd = "=0.5.5"` (or the exact version validated) to `[dependencies]`,
run the lockfile refresh, then add `html5ever` and `markup5ever_rcdom` as
direct dependencies pinned with `=` to the exact versions `Cargo.lock` now
contains (they are needed for the parity walk). If the operator chose a
hand-written converter, add only `html5ever` and `markup5ever_rcdom`.

**Verify**: `cargo check` → exit 0; `git diff --stat apps/desktop/src-tauri/Cargo.lock`
adds only the crates recorded in the spike; `cargo audit` → no new advisory.

### Step 4: Pure converter `capture/formatting.rs`

Declare `pub mod formatting;` in `capture/mod.rs` (public so it is not dead
code on Windows/Linux, where it is not called yet). No I/O, no logging.

```rust
pub const MAX_HTML_BYTES: usize = 1024 * 1024;
pub const MAX_DOM_NODES: usize = 20_000;
pub const MAX_DOM_DEPTH: usize = 128;
pub const MAX_CONVERSION: std::time::Duration = std::time::Duration::from_millis(50);
const DROPPED_TAGS: &[&str] = &["script", "style", "template", "noscript", "head",
    "title", "img", "picture", "svg", "math", "iframe", "object", "embed",
    "video", "audio", "canvas", "form", "input", "button", "select", "textarea"];

/// Returns Markdown only when every bound and the parity check pass.
pub fn html_to_markdown(html: &[u8], plain: &str) -> Option<String>;
```

Algorithm:
1. `html.len() <= MAX_HTML_BYTES`, `std::str::from_utf8(html)` succeeds
   (strict; no lossy decoding), start an `Instant`.
2. Parse with `html5ever::parse_document(markup5ever_rcdom::RcDom::default(), Default::default())`.
   Walk iteratively (explicit stack, no recursion): abort (`None`) above
   `MAX_DOM_NODES` nodes or `MAX_DOM_DEPTH` depth; collect text of text
   nodes not inside a `DROPPED_TAGS` element.
3. Parity: `fingerprint(collected) == fingerprint(plain)` where
   `fingerprint(s) = s.chars().filter(|c| c.is_alphanumeric()).flat_map(char::to_lowercase).collect::<String>()`.
   Mismatch → `None` (this rejects hidden text and content the user did not
   see).
4. Convert with a converter built once in a `std::sync::OnceLock`:
   skip `DROPPED_TAGS`; an `a` handler that emits `[text](href)` only when
   the trimmed, lowercased `href` starts with `http://`, `https://`, or
   `mailto:`, else the text alone; ATX headings.
5. Post-conditions: trim trailing whitespace; `None` if blank, if longer
   than `4 * MAX_HTML_BYTES`, or if `elapsed > MAX_CONVERSION`.

Unit tests in the same file (all platforms), each with an explicit `plain`
argument matching what a browser would put in `text/plain`:
- `<p><b>bold</b> and <i>it</i></p>` / `bold and it` → contains `**bold**`
  and `it` wrapped in `*` or `_`;
- link `https://example.test/a` kept; `javascript:alert(1)` and
  `data:` hrefs removed (output has no `javascript:`/`data:`) but the link
  text stays;
- `<ul><li>a</li><li>b</li></ul>` / `a\nb` → two list items;
  `<h2>T</h2>` → `## T`; `<pre><code>x = 1</code></pre>` → fenced code;
  a two-row table → a Markdown table (or plain if the converter does not
  support it — assert the actual chosen behaviour);
- hidden text `<span style="display:none">secret</span>` absent from `plain`
  → `None`; `<script>var s='x'</script>` never appears and does not break
  parity; `<img alt="alt">` dropped;
- unknown inline tags (`<u>`, `<span>`, `<mark>`) keep their text without raw
  HTML (assert no `<u>`/`<span` in output);
- `text-transform`-style case difference (`HELLO` vs `hello`) passes parity;
- invalid UTF-8, `MAX_HTML_BYTES + 1` bytes, 200 nested `<div>`s, and
  whitespace-only HTML → `None`.

**Verify**: focused Rust command → pass on the executor's OS; clippy clean.

### Step 5: macOS pasteboard read (only inside the existing transaction)

In `pasteboard.rs`:
- Add to `PasteboardPort`: `fn read_html(&mut self) -> Option<Vec<u8>>;`.
  `SystemPasteboardPort::read_html`: `self.pasteboard.dataForType(unsafe { NSPasteboardTypeHTML })`,
  return `None` when absent or `len() > formatting::MAX_HTML_BYTES`, else
  `Some(data.to_vec())` (SAFETY comment as for `NSPasteboardTypeString`).
- `capture_selection(source_process_id: i32, rich: bool)` and
  `capture_with_port(port, source_process_id, rich)`. Replace the tail shown
  in Current state with:

```rust
    let body = port.read_string().filter(|value| !value.trim().is_empty());
    let html = if rich && body.is_some() { port.read_html() } else { None };
    let html = html.filter(|_| port.change_count() == stable_count);
    let warning = match port.restore_if_unchanged(stable_count, &snapshot) {
        RestoreOutcome::Restored => None,
        RestoreOutcome::Changed | RestoreOutcome::Failed => {
            Some(CaptureWarning::ClipboardNotRestored)
        }
    };
    // Conversion runs after restoration so the clipboard exposure window does not grow.
    let body = body.map(|plain| {
        html.as_deref()
            .and_then(|html| crate::capture::formatting::html_to_markdown(html, &plain))
            .unwrap_or(plain)
    });
    CapturedSelection { body, warning }
```

- Tests (extend `FakePasteboardPort` with an `html: Option<Vec<u8>>` delivered
  with the scheduled selection and an `html_reads` counter):
  `rich = false` never calls `read_html` (counter 0) and returns the exact
  plain body; `rich = true` with matching HTML returns Markdown and still
  restores the snapshot; HTML whose parity fails returns the exact plain
  body; a concurrent change between `read_html` and restore discards the HTML
  and keeps today's warning behaviour; oversized HTML is ignored. Update every
  existing call of `capture_with_port`/`capture` helper to pass `false`.

**Verify**: Rust command → exit 0 on macOS (these tests only compile there);
also run clippy on Linux via CI later.

### Step 6: Adapter, coordinator, capability

- `PlatformCapturePort` (`coordinator.rs:25-38`): add default methods
  `fn set_rich_capture(&mut self, _enabled: bool) {}` and
  `fn rich_capture_state(&self) -> CapabilityState { CapabilityState::Unsupported }`.
- `MacosCaptureAdapter`: field `rich: bool`; override both
  (`Experimental` on macOS); pass `self.rich` to `pasteboard::capture_selection`
  inside `selected_text` (`mod.rs:87-91`). Direct AX unchanged.
- `CaptureCoordinator::set_rich_capture(&mut self, enabled: bool)` forwards;
  `refresh_platform_states` sets `capabilities.rich_capture = platform.rich_capture_state()`.
- `CaptureCapabilities` gains `rich_capture: CapabilityState`; update the
  serialization test and bindings; the Wayland/Windows/X11 tests assert
  `Unsupported`.
- `tests/capture_contract.rs`: add `rich: bool` to `FakePlatformState`
  (initialise `false` in `coordinator_on`) and override `set_rich_capture` in
  `FakePlatform` to record it; test that `set_rich_capture(true)` reaches the
  platform and never triggers a read by itself.

**Verify**: Rust command → exit 0; `bun run bindings:generate && bun run bindings:check` → exit 0.

### Step 7: Preference and IPC

- `preferences/model.rs`: `#[serde(default)] pub rich_capture: bool` (default
  `false`) on `PersistedPreferences` and in `PreferencesSnapshot`;
  `preferences/mod.rs` `set_rich_capture(root, enabled)`; test that an old
  file loads `false`.
- `ipc/capture.rs` `initialize`: after creating the coordinator, apply
  `read_persisted(app).map(|p| p.rich_capture).unwrap_or(false)` with
  `set_rich_capture` before `initialize()`.
- `ipc/preferences.rs`: `preferences_set_rich_capture(app, enabled: bool) -> Result<PreferencesSnapshot, PreferencesIpcError>`:
  persist, then `app.state::<CaptureRuntime>()` → coordinator
  `set_rich_capture(enabled)` (expose a small `pub(crate) fn apply_rich_capture(app, enabled)`
  in `ipc/capture.rs` rather than reaching into its private fields).
- Register the command in `lib.rs`; add `setRichCapture(enabled)` to
  `preferences-client.ts` and the test fakes.

**Verify**: `bun run ipc:check` → exit 0; Rust command → exit 0.

### Step 8: Preferences toggle (macOS only)

In the Capture section, when `native.capabilities?.richCapture` is not
`'unsupported'`: an `aria-pressed` toggle modelled on the updates toggle
(`preferences-panel.tsx:370-378`), the `Experimental` state label, and a
persistent description (not Tooltip-only). Pending + error via the context's
pattern (`preferences-context.tsx:101-114`).

Copy (EN / FR):
`preferences_rich_capture` "Keep formatting" / "Conserver la mise en forme";
`preferences_rich_capture_description` "When double Shift has to use the app’s Copy command, Charon also reads the formatted copy and turns links, lists, headings, and emphasis into Markdown. If the formatted copy does not match the plain text exactly, Charon keeps plain text. Nothing else is read or stored." / "Quand le double Maj doit utiliser la commande Copier de l’application, Charon lit aussi la copie mise en forme et convertit liens, listes, titres et emphase en Markdown. Si elle ne correspond pas exactement au texte brut, Charon garde le texte brut. Rien d’autre n’est lu ni conservé.";
`preferences_rich_capture_enable` / `_disable` "Turn on" / "Turn off", "Activer" / "Désactiver".

Tests: hidden on Windows/Linux capabilities; toggle calls the client and
reflects `aria-pressed`; error keeps it off.

**Verify**: `bun run --cwd apps/desktop test -- src/features/preferences` → pass; `bun run messages:check` → exit 0.

### Step 9: Contracts and documentation

- `docs/PRIVACY.md` "Selected-text capture clipboard behavior": add "When the
  optional formatted capture is on, the same bounded transaction also reads
  the HTML representation the source just produced (at most 1 MiB) and
  converts it to Markdown in memory; it is discarded afterwards and never
  logged or stored except as the resulting Note body."
- `docs/PRODUCT.md` "### Selected-text capture": one sentence (opt-in, macOS
  fallback path only, plain-text fallback).
- `docs/UX.md`: Preferences contents and Capture help mention the setting.
- `docs/ARCHITECTURE.md` "### CaptureCoordinator": the converter is a pure
  capture-owned function; `ClipboardComposer` is unchanged.
- `docs/platform-support.md`: macOS row notes the experimental formatted
  path; Windows/X11 spike findings as "not implemented".
- `AGENTS.md`: extend the ADR 0010 sentence with "and, when the user opts in,
  one bounded HTML read converted to Markdown under ADR NNNN".
- `docs/FEATURE_BACKLOG.md` and `README.md`.

**Verify**: `grep -n "formatted capture\|HTML representation" docs/PRIVACY.md` → ≥ 1; `bun run check` → exit 0.

### Step 10: Native smoke (macOS)

Setting off: every source behaves exactly as before (plain bodies). Setting
on: Chrome static page with link/list/heading/code → Markdown Note; Chrome
textarea and TextEdit → plain (direct AX); a selection containing hidden
text → plain; the clipboard is restored exactly as before (copy something,
capture, paste elsewhere); a concurrent copy during capture keeps today's
content-free warning. Record results; delete
`apps/desktop/src-tauri/target/debug` afterwards.

## Test plan

- Rust (all OSes): `capture/formatting.rs` unit tests; coordinator
  forwarding test; preferences default test; bindings serialization test.
- Rust (macOS): `pasteboard.rs` rich/plain/parity/concurrency tests.
- TypeScript: `preferences-panel.test.tsx`.
- Structural patterns: `pasteboard.rs` test module (`FakePasteboardPort`),
  `tests/capture_contract.rs` fakes.

## Done criteria

- [ ] ADR accepted with spike evidence; ADR 0010 status note added
- [ ] Rust fmt/clippy/test exit 0 (macOS locally, Linux/Windows in Quality)
- [ ] `bun run check`, `bindings:check`, `ipc:check`, `messages:check` exit 0
- [ ] `grep -n "read_html" apps/desktop/src-tauri/src/capture/platform/macos/pasteboard.rs` shows the call guarded by `rich`
- [ ] `grep -rn "NSPasteboardTypeRTF\|eprintln" apps/desktop/src-tauri/src/capture` → 0
- [ ] No new copyleft crate (`cargo tree` + license check recorded in the PR)
- [ ] Step 10 recorded
- [ ] `plans/README.md` status row updated

## STOP conditions

- The operator has not approved Step 0 or the Step 1 go/no-go.
- `pasteboard.rs` or `accessibility.rs` differ from the excerpts beyond line
  shifts.
- The only way to get formatting would read another pasteboard type, a second
  item, trigger Copy when direct AX succeeded, or keep HTML after the
  transaction.
- The converter needs network, file access, or cannot be bounded (node count,
  depth, size, time).
- A chosen crate has a copyleft license, an open advisory, or requires a Rust
  version above 1.91.0.

## Maintenance notes

- The parity check deliberately prefers plain text over risky Markdown; if
  users report too many plain fallbacks for a source, adjust the fingerprint
  rule only with new tests and an ADR note.
- Windows UIA attribute runs and X11 `text/html` (spike rows) are candidates
  for a follow-up plan; each needs its own bounds and a decision because
  neither goes through ADR 0010's Copy.
- Reviewer: confirm the HTML read happens only when `rich` is true, only on
  the fallback path, before restoration, and that nothing derived from the
  HTML is logged or returned on failure.
