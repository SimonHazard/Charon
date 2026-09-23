# Plan 058: Make the Markdown help show exactly what the safe Preview renders

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src/features/notes/markdown-help.tsx apps/desktop/src/features/notes/markdown-help.test.tsx apps/desktop/src/features/notes/note-preview.tsx apps/desktop/src/features/notes/note-preview.test.tsx apps/desktop/messages apps/desktop/src/styles/app.css apps/desktop/e2e/release.spec.ts docs/UX.md && git status --short -- apps/desktop/src/features/notes apps/desktop/messages apps/desktop/src/styles/app.css apps/desktop/e2e docs/UX.md`
> (without `..HEAD` the diff includes uncommitted edits). Plans 040-051 land
> first and edit `app.css`, the message catalogs, `release.spec.ts` and
> `docs/UX.md`; Plan "Tooltips" (B), if it landed first, wraps the compact
> trigger in `markdown-help.tsx` in a Tooltip. That is expected drift. Compare
> the "Current state" excerpts against the live code by symbol and quoted
> text; any other mismatch is a STOP condition. If an in-scope file has
> uncommitted changes you did not make, STOP until they are committed.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none. Best after 044 (multi-line composer), which makes the line-break guidance matter more.
- **Category**: bug (docs in UI)
- **Planned at**: commit `242d51e` plus the working tree of 2026-09-23 (backlog item "Améliorer le cheat sheet Markdown")

## Why this matters

The Markdown help shipped in v0.1.1 lists syntax without saying what the
Preview does with it. Its emphasis example puts three syntaxes on one line
joined by `·`, so copying it inserts middots into a Note. It never says that
a single line break joins lines in Preview, that links are not clickable, or
that HTML shows as text. And the Preview hides text in one real case: a Note
whose first line is `---` loses everything up to the next `---`, because the
renderer treats it as front matter. After this plan every example is
copyable, localized, verified by a test against the real Preview, and the
unsupported syntax is named.

## Current state

- `apps/desktop/src/features/notes/markdown-help.tsx:13-65` `MarkdownHelp({ compact })`:

```tsx
  const examples = [
    [m.markdown_help_heading(), `# ${word}\n## ${word}`],
    [m.markdown_help_emphasis(), `**${word}** · *${word}* · ~~${word}~~`],
    [m.markdown_help_list(), `- ${item}\n\n1. ${item}`],
    [m.markdown_help_task(), `- [ ] ${item}\n- [x] ${item}`],
    [m.markdown_help_quote(), `> ${word}`],
    [m.markdown_help_code(), `\`${word}\`\n\n\`\`\`\n${word}\n\`\`\``],
    [m.markdown_help_table(), `| ${column} | ${column} |\n| --- | --- |\n| ${word} | ${word} |`],
    [m.markdown_help_link(), `[${word}](notes.md)`],
  ];
```

  It renders a Base UI `Popover` (`PopoverContent className="markdown-help"`,
  whose `onKeyDown` stops Escape from reaching the editor), a `<dl>` of
  `<dt>`/`<dd><pre><code>` pairs and a final `<p>{m.markdown_help_local()}</p>`.
  It is mounted twice: compact (icon-only) beside Write/Preview in
  `note-editor.tsx`, and with visible text inside the Help popover in
  `shelf-chrome.tsx` `ShelfActions`.
- `apps/desktop/src/features/notes/note-preview.tsx` is the safe Preview:

```tsx
const components = {
  h1: ({ children }) => <h2>{children}</h2>,
  … h2→h3, h3→h4, h4→h5, h5→h6, h6→h6 …
  a: ({ children, href }) => (<span className="note-preview-link">{children}{href ? <> (<span>{href}</span>)</> : null}</span>),
  // Never create an image element: even a remote src must not reach the browser loader.
  img: ({ alt }) => <span className="note-preview-image">{alt}</span>,
  input: function Task({ checked }) { … disabled checkbox with m.markdown_task_done/open … },
} satisfies MarkdownComponents;
…
      <Markdown allowHtml={false} components={components}>
        {body}
      </Markdown>
```

- What `@tanstack/markdown` 0.0.15 (`parseMarkdown`) really does with
  `allowHtml: false`, verified by running its parser and React renderer at
  `242d51e`:
  - Renders: ATX headings `#`-`######` **with a space after `#`** (`#Title`
    stays text; no `===`/`---` underline headings); `**`/`__` strong,
    `*`/`_` emphasis, `~~`/`~` strikethrough; `-`/`*`/`+` and `1.`/`1)` lists,
    nested by indenting two spaces under a `- ` item; `- [ ]`/`- [x]` tasks
    (disabled checkboxes); `>` quotes; inline and fenced code (no highlighting;
    4-space indented code is **not** code); GFM pipe tables with alignment;
    `---`/`***`/`___` rules; a line ending in `\` is a line break (`<br>`).
  - A single newline inside a paragraph stays a `\n` text node, which the
    Preview CSS collapses to a space: the two lines join. Two trailing
    spaces do **not** make a break (lines are trimmed).
  - Links `[t](u)` and reference links go through the `a` override: text then
    ` (u)`, not clickable. `javascript:` destinations are dropped to text. No
    autolinks (`<https://…>` and bare URLs stay text).
  - Images go through the `img` override: alternative text only.
  - HTML (`<b>x</b>`) is kept as literal text.
  - **Front matter is on by default**: `'---\nHidden text\n---\nVisible'`
    renders only `Visible`. With `frontmatter: false` it renders
    `<hr/><p>Hidden text</p><hr/><p>Visible</p>`. `Markdown` forwards every
    prop except `children` to `parseMarkdown`, and `MarkdownProps` accepts
    `frontmatter?: boolean`.
  - Footnotes (`[^1]` + `[^1]: …`) render badly: through the `a` override the
    marker reads `1 (#user-content-fn-1)`, and the library's sr-only
    `<h2>Footnotes</h2>` goes through the `h2` override and becomes a visible
    English `<h3>Footnotes</h3>`. Not fixed here (operator decision); not
    documented in the help.
  - Heading ids: the library adds slug `id`s, but the `h1`-`h6` overrides drop
    them, so the Preview mints no ids from Note text. Keep it that way.
- Tests today: `note-preview.test.tsx` (two cases: heading depth/lists/tasks;
  rich syntax without HTML or resource elements). `note-editor.test.tsx`
  "opens Markdown help without editing the draft and Escape closes only the
  help" (focus returns to the trigger). `release.spec.ts` "Markdown help
  preserves the editor and safe Preview makes no resource requests" (around
  line 716; opens help from the editor and from Help, Escape closes only the
  nested help, but does not assert focus in the Help case).
- CSS (`app.css`): `.markdown-help { width: min(24rem, …); max-height: …; overflow: auto; background: var(--material-transient-solid); }`,
  `.markdown-help dl/dt/dd/pre` and `.markdown-help > p { color: var(--text-muted); font-size: 0.75rem; }`.
  `.markdown-help pre` uses `white-space: pre-wrap`. No `user-select: none`
  applies, so examples are selectable.
- Messages (en): `markdown_help_title` "Markdown help",
  `markdown_help_description` "Use these examples in Write, then switch to
  Preview.", `markdown_help_heading` "Heading", `markdown_help_emphasis`
  "Bold, italic, and strikethrough", `markdown_help_list` "Lists",
  `markdown_help_task` "Tasks", `markdown_help_quote` "Quote",
  `markdown_help_code` "Code", `markdown_help_table` "Table",
  `markdown_help_link` "Link", `markdown_help_word` "Text",
  `markdown_help_item` "Item", `markdown_help_column` "Column",
  `markdown_help_local` "Links display their destination. Images display only
  their alternative text; no content is loaded." French equivalents exist
  with `’` and U+00A0 before `;` (`messages.test.ts` rejects a plain space
  before `? ! ; :`).
- Contract (`docs/UX.md`, Editor expansion and enrichment): "Safe Preview uses
  TanStack Markdown for headings, emphasis, strikethrough, lists, read-only
  tasks, quotes, code, and tables. Raw HTML stays disabled; links show their
  destination as inert text and images show only alternative text, without
  resource requests or Attachment reads. Markdown help beside Write/Preview and
  in general Help shows localized syntax examples without changing the draft.
  Escape closes help first and restores its trigger focus."
- Backlog constraints: the help must not change the draft, make a network
  request, or present syntax the Preview does not render safely.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit (focused) | `bun run --cwd apps/desktop test -- src/features/notes` | pass |
| Full | `bun run check` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |
| Visual | `bun run dev:desktop`, open `http://127.0.0.1:1420/?fixture=demo`, EN and FR, 400×480 | manual check |

## Scope

**In scope** (the only files you should modify):
- `apps/desktop/src/features/notes/markdown-help.tsx`
- `apps/desktop/src/features/notes/markdown-help.test.tsx` (create)
- `apps/desktop/src/features/notes/note-preview.tsx` (one prop)
- `apps/desktop/src/features/notes/note-preview.test.tsx`
- `apps/desktop/messages/en.json`, `apps/desktop/messages/fr.json`
- `apps/desktop/src/styles/app.css` (`.markdown-help` rules only)
- `apps/desktop/e2e/release.spec.ts` (the existing Markdown help test)
- `docs/UX.md` (the paragraph quoted above)

**Out of scope**:
- Copy buttons or "insert into draft" actions: the help must not write the
  clipboard or the draft (clipboard writes belong to `ClipboardComposer`).
  Examples stay selectable text.
- A live rendered result next to each example (possible follow-up; the
  parity test below already guarantees the sources render as described).
- Footnote rendering, syntax highlighting, autolinks, clickable links, and any
  new Markdown extension.
- The trigger markup (Plan 056 owns its Tooltip) and the popover's placement.

## Git workflow

- Branch: `codex/058-markdown-help`
- Commits (conventional, as in `git log`):
  `fix(notes): never hide a leading rule as front matter in preview`,
  `feat(notes): match the Markdown help to the safe preview`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Preview renders the whole Note

In `note-preview.tsx`, pass `frontmatter={false}`:

```tsx
      <Markdown allowHtml={false} components={components} frontmatter={false}>
```

Add to `note-preview.test.tsx` a case "shows text between leading rules
instead of hiding it as front matter": body `'---\nKept text\n---\nAfter'` →
`screen.getByText('Kept text')` exists and `container.querySelectorAll('hr')`
has length 2. Add a second assertion to the existing heading case:
`container.querySelector('[id]')` is `null` (headings mint no ids).

**Verify**: `bun run --cwd apps/desktop test -- src/features/notes/note-preview.test.tsx` → pass (3 cases).

### Step 2: Messages

Keep the existing keys. Change `markdown_help_local` and add the new keys
(en / fr; French uses `’` and U+00A0 before `;`):

| Key | en | fr |
|---|---|---|
| `markdown_help_local` (changed) | Preview makes no network request and never opens files. | L’aperçu n’effectue aucune requête réseau et n’ouvre jamais de fichier. |
| `markdown_help_heading_hint` | Leave a space after #. | Laissez un espace après #. |
| `markdown_help_breaks` | Line breaks and paragraphs | Retours à la ligne et paragraphes |
| `markdown_help_breaks_hint` | A single line break joins the lines. End a line with {marker} to keep the break, or leave a blank line for a new paragraph. | Un simple retour à la ligne joint les lignes. Terminez une ligne par {marker} pour garder le retour, ou laissez une ligne vide pour un nouveau paragraphe. |
| `markdown_help_list_hint` | Indent a - item by two spaces to nest it. | Décalez un élément - de deux espaces pour l’imbriquer. |
| `markdown_help_task_hint` | Checkboxes are read-only in Preview. | Les cases sont en lecture seule dans l’aperçu. |
| `markdown_help_divider` | Divider | Séparateur |
| `markdown_help_link_hint` | Preview shows the address after the text; links are not clickable. | L’aperçu affiche l’adresse après le texte ; les liens ne sont pas cliquables. |
| `markdown_help_unsupported` | Not rendered | Non rendu |
| `markdown_help_html` | HTML | HTML |
| `markdown_help_html_hint` | Shown as plain text, never run. | Affiché comme texte brut, jamais exécuté. |
| `markdown_help_image` | Images | Images |
| `markdown_help_image_hint` | Only the alternative text appears; nothing is loaded. | Seul le texte alternatif s’affiche ; rien n’est chargé. |

(In `fr.json` the space before each `;` above is U+00A0.) The `{marker}`
parameter receives `'\\'` from code, so no backslash lives in a catalog.

**Verify**: `bun run --cwd apps/desktop test -- src/app/messages.test.ts` → pass;
`grep -c "markdown_help_" apps/desktop/messages/en.json` equals the count in `fr.json`.

### Step 3: One data source for the examples

In `markdown-help.tsx`, export the examples as data so tests and UI share them:

```tsx
import type { m as messages } from '@/paraglide/messages.js';

export type MarkdownHelpEntry = { id: string; title: string; source: string; hint?: string };

export function markdownHelpExamples(m: typeof messages): MarkdownHelpEntry[] {
  const word = m.markdown_help_word();
  const item = m.markdown_help_item();
  const column = m.markdown_help_column();
  return [
    { id: 'heading', title: m.markdown_help_heading(), source: `# ${word}\n## ${word}`, hint: m.markdown_help_heading_hint() },
    { id: 'emphasis', title: m.markdown_help_emphasis(), source: `**${word}**\n*${word}*\n~~${word}~~` },
    { id: 'breaks', title: m.markdown_help_breaks(), source: `${word}\\\n${word}\n\n${word}`, hint: m.markdown_help_breaks_hint({ marker: '\\' }) },
    { id: 'list', title: m.markdown_help_list(), source: `- ${item}\n  - ${item}\n\n1. ${item}\n2. ${item}`, hint: m.markdown_help_list_hint() },
    { id: 'task', title: m.markdown_help_task(), source: `- [ ] ${item}\n- [x] ${item}`, hint: m.markdown_help_task_hint() },
    { id: 'quote', title: m.markdown_help_quote(), source: `> ${word}` },
    { id: 'code', title: m.markdown_help_code(), source: `\`${word}\`\n\n\`\`\`\n${word}\n\`\`\`` },
    { id: 'table', title: m.markdown_help_table(), source: `| ${column} | ${column} |\n| --- | --- |\n| ${word} | ${word} |` },
    { id: 'divider', title: m.markdown_help_divider(), source: '---' },
    { id: 'link', title: m.markdown_help_link(), source: `[${word}](notes.md)`, hint: m.markdown_help_link_hint() },
  ];
}

export function markdownHelpUnsupported(m: typeof messages): MarkdownHelpEntry[] {
  const word = m.markdown_help_word();
  return [
    { id: 'html', title: m.markdown_help_html(), source: `<b>${word}</b>`, hint: m.markdown_help_html_hint() },
    { id: 'image', title: m.markdown_help_image(), source: `![${word}](image.png)`, hint: m.markdown_help_image_hint() },
  ];
}
```

(If `import type { m as messages }` does not typecheck, use
`type Messages = ReturnType<typeof useMessages>` from `@/app/providers`.)
If `bun run lint` reports formatting, run
`bunx biome check --write apps/desktop/src/features/notes/markdown-help.tsx`.
Every source above was rendered through the Preview's `components` with
`allowHtml: false, frontmatter: false` while this plan was written, and
produced exactly the elements listed in the Test plan table.

**Verify**: `bun run --cwd apps/desktop typecheck` → exit 0.

### Step 4: Render both lists

In `MarkdownHelp`, replace the inline array with
`const examples = markdownHelpExamples(m);` and
`const unsupported = markdownHelpUnsupported(m);`, then render:

```tsx
        <dl>
          {examples.map((entry) => (
            <div key={entry.id}>
              <dt>{entry.title}</dt>
              <dd>
                <pre><code>{entry.source}</code></pre>
                {entry.hint ? <p className="markdown-help-hint">{entry.hint}</p> : null}
              </dd>
            </div>
          ))}
        </dl>
        <h3 className="markdown-help-subtitle">{m.markdown_help_unsupported()}</h3>
        <dl>
          {unsupported.map((entry) => ( …same shape… ))}
        </dl>
        <p>{m.markdown_help_local()}</p>
```

Keep the trigger, `PopoverContent` props and the Escape `stopPropagation`
unchanged. In `app.css`, next to the `.markdown-help` rules, add
`.markdown-help-hint { margin: 0.2rem 0 0; color: var(--text-muted); font-size: 0.72rem; }`
and `.markdown-help-subtitle { margin: 0.25rem 0 0; font-size: 0.8rem; font-weight: 600; }`.
Semantic tokens only; no raw colours.

**Verify**: `bun run --cwd apps/desktop test -- src/features/notes` → pass.

### Step 5: Contract

`docs/UX.md`, Editor expansion and enrichment: replace "Safe Preview uses
TanStack Markdown for headings, emphasis, strikethrough, lists, read-only
tasks, quotes, code, and tables." with "Safe Preview uses TanStack Markdown for
headings, emphasis, strikethrough, lists, read-only tasks, quotes, code,
tables, dividers, and explicit line breaks, and renders the whole body: a
leading `---` is a divider, never hidden front matter." Replace "shows
localized syntax examples without changing the draft." with "shows localized,
selectable syntax examples, each verified against the Preview, and names what
the Preview does not render (HTML, images), without changing the draft."

**Verify**: `grep -n "never hidden front matter" docs/UX.md` → 1 match.

## Test plan

Create `apps/desktop/src/features/notes/markdown-help.test.tsx` (model the
render on `note-preview.test.tsx`; call `applyLocale('en')` in `beforeEach`
as `preferences-panel.test.tsx` does). Import `m` from
`@/paraglide/messages.js`. For each entry, render
`<AppProviders><NotePreview body={entry.source} label="Preview" /></AppProviders>`
and assert with `container.querySelector…`:

| id | Preview must contain | Preview must not contain |
|---|---|---|
| heading | `h2` and `h3`, both text "Text" | — |
| emphasis | `strong`, `em`, `del` | text `·` |
| breaks | exactly one `br`; exactly two `p` | — |
| list | `ul ul li`; `ol` with two `li` | — |
| task | two `input[type="checkbox"][disabled]`, the second `checked` | — |
| quote | `blockquote` | — |
| code | `p code` and `pre code` | — |
| table | `table`, two `th`, two `td` | — |
| divider | `hr` | — |
| link | `.note-preview-link` with text `Text (notes.md)` | `a` |
| html | text containing `<b>Text</b>` | `b` |
| image | `.note-preview-image` with text `Text` | `img` |

Also assert, for every entry, that no `a, img, script, iframe, object, video, audio`
element exists; that the two exported lists have 10 and 2 entries with unique
ids; and that `markdownHelpExamples(m)` after `applyLocale('fr')` uses "Texte"
and the French titles.

UI cases in the same file: render `<MarkdownHelp />` (non-compact); focus the
trigger and press Enter (`userEvent`); expect 12 `dt` elements (`getAllByRole('term')`)
and the heading "Not rendered"; press Escape → content gone and the trigger
focused (same pattern as `note-editor.test.tsx`).

`note-preview.test.tsx`: the Step 1 cases.

`release.spec.ts`, test "Markdown help preserves the editor and safe Preview
makes no resource requests": start collecting requests before the first help
opens and assert `requests` is empty after it closes; in the Help-popover
part, after `Escape`, add
`await expect(page.locator('.help-popover').getByRole('button', { name: 'Markdown help', exact: true })).toBeFocused();`;
while the help is open, assert
`await expect(page.locator('.markdown-help pre').first()).not.toHaveCSS('user-select', 'none');`.

## Done criteria

- [ ] `bun run check` exits 0; Chromium e2e passes
- [ ] `grep -n "frontmatter={false}" apps/desktop/src/features/notes/note-preview.tsx` → 1 match
- [ ] `grep -n " · " apps/desktop/src/features/notes/markdown-help.tsx` → nothing
- [ ] `markdown-help.test.tsx` exists; its 12 parity cases and the UI case pass
- [ ] `grep -c "markdown_help_" apps/desktop/messages/en.json` equals the count in `fr.json`
- [ ] `docs/UX.md` updated as in Step 5
- [ ] `git status --short` shows only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- A parity case fails because the renderer output differs from the table
  (for example `@tanstack/markdown` was upgraded): report the actual output;
  change the example or its hint only if the new output is still safe, and
  never document syntax that the test cannot confirm.
- `frontmatter={false}` changes any existing `note-preview.test.tsx` or e2e
  expectation besides the new case: report.
- The help popover no longer fits at 400×480 (it must scroll inside its own
  `max-height`, with no horizontal scroll): report with a screenshot.
- The Paraglide compiler rejects `{marker}` or the U+00A0 characters: report;
  do not put a raw backslash in a catalog.

## Maintenance notes

- Any change to `note-preview.tsx` `components` or a `@tanstack/markdown`
  upgrade must keep `markdown-help.test.tsx` green; that test is the contract
  between the help and the Preview.
- Reviewer: read the FR popover at 400×480 in Light and Graphite; select and
  copy an example into Write and switch to Preview.
- Deferred (operator decision): footnotes render as `1 (#user-content-fn-1)`
  with a visible English "Footnotes" heading; either override the footnote
  output or keep them undocumented. A live rendered result beside each
  example is a possible follow-up.
