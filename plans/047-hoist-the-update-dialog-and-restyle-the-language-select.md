# Plan 047: Hoist the update dialog out of the Preferences popover and replace the native language select

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src/features/preferences/preferences-panel.tsx apps/desktop/src/features/preferences/preferences-panel.test.tsx apps/desktop/src/components/ui/select.tsx apps/desktop/src/components/ui/transient-primitives.test.ts apps/desktop/src/styles/app.css apps/desktop/e2e/release.spec.ts && git status --short -- apps/desktop/src`
> (without `..HEAD` the diff includes uncommitted edits). Plans 038, 040 and
> 041 land first and touch `preferences-panel.tsx` and `app.css`; that is
> expected drift. Compare the "Current state" excerpts against the live code;
> any other mismatch is a STOP condition. Refer to `app.css` rules by selector.
>
> **Precondition**: the operator's uncommitted permission-regrant and
> settings-open-error changes to `preferences-panel.tsx`, its test and
> `app.css` (present at planning time) are committed first; do not edit those hunks.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: 041 (unified focus ring, toggle styles; 040's `--size-control-sm`)
- **Category**: bug (UX)
- **Planned at**: commit `242d51e`, 2026-09-23 (first written at `d0efa57`, 2026-09-21)

## Why this matters

The update install `AlertDialog` is rendered inside the Preferences
`<Popover>` subtree and opened from a button inside the popover content. The
popover's outside-press/focus-out logic and the dialog's focus trap fire at
the same moment, so the popover may collapse under the dialog and focus may
land on the gear instead of in the dialog (unverified: Step 1 starts with a
failing test and stops if the test already passes). Separately, the language control is
a bare native `<select>`: on Windows and Linux its dropdown is OS-drawn and is
the one control that does not look like Charon. Both are contained fixes.

## Current state

- `apps/desktop/src/features/preferences/preferences-panel.tsx:131` `<Popover>` … `:155` `<PopoverContent …>` … `:457` `</PopoverContent>` … `:459-484` (then `</Popover>` at `:485`):

```tsx
      <AlertDialog open={updateDialogOpen} onOpenChange={setUpdateDialogOpen}>
        <AlertDialogContent>
          …
        </AlertDialogContent>
      </AlertDialog>
    </Popover>
```

  The "Review" button (around `:414`, `onClick={() => setUpdateDialogOpen(true)}`) is inside the popover content, within Plan 037's `updates.canSelfUpdate ?` branch. The downloading/installing status and the Restart button exist only inside the popover.
- Language control `:195-206`:

```tsx
          <select id="preferences-language" className="preferences-language" value={appearance.locale} onChange={…}>
            <option value="en">{m.locale_english()}</option>
            <option value="fr">{m.locale_french()}</option>
          </select>
```

  Styled by `.preferences-language` and `.preferences-language:focus-visible` in `app.css`, plus `.preferences-language:hover` selectors in the fine-pointer media block.
- `apps/desktop/src/components/ui/` has no `select.tsx`. Base UI 1.6 ships `@base-ui/react/select` (`Select.Root/Trigger/Value/Portal/Positioner/Popup/List/Item/ItemText/ItemIndicator`); the repo convention is the shadcn-for-Base-UI shape used in `popover.tsx` (`data-slot`, `cn`, `data-starting-style` transitions, `origin-(--transform-origin)`).
- Native-select interactions to update: unit `preferences-panel.test.tsx` (around `:159`, `user.selectOptions`) and e2e `release.spec.ts` around `:279`, `:293`, `:366`, `:384` (`selectOption`). The Windows test (around `:642-715`) uses an unnamed `getByRole('combobox')` that must stay unique.
- Base UI Select shows the raw value (`en`/`fr`) unless `items` is passed; its default `alignItemWithTrigger` bypasses the popover-style transform origin. `AlertDialogContent` accepts `finalFocus` (`DialogPopup.d.ts:34`).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit | `bun run --cwd apps/desktop test -- src/features/preferences` | pass |
| Full | `bun run check` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |

## Scope

**In scope**: files in the drift-check list (create `select.tsx`).

**Out of scope**: the Preferences container decision (popover vs. panel, README "Direction"); update logic in `update-context.tsx`.

## Git workflow

- Branch: `codex/047-preferences-dialog-and-select`
- Commit: `fix(preferences): hoist the update dialog and use a themed language select`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Prove, then hoist the dialog

First add the failing case to `preferences-panel.test.tsx` (model it on
"shows no permission re-grant notice in the install dialog…" from Plan 052,
or "warns macOS users about permission re-grants…" if Plan 052 has not landed,
with `canSelfUpdate: true`):
Review opens a focused alertdialog while Preferences stays open; Cancel returns
focus to `Review update`; Download and install leaves Preferences open showing
the downloading status. If this already passes, keep the test and skip the
rest of this step.

Otherwise, make the popover controlled with
`onOpenChange={(next) => { if (!next && updateDialogOpen) return; setOpen(next); }}`
(Preferences must stay open so progress and Restart remain visible). Render
`<AlertDialog>` after `</Popover>` in a fragment. Pass
`finalFocus={() => reviewRef.current ?? triggerRef.current}` to `AlertDialogContent`.

**Verify**: `bun run --cwd apps/desktop test -- src/features/preferences` → pass.

### Step 2: Themed select

Create `apps/desktop/src/components/ui/select.tsx` from Base UI's Select with
the same transition classes as `popover.tsx` on the `Popup`, `--shadow-floating`,
`bg-popover`, items with `data-highlighted:bg-[var(--control-hover)]` and
`data-selected` showing `IconCheck`. Trigger: `h-[var(--size-control-sm)]
w-full rounded-lg border border-input bg-field px-2.5 text-sm` with the
unified focus ring; chevron `IconChevronDown`. Replace the `<select>` in
`preferences-panel.tsx` with
`<Select items={{ en: m.locale_english(), fr: m.locale_french() }} alignItemWithTrigger={false} value={appearance.locale} onValueChange={(v) => { if (v === 'en' || v === 'fr') appearance.setLocale(v); }}>`
and two `SelectItem`s; keep the `<label htmlFor>` association by giving the
trigger `id="preferences-language"`. Delete `.preferences-language`,
`.preferences-language:focus-visible` and the `.preferences-language:hover`
selectors in the fine-pointer media block.

Update every native-select interaction listed in "Current state" to click
`getByRole('combobox', …)` then `getByRole('option', { name: 'Français' | 'English' })`.

**Verify**: `bun run --cwd apps/desktop test -- src/features/preferences` → pass; Chromium e2e `compact Preferences applies themes and locale…` and the axe-clean Preferences test → pass.

## Test plan

- 1 unit case (Step 1), e2e update (Step 2), `transient-primitives.test.ts`: add `select` to the `it.each(['popover','tooltip'])` list so it is held to the same symmetric-transition contract.

## Done criteria

- [ ] `bun run check` exits 0; Chromium e2e passes
- [ ] `grep -n "<select" apps/desktop/src/features/preferences/preferences-panel.tsx` → nothing
- [ ] Step 1's focus/progress test passes; if the hoist was needed, the `AlertDialog` open tag appears after the `</Popover>` close tag (`grep -n "</Popover>\|<AlertDialog " apps/desktop/src/features/preferences/preferences-panel.tsx` shows the popover close line first)
- [ ] `apps/desktop/src/components/ui/select.tsx` exists
- [ ] `plans/README.md` status row updated

## STOP conditions

- The Preferences popover, once controlled, no longer closes on outside press because `onOpenChange` is not called for that reason in 1.6: check the `.d.ts` `OpenChangeReason` values and report.

## Maintenance notes

- Future dialogs launched from inside a popover must follow the same hoisting pattern.
- Reviewer: keyboard-only run through Preferences → Review → Cancel → `Review update` focused.
