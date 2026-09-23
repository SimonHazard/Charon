# Plan 038: Follow the OS appearance by default and paint the canvas before the webview loads

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> This plan changes an accepted contract (ADR 0012 decision 5: "Light becomes
> the first-run appearance"). Confirm in chat that the operator approves the
> System default before Step 0; without that approval, STOP.
>
> **Drift check (run first)**: `git diff --stat 242d51e..HEAD -- packages/theme/src/theme-contract.ts packages/theme/src/tokens.css apps/desktop/src/app/theme.ts apps/desktop/src/app/theme.test.ts apps/desktop/src/app/theme-contract.test.ts apps/desktop/src/app/providers.tsx apps/desktop/index.html apps/desktop/src/features/preferences/preferences-panel.tsx apps/desktop/src/features/preferences/preferences-panel.test.tsx apps/desktop/src-tauri/tauri.conf.json apps/desktop/src/app/window-config.test.ts apps/desktop/messages docs/UX.md docs/PRODUCT.md docs/adr README.md AGENTS.md apps/desktop/e2e/release.spec.ts && git status --short -- apps/desktop/src apps/desktop/messages docs`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Any uncommitted change in a listed
> file is a STOP until the operator commits it.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `242d51e`, 2026-09-23 (first written at `d0efa57`, 2026-09-21)

## Why this matters

Charon stores `light` or `dark` and defaults to `light`. It never reads
`prefers-color-scheme`, so every first launch on a dark macOS, GNOME or Windows
desktop is a bright white window, and the app never follows the OS when it
switches at sunset. A native-feeling app on three OSes follows the system by
default and lets the user pin a choice. The window also has no background
colour configured, so the OS shows a white/grey rectangle until the stylesheet
loads. Both are the first thing a user sees.

## Current state

- `packages/theme/src/theme-contract.ts` (entire file):

```ts
export const themeNames = ['light', 'dark'] as const;
export type ThemeName = (typeof themeNames)[number];
export const themeStorageKey = 'charon:theme:v1';
export const themeAttribute = 'data-theme';
export const defaultTheme: ThemeName = 'light';
export function isThemeName(value: unknown): value is ThemeName { … }
```

  Only `apps/desktop` imports it (`providers.tsx:1`, `theme.ts:1-7`,
  `theme.test.ts:1`). The site hardcodes `data-theme="light"` in
  `apps/site/src/layouts/BaseLayout.astro:24` and is out of scope.
- `apps/desktop/src/app/theme.ts` — `readTheme(storage)` returns the stored
  value when `isThemeName`, else `defaultTheme`; `applyTheme(theme, root)` sets
  `data-theme`; `saveTheme(theme, storage)` stores then applies.
- `apps/desktop/src/app/providers.tsx:48-65` — `useState(readTheme)`;
  `setTheme(next: ThemeName)` calls `saveTheme` then updates state;
  `usePreferences()` exposes `{ theme, locale, setTheme, setLocale }`.
- `apps/desktop/index.html:7-22` — inline pre-paint script:

```js
const value = localStorage.getItem('charon:theme:v1');
const theme = ['light', 'dark'].includes(value) ? value : 'light';
document.documentElement.dataset.theme = theme;
// … catch { document.documentElement.dataset.theme = 'light'; … }
```

- `packages/theme/src/tokens.css:18` `[data-theme="light"] { color-scheme: light; --canvas: #ebeae8; … }`, `:61` `[data-theme="dark"] { color-scheme: dark; --canvas: var(--brand-prune); … }` (`--brand-prune: #171221`). `apps/desktop/src/styles/app.css:37-39` paints `html { background: var(--canvas) }`.
- `apps/desktop/src/features/preferences/preferences-panel.tsx:161-188` — a
  `ToggleGroup` over `(['light','dark'] as const)` with sun/moon icons and
  tooltips `m.theme_light()` / `m.theme_dark()` ("Light" / "Graphite"). Its
  `onValueChange` guard (lines 166-171) accepts only `light`/`dark`.
- Tests pinning today's behaviour: `apps/desktop/src/app/theme.test.ts`
  ("uses Light for first run…"), `apps/desktop/src/app/theme-contract.test.ts:147-151`
  ("paints Light before React when no valid preference exists": asserts
  `? value : 'light'`, `dataset.theme = 'light'`, and no `solarized`). The same
  file has a `readTheme(theme)` token resolver at lines 103-120:
  `readTheme('light')('--canvas')` returns the resolved hex.
- `apps/desktop/src/test/setup.ts:17` exports `setMediaQuery(query, matches)`;
  the `matchMedia` mock is at lines 29-60.
- `apps/desktop/src-tauri/tauri.conf.json:14-24` window config has no
  `backgroundColor`. Tauri 2.11 accepts `backgroundColor` as a hex string
  (`tauri-utils` 2.9 `WindowConfig`).
- Contracts that say Light is the first-run default and must change together:
  ADR 0012 decision 5 (`docs/adr/0012-unified-note-shelf.md:45-48`, also
  "a persisted legacy `solarized` value resolves to Light"), `docs/UX.md:19`
  and `:104` ("compact sun/moon appearance buttons"), `docs/PRODUCT.md:40` and
  `:210-212`, `README.md:25`, `AGENTS.md:94`.
- The operator's uncommitted macOS-permission work (at planning time) touches
  `preferences-panel.tsx` (permission hunks near lines 317-361),
  `preferences-panel.test.tsx` (the test "applies immediate theme/language and
  requests each macOS permission explicitly", lines 144-165), both message
  catalogs, and `docs/UX.md` (states section near line 266). Extend those
  tests; do not rewrite them.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit | `bun run --cwd apps/desktop test` | pass |
| Typecheck | `bun run --cwd apps/desktop typecheck` | exit 0 |
| Full | `bun run check` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |
| Native smoke (optional) | `bun run tauri:dev` | see Step 5 |

## Scope

**In scope**: the files in the drift-check list, plus the new
`docs/adr/NNNN-follow-the-system-appearance.md`.

**Out of scope**:
- Token values in `tokens.css` (Plan 040 owns them).
- Any Rust file; no new IPC.
- The Astro site.
- `app-shell.tsx` and `shelf-chrome.tsx`: their `navigator.platform` fallback
  already runs synchronously on first render, and the Windows e2e test
  (`release.spec.ts:645-647`) overrides `navigator.platform`; do not replace it
  with `navigator.userAgentData`.

## Git workflow

- Branch: `codex/038-system-theme-first-paint`
- Commits: `docs(adr): follow the system appearance by default`,
  `feat(theme): follow the system appearance by default`,
  `fix(desktop): paint the canvas before the webview loads`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 0: Record the decision

Add `docs/adr/NNNN-follow-the-system-appearance.md` with the next free ADR
number (0019 or later: ADR 0018 is the macOS signing identity) (Status: "Accepted on
<date> by operator decision"; Context/Decision/Consequences like ADR 0017). It
amends ADR 0012 decision 5: the first-run appearance follows
`prefers-color-scheme`; Light and Graphite stay explicit choices that never
flip with the OS; a stored legacy `solarized` value still resolves to Light.
Add one "Amended by ADR NNNN" line under ADR 0012's Status. Update
`docs/PRODUCT.md:40` and `:210-212`, `README.md:25`, `docs/UX.md:19` and `:104`
(System, sun and moon buttons) and `AGENTS.md:94` ("The appearance follows the
OS by default; Light and Graphite are explicit choices.").

**Verify**: `grep -n "first-run default\|first-run theme" AGENTS.md docs/UX.md docs/PRODUCT.md` → no match.

### Step 1: Extend the theme contract with a `system` preference

In `theme-contract.ts`:

```ts
export const themeNames = ['light', 'dark'] as const;          // resolved themes (data-theme values)
export const themePreferences = ['system', 'light', 'dark'] as const;
export type ThemeName = (typeof themeNames)[number];
export type ThemePreference = (typeof themePreferences)[number];
export const defaultThemePreference: ThemePreference = 'system';
export const themeMediaQuery = '(prefers-color-scheme: dark)';
export function isThemePreference(value: unknown): value is ThemePreference { … }
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ThemeName {
  return preference === 'system' ? (prefersDark ? 'dark' : 'light') : preference;
}
```

Find consumers with
`grep -rn "theme-contract" apps packages --include='*.ts' --include='*.tsx' --include='*.astro' --exclude-dir=node_modules`
(quote the globs; zsh rejects them unquoted). Remove `defaultTheme` if nothing
uses it after Step 2. `data-theme` continues to receive only `light` or
`dark`, so `tokens.css` is untouched.

**Verify**: `bun run --cwd apps/desktop typecheck` → exit 0.

### Step 2: Resolve and subscribe in `theme.ts` and `providers.tsx`

- `readThemePreference(storage)` returns `'system'` when no value is stored or
  storage throws; returns the value when it is `system`, `light` or `dark`;
  returns `'light'` for any other stored string, including legacy `solarized`
  (ADR 0012).
- `applyTheme(preference, root, prefersDark)` sets `data-theme` to
  `resolveTheme(...)` and calls `root.style.removeProperty('background-color')`
  so the stylesheet owns the canvas after the pre-paint script (Step 3).
- `saveThemePreference(preference)` stores then applies.
- `watchSystemTheme(onChange)` in `theme.ts` adds one `change` listener on
  `matchMedia(themeMediaQuery)` and returns the remover.
- In `providers.tsx`, `theme` becomes the `ThemePreference` and `setTheme`
  accepts one. While the preference is `system`, an effect calls
  `watchSystemTheme` and re-applies on change; it also applies the resolved
  theme on mount. Do not add an unused `resolvedTheme` field.

Rewrite `theme.test.ts` deliberately with six cases: "uses System for first run
and when storage is unavailable", "maps legacy solarized and other invalid
values to Light", "preserves explicit system/light/dark", "resolves System to
dark when the media query matches" (use `setMediaQuery(themeMediaQuery, true)`),
"watchSystemTheme re-applies on change and its remover detaches the listener",
"applyTheme clears the pre-paint background".

**Verify**: `bun run --cwd apps/desktop test -- src/app/theme.test.ts` → 6 pass.

### Step 3: Pre-paint script and window background

`index.html` inline script: `value === null ? 'system' : ['system','light','dark'].includes(value) ? value : 'light'`
(do not write the word `solarized`; the contract test forbids it). Resolve
`system` with `window.matchMedia('(prefers-color-scheme: dark)').matches`, set
`dataset.theme`, and set `document.documentElement.style.backgroundColor` to
`#171221` when dark and `#ebeae8` when light (the two `--canvas` values). The
`catch` branch must resolve through `matchMedia` too. Do not add an inline
`<style>` element: Tauri injects a nonce into `style-src`, and browsers then
ignore `'unsafe-inline'`.

`tauri.conf.json` window: add `"backgroundColor": "#ebeae8"`. Do **not** add
`visible: false` here: Plan 039 adds it together with an explicit `show()` in
the Rust `setup` hook, so no frontend failure can leave an invisible app.

Tests: rename the `theme-contract.test.ts` case at 147-151 to "paints the
resolved canvas before React" and assert that `desktopHtml` contains
`prefers-color-scheme: dark`, `readTheme('light')('--canvas')` and
`readTheme('dark')('--canvas')`, still contains no `solarized`, and that
`tauriConfig.app.windows[0].backgroundColor === readTheme('light')('--canvas')`
(add the config assertion in `window-config.test.ts` if `tauriConfig` is not
already loaded in the contract test). These assertions make Plan 040's canvas
changes fail loudly until both literals follow.

**Verify**: `bun run --cwd apps/desktop test -- src/app/theme-contract.test.ts src/app/window-config.test.ts` → pass.

### Step 4: Third toggle item

Preferences: toggle group over `themePreferences` with icons
`IconDeviceDesktop` (system), `IconSun`, `IconMoon`; add message
`theme_system` ("System" / "Système") in en/fr; `aria-label` and tooltip from
messages. Replace the `onValueChange` guard with
`if (isThemePreference(value)) appearance.setTheme(value)`.

**Verify**: `bun run --cwd apps/desktop test -- src/features/preferences` → pass
(add a test: three toggle items, selecting System stores `system`).

### Step 5: E2E and native smoke

In `release.spec.ts`, test `compact Preferences applies themes and locale
without leaving the shelf` (line ~271): with no stored preference,
`page.emulateMedia({ colorScheme: 'dark' })` → `html[data-theme="dark"]`; then
`emulateMedia({ colorScheme: 'light' })` → `data-theme="light"` (live follow).
Then pick Graphite, switch the emulated scheme to dark and back to light, and
assert the theme stays `dark` (an explicit choice never flips).

Native smoke (macOS; Linux and Windows if available): the window opens dark
when the OS is dark and follows a live OS switch. Record Linux WebKitGTK
behaviour; do not claim GNOME support if it does not follow. Afterwards delete
`apps/desktop/src-tauri/target/debug` (AGENTS hygiene).

**Verify**: `bun run check` → exit 0; Chromium e2e → pass.

## Test plan

- `theme.test.ts` (rewritten, 6 cases), `theme-contract.test.ts` (script and
  config assertions), `window-config.test.ts` (backgroundColor),
  `preferences-panel.test.tsx` (three items), e2e live-follow and pinned cases.

## Done criteria

- [ ] `bun run check` exits 0 and Chromium e2e passes
- [ ] `grep -n "prefers-color-scheme" apps/desktop/index.html packages/theme/src/theme-contract.ts` → one match in each
- [ ] `grep -n "backgroundColor" apps/desktop/src-tauri/tauri.conf.json` → one match
- [ ] `docs/adr/*-follow-the-system-appearance.md` exists; `docs/UX.md`, `docs/PRODUCT.md` and `AGENTS.md` no longer say Light is the first-run default
- [ ] `plans/README.md` status row updated

## STOP conditions

- The operator has not approved changing ADR 0012's first-run appearance.
- Base UI `ToggleGroup` cannot represent three items at 400px width (e2e
  geometry test fails): report rather than shrink.
- The pre-paint `style.backgroundColor` survives a theme switch in the e2e run
  (the canvas stays the old colour): `applyTheme` is not clearing it; fix there,
  never with `!important`.

## Maintenance notes

- Plan 040 does not change `--canvas`; any later `--canvas` change must update
  both literals in `index.html` and `tauri.conf.json` (the Step 3 assertions
  fail until it does).
- Reviewer: check the media-query listener is removed on unmount and that a
  stored explicit theme never flips with the OS.
