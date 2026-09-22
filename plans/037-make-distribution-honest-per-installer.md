# Plan 037: Make the updater and installers honest for deb, rpm, MSI and macOS re-grants

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat d0efa57..HEAD -- apps/desktop/src-tauri/tauri.conf.json apps/desktop/src-tauri/src/lib.rs apps/desktop/src-tauri/src/ipc/preferences.rs apps/desktop/src-tauri/src/preferences apps/desktop/src/bindings/preferences.ts apps/desktop/src/lib/ipc/preferences-client.ts apps/desktop/src/features/updates apps/desktop/src/features/preferences/preferences-panel.tsx apps/desktop/src/app/window-config.test.ts scripts/release-artifacts.ts scripts/release-artifacts.test.ts .github/workflows/release.yml apps/desktop/messages docs/RELEASING.md docs/platform-support.md README.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Status**: DONE
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none (036 recommended first so the Rust change is compiled on all OSes)
- **Category**: bug
- **Planned at**: commit `d0efa57`, 2026-09-21

## Why this matters

Charon publishes `.deb`, `.rpm`, `.AppImage`, `.exe` (NSIS) and `.msi`. The
release manifest `latest.json` names the AppImage as the Linux updater
artifact and the NSIS installer as the Windows one. The Tauri updater
installs according to the *installed* bundle type: a deb/rpm/MSI install
downloads the AppImage/NSIS bytes and fails at install time. The UI collapses
every failure to one generic error. Separately, macOS users lose Input
Monitoring and Accessibility after every update (ad-hoc signing, ADR 0014),
and the install dialog does not warn them. The Linux packages also declare a
tray/xdo dependency the binary never loads. This plan makes each installer
path tell the truth and removes the dead dependencies.

## Current state

- `apps/desktop/src-tauri/tauri.conf.json:34` `"targets": ["app","dmg","deb","appimage","rpm","nsis","msi"]`;
  lines 52-63 Linux depends:

```json
"deb": { "depends": ["libwebkit2gtk-4.1-0","libgtk-3-0","libayatana-appindicator3-1","librsvg2-2","libxdo3"] },
"rpm": { "depends": ["webkit2gtk4.1","gtk3","libappindicator-gtk3","librsvg2","xdotool"] },
```

  `grep -rn "TrayIcon\|tray\|xdo" apps/desktop/src-tauri/src` returns nothing;
  `Cargo.toml` `tauri = { version = "=2.11.5", features = [] }` (no `tray-icon`).
- `scripts/release-artifacts.ts:21-33` — Linux `updater: /\.AppImage$/`,
  installers deb/rpm; Windows `updater` = NSIS `.exe`, installers include `.msi`.
- `apps/desktop/src/features/updates/update-context.tsx:151-162` — `downloadAndInstall` catches everything into `setStatus('error')`.
- `apps/desktop/messages/en.json:189` `update_error`, `:199` `update_install_description`.
- `apps/desktop/src/features/preferences/preferences-panel.tsx:427-449` — the install `AlertDialog`; `:294-310` the macOS permission rows.
- `apps/desktop/src-tauri/src/ipc/preferences.rs` — `preferences_read` returns `PreferencesSnapshot` (`schemaVersion`, `workspaceName`, `hasRememberedWorkspace`), generated to `apps/desktop/src/bindings/preferences.ts` via `ts-rs` (`bun run bindings:generate`).
- `apps/desktop/src/app/window-config.test.ts:76-82` asserts targets include `msi`.
- Tauri facts (verified 2026-09-21 on docs.rs / v2.tauri.app): the updater
  supports AppImage on Linux and both NSIS and MSI on Windows, but only for the
  bundle type that was installed; there is no in-place deb/rpm update.
  `tauri::utils::platform::bundle_type()` is not a public stable API in 2.11 —
  detect the bundle type instead with an env/marker approach (Step 1).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Rust tests | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | pass |
| Bindings regen | `bun run bindings:generate` then `bun run bindings:check` | exit 0 |
| IPC names | `bun run ipc:check` | exit 0 |
| Release scripts | `bun run test:release` | pass |
| Desktop unit | `bun run --cwd apps/desktop test` | pass |
| Full | `bun run check` | exit 0 |

## Scope

**In scope**: files in the drift-check list above, plus
`apps/desktop/src-tauri/src/preferences/model.rs` (add a field) and
`apps/desktop/src/features/updates/update-context.test.tsx`.

**Out of scope**:
- Changing the updater endpoint, signing key handling, or ADR 0014/0016 decisions.
- The site (`apps/site`).
- Any capture code.

## Implemented changes

- Added the typed `installKind` preference snapshot and a cached native detector
  for AppImage, deb, rpm, NSIS, MSI, macOS, and unknown installations.
- Kept update checks enabled for every bundle, while package-managed installs
  now receive a manual GitHub Releases path instead of a mismatched updater
  artifact; AppImage, NSIS, and macOS retain explicit self-install.
- Added the scoped Tauri opener permission and release link, plus the macOS
  Input Monitoring and Accessibility re-grant notice in English and French.
- Removed unused Linux tray/X11 package dependencies and aligned README,
  platform-support, and releasing documentation with the installer behavior.
- Regenerated the preferences binding and added Rust, updater, Preferences,
  capability, bundle, and release-contract coverage.

## Git workflow

- Branch: `codex/037-honest-distribution`
- Commits: `feat(desktop): report the installed bundle type`,
  `fix(updater): explain package-manager installs and macos permission regrant`,
  `build(linux): drop tray and xdo package dependencies`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Report the installed bundle type over IPC

Add `installKind: 'appimage' | 'deb' | 'rpm' | 'nsis' | 'msi' | 'macos' | 'unknown'`
to `PreferencesSnapshot` (`preferences/model.rs`, derive with the existing
`ts-rs` attributes; look at how `workspaceName` is declared and copy it).
Compute it in `ipc/preferences.rs` once at startup:

- Linux: `std::env::var_os("APPIMAGE").is_some()` → `appimage`; else if the
  running executable path (`std::env::current_exe()`) starts with `/usr/` and
  `/var/lib/dpkg/status` exists → `deb`; else if `/var/lib/rpm` exists → `rpm`;
  else `unknown`.
- Windows: Tauri's NSIS installer writes the uninstaller under the install dir
  as `uninstall.exe`; MSI installs register under
  `HKCU/HKLM\Software\Microsoft\Windows\CurrentVersion\Uninstall\{product-code}`
  — the simplest robust signal is: if `uninstall.exe` sits next to
  `current_exe()` → `nsis`, else `msi`. (Reading `tauri-plugin-updater`'s own
  detection in `~/.cargo/registry/src/*/tauri-plugin-updater-2.11.0/src/updater.rs`
  around `install_inner` is the reference; copy its heuristic if it is simpler.)
- macOS: `macos`.

Regenerate bindings; update `apps/desktop/src/lib/ipc/preferences-client.ts`
if it narrows the type.

**Verify**: `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` → pass; `bun run bindings:generate && bun run bindings:check && bun run ipc:check` → exit 0.

### Step 2: Branch the update UI on install kind

In `update-context.tsx`, expose `installKind` (read from
`useNativePreferences().preferences.installKind`) as `canSelfUpdate =
installKind !== 'deb' && installKind !== 'rpm' && installKind !== 'msi'`.

In `preferences-panel.tsx` "available" branch (`:386-396`): when
`!canSelfUpdate`, replace the Review/Download flow with a message
`update_manual_install_description` ("This installation was made with a
package. Download the new version from GitHub Releases and install it the same
way.") and a button `update_open_releases` that opens
`https://github.com/SimonHazard/Charon/releases/latest` through Tauri's opener.
There is no opener plugin today: add `tauri-plugin-opener` (pinned exact
version, matching the repo's `=x.y.z` convention) with the capability
`opener:allow-open-url` restricted to that URL, or, if adding a plugin is
judged too heavy, render the URL as selectable text with a Copy button using
the existing `clipboard-manager:allow-write-text` permission. Prefer the
opener; STOP if the capability schema in `apps/desktop/src-tauri/gen/schemas`
does not list it after `cargo build`.

Keep the check itself enabled for all kinds so users still learn about new
versions.

**Verify**: `bun run --cwd apps/desktop test -- src/features/updates` → pass, with a new test: `installKind: 'deb'` and an available update renders the manual-install message and no download button.

### Step 3: Warn macOS users about the permission re-grant

In the install dialog (`preferences-panel.tsx:427-449`) when
`native.capabilities?.platform === 'macos'`, add a paragraph
`update_macos_regrant_notice` ("After the update, macOS may ask again for
Input Monitoring and Accessibility. Charon shows both in Preferences.") in en
and fr. After a successful `restart` is not observable; instead, when
capabilities report `inputMonitoring === 'denied'` or `accessibility === 'denied'`
on macOS, the existing permission rows already show the state — no extra work.

**Verify**: `bun run --cwd apps/desktop test -- src/features/preferences` → pass with a test that the notice renders for `macos` and not for `windows`.

### Step 4: Drop dead Linux dependencies and decide on MSI

- `tauri.conf.json`: deb depends → `["libwebkit2gtk-4.1-0","libgtk-3-0","librsvg2-2"]`;
  rpm depends → `["webkit2gtk4.1","gtk3","librsvg2"]`.
- MSI: keep it (it is the only per-machine/GPO artifact) but it is now honest
  through Step 2. Do not remove `msi` from targets in this plan.
- Update `window-config.test.ts` if it asserts the appindicator/xdo entries
  (it asserts `libwebkit2gtk-4.1-0` only; keep that).
- `docs/platform-support.md` and `README.md` "Download and updates": add one
  sentence that deb/rpm/MSI installations are updated by downloading the new
  package, and AppImage/NSIS/macOS self-update.
- `docs/RELEASING.md`: same sentence in the artifact table if one exists.

**Verify**: `bun run --cwd apps/desktop test -- src/app/window-config.test.ts` → pass; `bun run test:release` → pass; `bun run check` → exit 0.

## Test plan

- `update-context.test.tsx`: `canSelfUpdate` false for deb/rpm/msi, true for appimage/nsis/macos/unknown.
- `preferences-panel.test.tsx`: manual-install branch; macOS regrant notice.
- Rust: unit test for the Linux detection function with injected env/paths (model after existing tests in `src/preferences/storage.rs`).

## Done criteria

- [x] `bun run check` exits 0; `cargo test … --locked` passes
- [x] `grep -n "appindicator\|xdo" apps/desktop/src-tauri/tauri.conf.json` returns nothing
- [x] `PreferencesSnapshot` in `apps/desktop/src/bindings/preferences.ts` contains `installKind`
- [x] `grep -n "update_manual_install_description\|update_macos_regrant_notice" apps/desktop/messages/en.json apps/desktop/messages/fr.json` → 2 matches each
- [x] No files outside the in-scope list are modified
- [x] `plans/README.md` status row updated

## STOP conditions

- The X11 adapter or any crate in `Cargo.lock` links `libxdo` (check with
  `grep -n xdo apps/desktop/src-tauri/Cargo.lock`; today it returns nothing). If it does, keep the xdo dependency and report.
- Adding `tauri-plugin-opener` changes the CSP or requires a permission not
  expressible in `capabilities/main.json`.
- The updater plugin's own bundle detection in the vendored source disagrees
  with the heuristic above: use the plugin's, and report the difference.

## Maintenance notes

- If `tauri-plugin-updater` gains deb/rpm support, flip `canSelfUpdate`.
- Reviewer: check that `installKind` never leaks a filesystem path to React (it is an enum).
- Deferred: dropping MSI entirely (decision for the operator, see README).
