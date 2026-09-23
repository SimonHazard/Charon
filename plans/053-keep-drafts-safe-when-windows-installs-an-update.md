# Plan 053: Keep drafts safe when Windows closes Charon to install an update

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src/features/updates apps/desktop/src/features/preferences/preferences-panel.tsx apps/desktop/src/features/preferences/preferences-panel.test.tsx apps/desktop/messages docs/UX.md docs/PRIVACY.md && git status --short -- apps/desktop/src apps/desktop/messages docs`
> (without `..HEAD` the diff includes uncommitted edits). The operator's
> macOS-permission PR and plans 038, 040, 041 and 052 land first and touch the
> Preferences panel, its test, the catalogs and `docs/UX.md`; that is expected
> drift. Compare the "Current state" excerpts against the live code; any other
> mismatch is a STOP condition.

## Status

- **Priority**: P1 (a Windows user can lose typed text)
- **Effort**: S
- **Risk**: MED
- **Depends on**: 052 (same install dialog)
- **Category**: bug
- **Planned at**: commit `242d51e`, 2026-09-23 (Tauri best-practice audit)

## Why this matters

AGENTS.md and ADR 0016 Decision 4 require that restart waits for dirty
drafts. On Windows it does not: the official updater guide says the
application exits automatically when the install step runs
(<https://v2.tauri.app/plugin/updater/>, note under "Checking for Updates" and
"Windows before exit hook"), and `tauri-plugin-updater` 2.11.0 ends its
Windows install with `std::process::exit(0)` (`src/updater.rs:333`). Charon
checks drafts only once, before the download starts. Text typed in the
composer or the open editor while the update downloads is lost when the
installer closes the app, and because Charon passes
`restartAfterInstall: false`, the NSIS installer does not relaunch it (it
only relaunches with `/R`, `src/config.rs:53-56`). The user sees the window
vanish and the "Restart when you are ready" state never appears on Windows.

## Current state

- `apps/desktop/src/features/updates/update-context.tsx:145-167`:

```tsx
  const downloadAndInstall = useCallback(async () => {
    const update = candidateRef.current;
    if (!update || !canSelfUpdate || workspace.isWorkspaceSwitchBlocked) return;
    setStatus('downloading');
    …
      await update.download((event: UpdateProgress) => { … });
      setStatus('installing');
      await update.install();
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [canSelfUpdate, workspace.isWorkspaceSwitchBlocked]);
```

  `workspace.isWorkspaceSwitchBlocked` is the dirty-draft flag
  (`src/app/workspace-context.tsx:84`); the value used after the `await` is the
  one captured when the button was clicked.
- `UpdateStatus` (same file, ~line 24): `idle | checking | noUpdate |
  available | downloading | installing | ready | error`.
- `canSelfUpdate` (~line 75) excludes `deb`, `rpm`, `msi`; the install kind
  comes from `native.preferences.installKind` (`InstallKind` in
  `src/bindings/preferences.ts`: `appimage | deb | rpm | nsis | msi | macos | unknown`).
- `apps/desktop/src/features/updates/update-client.ts:40`:
  `install: () => update.install({ restartAfterInstall: false }),`.
- Install dialog: `preferences-panel.tsx` (the `AlertDialog` after
  `</PopoverContent>`), messages `update_install_description`,
  `update_install_blocked`, `update_ready_to_restart`, `update_restart_blocked`.
- Tests: `update-context.test.tsx` "downloads with progress, installs
  explicitly, and waits for clean drafts to restart" (~line 139) is the pattern.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit | `bun run --cwd apps/desktop test -- src/features/updates src/features/preferences` | pass |
| Full | `bun run check` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |

## Scope

**In scope**: `update-context.tsx`, `update-context.test.tsx`,
`update-client.ts`, `preferences-panel.tsx`, `preferences-panel.test.tsx`,
both message catalogs, `docs/UX.md` (updates sentence).

**Out of scope**: macOS/Linux install behaviour (they install in place and
wait for an explicit restart), the updater plugin configuration, Rust.

## Git workflow

- Branch: `codex/053-windows-update-draft-safety`
- Commit: `fix(updates): never let the Windows installer close a dirty draft`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Split download from install and re-check drafts live

- Mirror `workspace.isWorkspaceSwitchBlocked` in a ref updated on every render.
- Add status `downloaded`. `downloadAndInstall` becomes `download()` (sets
  `downloaded` when done) and `install()` (runs only from `downloaded`, and
  only when the ref says drafts are clean; otherwise it keeps `downloaded`).
- macOS and AppImage keep today's flow: after `download()` they call
  `install()` automatically if drafts are clean, then `ready`.

### Step 2: Windows needs a second, explicit, draft-safe click

- For `installKind === 'nsis'`, stop at `downloaded` and show
  `update_windows_close_notice` ("Charon closes to install the update and
  reopens when it finishes." / "Charon se ferme pour installer la mise à jour
  et se rouvre ensuite.") with a "Close and install" / "Fermer et installer"
  button (`update_close_and_install`), disabled with `update_install_blocked`
  while a draft is dirty.
- `update-client.ts`: pass `restartAfterInstall: true` only for NSIS, so the
  installer relaunches Charon (`/R`).

### Step 3: Tests and contract

`update-context.test.tsx` new cases: a draft that becomes dirty during the
download stops at `downloaded` and never calls `install`; NSIS never installs
without the second call; NSIS passes `restartAfterInstall: true`; macOS still
installs automatically when clean. `preferences-panel.test.tsx`: the Windows
dialog shows the close notice and disables "Close and install" while blocked.
`docs/UX.md` updates sentence: "On Windows the installer closes Charon; the
install button stays disabled until every draft is saved, and the installer
reopens Charon."

**Verify**: unit tests → pass; `bun run check` → exit 0.

## Test plan

- 4 `update-context` cases and 1 Preferences case above; existing updater
  tests keep passing.

## Done criteria

- [ ] `bun run check` exits 0; Chromium e2e passes
- [ ] `grep -n "'downloaded'" apps/desktop/src/features/updates/update-context.tsx` → at least one match
- [ ] `grep -n "restartAfterInstall: false" apps/desktop/src/features/updates/update-client.ts` → nothing unconditional
- [ ] Batch operator test (Windows, if available): type in the composer during a download, see "Close and install" disabled until saved, then Charon closes, installs and reopens
- [ ] `plans/README.md` status row updated

## STOP conditions

- The pinned `@tauri-apps/plugin-updater` JS API has no `download()` /
  `install()` split or no `restartAfterInstall` option: report the actual API.
- A Windows run shows the installer does not relaunch Charon with `/R`
  under `installMode: passive`: report; keep the explicit notice.

## Maintenance notes

- Any future install path must re-check drafts immediately before the step
  that can exit the process.
