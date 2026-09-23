# Plan 044: Accept multi-line Markdown in the composer without losing Enter-to-create

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src/features/notes/capture-input.tsx apps/desktop/src/features/notes/capture-input.test.tsx apps/desktop/src/components/ui/textarea.tsx apps/desktop/src/styles/app.css apps/desktop/e2e/release.spec.ts apps/desktop/messages docs/UX.md && git status --short -- apps/desktop/src apps/desktop/messages docs/UX.md`
> (without `..HEAD` the diff includes uncommitted edits). Plans 040 and 041
> land first and edit `app.css`, `capture-input.tsx` and `docs/UX.md`; that is
> expected drift. Compare the "Current state" excerpts against the live code;
> any other mismatch is a STOP condition. If uncommitted user changes touch an
> in-scope file, STOP until they are committed. Refer to `app.css` rules by selector.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: 041 (same files; do not run in parallel). This plan overrides 041's fixed `.capture-field` height with `min-height` and keeps 041's submit-button variant.
- **Category**: bug
- **Planned at**: commit `242d51e`, 2026-09-23 (first written at `d0efa57`, 2026-09-21)

## Why this matters

The composer is an `<input type="text">`. Browsers strip line breaks from a
text input's value, so pasting a list, a code block or two paragraphs
silently collapses them into one line, and Enter submits so the user cannot
type a newline either. Everything else in Charon is multi-line: the row
headline splits on `\n`, search matches across line breaks, and double-Shift
capture preserves the selection's newlines. The manual capture surface is the
only one that destroys Markdown structure. An auto-growing textarea with
Enter-to-create and Shift+Enter-for-newline fixes it.

## Current state

- `apps/desktop/src/features/notes/capture-input.tsx:52-107` — `<form className="note-capture-input">` → `<Field>` → `<fieldset className="capture-field">` → `<Input className="capture-field-input" … onCompositionStart/End … onKeyDown …>` + submit `<Button size="icon-xs" variant="ghost">`. The IME guard:

```tsx
            onKeyDown={(event) => {
              if (
                event.key === 'Enter' &&
                (composingRef.current ||
                  event.nativeEvent.isComposing ||
                  event.nativeEvent.keyCode === 229)
              ) {
                event.preventDefault();
              }
            }}
```

- Submit happens through the form's `onSubmit` (`:53-57`); `body = value.trim()`; `readOnly={pending}`; focus returns to the input in `finally`.
- `apps/desktop/src/components/ui/textarea.tsx` — `field-sizing-content min-h-16 … rounded-lg border border-input bg-field px-2.5 py-2`.
- `apps/desktop/src/styles/app.css` `.capture-field { display: flex; align-items: center; height: 3rem; min-height: 3rem; … }`, `.capture-field-input { flex: 1; border: 0; background: transparent; }`, and `.note-capture-input input::placeholder`.
- `Textarea` carries `min-h-16`; `field-sizing: content` is not supported by
  WebKitGTK 2.44 and only recently by macOS WebKit, so auto-grow needs a
  fallback on two of three platforms.
- `docs/UX.md` "Composer" (line 194): "The solid bottom composer is always
  visible, accepts a short Markdown body, creates one Open Note on Enter, and
  does nothing for empty or whitespace-only input. … Longer work moves into
  the same expanded Note editor"; keyboard contract: Enter "submits the
  composer". ADR 0006's "compact single-line input" was superseded by ADR
  0011, so no ADR is needed. ADR 0012 decision 6 fixes the placeholder
  (`Add a note…` / `Ajouter une note…`).
- e2e: `expectCompactShelf` (`release.spec.ts:56`) and the 360 px test (`:389`)
  select `.note-capture-input input`; geometry tests at `:331` and `:378`;
  `first launch and manual composer create exactly one Open Note` at `:98`.
- Test file `capture-input.test.tsx` (65 lines) uses `@testing-library/user-event`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit | `bun run --cwd apps/desktop test -- src/features/notes/capture-input.test.tsx` | pass |
| Full | `bun run check` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |

## Scope

**In scope**: files in the drift-check list.

**Out of scope**: the note editor textarea; search field; Rust `createNote` (already accepts multi-line bodies).

## Git workflow

- Branch: `codex/044-multiline-composer`
- Commit: `feat(notes): accept multi-line markdown in the composer`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Swap to an auto-growing textarea

Replace `<Input>` with `<Textarea>` (same `className="capture-field-input"`,
`rows={1}`, `aria-label`, `aria-busy`, `aria-invalid`, `name`, `readOnly`,
`ref` typed `HTMLTextAreaElement`, `value`, `onChange`, composition handlers).
Auto-grow only when `!CSS.supports('field-sizing', 'content')`: in a
`useLayoutEffect` keyed on `value`, set `el.style.height = 'auto'` then
`` `${Math.min(el.scrollHeight, maxPx)}px` ``, with `maxPx` read once from the
computed `max-height` (no new React state).

- `.capture-field { align-items: flex-end; height: auto; min-height: 3rem; }`
- `.capture-field-input { min-height: 0; max-height: 9.5rem; overflow-y: auto; resize: none; line-height: 1.45; padding-block: 0.75rem; }`
- `.capture-submit-button { margin-block-end: calc((3rem - 2px - 1.5rem) / 2); }`
  (the button stays centred on the first line).
- Rename `.note-capture-input input::placeholder` to `.note-capture-input textarea::placeholder`.

`CaptureInputHandle.focus` stays; `inputRef.current?.focus()` unchanged.

**Verify**: `bun run --cwd apps/desktop typecheck` → exit 0.

### Step 2: Enter submits, Shift+Enter inserts a newline, IME untouched

Extend `onKeyDown`:

```tsx
if (event.key !== 'Enter') return;
if (composingRef.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
  event.preventDefault(); // unchanged IME guard
  return;
}
if (event.shiftKey) return; // native newline
event.preventDefault();
void submit();
```

(A textarea does not submit its form on Enter, so `submit()` must be called
explicitly; the form `onSubmit` stays for the button.) Do not trim internal
newlines: `body = value.trim()` only strips leading/trailing whitespace, which
is the existing behaviour.

**Verify**: unit tests (Step 4) → pass.

### Step 3: Contract and help copy

- Do not change `capture_input_placeholder`; ADR 0012 decision 6 fixes it.
- Add `capture_input_newline_hint` ("Shift+Enter adds a line" / "Maj+Entrée
  ajoute une ligne") as `aria-describedby` text in a `sr-only` span.
- `docs/UX.md` "Composer": "The solid bottom composer is always visible,
  accepts a short Markdown body, creates one Open Note on Enter, inserts a line
  break on `Shift+Enter`, and does nothing for empty or whitespace-only input.
  The field grows with its content to about five lines, then scrolls; pasted
  line breaks are preserved." Keyboard contract: "- `Shift+Enter` inserts a
  line break in the bottom composer; IME confirmation never submits."

**Verify**: `grep -c "Shift+Enter" docs/UX.md` → 2.

### Step 4: Tests

`capture-input.test.tsx` new cases (model after the existing ones):
1. Pasting `"a\nb"` (use `user.paste`) then Enter calls `onCreate` with `"a\nb"`.
2. Shift+Enter inserts a newline and does not call `onCreate`.
3. A failed create keeps the multi-line value intact and focused
   (Enter during composition is already covered by `capture-input.test.tsx:9-26`).
4. Enter on empty/whitespace input does nothing.

e2e: replace `.note-capture-input input` with `.note-capture-input textarea`
at `release.spec.ts:56` and `:389`. Add a separate test, `composer keeps a
multi-line body as one Note`: type `first`, `Shift+Enter`, `second`, `Enter`;
assert one `.note-row-title` reading `first` whose `.note-row-snippet` reads
`second`. Then paste 30 lines and assert the field is at most 9.5rem tall and
the list still ends above the composer. Also run
`CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=webkit --grep "composer|geometry|360"`
(WebKit exercises the `field-sizing` fallback).

**Verify**: `bun run check` → exit 0; Chromium e2e including geometry tests → pass.

## Test plan

See Step 4: 4 unit cases, 1 new e2e test, 2 selector updates, one WebKit run.

## Done criteria

- [ ] `bun run check` exits 0; Chromium e2e passes
- [ ] `grep -n "<Input" apps/desktop/src/features/notes/capture-input.tsx` → nothing; `grep -n "<Textarea" …` → one
- [ ] `grep -c "Shift+Enter" docs/UX.md` → 2
- [ ] `plans/README.md` status row updated

## STOP conditions

- The auto-grow fallback visibly lags a keystroke in WebKit (the field
  scrolls before it grows): report the measured behaviour rather than adding
  React state.
- The 360px/400px geometry e2e tests fail because the composer dock grew: cap
  `max-height` lower and report the measured heights.

## Maintenance notes

- Plan 041's submit-variant change lands in the same file first; keep it.
- Reviewer: test a long paste (30 lines) — the field must cap at ~5 lines and scroll internally.
