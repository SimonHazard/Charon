# Plan 027: Harden the webview, IPC, site, and CI boundaries

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `plans/README.md`. Never print, invent, or commit a secret; this plan
> references credential *locations and types* only.
>
> **Drift check (run first)**:
> `git diff --stat f2b1bbd..HEAD -- apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/capabilities apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/src/ipc/workspace.rs apps/desktop/src-tauri/src/workspace/mod.rs apps/desktop/src-tauri/src/workspace/storage.rs apps/desktop/src/app/window-config.test.ts apps/desktop/src/features/notes/note-screen.tsx apps/desktop/src/lib/ipc/workspace-client.ts scripts/check-workflows.ts .github/workflows apps/site/public apps/site/src/layouts/BaseLayout.astro apps/site/scripts/verify-site.ts docs/PRIVACY.md docs/ARCHITECTURE.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 (Steps 1-5), P2 (Step 6)
- **Effort**: M
- **Risk**: LOW for Steps 1-5, MED for Step 6 (changes the attachment picker path)
- **Depends on**: `plans/023-make-desktop-ui-honest-per-platform.md` (adds `core:window:allow-start-dragging`; keep it) — otherwise none
- **Category**: security
- **Planned at**: commit `f2b1bbd`, 2026-08-17

## Why this matters

The security posture is already strong (no HTML sink, no network, typed
content-free IPC errors, no logging). The remaining gaps are boundary hygiene,
each cheap to close, and one architectural inconsistency:

1. **CSP misses directives that do not inherit from `default-src`.**
   `form-action` and `base-uri` have no fallback, so a form POST or `<base>`
   hijack from injected note content could still leave the webview. `img-src`
   lists `asset:` although the asset protocol is not enabled.
2. **`core:default` grants unused surface** to the webview: menus (incl.
   `set-as-app-menu`, `popup`), tray, `get-all-windows`/`webviews`,
   `internal-toggle-devtools`, `core:image` (`from-path`+`rgba` become a file
   read primitive the day an image feature is enabled). The frontend uses only
   `invoke` (custom commands), `listen`/`unlisten`, the dialog `open`, and the
   drag region.
3. **Four IPC commands nothing calls** (`workspace_create`, `workspace_open`,
   `workspace_close`, `workspace_health`) remain reachable, three taking raw
   `path` strings; `workspace_open_or_create` (used) will populate an unrelated
   non-empty directory with a manifest and `notes/`, unlike the default path
   which refuses to adopt an unrelated directory.
4. **Attachment source paths are trusted from the webview.** The picker runs
   in the webview and its result crosses IPC as `sourcePaths`; Rust validates
   "regular non-symlink file outside the active Workspace" but cannot tell a
   picker result from a fabricated path. `docs/ARCHITECTURE.md` says the
   picker "may return transient source paths to the command boundary" — so a
   compromised webview could ask Rust to copy any readable file into
   `attachments/`. Local-only threat model, but "Rust owns everything" is the
   stated architecture and moving the picker into Rust (like
   `workspace_choose_directory`) is small.
5. **CI/site hygiene**: `check-workflows.ts` only scans `*.yml` (a `*.yaml`
   workflow bypasses every policy); the release checkouts keep the elevated
   `GITHUB_TOKEN` in `.git/config` while a third-party action runs
   (`persist-credentials` unset); the static site ships no `_headers`
   (CSP/Referrer-Policy/nosniff) and its two outbound links have no
   `rel="noreferrer"`.
6. **A credential-shaped value sits in the untracked repo-root `.env`** (one
   bare line, no `KEY=`; classified by both auditors as a Cloudflare user API
   token by prefix; never committed; nothing in the repo reads it). This is an
   operator action: rotate it, delete the file, and add a committed
   `.env.example` naming the variables the repo actually reads.

## Current state

- `apps/desktop/src-tauri/tauri.conf.json:26-29`:
  `"csp": "default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' asset: data:; style-src 'self' 'unsafe-inline'"`
  and `devCsp` adding `http://127.0.0.1:1420 ws://127.0.0.1:1420`.
- `apps/desktop/src-tauri/capabilities/main.json:6` —
  `["core:default", "clipboard-manager:allow-write-text", "dialog:allow-open"]`
  (Plan 023 adds `core:window:allow-start-dragging`).
- `apps/desktop/src-tauri/gen/schemas/acl-manifests.json` — `core:event:default`
  = `allow-listen, allow-unlisten, allow-emit, allow-emit-to`;
  `core:window:default` lacks `allow-start-dragging`.
- Frontend Tauri usage: `@tauri-apps/api/core` `invoke` and `@tauri-apps/api/event`
  `listen` in `apps/desktop/src/lib/ipc/*.ts`; `@tauri-apps/plugin-dialog`
  `open` in `note-screen.tsx:42-46`; nothing imports `/window`, `/webview`,
  `/menu`, `/tray`, `/image`, `/app`, `/path`.
- `apps/desktop/src-tauri/src/lib.rs:31-50` — `generate_handler!` registers 18
  commands incl. the four unused ones. `apps/desktop/src/lib/ipc/workspace-client.ts:25-31`
  invokes `workspace_snapshot`, `workspace_bootstrap`, `workspace_bootstrap_default`,
  `workspace_choose_directory`, `workspace_open_or_create`, `workspace_execute`.
- `apps/desktop/src-tauri/src/ipc/workspace.rs:20-28` — `workspace_choose_directory`
  is the Rust-side folder picker (async, `app.dialog().file().pick_folder`);
  `:227-233` `open_or_create_workspace`; `:253-264` `default_candidate_is_safe`.
- `apps/desktop/src-tauri/src/workspace/command.rs:33-37` —
  `ImportNoteAttachments { expected_revision, note_id, source_paths: Vec<String> }`;
  `mod.rs:478-513` `prepare_attachment_import`; `storage.rs:279-323` `read_external_regular`.
- `apps/desktop/src/app/window-config.test.ts` reads `tauri.conf.json` and
  `lib.rs` — the natural home for CSP/capability assertions.
- `scripts/check-workflows.ts:4` — `.filter((file) => file.endsWith('.yml'))`.
  `.github/workflows/release.yml:24,49` — `actions/checkout` without
  `persist-credentials: false`; `:44` `permissions: contents: write`.
- `apps/site/public/` — `brand/`, `robots.txt`, `site.webmanifest` (no
  `_headers`); `apps/site/wrangler.jsonc` `assets` block; `BaseLayout.astro:79-80`
  two footer `<a>` without `rel`; `apps/site/scripts/verify-site.ts:77-92`
  asserts exactly two footer links.
- `.gitignore:3-5` — `.env`, `.env.*`, `!.env.example`; no `.env.example` exists.
  Environment variables actually read: `CHARON_SITE_ORIGIN`, `CHARON_SITE_BASE`
  (`apps/site/astro.config.mjs`), `CHARON_DESKTOP_ONLY_E2E`
  (`apps/desktop/playwright.config.ts`), `CLOUDFLARE_ACCOUNT_ID`/`CLOUDFLARE_API_TOKEN`
  (CI secrets only).
- `docs/PRIVACY.md:43-48` and `docs/ARCHITECTURE.md:88-91` describe the
  attachment contract ("explicitly selected", "does not follow symlinks").

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Frontend | `bun run typecheck && bun run test:desktop` | pass |
| Rust | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |
| Bindings | `bun run bindings:check` | exit 0 (after any DTO change: `bun run bindings:generate`) |
| Workflow policy | `bun scripts/check-workflows.ts` | passes |
| Site | `bun run test:site` | passes (runs `verify-site.ts`) |
| Native smoke | `bun run tauri:dev` | app opens; Attachment picker, drag strip, Preferences, Copy all work |

## Scope

**In scope**:
- `apps/desktop/src-tauri/tauri.conf.json`, `capabilities/main.json`
- `apps/desktop/src-tauri/src/lib.rs`, `src/ipc/workspace.rs`, `src/workspace/mod.rs` (import guard), `src/workspace/storage.rs` (path control-char check), `src/workspace/command.rs` (only if Step 6 changes the DTO)
- `apps/desktop/src/app/window-config.test.ts`
- `apps/desktop/src/features/notes/note-screen.tsx`, `apps/desktop/src/lib/ipc/workspace-client.ts` (Step 6)
- `scripts/check-workflows.ts`, `.github/workflows/release.yml` (and `quality.yml`/`review-builds.yml`/`site-deploy.yml`/`security.yml` for `persist-credentials` only)
- `apps/site/public/_headers` (create), `apps/site/src/layouts/BaseLayout.astro`, `apps/site/scripts/verify-site.ts`
- `.env.example` (create), `docs/PRIVACY.md`, `docs/ARCHITECTURE.md` (wording)

**Out of scope**:
- Tauri isolation pattern (not justified with no HTML sink).
- Signing/release secrets (Plan 015).
- Removing the drag strip (Plan 023 note).

## Git workflow

- Branch: `codex/027-boundary-hardening`
- Commit message: `security(desktop): tighten csp, capabilities, ipc surface, and ci boundaries`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Complete the CSP

Set `csp` to
`default-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' data:; style-src 'self' 'unsafe-inline'; form-action 'none'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'`
and `devCsp` to the same plus `http://127.0.0.1:1420 ws://127.0.0.1:1420` in
`connect-src`. In `window-config.test.ts` add a test asserting the exact
`csp` string (so widening is a deliberate diff).

**Verify**: `bun run test:desktop -- window-config` → pass; `bun run tauri:dev` → styles render, IPC works, no CSP errors in the devtools console.

### Step 2: Replace `core:default` with the permissions actually used

`capabilities/main.json` `permissions` →
```json
["core:event:allow-listen", "core:event:allow-unlisten",
 "core:window:allow-start-dragging", "core:window:allow-internal-toggle-maximize",
 "clipboard-manager:allow-write-text", "dialog:allow-open"]
```
Then smoke-test natively: window opens, drag strip drags, double-click on the
strip toggles maximize (or drop `internal-toggle-maximize` if not wanted),
Attachment picker opens, Copy writes the clipboard, `workspace://changed`
events arrive (edit a Note; list updates). If any Tauri internal
(`window-state` restore, plugin init) logs a permission error, add the single
named permission it asks for and record why. Add an assertion in
`window-config.test.ts` for the exact permission array.

**Verify**: `bun run test:desktop -- window-config` → pass; native smoke checklist above passes.

### Step 3: Remove unused IPC commands and guard `open_or_create`

- `lib.rs` `generate_handler!`: delete `workspace_create`, `workspace_open`,
  `workspace_close`, `workspace_health`; delete their `#[tauri::command]`
  functions in `ipc/workspace.rs` **only if** no test needs them (the
  `default_workspace_reopens_an_existing_workspace` test uses the private
  `open_or_create_workspace`, not the commands). Keep `Workspace::create/open`
  in the domain.
- In `workspace_open_or_create`, before creating, apply
  `default_candidate_is_safe(&path)?` semantics: if the directory exists, is
  non-empty, and has no `charon.workspace.json`, return
  `WorkspaceError::Validation("target directory is not empty and is not a Workspace")`
  (map to a new `code: "not_a_workspace"` + EN/FR message if the UI must show
  it; otherwise reuse `validation`). Add a test.
- Add a script step or unit test asserting `generate_handler!` names ==
  `invoke('...')` literals in `apps/desktop/src/lib/ipc/*.ts` (see Plan 028
  TEST-02; if 028 already added it, just run it).

**Verify**: `cargo test ... --locked` → pass; `bun run typecheck && bun run test:desktop` → pass; `grep -n "workspace_create\|workspace_open\b\|workspace_close\|workspace_health" apps/desktop/src-tauri/src/lib.rs` → no matches.

### Step 4: CI and site hygiene

- `scripts/check-workflows.ts:4` → accept `.yml` and `.yaml`.
- Every `actions/checkout` step in all workflows: add `with: persist-credentials: false`
  (release.yml `signed-macos` uses `tauri-action` with `GITHUB_TOKEN` passed
  explicitly via `env`, so it does not need persisted git credentials).
- `apps/site/public/_headers`:
  ```
  /*
    Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'
    Referrer-Policy: strict-origin-when-cross-origin
    X-Content-Type-Options: nosniff
  ```
  (Cloudflare Workers Static Assets honours `_headers`; verify with
  <https://developers.cloudflare.com/workers/static-assets/headers/>.)
- `BaseLayout.astro:79-80`: add `rel="noreferrer"` to both links; extend
  `verify-site.ts` to assert `_headers` exists in `dist/` with the CSP line and
  that both footer links carry `rel="noreferrer"`.

**Verify**: `bun scripts/check-workflows.ts` → passes; `bun run test:site` → passes; `bun run build:site && test -f apps/site/dist/_headers` → exists.

### Step 5: `.env.example`, credential rotation note, and path hygiene

- Create `.env.example` listing `CHARON_SITE_ORIGIN`, `CHARON_SITE_BASE`,
  `CHARON_DESKTOP_ONLY_E2E` with one-line comments and a note that Cloudflare
  credentials live only in GitHub environment secrets. Do **not** read or copy
  the existing `.env`.
- Report to the operator: rotate the token in `.env` at its provider and delete
  the file (this plan cannot do it).
- `storage.rs::canonical_managed_path`: reject paths containing control
  characters or line breaks (`WorkspaceError::InvalidPath`) so `Copy as
  Markdown` can never receive a multi-line path (the composer escapes backticks
  but not newlines in the path field). Add a unit test.

**Verify**: `test -f .env.example`; `cargo test ... --locked` → pass.

### Step 6 (P2): Move the Attachment picker into Rust

Add `#[tauri::command] pub async fn workspace_choose_attachments(app: AppHandle) -> Result<Vec<String>, WorkspaceIpcError>`
next to `workspace_choose_directory` (same async channel pattern with
`app.dialog().file().pick_files`), returning **opaque one-shot tokens**
(UUIDs) stored in `WorkspaceRuntime` (`Mutex<HashMap<String, PathBuf>>` with a
short TTL) instead of raw paths. Change `ImportNoteAttachments.source_paths`
to `source_tokens: Vec<String>` (rename the TS field via ts-rs, regenerate
bindings), and have `prepare_attachment_import` resolve tokens → paths,
consuming them. Update `note-screen.tsx` `nativeAttachmentPicker` to invoke the
new command through `workspaceClient` (add `chooseAttachments?()`), remove the
`@tauri-apps/plugin-dialog` import from the frontend, and remove
`dialog:allow-open` from the capabilities (Rust-side dialogs need no webview
permission). Update `docs/ARCHITECTURE.md:88-91` and `docs/PRIVACY.md:43-48`
wording: "the explicit picker runs in Rust; the webview never handles source
paths". Also reject sources under any directory containing
`charon.workspace.json` (other Charon Workspaces), not only the active root.
Keep the in-memory test seam (`in_memory_with_attachment_sources`) by letting
the memory storage pre-register tokens.

**Verify**: `bun run bindings:generate && bun run bindings:check` → exit 0; `cargo test ... --locked` → pass; `bun run typecheck && bun run test:desktop` → pass; native: pick two files → attachments appear; cancel → nothing.

## Test plan

- `window-config.test.ts`: exact CSP and permission array (Steps 1-2).
- Rust: `open_or_create` guard test (Step 3), path control-char test (Step 5),
  token round-trip and expiry tests (Step 6).
- `verify-site.ts` assertions for `_headers` and `rel` (Step 4).
- Native smoke checklist after Steps 2 and 6, recorded in the status row.

## Done criteria

- [ ] CSP contains `form-action 'none'; base-uri 'none'; object-src 'none'` and no `asset:`
- [ ] `capabilities/main.json` no longer contains `core:default`; native smoke passes
- [ ] The four unused commands are gone; `workspace_open_or_create` refuses unrelated non-empty directories (test)
- [ ] `check-workflows.ts` scans `.yaml`; every checkout sets `persist-credentials: false`
- [ ] `apps/site/dist/_headers` is produced and asserted; footer links have `rel="noreferrer"`
- [ ] `.env.example` exists; the operator has been told to rotate/delete `.env`
- [ ] (Step 6) Attachment picker runs in Rust; `dialog:allow-open` removed; docs updated
- [ ] All gates: `bun run typecheck && bun run test:desktop && bun run test:site`, Cargo fmt/clippy/test, `bun run bindings:check`, `bun scripts/check-workflows.ts`
- [ ] `plans/README.md` status row for 027 updated

## STOP conditions

- Narrowing capabilities breaks a Tauri internal you cannot identify from the
  console (report the exact denied command instead of restoring `core:default`).
- Cloudflare does not apply `_headers` for this project (check the deploy
  preview) — keep the file, note it, and add the headers via
  `wrangler.jsonc` `assets` config only if the schema supports it.
- Step 6 requires changing the transaction/attachment copy path beyond
  `prepare_attachment_import` — stop and report; the rest of the plan stands.

## Maintenance notes

- Any new webview capability must be added by name; `core:default` must not
  return. The `window-config.test.ts` assertion is the tripwire.
- If Plan 015 enables the updater plugin, add only its named permissions.
- Egress policy: `harden-runner` is in `audit` mode everywhere; graduate to
  `block` with an allowlist after reviewing a few runs' logs (out of scope).
