# Plan 052: Retire the per-update macOS permission notice once releases keep their TCC grants

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 242d51e -- apps/desktop/src/features/preferences/preferences-panel.tsx apps/desktop/src/features/preferences/preferences-panel.test.tsx apps/desktop/messages .github/workflows/release.yml docs/adr/0018-stable-self-signed-macos-identity.md && git status --short -- apps/desktop/src apps/desktop/messages`
> (without `..HEAD` the diff includes uncommitted edits). The operator's
> macOS-permission PR, the signing PR (ADR 0018) and plan 038 land first and
> touch these files; that is expected drift. Compare the "Current state"
> excerpts against the live code; any other mismatch is a STOP condition.

## Status

- **Priority**: P1 (must ship in `0.2.0`, the first self-signed release)
- **Effort**: S
- **Risk**: LOW
- **Depends on**: the ADR 0018 signing change merged on `main`
- **Category**: bug (copy)
- **Planned at**: commit `242d51e`, 2026-09-23

## Why this matters

ADR 0018 signs macOS releases with one stable self-signed certificate, so from
`0.2.0` on, an update keeps Input Monitoring and Accessibility. The install
dialog still warns every macOS user that "After the update, macOS may ask
again for Input Monitoring and Accessibility", which becomes false for every
update after `0.2.0` and trains users to expect a regrant that should not
happen. The one-time transition (ad-hoc `0.1.x` → signed `0.2.0`) is shown by
the already-shipped `0.1.x` dialog and disclosed in the `0.2.0` release notes,
so the notice can be removed from `0.2.0` onward.

## Current state

- `apps/desktop/src/features/preferences/preferences-panel.tsx` (install
  `AlertDialog`, around lines 459-470):

```tsx
          {native.capabilities?.platform === 'macos' ? (
            <p className="preferences-inline-warning">{m.update_macos_regrant_notice()}</p>
          ) : null}
```

- `apps/desktop/messages/en.json:205` `"update_macos_regrant_notice": "After the update, macOS may ask again for Input Monitoring and Accessibility. Charon shows both in Preferences."`;
  `fr.json:205` same key.
- `apps/desktop/src/features/preferences/preferences-panel.test.tsx`:
  `it('warns macOS users about permission re-grants in the install dialog', …)`
  (around line 363) and `it('does not show the macOS permission notice on Windows', …)`.
- Keep: `preferences_permission_regrant_help` (the operator's Preferences help
  for a stale ad-hoc entry in System Settings) stays; it still helps users
  who come from `0.1.x`.
- `scripts/check-message-keys.ts` (`bun run messages:check`) fails if a Rust
  key is missing from the catalogs; removing an unused key is safe.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Unit | `bun run --cwd apps/desktop test -- src/features/preferences` | pass |
| Full | `bun run check` | exit 0 |
| E2E | `CHARON_DESKTOP_ONLY_E2E=1 bun run --cwd apps/desktop test:e2e -- --project=chromium` | pass |

## Scope

**In scope**: `preferences-panel.tsx`, `preferences-panel.test.tsx`,
`apps/desktop/messages/en.json`, `apps/desktop/messages/fr.json`.

**Out of scope**: `preferences_permission_regrant_help`, the Preferences
permission rows, the updater logic, release notes (the release PR writes them).

## Git workflow

- Branch: `codex/052-retire-macos-regrant-notice`
- Commit: `fix(updates): drop the per-update macOS permission notice`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Remove the notice

Delete the `native.capabilities?.platform === 'macos'` paragraph from the
install dialog and the `update_macos_regrant_notice` key from both catalogs.
`grep -rn "update_macos_regrant_notice" apps/desktop/src apps/desktop/messages`
must then print nothing (Paraglide output is regenerated, never edited).

**Verify**: `bun run --cwd apps/desktop typecheck` → exit 0.

### Step 2: Tests

Replace the two notice tests with one: `shows no permission re-grant notice in
the install dialog on macOS or Windows` — open the dialog for
`clients()` and for `clients({ platform: 'windows' })` and assert
`queryByText(/ask again for Input Monitoring/)` is null in both.

**Verify**: `bun run --cwd apps/desktop test -- src/features/preferences` → pass; `bun run check` → exit 0.

## Test plan

- One replaced unit test covering both platforms.

## Done criteria

- [ ] `bun run check` exits 0; Chromium e2e passes
- [ ] `grep -rn "update_macos_regrant_notice" apps/desktop/src apps/desktop/messages` → nothing
- [ ] `plans/README.md` status row updated

## STOP conditions

- The signing change (ADR 0018) is not merged, or the latest release workflow
  change reverted macOS to ad-hoc: the notice is still true; STOP.

## Maintenance notes

- If the signing certificate is ever replaced (loss or compromise), the release
  notes, not the app, disclose the one extra regrant.
- Plan 047 models its new test on the install-dialog test replaced here; it
  must use the new test name.
