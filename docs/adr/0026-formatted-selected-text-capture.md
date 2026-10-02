# ADR 0026: Formatted selected-text capture from the Copy fallback's HTML

## Status

Accepted on 2026-10-02 (operator asked to complete the plan queue); native
spike evidence pending operator verification. Amends ADR 0010 invariant 5 only,
for one opt-in, bounded HTML read on macOS; ADR 0010 invariants 1-4, 6, and 7
are unchanged. Amends `docs/PRIVACY.md`, `docs/PRODUCT.md`, `docs/UX.md`,
`docs/ARCHITECTURE.md`, `docs/platform-support.md`, `AGENTS.md`, and
`README.md`.

## Context

Captured Notes are plain text, so links, lists, headings, emphasis, tables,
and code blocks selected in a web page or an Electron app arrive flattened, and
an agent reading `Copy as Markdown` loses structure the user saw.
`docs/FEATURE_BACKLOG.md` asks to keep formatting where a source exposes it,
with plain text as the deterministic fallback, no extra content read, no
network, and bounded access.

On macOS, ADR 0010's Copy fallback already asks the source application to
write its normal clipboard payload. Chromium and Electron write the selection's
markup as an HTML representation next to the plain string, but invariant 5 lets
Charon read only the text representation. Direct Accessibility reads
(ADR 0009) return plain strings, Windows reads a plain UI Automation range, and
X11 converts `PRIMARY` to `UTF8_STRING` only.

## Decision

1. **Opt-in, default off, macOS only.** Preferences offers "Keep formatting",
   labelled Experimental, stored per machine in native preferences as
   `richCapture` (schema v1, `#[serde(default)]`). `CaptureCapabilities`
   reports `richCapture`: `experimental` from the macOS adapter, `unsupported`
   from every other adapter, where Preferences shows nothing. The command
   `preferences_set_rich_capture(enabled)` persists the choice, then applies it
   to the running adapter; capture start applies the stored choice before
   `initialize`, and resetting preferences turns it off.
2. **One read inside the existing transaction.** When enabled, and only when
   ADR 0010's Copy fallback already ran and produced a non-blank plain string,
   the macOS adapter reads the `public.html` representation once: from a
   single-item payload only (so it describes the same selection as the
   string), at most 1 MiB, after the string and before restoration. AppKit
   hands over a representation before its length is known (as for ADR 0010's
   snapshot), so a larger one is discarded unparsed. It keeps the HTML only if
   the pasteboard still has the transaction-owned change count; a later write
   discards it and keeps ADR 0010's warning behaviour. No
   other type (RTF, WebArchive, images), item, or Accessibility attributed
   string is read. Formatting never triggers a Copy, never runs when direct
   Accessibility returned text, and never extends a timeout.
3. **Pure, capture-owned conversion after restoration.** `capture::formatting`
   converts in memory after the pasteboard is restored, so the clipboard
   exposure window does not grow. It performs no I/O, never resolves or
   fetches a URL, and never evaluates scripts or stylesheets. It parses with
   html5ever's spec-compliant tree builder into a flat arena that keeps only
   the attributes it reads, then writes Markdown:
   - ATX headings, `**strong**`, `*emphasis*`, `~~strike-through~~`, inline
     code and fenced code blocks (fences longer than any backtick run inside),
     `-` and numbered lists (honouring `start`), block quotes, `---`, `\` hard
     line breaks, and simple GFM tables (every row the same number of cells,
     no spans, inline cells only; the header row comes from `th` cells or is
     left empty). Any other table keeps the whole capture plain.
   - Dropped with everything inside: `head`, `title`, `script`, `style`,
     `template`, `noscript`, `noembed`, `noframes`, `iframe`, `object`,
     `embed`, `video`, `audio`, `canvas`, `svg`, `math`, form controls whose
     shown value is not their text (`input`, `select`, `option`, `optgroup`,
     `datalist`, `textarea`), `progress`, `meter`, and any element with the
     `hidden` attribute. A form and a button keep their visible text.
   - Images become their `alt` text only, as in Chromium's own plain copy;
     no image syntax, source, or URL is written.
   - Links keep only `http`, `https`, and `mailto` destinations of at most
     2048 bytes without whitespace, control characters, `<`, `>`, `\`, or
     backtick; anything else keeps the link text alone.
   - Selected text that Markdown would interpret (`\`, `` ` ``, `*`, `_`,
     `[`, `]`, `<`, `~`, an entity-like `&`, `|` in a table, `#` in a heading,
     and block markers at the start of a line) is escaped.
   - Strong and emphasis elements whose inline `style` mentions `font-weight`
     or `font-style` stay plain spans: Google Docs, for one, wraps whole copies
     in a non-bold `<b>`. This reads an attribute; it evaluates no CSS.
4. **Bounds.** Strict UTF-8 input of at most 1 MiB; at most 20,000 nodes and
   128 levels of nesting (checked between 4 KiB parser chunks, which also
   bounds html5ever's depth-linear scope scans); at most 4 MiB of Markdown;
   50 ms for parsing and rendering (checked between chunks and every 256
   steps). Every walk uses an explicit stack, the tree is one flat arena, and
   a panic inside the converter is caught and keeps the plain text.
5. **Parity, or the exact plain text.** The Markdown replaces the plain text
   only when (a) the letters and digits it writes as text, lowercased, are
   exactly those of the plain text in order; (b) between every two of them,
   both sides agree on whether they are joined, separated, or on different
   lines; and (c) it adds at least one formatting construct. Otherwise, and on
   any bound, invalid encoding, unsupported table, or empty result, the exact
   plain body is kept as today. This is stricter than the plan's first draft
   (letters and digits only): CSS `pre-wrap` text or styled blocks can share
   every letter with the plain text yet differ in words or lines, and hidden
   or unseen text changes the letters.
6. **Content-free.** The HTML and every intermediate value stay in memory for
   the duration of one capture and never enter logs, errors, disk, IPC,
   notifications, or diagnostics; the only output is the Note body through the
   existing typed create-note action. html5ever emits `log` trace records that
   can include parsed characters; Charon installs no `log` logger, so the
   facade discards them before formatting anything. Adding a logger requires
   revisiting this decision.
7. Direct-Accessibility captures, Windows, X11, and Wayland remain plain text.
   The research notes below describe what a later decision would need.

## Converter choice

Charon uses its own small converter on `html5ever` `=0.38.0` (Servo project,
MIT OR Apache-2.0, MSRV 1.71). html5ever was already in `Cargo.lock` through
`tauri-utils` (build time only); adding it as a runtime dependency added one
dependency edge and no new package. The alternatives were weaker:

- `htmd` 0.5.x (Apache-2.0, turndown-inspired) adds `htmd` and
  `markup5ever_rcdom` (neither in the lockfile), walks an `Rc` tree
  recursively, and would still need custom handlers for links and images.
- `dom_query` 0.27 (MIT, already in the lockfile) has a Markdown serializer
  that copies `href` and `src` verbatim (including `javascript:` and `data:`),
  writes raw `<br>` inside tables, recurses through nested lists and quotes,
  and links its CSS selector engine into the runtime.
- `html2md` is GPL-3.0.

Runtime crates html5ever brings, all permissive: `html5ever`, `markup5ever`,
`web_atoms`, `tendril`, `string_cache`, `log`, `smallvec` (MIT OR Apache-2.0);
`phf`, `phf_shared`, `precomputed-hash`, `new_debug_unreachable` (MIT);
`siphasher` (MIT/Apache-2.0); `parking_lot` and its dependencies (MIT OR
Apache-2.0). `cargo audit` reports no vulnerability (574 crates; only the seven
pre-existing unmaintained or unsound warnings on GTK and build-time crates).

**Release-size impact (estimate).** A scratch binary built with Charon's
release profile (`codegen-units = 1`, LTO, `opt-level = "s"`, `strip`) on
`aarch64-apple-darwin` grows by 595,632 bytes (about 0.57 MiB) when it calls
the converter. That is an upper bound for the macOS binary, which may already
link some shared code such as `log`. Windows and Linux compile the module but
never call it, so LTO should drop it there; neither was measured.

## Spike evidence

Observed on the operator's Apple Silicon Mac (macOS 26.6.2) in the working
tree, without `tauri build`, without system permission prompts, without
reading or changing the operator's clipboard, and without writing the
operator's preferences:

| Check | Result |
| --- | --- |
| Lockfile and toolchain | `cargo check` added only the `html5ever` edge under `charon-desktop`; no new package. Built and tested with rustc 1.91.0, the declared MSRV; html5ever's tree requires at most 1.71 |
| AppKit API | `NSPasteboardTypeHTML`, `pasteboardItems`, and `NSPasteboardItem::dataForType` come from `objc2-app-kit` 0.3.2's already enabled `NSPasteboard` feature and compile inside the existing transaction |
| Conversion time (release profile, this Mac, synthetic Chromium-style clipboard markup with `<meta charset>` and inline styles) | p95 0.5 ms at 8 KB, 2.2 ms at 64 KB, 8.4 ms at 256 KB; at the 1 MiB cap 11.2 ms (text-heavy) and 11.3 ms (one code block); a 1 MB page beyond 20,000 nodes is rejected in 4.2 ms. Hostile 1 MB shapes: 200,000 entities 35 ms (the worst), 30,000 links 8.6 ms, 100,000 nested `<div>` 2.0 ms; all others under 7 ms |
| Transaction (unit tests with a fake pasteboard) | With the setting off, HTML is never read. With it on, HTML is read once, after the string and before restoration, and converted after restoration; failed parity, missing HTML, and oversized HTML keep the exact plain body; a write after the HTML read discards it and keeps the content-free warning; no HTML is read without a new non-blank string |
| Converter (22 unit and property-style tests) | 400 generated documents with known visible text convert when they contain formatting and keep every letter and digit; 600 hostile tag-soup inputs (unbalanced, misnested, foreign content, `javascript:`/`data:` links, text inside dropped elements) never leak dropped text or unsafe destinations, are deterministic, and never panic, including under an 8-node budget; 11 pathological shapes up to 1 MB stay within every bound |
| Real Copy payloads: whether `public.html` is offered by Chrome static pages, Codex, another Electron app, Safari, Notes, TextEdit, and Terminal; how often parity passes; whether the Markdown is better than plain text | not tested: real captures need Input Monitoring and Accessibility grants and selections in those apps, and reading a test copy would replace the operator's clipboard (operator to verify) |
| macOS Accessibility attributed-string probe (`AXAttributedStringForTextMarkerRange`, `AXAttributedStringForRange`) | not tested: measurement for a later decision (operator to verify) |
| Windows UI Automation formatting attributes | not tested: no Windows hardware; research only |
| X11 `text/html` on `PRIMARY` | not tested: no Linux machine; research only |
| Size in a real `tauri build` | not measured (no `tauri build` in this session); the scratch estimate above stands |

**Research notes (no behaviour change).** Windows: the adapter never
synthesizes Copy, so formatting would come from UI Automation text attribute
runs (`UIA_FontWeightAttributeId`, `UIA_IsItalicAttributeId`,
`UIA_StyleIdAttributeId`, with the mixed-attribute sentinel) over the
selection, which needs its own bounds on runs and time. X11: Chromium and
Firefox may offer `text/html` on `PRIMARY`; the adapter would need to request
it from the same owner it already verifies, with the same size and time
bounds. Neither goes through ADR 0010's Copy, so each needs its own decision.

## Consequences

- `CaptureCapabilities` gains `richCapture`; `PreferencesSnapshot` gains
  `richCapture`; the app manifest, capability, and `generate_handler!` gain
  `preferences_set_rich_capture` (21 custom commands).
- The macOS binary grows by about 0.57 MiB at most.
- Conservative parity means some sources keep plain text: for example a
  source whose plain copy numbers ordered lists, omits image alternative text,
  or lays out lines through CSS.
- Debug builds parse several times slower; large selections in `tauri dev` may
  exceed the time bound and keep plain text, which release builds would not.
- The clipboard exposure is unchanged: clipboard managers could already
  observe the HTML the source wrote during ADR 0010's transaction; Charon only
  reads it too.
- As with ADRs 0023-0025, a manual downgrade to a build without the field
  treats the preferences file as corrupt, backs it up, and falls back to
  defaults; the updater never downgrades.

## Revisit when

- The operator's native checks contradict a row above, or users report too
  many plain fallbacks for a source (adjust the parity rule only with new tests
  and a note here).
- macOS changes synthetic Copy or pasteboard read behaviour (ADR 0010).
- A later plan adds Accessibility attributed strings, Windows attribute runs,
  or X11 `text/html`; each needs its own bounds and decision.
- A `log` logger or any diagnostics sink is added to the desktop app.
