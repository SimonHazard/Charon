# Plan 056: Give every icon-only control a Tooltip that repeats its name, and keep no information tooltip-only

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src/components/ui/tooltip.tsx apps/desktop/src/features/notes/note-row.tsx apps/desktop/src/features/notes/note-row.test.tsx apps/desktop/src/features/notes/note-editor.tsx apps/desktop/src/features/notes/markdown-help.tsx apps/desktop/src/features/notes/capture-input.tsx apps/desktop/src/features/notes/capture-input.test.tsx apps/desktop/src/features/notes/note-list.test.tsx apps/desktop/src/features/notes/note-screen.test.tsx apps/desktop/src/features/preferences/preferences-panel.tsx apps/desktop/src/features/preferences/preferences-panel.test.tsx apps/desktop/src/test apps/desktop/src/styles/app.css apps/desktop/messages apps/desktop/e2e/release.spec.ts docs/UX.md && git status --short -- apps/desktop/src apps/desktop/messages apps/desktop/e2e docs/UX.md`
> (without `..HEAD` the diff includes uncommitted edits). Plans 038-051 land
> first and rewrite several of these controls: 041 (`main.tsx`
> `<TooltipProvider delay={350} closeDelay={0}>`, `button.tsx`, removes the
> `motion.span` press wrappers in `shelf-chrome.tsx`/`preferences-panel.tsx`),
> 042 (status button and copy button in `note-row.tsx`), 044 (composer in
> `capture-input.tsx`), 046 (`note-row.tsx` Cmd+C, Help rows), 047
> (`preferences-panel.tsx` select), 049 (Edit button `aria-expanded`), 050
> (exit timing in `tooltip.tsx`) and 040/041/042/049 (`app.css`). That is
> expected drift, and so is Plan "Markdown help" (C) if it landed first
> (`markdown-help.tsx`). Find each control by the symbol and accessible name
> quoted below, not by line number. Any other mismatch is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: 041 (tooltip open delay), 050 (tooltip exit timing) — do not
  re-tune either. Run after 042, 044, 046, 047 and 049, which rewrite the same controls.
- **Category**: bug (accessibility/UX)
- **Planned at**: commit `242d51e` plus the working tree of 2026-09-23 (backlog item "Corriger et systématiser les Tooltips")

## Why this matters

Tooltips are applied by habit, not by rule. Five icon-only row and editor
controls (status, Edit, Delete, the editor's Markdown help, Tag remove) and
the composer's send arrow have none, while the attachment remove button's
Tooltip shows the file name instead of its action. Three Preferences
explanations (Input Monitoring, Accessibility, portable shortcut) exist only
inside a hover Tooltip, so touch and screen-reader users cannot read them.
Tag chips announce only the Tag, not that they filter, and the row title
uses a second, pointer-only mechanism (a native `title`).
A wrapper detail also silently breaks styling: `TooltipTrigger` overwrites the
`data-slot="button"` that CSS relies on, which is why the attachment remove
button renders 28px instead of the intended 44px and why wrapping Edit/Delete
today would hide them. This plan states one rule, fixes the gaps it finds,
and locks it with tests.

## The rule (goes into `docs/UX.md` in Step 6)

1. Every icon-only control shows a Tooltip whose text is its short action
   label (its accessible name without the Note title or file name already
   visible beside it), on fine-pointer hover after the provider delay and on
   keyboard focus.
2. Controls with visible text get no Tooltip, except text that CSS truncates
   (Tag chips, Attachment names); their Tooltip shows the full text.
3. Exempt: dismiss-only "X" controls that close or clear the surface they sit
   in and change no Note data: editor Close, search clear, Tag filter clear,
   folder-error dismiss, toast close. The Tag remove "X" and Attachment remove
   "X" change data and are not exempt.
4. A Tooltip never holds the only copy of information. Longer explanations
   use an info toggletip: a Popover that opens on hover, click, tap, Enter or
   Space and closes with Escape, returning focus to its trigger.
5. Tooltips never take focus, never block typing or Escape, and close when
   their trigger opens a Popover. Coarse pointers rely on visible controls
   and accessible names. Native `title` attributes are not used.

## Current state

Inventory of every interactive control in `apps/desktop/src` (from
`grep -rn "Tooltip\|size=\"icon\|aria-label=" apps/desktop/src`):

| Control | Location (symbol) | Kind | Tooltip today | Rule outcome |
|---|---|---|---|---|
| Help trigger "Keyboard shortcuts" | `shelf-chrome.tsx` `ShelfActions` | icon-only, Popover | repeats name | keep |
| Settings trigger | `preferences-panel.tsx` `PreferencesPanel` | icon-only, Popover | repeats name | keep |
| Light / Graphite toggles | `preferences-panel.tsx` appearance `ToggleGroup` | icon-only | repeats name | keep |
| "About Input Monitoring", "About Accessibility" (ⓘ) | `preferences-panel.tsx` `permissionRow` | icon-only | **only copy of the description** | **gap 1**: toggletip |
| "About the portable shortcut" (ⓘ) | `preferences-panel.tsx` capture section | icon-only | **only copy of the description** | **gap 1**: toggletip |
| "Dismiss folder error" | `preferences-panel.tsx` | dismiss X | none | exempt |
| "Clear search and tag filter" | `note-screen.tsx` search | dismiss X | none | exempt |
| "Clear tag filter {tag}" | `note-screen.tsx` `.active-tag-filter` | dismiss X | none | exempt |
| "Mark done" / "Mark open" | `note-row.tsx` `.note-status-button` | icon-only | **none** | **gap 2** |
| Row activation (title + snippet) | `note-row.tsx` `.note-row-activation` | visible text | native `title={title}` on `.note-row-title` | **gap 3**: remove `title` (full text is the accessible name and one Enter away) |
| Attachment count | `note-row.tsx` `.attachment-count` | icon + `aria-hidden` number | repeats name | keep |
| Tag chips (first two) | `note-row.tsx` `.tag-filter-chip` (`max-width: 5.5rem`, ellipsis) | truncated text | tag text | **gap 4**: name does not say it filters |
| "+N" overflow | `note-row.tsx` `Badge.tag-overflow` | not focusable | none | keep (hidden Tags are in the row's sr-only summary and the editor) |
| Copy | `note-row.tsx` `.note-copy-button` | icon-only | "Copy as Markdown" + disclosure | keep |
| "Edit {title}" | `note-row.tsx` `.note-edit-button` | icon-only | **none** | **gap 2** |
| "Delete {title}" | `note-row.tsx` `.note-delete-button` | icon-only | **none** | **gap 2** |
| Editor "Close" | `note-editor.tsx` heading | dismiss X | none | exempt |
| Write / Preview tabs | `note-editor.tsx` | text | none | keep |
| "Markdown help" (compact) | `markdown-help.tsx` `compact` via `note-editor.tsx` | icon-only, Popover | **none** | **gap 2** |
| "Markdown help" (in Help) | `markdown-help.tsx` non-compact | icon + text | none | keep |
| "Remove tag {tag}" | `note-editor.tsx` `.tag-remove-button` | icon-only, changes data | **none** | **gap 2** |
| Attachment name | `note-editor.tsx` `.attachment-name` | truncated text | full file name | keep |
| "Remove {file}" | `note-editor.tsx` attachment list | icon-only, destructive | **file name, not the action** | **gap 5** |
| "Add note" | `capture-input.tsx` `.capture-submit-button` | icon-only (disabled when empty) | **none** | **gap 2** |
| "Close notification" | `components/ui/toast.tsx` `ToastClose` | dismiss X | none | exempt |

Code facts behind the gaps:

- `apps/desktop/src/components/ui/tooltip.tsx:15-17`:

```tsx
function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}
```

  `button.tsx` renders `<ButtonPrimitive data-slot="button" … {...props} />`, so
  the trigger's `data-slot` overwrites `"button"`. Verified by server-rendering
  both at `242d51e`: a plain `Button` gets `data-slot="button"`, a
  `TooltipTrigger render={<Button />}` gets `data-slot="tooltip-trigger"`;
  without the wrapper's `data-slot` it keeps `data-slot="button"`, a
  `ToggleGroupItem` keeps `"toggle-group-item"`, and `type="submit"` on the
  render element survives. Consequences in `apps/desktop/src/styles/app.css`:
  `.attachment-list [data-slot="button"] { width: 2.75rem; height: 2.75rem; }`
  matches nothing (the only Button there is tooltip-wrapped);
  `:root[data-input-modality="keyboard"] [data-slot="button"]` (instant keyboard
  transitions) skips every tooltip-wrapped Button; `.note-copy-button` had to be
  listed next to `.note-row-actions [data-slot="button"]` for sizing and reveal.
  The only CSS keyed on the trigger slot is
  `.preferences-row-title [data-slot="tooltip-trigger"]` and its fine-pointer
  `:hover` variant (the ⓘ buttons, which carry class `preferences-info-button`).
- Base UI 1.6 Tooltip popups have **no** `role="tooltip"`. The e2e assertion
  `await expect(page.getByRole('tooltip')).toHaveCount(0);` in "Windows shelf
  aligns rows…" is therefore always true. Our wrapper puts
  `data-slot="tooltip-content"` on the popup; closed tooltips unmount.
- Base UI Tooltip opens on keyboard focus (floating-ui `useFocus`, focus-visible
  only) and on hover; `closeOnClick` defaults to true; the popup is hoverable
  by default (keep it: WCAG 1.4.13). Popover.Trigger 1.6 supports
  `openOnHover`, `delay`, `closeDelay` and sets `aria-haspopup="dialog"` and
  `aria-expanded`.
- Existing pattern for an icon-only Popover trigger with a Tooltip:
  `shelf-chrome.tsx` `ShelfActions`
  (`<Tooltip><TooltipTrigger render={<PopoverTrigger aria-label=… render={<Button size="icon-sm" variant="ghost" />} />}>…</TooltipTrigger><TooltipContent>…</TooltipContent></Tooltip>`).
  Existing pattern for an icon-only Button: the copy button in `note-row.tsx`
  (`<TooltipTrigger aria-label=… className=… onClick=… render={<Button size="icon-sm" variant="ghost" />}>`).
- `preferences-panel.tsx` ⓘ today:

```tsx
        <Tooltip>
          <TooltipTrigger
            aria-label={detailsLabel}
            className="preferences-info-button"
            render={<Button size="icon-xs" variant="ghost" />}
          >
            <IconInfoCircle aria-hidden="true" />
          </TooltipTrigger>
          <TooltipContent align="start" side="left" sideOffset={8}>
            <p>{description}</p>
          </TooltipContent>
        </Tooltip>
```

  (twice: in `permissionRow` and in the portable-shortcut row).
- `note-editor.tsx` attachment remove today: `<TooltipTrigger aria-label={m.attachment_remove({ file: attachment.fileName })} … render={<Button size="icon-sm" variant="ghost" />}>` with `<TooltipContent>{attachment.fileName}</TooltipContent>`.
- Tests that find Tag chips by their current name: `note-list.test.tsx`
  (`getByRole('button', { name: 'Agent' })`, around line 76),
  `note-screen.test.tsx` (`{ name: 'Agent' }`, around line 93),
  `release.spec.ts` "search, exact Tag filter…" (`{ name: 'Privacy' }`).
- The browser demo fixture has no native capabilities, so the ⓘ buttons only
  render in unit tests (`preferences-panel.test.tsx` passes capture clients).
  Existing case "keeps detailed capture disclosures in keyboard-accessible
  tooltips" hovers "About Input Monitoring" and checks the text sits in
  `[data-slot="tooltip-content"]` whose parent has `z-[60]`.
- Messages today (en): `note_mark_open` "Mark open", `note_mark_done` "Mark
  done", `note_edit` "Edit {title}", `note_delete` "Delete {title}",
  `tag_remove` "Remove tag {tag}", `attachment_remove` "Remove {file}",
  `capture_input_submit` "Add note", `markdown_help_title` "Markdown help". No
  short Edit/Delete label and no Tag-filter label exist. French uses `’` and
  U+00A0 before `; : ! ?` (`messages.test.ts`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit (focused) | `bun run --cwd apps/desktop test -- src/features src/components` | pass |
| Full | `bun run check` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |
| Visual | `bun run dev:desktop`, open `http://127.0.0.1:1420/?fixture=demo` at 480×720 | manual check |

## Suggested executor toolkit

- Skill `web-design-guidelines` for the accessibility review of Step 6.
- Skill `apple-design` if a Tooltip or toggletip interaction needs a motion
  decision (none should: timing comes from Plans 041 and 050).

## Scope

**In scope**: the files in the drift-check list, plus
`apps/desktop/src/test/tooltip-contract.ts` (create).

**Out of scope**:
- Tooltip timing, easing and exit duration (Plans 041 and 050 own them).
- Keyboard-shortcut hints (`kbd`) inside Tooltips; shortcuts live in Help (Plan 046).
- The `PopoverTrigger` wrapper's own `data-slot` (it has the same overwrite
  pattern, but no size or reveal rule depends on it; note it in the PR).
- Renaming the Help trigger ("Keyboard shortcuts" opens a popover titled
  "Capture text"); report it as a follow-up.
- `note-screen.tsx`, `toast.tsx`, `note-list.tsx` source (their controls are
  exempt or unchanged; only their tests change).
- A shared `Tooltip.createHandle()` for rows; revisit only if a perf check regresses.

## Git workflow

- Branch: `codex/056-systematic-tooltips`
- Commits (conventional, as in `git log`):
  `fix(ui): keep a control's slot when it gains a tooltip`,
  `fix(ui): name every icon-only control in a tooltip`,
  `fix(preferences): move capture details into toggletips`,
  `docs(ux): state the tooltip rule`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Keep the rendered control's slot

`tooltip.tsx`:

```tsx
function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  // The rendered control keeps its own data-slot (Button's "button"), which CSS keys on.
  return <TooltipPrimitive.Trigger data-tooltip-trigger="" {...props} />;
}
```

`app.css`: replace `.preferences-row-title [data-slot="tooltip-trigger"]` with
`.preferences-row-title .preferences-info-button`, in the base rule and in the
fine-pointer `:hover` selector list. Make no other CSS change: the
`.attachment-list [data-slot="button"]` 2.75rem rule now reaches the
attachment remove button as its author intended.

**Verify**: `grep -rn 'data-slot="tooltip-trigger"' apps/desktop/src` → nothing;
`bun run --cwd apps/desktop test -- src/features src/components` → pass.

### Step 2: The contract helper and failing inventory tests

Create `apps/desktop/src/test/tooltip-contract.ts`:

```ts
const exemptDismissNames = [
  /^Close$/u,
  /^Close notification$/u,
  /^Clear search and tag filter$/u,
  /^Clear tag filter /u,
  /^Dismiss folder error$/u,
];

function visibleText(element: Element): string {
  let text = '';
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
    else if (
      node instanceof Element &&
      node.getAttribute('aria-hidden') !== 'true' &&
      !node.classList.contains('sr-only')
    )
      text += visibleText(node);
  }
  return text.trim();
}

/** Names of icon-only buttons that break the Tooltip rule (English locale). */
export function iconOnlyControlsWithoutTooltip(root: ParentNode): string[] {
  const violations: string[] = [];
  for (const button of root.querySelectorAll('button')) {
    if (visibleText(button)) continue; // visible text names it
    if (button.classList.contains('preferences-info-button')) continue; // toggletip holds the text
    const name = button.getAttribute('aria-label') ?? '(unnamed)';
    if (exemptDismissNames.some((pattern) => pattern.test(name))) continue;
    if (!button.hasAttribute('data-tooltip-trigger')) violations.push(name);
  }
  return violations;
}
```

Add failing cases (they pass after Steps 3-5):

- `note-row.test.tsx` "names every icon-only row and editor control in a
  Tooltip": render `NoteRow` `expanded` with
  `note({ id: 'row', body: 'Agent handoff', tags: ['Agent', 'Research', 'Privacy'], attachments: [{ id: 'a1', fileName: 'release-brief.pdf', relativePath: 'attachments/row/a1.pdf', createdAt: '2026-08-05T10:00:00.000Z' }] })`
  and the existing `callbacks` → `iconOnlyControlsWithoutTooltip(document.body)`
  equals `[]`; every `.tag-filter-chip` and `.attachment-name` has
  `data-tooltip-trigger`; `document.querySelector('.note-row-title[title]')` is `null`.
- `capture-input.test.tsx`: after typing text, the helper returns `[]`.
- `preferences-panel.test.tsx`: after opening Settings with capture clients,
  the helper returns `[]`.

**Verify**: `bun run --cwd apps/desktop test -- src/features` → only the three new cases fail, listing the gap names from the inventory.

### Step 3: Row and editor Tooltips

Messages (en / fr), next to their siblings:

| Key | en | fr |
|---|---|---|
| `note_edit_tooltip` | Edit | Modifier |
| `note_delete_tooltip` | Delete | Supprimer |
| `tag_filter_apply` | Show notes tagged {tag} | Afficher les notes avec le tag {tag} |

`note-row.tsx` (keep every existing prop, including those Plans 042 and 049 added):
- Status button: wrap as a `TooltipTrigger … render={<Button size="icon-sm" variant="ghost" />}`
  carrying the current props; `TooltipContent` = the same expression the
  button uses for `aria-label`.
- Edit and Delete: same wrapping (model: the copy button); contents
  `m.note_edit_tooltip()` and `m.note_delete_tooltip()`. Keep classes
  `note-edit-button` / `note-delete-button` (reveal and coarse-pointer CSS use them).
- Tag chips: add `aria-label={m.tag_filter_apply({ tag })}` to the
  `TooltipTrigger`; `TooltipContent` = the same message.
- Remove `title={title}` from `.note-row-title`.

`note-editor.tsx`:
- Attachment remove: `TooltipContent` becomes
  `m.attachment_remove({ file: attachment.fileName })`.
- Tag remove: wrap the `.tag-remove-button` native button as
  `<TooltipTrigger aria-label={m.tag_remove({ tag })} className="tag-remove-button" onClick={…} render={<button type="button" />}>`
  with `TooltipContent` `m.tag_remove({ tag })`.

`markdown-help.tsx`: when `compact`, render the trigger like `ShelfActions`
(`Tooltip` → `TooltipTrigger render={<PopoverTrigger aria-label=… render={<Button size="icon-sm" variant="ghost" />} />}`,
`TooltipContent` `m.markdown_help_title()`); the non-compact trigger is unchanged.

Update the chip names in `note-list.test.tsx` (`'Show notes tagged Agent'`),
`note-screen.test.tsx` (same) and `release.spec.ts` (`'Show notes tagged Privacy'`).

**Verify**: `bun run --cwd apps/desktop test -- src/features/notes` → pass, including the Step 2 row case.

### Step 4: Composer send button

`capture-input.tsx`: wrap the submit `Button` as
`<TooltipTrigger aria-label={…unchanged…} className="capture-submit-button" render={<Button disabled={…unchanged…} size=… type="submit" variant={…unchanged…} />}>`
with `TooltipContent` `m.capture_input_submit()`. Keep `disabled` and
`type="submit"` on the render element (a disabled button shows no Tooltip:
`disabled:pointer-events-none` and no focus; the placeholder explains the field).

**Verify**: `bun run --cwd apps/desktop test -- src/features/notes/capture-input.test.tsx` → pass,
plus a new case: clicking the enabled send button creates the Note once.

### Step 5: Preferences toggletips

In `preferences-panel.tsx`, add `import type { ReactNode } from 'react';`, a
local component, and use it for all three ⓘ (`permissionRow` passes
`detailsLabel`/`description`; the portable-shortcut row passes
`m.preferences_portable_details()`/`m.preferences_portable_description()`):

```tsx
function InfoToggletip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className="preferences-info-button"
        delay={350}
        openOnHover
        render={<Button size="icon-xs" variant="ghost" />}
      >
        <IconInfoCircle aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="preferences-info-popover" side="left" sideOffset={8}>
        <p>{children}</p>
      </PopoverContent>
    </Popover>
  );
}
```

`app.css`: `.preferences-info-popover { width: min(18rem, calc(100vw - 1rem)); background: var(--material-transient-solid); font-size: 0.75rem; }`
(opaque like Preferences, per `docs/UX.md`). If Escape closes Preferences
together with the toggletip in Step 5's test, add the same guard
`markdown-help.tsx` uses: `onKeyDown={(event) => { if (event.key === 'Escape') event.stopPropagation(); }}` on `PopoverContent`.

**Verify**: `bun run --cwd apps/desktop test -- src/features/preferences` → pass, with the updated and new cases below.

### Step 6: Contract and e2e

- `docs/UX.md` "Shared control polish": append a paragraph containing the
  five rules from "The rule" above (plain wording, no emoji).
- `release.spec.ts`:
  - In "Windows shelf aligns rows…", replace `page.getByRole('tooltip')` with
    `page.locator('[data-slot="tooltip-content"]')` (one assertion, inside
    the theme loop, after focusing the language control).
  - In "compact icon controls expose at least 44px CSS hit areas", after
    opening the editor, also assert `.attachment-list [data-slot="button"]` ≥ 44×44.
  - New test `icon-only controls name themselves in Tooltips`: for each theme
    in `['Light', 'Graphite']` (switch via Settings as the Windows test does,
    then Escape): `await page.keyboard.press('Shift')`, focus
    `getByRole('button', { name: 'Edit Agent handoff' })` → the
    `[data-slot="tooltip-content"]` locator is visible with text `Edit`; axe
    (same filter as the axe-clean test) reports no serious/critical
    violation; `Escape` removes the tooltip and the Edit button stays focused.
    Then hover `Delete Agent handoff` with the mouse → tooltip `Delete` visible.
    Then open the editor, click the compact `Markdown help` → `.markdown-help`
    visible and the tooltip locator has count 0.

**Verify**: `bun run check` → exit 0; Chromium e2e → pass.

## Test plan

- `note-row.test.tsx`: inventory case (Step 2); hover cases (`userEvent.hover`,
  then `await screen.findByText(…)` inside `[data-slot="tooltip-content"]`)
  for status "Mark done", Edit "Edit", Delete "Delete", chip "Show notes
  tagged Agent", attachment remove "Remove release-brief.pdf", tag remove
  "Remove tag Agent", compact Markdown help "Markdown help"; the attachment
  remove button has `data-slot="button"` and `data-tooltip-trigger`.
- `capture-input.test.tsx`: inventory case; click-submit case.
- `preferences-panel.test.tsx`: rename "keeps detailed capture disclosures in
  keyboard-accessible tooltips" to "keeps detailed capture disclosures in
  toggletips" and check: hover still shows the description (now inside
  `[data-slot="popover-content"]`); a click opens it with `aria-expanded="true"`;
  `Escape` closes only the toggletip (the "Preferences" heading remains) and
  focus returns to the ⓘ button; a touch tap
  (`user.pointer({ keys: '[TouchA]', target })`) opens it. Plus the inventory case.
- `note-list.test.tsx`, `note-screen.test.tsx`: chip names updated.
- e2e: the fixed Windows assertion, the 44px attachment remove check, the new Tooltip test.

## Done criteria

- [ ] `bun run check` exits 0; Chromium e2e passes
- [ ] `grep -rn 'data-slot="tooltip-trigger"' apps/desktop/src` → nothing
- [ ] `grep -n ' title=' apps/desktop/src/features/notes/note-row.tsx` → nothing
- [ ] `grep -rn "getByRole('tooltip')" apps/desktop/e2e` → nothing
- [ ] `grep -c "InfoToggletip" apps/desktop/src/features/preferences/preferences-panel.tsx` → ≥ 4 (definition + 3 uses)
- [ ] `grep -n "note_edit_tooltip\|note_delete_tooltip\|tag_filter_apply" apps/desktop/messages/fr.json` → 3 matches
- [ ] The three inventory cases exist and pass
- [ ] `docs/UX.md` contains the rule (`grep -n "toggletip" docs/UX.md` → ≥ 1)
- [ ] `plans/README.md` status row updated

## STOP conditions

- A control named in the inventory no longer exists or has become a text
  button after Plans 041-050: report the new shape instead of forcing a Tooltip.
- After Step 1, a row action loses its hover/focus reveal or size (the
  "fine-pointer hover…" or "changed compact controls…" e2e fails): report the
  selector; do not add `!important` or re-add the trigger slot.
- The 44px attachment remove button makes the attachment list clip at 400px
  (e2e geometry tests fail): report with a screenshot.
- The toggletip cannot be closed by Escape without also closing Preferences,
  even with the `stopPropagation` guard: report.
- A Tooltip stays visible over a Popover its trigger opened (Step 6 test):
  report; do not add timers.

## Maintenance notes

- New icon-only controls must pass `iconOnlyControlsWithoutTooltip`; extend
  the exempt list only for a dismiss-only X, and say why in the PR.
- The helper matches English names; tests call `applyLocale('en')` first.
- Reviewer: VoiceOver pass on a row (chip now announces "Show notes tagged …"),
  a touch-screen or `hasTouch` check of the toggletips, and a 200% text-size
  check that Tooltips wrap inside `max-w-xs`.
- Follow-ups: `PopoverTrigger` overwrites `data-slot` the same way (Help and
  Settings buttons miss the keyboard-instant rule); the Help trigger's name
  "Keyboard shortcuts" versus its "Capture text" title.
