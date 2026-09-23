# Plan 057: Show the version and the open-source links in a quiet Preferences About section

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src/features/preferences/preferences-panel.tsx apps/desktop/src/features/preferences/preferences-panel.test.tsx apps/desktop/src-tauri/capabilities/main.json apps/desktop/src/app/window-config.test.ts apps/desktop/src/app/theme-contract.test.ts apps/desktop/vite.config.ts apps/desktop/src/env.d.ts scripts/check-privacy.ts apps/desktop/messages apps/desktop/src/styles/app.css apps/desktop/e2e/release.spec.ts docs/UX.md docs/PRIVACY.md && git status --short -- apps/desktop/src apps/desktop/src-tauri/capabilities apps/desktop/vite.config.ts apps/desktop/messages scripts docs/UX.md docs/PRIVACY.md`
> (without `..HEAD` the diff includes uncommitted edits). Plans 038-051 land
> first and touch several of these files: 038 (`preferences-panel.tsx`, its
> test, `window-config.test.ts`, `theme-contract.test.ts`, messages,
> `docs/UX.md`, e2e), 039 (`window-config.test.ts`), 040/041 (`app.css`,
> `preferences-panel.tsx`, `theme-contract.test.ts`), 043 (`check-privacy.ts`),
> 045 (`docs/PRIVACY.md`, messages), 046 (messages, `docs/UX.md`) and 047
> (`preferences-panel.tsx`, its test, `app.css`, e2e). That is expected drift.
> Compare the "Current state" excerpts against the live code by symbol and
> quoted text, not by line number; any other mismatch is a STOP condition.
> If `git status --short` lists an in-scope file as modified but uncommitted
> by someone else, STOP until that work is committed.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none functionally. Run after 047 (the same Preferences file, test and e2e test).
- **Category**: direction (discoverability)
- **Planned at**: commit `242d51e` plus the working tree of 2026-09-23 (backlog items "Ajouter le lien GitHub dans Preferences" and "Rendre visible le caractère open source et contribuable")

## Why this matters

Charon is public, MIT-licensed and open to pull requests, but nothing in the
app says so and the running version appears nowhere. A user who wants to
report a bug, read the source or contribute has to find the repository by
themselves, and cannot say which version they run. One quiet section at the
end of Preferences fixes both. The links must keep the privacy promise: the
app requests nothing, and the default browser opens a link only after an
explicit click, through an opener permission scoped to those exact URLs.

## Current state

- `apps/desktop/src/features/preferences/preferences-panel.tsx` is the
  Preferences popover. Relevant parts:
  - line 13: `import { openUrl } from '@tauri-apps/plugin-opener';`
  - line 46: `const RELEASES_URL = 'https://github.com/SimonHazard/Charon/releases/latest';`
  - the Updates section ends the popover (around lines 366-457):

```tsx
        <section className="preferences-group">
          <h2>{m.preferences_updates()}</h2>
          …
                  <Button onClick={() => void openUrl(RELEASES_URL)} size="sm" variant="outline">
                    <IconExternalLink aria-hidden="true" />
                    {m.update_open_releases()}
                  </Button>
          …
        </section>
      </PopoverContent>
```

  This is the only existing external link. It is opened by
  `@tauri-apps/plugin-opener` (`tauri-plugin-opener = "=2.5.5"` in
  `apps/desktop/src-tauri/Cargo.toml`, registered in `src-tauri/src/lib.rs`).
  Its rejection is ignored (`void openUrl(...)`).
- `apps/desktop/src-tauri/capabilities/main.json` scopes the opener to one URL:

```json
    {
      "identifier": "opener:allow-open-url",
      "scope": {
        "allow": [{ "url": "https://github.com/SimonHazard/Charon/releases/latest" }]
      }
    },
```

  Two tests pin the whole permission list verbatim:
  `apps/desktop/src/app/window-config.test.ts` ("grants only the named webview
  permissions used by the shelf", around line 45) and
  `apps/desktop/src/app/theme-contract.test.ts` ("allows only explicit event,
  window lifecycle, clipboard, and release-link commands", around line 256).
- `scripts/check-privacy.ts` scans `apps/desktop/dist` for network sinks,
  including any `https?://` string, after removing allowlisted strings with
  `replaceAll`:

```ts
const desktopNetworkAllowlist = [
  'fetch(e.href,n)', // React DOM stylesheet preloading; Charon emits no preload links.
  // Explicit user-triggered release link opened through Tauri's opener plugin.
  'https://github.com/SimonHazard/Charon/releases/latest',
  'https://react.dev/errors/',
  …
];
```

  It runs in `verify:release`, not in `bun run check`; run it explicitly.
- No version is displayed anywhere. `apps/desktop/package.json` `"version": "0.1.3"`
  is one of the four manifests that `scripts/check-release-version.ts` keeps
  equal (with the root `package.json`, `tauri.conf.json` and `Cargo.toml`).
  `apps/desktop/vite.config.ts` has no `define`; `apps/desktop/tsconfig.app.json`
  includes `src` with `"types": ["vite/client", "vitest/globals"]`; there is
  no `src/*.d.ts` yet. Vitest reuses `vite.config.ts`, so a `define` applies in
  unit tests and in the e2e dev server.
- Repository facts: `LICENSE` is MIT ("Copyright (c) 2026 Simon Hazard"),
  `CONTRIBUTING.md` exists at the root, the default branch is `main`. URLs:
  `https://github.com/SimonHazard/Charon` and
  `https://github.com/SimonHazard/Charon/blob/main/CONTRIBUTING.md`.
- Unit test pattern: `preferences-panel.test.tsx` mocks the opener at the top
  (`vi.mock('@tauri-apps/plugin-opener', () => ({ openUrl: vi.fn().mockResolvedValue(undefined) }))`),
  renders `<ShelfActions />` inside `<AppProviders captureClient preferencesClient workspaceClient>`
  and opens Preferences with `userEvent.click(screen.getByRole('button', { name: 'Settings' }))`.
  The first test lists the section headings
  `['Appearance', 'Language', 'Notes folder', 'Capture', 'Updates']`.
- In the browser e2e fixture (`?fixture=demo`) there is no Tauri runtime, so
  `openUrl` rejects (its `invoke` reads `window.__TAURI_INTERNALS__`).
- Contracts to honor:
  - `AGENTS.md`: "Keep Charon local-only: no … undisclosed network access";
    "All desktop copy goes through Paraglide"; "Use Tabler outline icons";
    "Every flow covers loading, empty, error … states. Failures stay
    contextual, content-free, input-preserving, and actionable."
  - `docs/UX.md` (Single-shelf layout): "Preferences is a focused transient
    surface containing the active Notes folder, … and the disclosed
    default-off update setting; it is not a product destination." Feature map
    row: "| Preferences | Search-trailing gear Popover | Appearance, language,
    Notes folder, and capture state scroll within a 400 by 480 shelf. |"
  - `docs/PRIVACY.md` "Network access and updates": "With update checks
    disabled, the desktop performs no network requests." Opening a link hands
    a URL to the default browser; the app itself still requests nothing, and
    that must be written down (the site paragraph in "Promise" is the model:
    "None of these destinations is embedded or contacted until the visitor
    explicitly follows its link.").
  - Backlog constraints: open only after explicit activation, no iframe, no
    tracking, no automatic request, no marketing page, no new route.
- French catalog typography: `messages.test.ts` rejects a normal space before
  `? ! ; :`; the catalog uses U+00A0 (see `markdown_help_local` in `fr.json`)
  and the typographic apostrophe `’`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit (focused) | `bun run --cwd apps/desktop test -- src/features/preferences src/app` | pass |
| Full | `bun run check` | exit 0 |
| Privacy scan | `bun run build:desktop && bun scripts/check-privacy.ts apps/desktop/dist` | `privacy scan passed for apps/desktop/dist` |
| Rust (validates the capability file) | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | pass; then `rm -rf apps/desktop/src-tauri/target/debug` |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |

## Scope

**In scope** (the only files you should modify):
- `apps/desktop/vite.config.ts`
- `apps/desktop/src/env.d.ts` (create)
- `apps/desktop/src/features/preferences/preferences-panel.tsx`
- `apps/desktop/src/features/preferences/preferences-panel.test.tsx`
- `apps/desktop/src-tauri/capabilities/main.json`
- `apps/desktop/src/app/window-config.test.ts`, `apps/desktop/src/app/theme-contract.test.ts` (capability assertions only)
- `scripts/check-privacy.ts` (allowlist only)
- `apps/desktop/messages/en.json`, `apps/desktop/messages/fr.json`
- `apps/desktop/src/styles/app.css` (only if the About section needs a rule)
- `apps/desktop/e2e/release.spec.ts` (one new test)
- `docs/UX.md`, `docs/PRIVACY.md` (the sentences named in Step 5)

**Out of scope**:
- The Help popover. The backlog item asks for Preferences; Help stays about
  capture and Markdown.
- Links to `LICENSE` or `CODE_OF_CONDUCT.md` (operator question; the MIT
  license is named in text only).
- The existing Releases button's ignored rejection. Leave it as is; note it
  in the PR.
- Reading the version from Rust or adding `core:app:allow-version`: the
  build-time manifest version is deterministic and needs no new permission.
- Any `<a href>` navigation inside the webview, any iframe, favicon, preview,
  or prefetch of the destinations.
- The public site (`apps/site`).

## Git workflow

- Branch: `codex/057-about-links`
- Commit: `feat(preferences): show the version and open-source links in About`
  (conventional commits, as in `git log`: `fix(release): forward locked flag to Cargo (#57)`)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Expose the manifest version at build time

In `apps/desktop/vite.config.ts`, read the desktop manifest and define one
constant (this is the pattern from the Vite `define` documentation):

```ts
import { readFileSync } from 'node:fs';
…
const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };

export default defineConfig(() => ({
  define: { __CHARON_VERSION__: JSON.stringify(version) },
  plugins: [ … unchanged … ],
  …
}));
```

Create `apps/desktop/src/env.d.ts`:

```ts
/** Desktop manifest version, injected by `vite.config.ts` `define`. */
declare const __CHARON_VERSION__: string;
```

**Verify**: `bun run --cwd apps/desktop typecheck` → exit 0; `bun run lint` → exit 0.

### Step 2: Scope the opener to the two new URLs

In `capabilities/main.json`, extend the existing `opener:allow-open-url`
`allow` array to exactly, in this order:

```json
"allow": [
  { "url": "https://github.com/SimonHazard/Charon/releases/latest" },
  { "url": "https://github.com/SimonHazard/Charon" },
  { "url": "https://github.com/SimonHazard/Charon/blob/main/CONTRIBUTING.md" }
]
```

Update the same array in both pinned assertions (`window-config.test.ts` and
`theme-contract.test.ts`); rename the `theme-contract.test.ts` case to
"allows only explicit event, window lifecycle, clipboard, and GitHub link commands".
Change no other permission.

In `scripts/check-privacy.ts` `desktopNetworkAllowlist`, replace the release
comment and entry with (specific URLs first, the bare repository last):

```ts
  // Explicit user-triggered GitHub links opened through Tauri's opener plugin.
  'https://github.com/SimonHazard/Charon/blob/main/CONTRIBUTING.md',
  'https://github.com/SimonHazard/Charon/releases/latest',
  'https://github.com/SimonHazard/Charon',
```

**Verify**: `bun run --cwd apps/desktop test -- src/app` → pass;
`cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` → pass
(the Tauri build validates the capability file), then
`rm -rf apps/desktop/src-tauri/target/debug`.

### Step 3: Messages

Add to `en.json` and `fr.json` (same keys, same order, near the other
`preferences_*` keys). French uses `’` and U+00A0 before `; : ! ?`.

| Key | en | fr |
|---|---|---|
| `preferences_about` | About | À propos |
| `preferences_about_version` | Charon {version} | Charon {version} |
| `preferences_about_open_source` | Charon is open source under the MIT License. Contributions are welcome. | Charon est open source sous licence MIT. Les contributions sont bienvenues. |
| `preferences_about_repository` | Source code on GitHub | Code source sur GitHub |
| `preferences_about_contributing` | How to contribute | Comment contribuer |
| `preferences_about_links` | These links open in your default browser only when you choose them. | Ces liens s’ouvrent dans votre navigateur par défaut, seulement quand vous les choisissez. |
| `preferences_about_open_failed` | The browser could not be opened. Try again. | Le navigateur n’a pas pu s’ouvrir. Réessayez. |

**Verify**: `bun run --cwd apps/desktop test -- src/app/messages.test.ts` → pass;
`bun run messages:check` → exit 0.

### Step 4: The About section

In `preferences-panel.tsx`:

1. Next to `RELEASES_URL`, add
   `const REPOSITORY_URL = 'https://github.com/SimonHazard/Charon';` and
   `const CONTRIBUTING_URL = 'https://github.com/SimonHazard/Charon/blob/main/CONTRIBUTING.md';`.
2. Add `const [aboutLinkFailed, setAboutLinkFailed] = useState(false);` and

```tsx
  const openAboutLink = async (url: string) => {
    setAboutLinkFailed(false);
    try {
      await openUrl(url);
    } catch {
      setAboutLinkFailed(true);
    }
  };
```

3. After the Updates `</section>` and before `</PopoverContent>`, add:

```tsx
        <section className="preferences-group" aria-labelledby="preferences-about-title">
          <h2 id="preferences-about-title">{m.preferences_about()}</h2>
          <p>{m.preferences_about_version({ version: __CHARON_VERSION__ })}</p>
          <p>{m.preferences_about_open_source()}</p>
          <div className="preferences-update-actions">
            <Button
              aria-describedby="preferences-about-links"
              onClick={() => void openAboutLink(REPOSITORY_URL)}
              size="sm"
              variant="ghost"
            >
              <IconExternalLink aria-hidden="true" />
              {m.preferences_about_repository()}
            </Button>
            <Button
              aria-describedby="preferences-about-links"
              onClick={() => void openAboutLink(CONTRIBUTING_URL)}
              size="sm"
              variant="ghost"
            >
              <IconExternalLink aria-hidden="true" />
              {m.preferences_about_contributing()}
            </Button>
          </div>
          <p id="preferences-about-links">{m.preferences_about_links()}</p>
          {aboutLinkFailed ? (
            <p className="preferences-inline-warning" role="alert">
              {m.preferences_about_open_failed()}
            </p>
          ) : null}
        </section>
```

Reuse the existing `preferences-group`, `preferences-update-actions` and
`preferences-inline-warning` classes; add CSS only if the two buttons clip
or overflow at 400px wide (then a `flex-wrap: wrap` on a new
`.preferences-about-actions` class, no colours). No `<a>` element, no
`target`, no `href`: the webview never navigates.

**Verify**: `bun run --cwd apps/desktop test -- src/features/preferences` → the
existing tests pass except the heading list in the first test (fixed in the
Test plan below).

### Step 5: Contracts

- `docs/UX.md`, Single-shelf layout paragraph: replace "and the disclosed
  default-off update setting; it is not a product destination." with "the
  disclosed default-off update setting, and a quiet About footer with the
  installed version, the MIT license, and two explicit links to the source
  repository and contribution guide that open in the default browser; it is
  not a product destination."
- `docs/UX.md` feature map, Preferences row: "Appearance, language, Notes
  folder, capture state, updates, and About scroll within a 400 by 480 shelf."
- `docs/PRIVACY.md` "Network access and updates": after the paragraph that
  begins "With update checks disabled", add: "Preferences links to the
  GitHub Releases page, the public source repository, and its contribution
  guide. Charon hands each exact URL to the default browser only after the
  user activates that link, through an opener permission limited to those
  three URLs. The app itself never fetches, embeds, prefetches, or previews
  them; the destinations have their own privacy boundaries after navigation."

**Verify**: `grep -n "About footer" docs/UX.md` → 1 match;
`grep -n "opener permission limited" docs/PRIVACY.md` → 1 match.

## Test plan

In `preferences-panel.test.tsx` (model on "explains manual package
installation and links to GitHub Releases"; import
`import { openUrl } from '@tauri-apps/plugin-opener';` and use `vi.mocked(openUrl)`,
calling `vi.mocked(openUrl).mockClear()` in `beforeEach`):

1. First test: add `'About'` to the heading list.
2. New "shows the version and license without requesting anything":
   open Settings → `screen.getByText(`Charon ${__CHARON_VERSION__}`)` exists;
   text matching `/MIT License/` exists; `openUrl` was not called.
3. New "opens each GitHub link only on explicit activation": click
   "Source code on GitHub" → `openUrl` called once with
   `'https://github.com/SimonHazard/Charon'`; click "How to contribute" →
   second call with the CONTRIBUTING URL; both buttons have
   `aria-describedby="preferences-about-links"`.
4. New "keeps a browser-opening failure local and retryable":
   `vi.mocked(openUrl).mockRejectedValueOnce(new Error('denied'))`, click →
   `findByRole('alert')` contains "The browser could not be opened"; Preferences
   stays open; a second click with a resolved mock removes the alert.
5. New "matches the desktop manifest version": read
   `package.json` with `readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')`
   (add `/// <reference types="node" />` at the top as other tests do) and
   expect `__CHARON_VERSION__` to equal its `version`.

In `release.spec.ts`, add `Preferences About opens nothing until a link is
activated`: collect `page.on('request')` URLs after `page.goto(desktop)`;
open Settings; scroll `.preferences-popover` to the bottom; expect the heading
"About" and the version line visible; click "Source code on GitHub"; expect
the alert "The browser could not be opened" (no Tauri runtime in the fixture),
`page.url()` unchanged, and no collected request whose URL contains
`github.com`. The existing axe test "desktop major shelf and Preferences
states are axe-clean" must still pass with the new section.

## Done criteria

- [ ] `bun run check` exits 0; Chromium e2e passes
- [ ] `bun run build:desktop && bun scripts/check-privacy.ts apps/desktop/dist` prints `privacy scan passed for apps/desktop/dist`
- [ ] `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` passes; `apps/desktop/src-tauri/target/debug` deleted afterwards
- [ ] `grep -c "SimonHazard/Charon" apps/desktop/src-tauri/capabilities/main.json` → 3
- [ ] `grep -rn "href=" apps/desktop/src/features/preferences/preferences-panel.tsx` → nothing
- [ ] `grep -c "preferences_about" apps/desktop/messages/en.json` equals the count in `fr.json` (7 each)
- [ ] Four new unit cases and one e2e test exist and pass
- [ ] `git status --short` shows only in-scope files
- [ ] `plans/README.md` status row updated

## STOP conditions

- `cargo test` rejects the capability file or the opener scope entries (the
  plugin's URL pattern syntax differs from exact URLs): report the error;
  do not widen the scope to a wildcard.
- The privacy scan fails on a GitHub URL other than the three allowlisted
  ones, or on any new `https?://` string: report it; do not add a broader
  pattern.
- `__CHARON_VERSION__` is `undefined` in Vitest or in the e2e dev server:
  report; do not fall back to IPC or a hard-coded string.
- The About section makes the Preferences popover scroll horizontally at
  400px (the e2e `scrollWidth <= clientWidth` check in "compact Preferences
  applies themes and locale…" fails): report with a screenshot.
- The operator's uncommitted Preferences/messages/UX work is still
  uncommitted when you start.

## Maintenance notes

- Any new external link needs all four together: an exact opener scope entry,
  the two pinned capability assertions, the privacy-scan allowlist, and the
  `docs/PRIVACY.md` list. The bare-repository allowlist entry also strips
  that prefix from longer strings; keep it last so each specific URL is
  matched whole first.
- The version comes from `apps/desktop/package.json`, which the release
  workflow bumps with the three other manifests; no release step changes.
- Reviewer: check the French wrapping of the two buttons at 400×480 and that
  clicking a link in `bun run tauri:dev` opens the system browser once and
  leaves Preferences open. Delete `target/debug` afterwards.
- Deferred: links to `LICENSE` and `CODE_OF_CONDUCT.md`; handling the ignored
  rejection of the existing Releases button with the same `openAboutLink`
  pattern.
