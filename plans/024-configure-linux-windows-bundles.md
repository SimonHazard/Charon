# Plan 024: Configure Linux and Windows bundles so `tauri build` produces installers on every OS

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in "STOP conditions" occurs, stop and report — do not
> improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f2b1bbd..HEAD -- apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/Cargo.toml apps/desktop/src-tauri/src/lib.rs .github/workflows/review-builds.yml docs/RELEASING.md docs/RELEASE_CHECKLIST.md apps/desktop/src/app/window-config.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S (config) — physical install checks on Linux/Windows are an operator gate
- **Risk**: LOW
- **Depends on**: none (Plan 015 will build on this; do not wait for it)
- **Category**: dx / distribution (cross-platform)
- **Planned at**: commit `f2b1bbd`, 2026-08-17

## Why this matters

`apps/desktop/src-tauri/tauri.conf.json` sets `bundle.targets: ["app"]` — the
macOS `.app` type — and has no `bundle.linux` or `bundle.windows` section. On
Linux or Windows, `bun run tauri:build` therefore produces no installer (the
bundler skips package types it cannot build on the host), so a contributor on
those platforms has no path from source to something installable. The manual
`review-builds.yml` works only because it overrides the config with
`--bundles deb,appimage` / `--bundles msi,nsis` on the CLI. With no
`windows.webviewInstallMode`, the NSIS/MSI installers default to the
*download bootstrapper*, which needs network access during install — at odds
with a product positioned as offline/local-only. With no `linux.deb.depends`,
the `.deb` may install on a system missing `libwebkit2gtk-4.1-0` and fail at
launch. The config also carries mobile leftovers (`bundle.android`,
`crate-type = ["staticlib","cdylib","rlib"]`, `#[cfg_attr(mobile, ...)]`,
`icons/android`, `icons/ios`) in a desktop-only product.

Plan 015 (protected releases) owns signing, updater, and the release matrix; it
explicitly lists Tauri bundle config in its scope. This plan makes the checked-in
config correct **for local and review builds** so 015 has a working base and so
`docs/RELEASE_CHECKLIST.md`'s Linux/Windows rows can be exercised at all.

## Current state

`apps/desktop/src-tauri/tauri.conf.json:31-56`:

```json
"bundle": {
  "active": true,
  "targets": ["app"],
  "category": "Productivity",
  "publisher": "Simon Hazard",
  ...
  "icon": ["icons/32x32.png", "icons/64x64.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.png", "icons/icon.icns", "icons/icon.ico"],
  "android": { "debugApplicationIdSuffix": ".debug" },
  "macOS": { "minimumSystemVersion": "14.0", "signingIdentity": "-" }
}
```

- `icons/icon.ico`, `icon.icns`, and every PNG listed exist (verified). The
  `Square*Logo.png`/`StoreLogo.png` set is unused by NSIS/MSI (MSIX only).
- `apps/desktop/src-tauri/Cargo.toml:12-14` — `[lib] crate-type = ["staticlib", "cdylib", "rlib"]`.
- `apps/desktop/src-tauri/src/lib.rs:13` — `#[cfg_attr(mobile, tauri::mobile_entry_point)]`.
- `.github/workflows/review-builds.yml:17-27` — matrix passes
  `--no-sign --bundles app,dmg` / `--bundles deb,appimage` / `--bundles msi,nsis`.
- `.github/workflows/quality.yml:51` — apt prerequisites include
  `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`,
  `libxdo-dev` (runtime equivalents: `libwebkit2gtk-4.1-0`,
  `libayatana-appindicator3-1`, `librsvg2-2`, `libxdo3`).
- `apps/desktop/src/app/window-config.test.ts` reads `tauri.conf.json` and
  asserts window geometry — extend it, don't add a second config test file.
- `docs/RELEASING.md:11-19` describes ad-hoc macOS review builds and manual
  Linux/Windows review bundles.
- Tauri 2 config reference: <https://v2.tauri.app/reference/config/#bundleconfig>
  (`targets` accepts `"all"` or a list; per-OS keys `linux`, `windows`,
  `macOS`; `windows.webviewInstallMode` values `downloadBootstrapper` (default),
  `embedBootstrapper`, `offlineInstaller`, `fixedRuntime`, `skip`).

Conventions: keep every claim in docs honest — Linux/Windows bundles remain
**unsigned review artifacts** until Plan 015; do not add updater config here.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Config schema check | `bunx tauri info` (from `apps/desktop`) | prints config without schema errors |
| Local build (macOS host) | `bun run tauri:build` | `.app` (and `.dmg` if listed) under `apps/desktop/src-tauri/target/release/bundle/` |
| Unit test | `bun run test:desktop` | pass |
| Rust | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |
| Review artifacts (operator) | `gh workflow run review-builds.yml` | three artifacts uploaded |

## Scope

**In scope**:
- `apps/desktop/src-tauri/tauri.conf.json`
- `apps/desktop/src-tauri/Cargo.toml` (`crate-type` only)
- `apps/desktop/src-tauri/src/lib.rs` (remove the `mobile` cfg attribute only)
- `apps/desktop/src-tauri/icons/android/`, `icons/ios/` (delete)
- `.github/workflows/review-builds.yml` (drop the now-redundant `--bundles` overrides or keep them in sync — see Step 4)
- `apps/desktop/src/app/window-config.test.ts` (assert the bundle config)
- `docs/RELEASING.md`, `docs/RELEASE_CHECKLIST.md` (wording)

**Out of scope**:
- Signing identities, notarization, updater, GitHub Releases (Plan 015).
- `bundle.macOS` (leave as is; Plan 015 reconciles `signingIdentity`).
- Any Rust logic beyond the one attribute.

## Git workflow

- Branch: `codex/024-linux-windows-bundles`
- Commit message: `build(desktop): configure linux and windows bundles`
- Do NOT push, dispatch workflows, or open a PR unless the operator instructed it.

## Steps

### Step 1: Declare per-platform bundle targets and settings

Edit `tauri.conf.json` `bundle`:

```json
"targets": ["app", "dmg", "deb", "appimage", "rpm", "nsis", "msi"],
"linux": {
  "deb": {
    "depends": ["libwebkit2gtk-4.1-0", "libgtk-3-0", "libayatana-appindicator3-1", "librsvg2-2", "libxdo3"]
  },
  "rpm": {
    "depends": ["webkit2gtk4.1", "gtk3", "libappindicator-gtk3", "librsvg2", "xdotool"]
  },
  "appimage": { "bundleMediaFramework": false }
},
"windows": {
  "webviewInstallMode": { "type": "embedBootstrapper" },
  "nsis": { "installMode": "currentUser", "languages": ["English", "French"] }
}
```

Remove the `"android"` object. Tauri ignores targets that do not apply to the
build host, so one list serves all three OSes; if `bunx tauri info` or the
schema rejects `"rpm"` dependency names, drop `rpm` from `targets` rather than
guessing package names (record it). `embedBootstrapper` keeps the installer
small while allowing offline install when the WebView2 runtime is already
present (Windows 11 default) — if the operator prefers a fully offline
installer, use `"offlineInstaller"` (≈+120 MB) and note it in RELEASING.md.

**Verify**: `cd apps/desktop && bunx tauri info` → no config error; `bun run tauri:build` on the macOS host → `.app` and `.dmg` produced (`ls apps/desktop/src-tauri/target/release/bundle/`).

### Step 2: Remove mobile leftovers

- `Cargo.toml:14` → `crate-type = ["rlib"]` (Tauri desktop needs only the rlib
  for the `bin` target; keep the `[[bin]] name = "Charon"`).
- `lib.rs:13` → delete `#[cfg_attr(mobile, tauri::mobile_entry_point)]`.
- Delete `apps/desktop/src-tauri/icons/android/` and `icons/ios/`.

**Verify**: `cargo clippy ... -D warnings && cargo test ... --locked` → exit 0; `bun run tauri:build` still succeeds on the host.

### Step 3: Assert the config in the existing test

In `apps/desktop/src/app/window-config.test.ts`, add assertions: `bundle.targets`
contains `deb`, `appimage`, `nsis`, `msi`, `app`; `bundle.windows.webviewInstallMode.type`
is not `downloadBootstrapper`; `bundle.linux.deb.depends` includes
`libwebkit2gtk-4.1-0`; `bundle.android` is undefined. Model on the existing
assertions in that file.

**Verify**: `bun run test:desktop` → passes with the new assertions.

### Step 4: Keep the review workflow consistent

In `review-builds.yml`, either delete the `--bundles ...` overrides (the config
now decides) or keep them and add a YAML comment that they must match
`tauri.conf.json` `bundle.targets`. Prefer deleting; keep `--no-sign`.
`bun scripts/check-workflows.ts` must still pass (`review-builds.yml`
fragments are asserted at `scripts/check-workflows.ts:85-104`; `--bundles` is
not among them).

**Verify**: `bun scripts/check-workflows.ts` → passes.

### Step 5: Document and hand over the physical checks

- `docs/RELEASING.md` "review builds" paragraph: state that `bun run tauri:build`
  now yields platform-native unsigned installers on each OS (`.deb`/AppImage/
  `.rpm` on Linux, NSIS/MSI on Windows, `.app`/`.dmg` on macOS), the WebView2
  install mode chosen, and that none of it is a signed-publisher claim.
- `docs/RELEASE_CHECKLIST.md` Linux/Windows rows: add "install from the review
  artifact, launch, create/open Workspace" as the evidence to record.
- Ask the operator to run `review-builds.yml` once and to install the Linux and
  Windows artifacts on real machines/VMs. Record results in the status row.

**Verify**: `git diff --stat` shows only in-scope files; `bun run test:desktop` and Cargo gates pass.

## Test plan

- `window-config.test.ts` assertions (Step 3).
- macOS host: `bun run tauri:build` succeeds before and after (Steps 1-2).
- Operator: one `review-builds.yml` run with three artifacts; install + launch
  on Linux (Ubuntu 24.04 `.deb` and AppImage) and Windows 11 (NSIS); record in
  the status row.

## Done criteria

- [ ] `tauri.conf.json` lists per-platform targets, `linux.deb.depends`, and a non-download `windows.webviewInstallMode`; no `bundle.android`
- [ ] `crate-type = ["rlib"]`; no `mobile` cfg attribute; `icons/android` and `icons/ios` removed
- [ ] `window-config.test.ts` asserts the bundle config; `bun run test:desktop` passes
- [ ] `bun scripts/check-workflows.ts` passes
- [ ] `bun run tauri:build` on the macOS host produces `.app` (+ `.dmg`)
- [ ] Operator evidence for one Linux and one Windows install is recorded, or the row says `AWAITING OPERATOR: install checks`
- [ ] `plans/README.md` status row for 024 updated

## STOP conditions

- `bunx tauri info`/`tauri build` rejects the config (schema change in the
  pinned CLI 2.11.4) — report the exact message; do not downgrade/upgrade the
  CLI.
- Removing `staticlib`/`cdylib` breaks `tauri build` on the host — restore and
  report (some Tauri versions require `cdylib` for iOS only; desktop should not).
- Plan 015 has already changed `bundle.*` when you start — reconcile with its
  executor instead of overwriting.

## Maintenance notes

- Plan 015 must reuse these targets for the release matrix and decide the
  WebView2 install mode for public artifacts (bootstrapper vs offline).
- Debian dependency names track the Ubuntu 24.04 baseline used in CI; when the
  runner image moves, recheck `libwebkit2gtk-4.1-0`.
- If a Linux desktop file/category or Windows file association is ever needed,
  it belongs in `bundle.linux`/`bundle.windows` here, not in Rust.
