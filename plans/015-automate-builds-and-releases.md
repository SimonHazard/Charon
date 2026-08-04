# Plan 015: Automate signed builds, static hosting, and releases

> **Executor instructions**: Do not begin until Plan 014 is DONE and
> `bun run verify:release` passes twice. Never print, invent, commit, or weaken
> secrets. Agents and workflows may build/verify artifacts but must stop before
> operator-owned installation, purchase, publication, tagging, or production
> promotion unless explicitly authorized. Update the plan index when complete.
>
> **Drift check (run first)**:
> `git diff --stat 9beb3fe..HEAD -- .github scripts apps/desktop/src-tauri apps/desktop/src/features/preferences apps/site docs package.json bun.lock plans/README.md`
> Stop if workflows, signing material, updater endpoints, deployed hosting, or
> public release assets already exist without an ownership reconciliation.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: `plans/014-close-rapid-capture-quality-gaps.md`
- **Category**: security, dx, migration
- **Planned at**: commit `9beb3fe`, 2026-08-04

## Why this matters

Charon is only useful if users can install a trustworthy local app and reach a
static, truthful download page. CI must reproduce quality on macOS, Linux, and
Windows, keep signing keys secret, generate verified artifacts and updates, and
deploy Astro without turning the desktop privacy promise into a network service.

## Current state

- Plan 014 supplies the complete local release gate and dated platform evidence.
- The site is static and uses truthful release-link states but is not deployed.
- Dependencies are exact and lockfiles exist.
- Plan 012 removes unused updater/process plugins; this plan may reintroduce the
  updater only with a signed endpoint, public key, compact Preferences control,
  and updated privacy contract.
- No workflows, signing material, public artifacts, release script, checksums,
  security policy, or deployment exists at the planned baseline.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Local gate | `bun install --frozen-lockfile && bun run verify:release` | exit 0 |
| Site | `bun run --cwd apps/site check && bun run build:site && bun run test:site` | exit 0 |
| Rust | `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --all-targets` | exit 0 |
| Workflow policy | `bun run check:workflows` | syntax/pin/permission policy passes |
| Mutable actions | `rg -n "uses: [^#[:space:]]+@(v[0-9]|main|master|latest)" .github/workflows .github/actions` | no matches |
| Privacy | `bun run check:privacy` | exit 0 |
| Bundle | `bun run tauri:build` | signed or explicit unsigned-local bundle succeeds |

## Scope

**In scope**:

- Least-privilege immutable GitHub workflows/actions and Dependabot policy
- Workflow/artifact/site/download verification scripts
- Root manifests/lockfile for exact tooling
- Tauri bundle/updater config, exact Rust dependencies/lockfile/capability
- Compact updater addition inside existing Preferences only
- Static site release metadata and hosting config
- Releasing/security/checklist/privacy/platform docs, changelog, ignore files

**Out of scope**:

- Committed private keys/certificates/passwords, weakened tests, cloud sync,
  analytics, custom update server, silent updates/restarts, automatic production
  publication, certificate purchase, agent-installed packages, custom domain
  without explicit operator choice

## Git workflow

- Branch: `codex/015-distribution`
- Commits: `ci: add immutable quality and build workflows`,
  `ci(site): deploy static Astro site`,
  `feat(updater): configure signed opt-in updates`,
  `docs: add secure release runbook`
- Do not push, tag, publish, deploy, install, or open a PR unless explicitly instructed.

## Steps

### Step 1: Pin every action and add workflow policy

Resolve official stable action tags to immutable 40-character commit SHAs and
record repository, release tag, SHA, date, and purpose in `docs/RELEASING.md`.
Cover checkout, Bun, Rust/cache, artifacts, Tauri build, Pages, and security.
`check-workflows` rejects mutable actions, broad permissions, fork secrets,
unsafe expression placement, and unpinned install tools.

**Verify**: Workflow policy and Mutable actions pass; every remote action has a
reviewed tag comment/ledger entry.

### Step 2: Add least-privilege quality, security, and review builds

Quality runs frozen frontend/site gates plus Rust fmt/clippy/test/check on macOS,
Ubuntu, and Windows with read-only permissions. Security runs scheduled/manual
dependency, license, secret, and policy scans without code changes. Dependabot
opens separated exact lockfile PRs without auto-merge.

Review build matrix produces clearly named unsigned macOS, Linux, Windows
artifacts where supported, checksums, version/build metadata, and the verified
static site. Validate bundle identity, approved icons, license, no source maps,
fixtures, note content, external brand-source path, or secret.

**Verify**: authorized dry runs pass Mac/Linux and either pass Windows or record
the truthful blocker; downloaded artifacts pass verification/checksums.

### Step 3: Configure secret-only platform signing

Document protected-environment inputs for Apple Developer ID/notarization,
Windows signing if available, and Tauri updater signing. Only public keys enter
the repository. Workflows materialize secrets in runner temp, mask them, use
least privilege, and clean in `always()`.

**Verify**: policy proves release secrets are referenced only in protected release
jobs; repository scan finds no private key/certificate/password.

### Step 4: Add a human-approved signed release and opt-in updater

Release triggers annotated version tags or manual dry run, requires Plan 014
gate, version/changelog consistency, platform checklist, and environment approval.
It builds/signs/notarizes, verifies, emits SHA-256 and signed Tauri `latest.json`,
and creates a draft release. Human install/update verification gates public/latest.

Reintroduce updater dependencies only now. Add one compact Preferences control
defaulting off until the user explicitly opts in. Show available version,
download size/notes, and safe restart. Never restart over a dirty draft or install
silently. Privacy states that GitHub observes network metadata but receives no
Note/Workspace identifier/content.

**Verify**: private/prerelease older build detects, verifies, defers dirty draft,
updates on explicit action, launches new version; tampered signature fails.

### Step 5: Deploy static Astro through protected Pages

Use separate read-only build and minimal `pages:write`/`id-token:write` deploy
jobs pinned by SHA. PRs build/test only. Configure Astro site/base from reviewed
Pages settings. Generate download metadata at build time from verified public
release/checksum/signature data; the browser never calls GitHub APIs. Without a
verified release, keep View releases.

**Verify**: authorized dry deployment serves all localized routes/assets/
canonicals/sitemap/media under the base path, has no runtime API/tracker call,
and links only verified artifacts.

### Step 6: Complete operator runbooks and final signed evidence

Document version bump, changelog, local gate, tag, approvals, operator-owned
install, update-from-previous, draft promotion, rollback/yank, key compromise/
rotation, Pages rollback, and metadata refresh. Agents stop before install.

Repeat Plan 014's full capture/pasteboard/focus matrix on the exact signed macOS
bundle identity. Run standard install/composer/workspace/edit/copy/delete smoke
on signed Linux and Windows artifacts when supported. Update public platform
claims only from this evidence.

**Verify**: a second operator can follow the runbook to the explicit secret,
approval, manual-install, or publication gate without undocumented knowledge.

## Test plan

- Workflow syntax/pin/permission/secret policy.
- Quality/security/build/site dry runs and artifact verification.
- Signed prerelease success, tamper rejection, dirty-draft deferral, opt-out.
- Protected Pages base/localization/metadata/network/download tests.
- Operator-performed signed artifact install and native capture matrix.

## Done criteria

- [ ] Every remote action is immutable and workflows least-privilege.
- [ ] Frozen frontend/Rust/site gates run on truthful platform matrix.
- [ ] Approved icons/brand and privacy scans pass built artifacts.
- [ ] Signing material exists only in protected secrets/runner temp.
- [ ] Signed updater is explicit, opt-in, verified, and dirty-draft safe.
- [ ] Static site deploys with verified release metadata and no runtime tracking/API.
- [ ] Signed macOS artifact passes full capture/clipboard/focus matrix.
- [ ] Release/rollback/compromise/key-rotation runbooks are complete.
- [ ] No tag, public release, install, push, or deploy occurred without authorization.
- [ ] This plan is `DONE` in `plans/README.md`.

## STOP conditions

- Plan 014/local release gate is not green.
- Required secret/environment/operator approval is absent.
- Any action cannot be pinned or needs excessive permissions/fork secrets.
- Updater accepts tampering, installs silently, or restarts over a dirty draft.
- Pages needs release secrets or makes runtime tracking/API requests.
- Required Mac/Linux artifact fails manual install after two platform fixes.
- Publishing, tagging, pushing, installing, deploying, or purchasing lacks authority.

## Maintenance notes

- Rotate action SHAs through reviewed dependency changes, never floating tags.
- Re-run previous-version update and signed native capture tests every release.
- Treat updater/signing key compromise as an incident and follow the runbook.
