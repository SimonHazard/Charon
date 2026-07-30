# Plan 012: Automate desktop builds, Astro deployment, updates, security, and releases

> **Executor instructions**: Do not begin until Plan 011 is `DONE` and
> `bun run verify:release` passes. Never invent, print, commit, or weaken secrets.
> Follow every verification gate and STOP condition. Update the plan index when done.
>
> **Drift check (run first)**: inspect `.github`, Tauri bundle/updater config,
> Astro site/deployment config, docs, lockfiles, and current release checklist.
> Expected state has no workflows, production updater endpoint, site deployment,
> signing material, or published artifacts. If any
> exist, stop and reconcile ownership before changing distribution behavior.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: `plans/011-close-release-quality-gaps.md`
- **Category**: security, dx, migration
- **Planned at**: unborn `main` (no commit), 2026-07-30

## Why this matters

A desktop product is not finished when its app builds on one laptop and its
public site exists only locally. Users need verified
Mac and Linux artifacts, best-effort Windows packaging, signed updates, provenance,
an accessible static product site, and reproducible quality gates. CI must use immutable action and dependency pins,
minimal secrets, and privacy-preserving update behavior so the release channel
does not undermine the local-only product promise.

## Current state

- Plan 011 supplies a complete local release gate and documented platform smoke.
- The Astro site builds statically with truthful placeholder/release states but
  is not deployed and has no generated signed-artifact metadata.
- Exact JS/Rust dependencies and lockfiles exist.
- Tauri updater plugin is registered but disabled in settings and has no public
  key or endpoint.
- No GitHub workflows, dependency bot config, security policy, signing docs,
  release script, or artifact checksums exist.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Local gate | `bun install --frozen-lockfile && bun run verify:release` | exit 0 |
| Site build | `bun --cwd apps/site run check && bun run build:site && bun run test:site` | exit 0 |
| Rust locked | `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --all-targets` | exit 0 |
| Workflow syntax | `bun run check:workflows` | workflow parser/policy exits 0 |
| Action pins | `rg -n "uses: [^#[:space:]]+@(v[0-9]|main|master|latest)" .github/workflows .github/actions` | no matches |
| Secret scan | `bun run check:privacy` | exit 0 |
| Current bundle | `bun run tauri:build` | signed or explicit unsigned-local bundle succeeds |

## Suggested executor toolkit

- Use `github:github` for repository and existing policy context if connected.
- Use `github:gh-fix-ci` only after a workflow run actually fails.
- Use Tauri's official distribution, signing, updater, and GitHub Action docs.
- Use `shadcn` only if updater settings UI needs a small state addition.

## Scope

**In scope**:

- `.github/workflows/quality.yml`, `build.yml`, `release.yml`, `site.yml`, `security.yml`
- `.github/dependabot.yml`, `.github/pull_request_template.md`,
  `.github/ISSUE_TEMPLATE/bug.yml`, `.github/SECURITY.md`
- `.github/actions/setup-charon/action.yml` if a composite action materially
  removes repeated pinned setup steps
- `scripts/check-workflows.ts`, `scripts/verify-artifacts.ts`,
  `scripts/generate-downloads.ts`, `scripts/verify-site-artifact.ts`
- `package.json`, `bun.lock`
- `apps/desktop/src-tauri/tauri.conf.json`,
  `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/Cargo.lock`,
  `apps/desktop/src-tauri/capabilities/main.json`,
  `apps/desktop/src-tauri/src/lib.rs`
- `apps/desktop/src/features/settings/privacy-settings.tsx`,
  `apps/desktop/messages/en.json`, `apps/desktop/messages/fr.json`
- `apps/site/astro.config.mjs`, `apps/site/src/content/downloads.json`,
  `apps/site/src/content/releases.json`, `apps/site/public/CNAME` only if a
  custom domain is explicitly selected
- `docs/RELEASING.md`, `docs/RELEASE_CHECKLIST.md`, `docs/PRIVACY.md`,
  `docs/platform-support.md`, `README.md`, `CHANGELOG.md`
- `.gitignore`

**Out of scope**:

- Committing certificates/private keys/passwords, weakening tests for CI, cloud
  sync, analytics, custom update servers, automatic update installation without
  consent, automated or agent-driven installation of packaged desktop artifacts,
  paid code-signing purchases without operator approval, and publishing a release
  before all required secrets/manual checks exist. The operator alone installs the
  macOS `.dmg` manually during final release validation. A custom domain or non-GitHub
  Pages host is out of scope without an explicit operator decision.

## Git workflow

- Branch: `codex/012-distribution`
- Commits: `ci: add immutable quality and build workflows`,
  `ci(site): deploy static astro site`,
  `feat(updater): configure signed opt-in updates`,
  `docs: add secure release runbook`
- Do not push, create tags, publish, or open a PR unless explicitly instructed.

## Steps

### Step 1: Resolve and freeze every GitHub Action to an immutable SHA

For each action, query its official repository for the current stable release,
resolve the tag to its immutable commit SHA, and use `owner/repo@<40-char-sha>`
with a comment containing the release tag. Required categories are checkout,
Bun setup, Rust toolchain/cache, artifact upload/download, Tauri release action,
Astro or GitHub Pages build/deploy actions, and security audit. Never use a
moving major tag, branch, or third-party fork
when an official action exists.

Record action repository, release tag, commit SHA, date, and purpose in
`docs/RELEASING.md`. `check-workflows.ts` must parse workflow YAML and reject any
non-local action not pinned to exactly 40 lowercase hex characters, excessive
job permissions, untrusted PR secrets, mutable install commands, or unquoted
dangerous expression placement.

**Verify**: Workflow syntax and Action pins commands pass; every remote `uses:`
line has a tag comment and ledger row.

### Step 2: Add least-privilege quality and security workflows

`quality.yml` runs on PR/push with read-only contents permission:

- Ubuntu frontend job: exact Bun, frozen install, `bun run check`, bindings,
  desktop and Astro builds, Playwright Chromium/WebKit, axe, privacy/i18n/link/
  metadata/bundle checks.
- Rust matrix on macOS, Ubuntu, Windows: fmt once, clippy/tests/check with locked
  Cargo and target-specific compilation.
- Cache only verified lockfile-keyed package/build data; caches never contain
  secrets or signed artifacts.

`security.yml` runs weekly and manually: `bun audit`, RustSec audit using a pinned
official action/tool, dependency license review, and secret/policy scans. It
creates no automatic code changes. Dependabot opens grouped weekly PRs separately
for npm, Cargo, and GitHub Actions, with exact lockfile updates and no auto-merge.

**Verify**: run workflow policy locally; open a draft PR only if authorized and
confirm jobs start with no write/token permissions beyond declared needs.

### Step 3: Build unsigned review artifacts on all targets

`build.yml` runs manually and on protected main after quality. Use a matrix for:

- macOS current supported runners/architectures, producing `.app` and `.dmg`;
- Ubuntu 24.04, installing official Tauri WebKitGTK prerequisites and producing
  `.AppImage`, `.deb`, and `.rpm` when supported;
- Windows current stable runner, producing `.msi` and NSIS `.exe` when green.

Use exact lockfiles and `tauri-action` pinned by SHA. Review artifacts are clearly
named `unsigned` and retained briefly. Upload checksums and build metadata; never
publish them as updates. Validate bundle identifier, version equality across
package/Cargo/Tauri, icons, licenses, and no source maps/content fixture leakage.

Build the Astro site once in the same trusted revision and upload its static
output as a review artifact after `verify-site-artifact.ts` confirms expected
routes, canonical origin mode, no tracker request/import, no fixture/private
content, and no desktop binary bundled into the site.

**Verify**: authorized workflow run completes all required Mac/Linux jobs and
Windows or records a truthful blocked matrix row; downloaded artifacts pass
`scripts/verify-artifacts.ts` and checksum verification.

### Step 4: Configure platform signing and notarization as secret-only inputs

Document required GitHub Environment secrets and how the operator creates them:

- Apple Developer ID signing certificate/password plus notarization API key
  issuer/key ID/private key, or the exact current Tauri-supported equivalent.
- Windows code-signing certificate/provider credentials if available.
- Tauri updater signing private key/password; only its public key belongs in
  `tauri.conf.json`.

Use protected `release` environment approval. Workflows write temporary key
material only to runner temp, mask values, restrict permissions, and clean it in
an `always()` step. Never echo derived secrets. Linux packages get checksums and
updater signatures even when platform code signing is not applicable.

**Verify**: workflow dry/policy checks prove secret references exist only in the
release job/environment; repository scan finds no certificate, private key, or password.

### Step 5: Add a tag-driven signed release and updater manifest

`release.yml` triggers only on annotated `vX.Y.Z` tags or manual dry run. It
requires quality, version consistency, clean changelog, platform manual checklist,
and protected environment approval. Build signed/notarized artifacts, verify
them, generate SHA-256 checksums and Tauri `latest.json`, then create a draft
GitHub Release. Do not automatically mark it latest until a human verifies
install/update on Mac and Linux; Windows is included only when signing/build
acceptance is green.

Configure updater endpoints to the GitHub Release `latest.json` and pin the
public key. Update checks are user-controlled and default according to the
privacy/product decision. Show available version, notes, download size, and
Restart to install; never interrupt a dirty draft or install silently. Update
network disclosure states that the hosting provider observes IP and requested
version metadata, while no note content or identifier is sent.

**Verify**: against a private/prerelease dry-run channel, an older signed build
detects, downloads, verifies, waits for safe restart, and launches the newer
version; tampered artifact/signature is rejected.

### Step 6: Deploy the static Astro site through GitHub Pages

Create `site.yml` following the official Astro GitHub Pages architecture: a
read-only build job and a separate deploy job with `pages: write` and
`id-token: write`, scoped only to the protected `github-pages` environment. Pin
checkout, Astro/Pages upload, and deploy actions to immutable SHAs. Trigger on
protected `main`, manual dispatch, and successful public desktop release when
download metadata must refresh. Pull requests build and test but never deploy.

Configure Astro `site` and `base` from reviewed repository/Pages settings. Use a
custom domain and `CNAME` only after explicit operator selection; otherwise use
the repository Pages URL and base path in all localized internal links,
canonicals, sitemap, media, and manifest references.

At build time, `generate-downloads.ts` may read the public GitHub Release API
using least-privilege repository metadata. It validates release status,
platform, version, artifact name, checksum, and signature before producing a
temporary static downloads dataset. The browser never calls GitHub APIs. If no
verified public release exists, keep the truthful View releases state from Plan
009. Do not commit generated deployment output.

**Verify**: an authorized Pages dry deployment serves all EN/FR routes, assets,
canonical/hreflang/sitemap links and real media under the configured base path;
network inspection finds no runtime API/tracker request; download links match
the signed public release and checksums.

### Step 7: Complete release, site, and rollback documentation

Write `docs/RELEASING.md` as an exact operator runbook: version bump locations,
changelog, local gate, tag, environment approvals, operator-owned manual
per-platform install smoke, update-from-previous smoke, draft-to-public promotion,
rollback/yank, compromised key response, key rotation, site deploy/rollback, Pages
base/custom-domain rules, and download metadata refresh. Agents and automation may
build and verify artifacts but must stop before installation. `CHANGELOG.md` starts
with Keep a Changelog-style Unreleased and first version sections without claiming
an unpublished release.

Update README platform table and privacy from actual green build evidence only.
Create issue/PR templates that request OS/session, app version, capability state,
and redacted diagnostics, explicitly warning not to paste note content or paths.

**Verify**: a second operator/agent can run a dry release using only the runbook
until the explicit secret/approval or manual-install gate; every rollback step has
an owner and command.

## Test plan

- Local workflow policy parser and secret/privacy scanner.
- CI quality, Rust matrix, and unsigned artifact workflow runs.
- Astro review artifact and protected GitHub Pages deployment with base-path,
  localization, metadata, link, privacy, and rollback tests.
- Operator-performed manual artifact installation/smoke on macOS and Linux, then
  Windows if supported; agents and workflows stop after artifact verification.
- Signed prerelease update success and tamper rejection from the previous version.
- Dirty-draft restart deferral and updater opt-out.
- Manual notarization/signature verification using platform tools documented in
  `docs/RELEASING.md`.

## Done criteria

- [ ] Every remote action is pinned to an immutable 40-character SHA.
- [ ] PR workflows have read-only least privilege and cannot access release secrets.
- [ ] Frozen frontend/Rust gates run on the promised platform matrix.
- [ ] Astro static artifact verifies and deploys through a protected Pages job.
- [ ] EN/FR routes, canonical/base paths, sitemap, media, and privacy checks pass at the deployed URL.
- [ ] Mac and Linux review artifacts build and verify; Windows status is truthful.
- [ ] Signing material exists only in protected environment secrets and runner temp.
- [ ] Signed prerelease updater succeeds; tampering fails; dirty drafts defer restart.
- [ ] Update privacy and opt-in behavior are visible in EN/FR.
- [ ] Site download metadata contains only verified signed public artifacts and
  makes no runtime GitHub/API request.
- [ ] Release, rollback, compromise, and key-rotation runbooks are complete.
- [ ] No tag or public release was created without explicit authorization.
- [ ] This plan is `DONE` in the index.

## STOP conditions

- Plan 011 or local release verification is not green.
- Required signing/notarization credentials or protected environment approval are absent.
- A workflow needs secrets on pull requests from forks or broader write permission.
- Any action cannot be pinned to a reviewed immutable commit.
- The Pages deploy job needs release secrets, runs for untrusted PRs, or receives
  permissions beyond contents read, pages write, and id-token write.
- Site base/canonical paths break localized routes or verified downloads.
- Signed updater accepts a tampered artifact or can restart over a dirty draft.
- A required Mac/Linux artifact fails the operator's manual install-and-run smoke
  after two platform fixes.
- Publishing, tagging, pushing, or buying a certificate lacks explicit operator authorization.

## Maintenance notes

- Rotate action SHAs through reviewed dependency PRs, never by floating tags.
- Re-run previous-version update tests for every release.
- Re-run site link/metadata/download verification after repository rename, Pages
  base-path change, custom-domain change, or desktop artifact rename.
- Treat updater key compromise as a security incident; follow the documented
  rotation and release-yank procedure immediately.
