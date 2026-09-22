# Plan 015: Publish automatic Tauri releases and integrated updates

> **Executor instructions**: Implement the smallest reliable release and
> updater path for a side project. A protected merge to `main` with one new
> consistent manifest version builds all current desktop targets, signs updater
> artifacts, assembles one `latest.json`, creates the matching `vX.Y.Z` tag, and
> publishes the GitHub Release only after every build succeeds. Add the in-app
> updater under the existing privacy contract. Do not add paid platform signing,
> a release approval ceremony, or a physical certification matrix. Never print
> or invent secrets.
>
> **Drift check (run first)**:
> `git diff --stat 07dbb48..HEAD -- .github/workflows/release.yml scripts/check-release-version.ts scripts/check-workflows.ts apps/desktop/src-tauri apps/desktop/src docs package.json apps/desktop/package.json plans/README.md`
> Contracts and public-readiness documentation are settled by ADR 0016.
> Stop on unrelated release changes, a conflicting published version, or a
> private repository with no explicitly selected public updater origin.

## Status

- **State**: IN PROGRESS — implementation ready; first versioned merge pending
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: release, updater, dx
- **Planned at**: commit `07dbb48`, 2026-09-05

## Why this matters

The work started from a macOS-only, manually dispatched draft workflow with no
updater artifacts or app integration. Charon needs one cheap operator flow:
choose a version in the four manifests, merge the release preparation, let
GitHub build and publish Apple Silicon macOS, Linux, and Windows downloads plus
the matching tag, then let opted-in installations discover and explicitly
install the signed update.

## Target behavior

1. The operator updates every manifest version and release notes, then merges a
   validated pull request into protected `main`.
2. `release.yml` validates manifest consistency and exits successfully when the
   matching version is already published.
3. Apple Silicon macOS, Linux, and Windows jobs build normal bundles plus Tauri
   updater artifacts and signatures.
4. Build jobs upload private workflow artifacts; they do not mutate a public
   release in parallel.
5. One final job verifies all expected OS families, creates `SHA256SUMS.txt` and
   one combined `latest.json`, then creates the `vX.Y.Z` tag on the merged
   commit, creates the GitHub Release, uploads everything, and publishes it.
6. A failure leaves no partial public release. A fix uses a new manifest version.
7. When update checks are enabled, Charon reads the public `latest.json` without
   sending content or a stable identifier. It shows the version and notes, then
   downloads and installs only after explicit confirmation. Restart waits until
   drafts are safe.

## Public release origin

The selected v1 endpoint is:

`https://github.com/SimonHazard/Charon/releases/latest/download/latest.json`

The repository is public, so anonymous installed clients can read release
metadata and assets. Do not embed a GitHub token, Cloudflare credential, or
authenticated proxy in the app.

## Secrets and permissions

Create a GitHub Actions environment named `release` with no required reviewer.
Store exactly for the current unencrypted key:

- `TAURI_SIGNING_PRIVATE_KEY`: complete private key content.

Generate the updater key pair once on the operator machine. Commit only the
public key in `tauri.conf.json`, and keep an independent secure backup of the
private key. A lost key cannot sign updates trusted by existing
installations.

Use the automatic `${{ secrets.GITHUB_TOKEN }}`; never create it manually. Give
`contents: write` only to the final release job. Build jobs need `contents: read`
and access to the `release` environment secret. No GitHub Actions variable
is required.

Do not create Apple, notarization, Authenticode, or certificate secrets.
`APPLE_SIGNING_IDENTITY: '-'` remains a literal for the macOS ad-hoc bundle.
The existing `site-production` Cloudflare secrets are unrelated and must not be
exposed to this workflow.

## Scope

**In scope**:

- `.github/workflows/release.yml`
- `scripts/check-release-version.ts`
- `scripts/check-workflows.ts`
- one small deterministic `latest.json`/asset validation script and focused tests
- Tauri updater plugin dependencies and lockfiles
- updater capability permissions and Tauri configuration
- a compact Preferences setting and contextual update prompt/progress/error UI
- English and French updater copy
- `docs/PRIVACY.md`, `docs/RELEASING.md`, `docs/RELEASE_CHECKLIST.md`,
  `docs/TESTING.md`, `docs/platform-support.md`, and `plans/README.md`
- a future GitHub Releases link with explicit pending early access copy on the
  site, as requested by the operator on 2026-09-19; announce availability only
  after the first real release exists

**Out of scope**:

- Apple Developer ID, notarization, Windows Authenticode, paid certificates, or
  claims that an unsigned/ad-hoc artifact is platform trusted.
- Silent background installation, forced restart, automatic install without
  consent, telemetry, rollout cohorts, channels, delta updates, rollback server,
  or a custom update backend.
- Automatic version bumping, release bots, conventional-commit parsers, release
  branches, or rebuilding a version already published from `main`.
- Full E2E, performance, accessibility, or physical application matrices as
  release gates.
- Cloudflare deployment changes or repository visibility mutation.

## Git workflow

- Branch: `codex/015-automatic-tauri-releases`
- Commit: `feat(release): add automatic releases and signed updates`
- Do not merge a new manifest version, publish a release, or create secret
  values without explicit operator authorization.

## Steps

### Step 1: Lock the version and workflow policy

Allow `release.yml` to use only a protected `main` push trigger. Keep Security
manual, Quality on pull requests/manual dispatch, and site deployment on
protected `main`. Reject tag, pull-request, schedule, and manual triggers for
the release workflow.

Extend the version check so Tauri, Cargo, root package, and desktop package use
one valid SemVer value. Before expensive work, skip an already-published version
and fail closed on an orphaned tag or draft release.

**Verify**: focused tests accept one consistent manifest version and reject
malformed versions, manifest drift, release branch pushes, and automatic
triggers elsewhere.

### Step 2: Add the signed updater contract

Add the official Tauri updater plugin, its minimal capability permission, the
committed public key, the public `latest.json` endpoint, and
`createUpdaterArtifacts: true`. Keep updater signing separate from platform code
signing.

Implement the smallest UI consistent with `docs/PRIVACY.md`:

- update checks start disabled;
- Preferences explains the metadata-only GitHub request and enables checks;
- enabled checks run at app start and can also be triggered manually;
- an available update shows version and notes;
- download/install requires explicit confirmation and visible progress;
- network, signature, download, and install errors remain contextual and do not
  affect Notes;
- restart waits while an editor/composer draft is dirty.

Do not log endpoint responses, Workspace data, Note data, or updater secret
material.

**Verify**: mocked updater tests cover disabled, no-update, available, rejected,
signature/error, progress, and dirty-draft restart states without network calls.

### Step 3: Build three platforms without release races

Use the current supported GitHub runner matrix:

- Apple Silicon macOS: `.app`, `.dmg`, and signed updater archive with ad-hoc identity `-`;
- Ubuntu: `.deb`, AppImage, `.rpm`, and the supported Linux updater artifact;
- Windows: NSIS, MSI, and the selected updater installer/signature.

Reuse the repository's pinned actions and Linux prerequisites. Each job receives
the updater key secret, builds through the workspace-local Tauri CLI, and uploads
its results only as workflow artifacts. Prefer NSIS for the Windows updater while
still publishing MSI as a manual installer.

**Verify**: all three runner definitions exist, updater signatures are required,
and no build job can publish a GitHub Release.

### Step 4: Assemble and publish once

After every build succeeds, download the workflow artifacts in one final job.
Fail closed if an expected OS family, updater bundle, signature, installer, or
signature content is missing. Generate:

- `SHA256SUMS.txt` for published assets;
- one static `latest.json` with version, notes, publication date, public asset
  URLs, and the contents of each matching `.sig` file.

Create the tag and draft release on the merged commit only after those checks,
then publish it. Release copy states the unsigned/ad-hoc warnings and that
compatibility fixes follow normal user feedback. Never overwrite an existing
tag, draft, or published version.

**Verify**: a fixture missing one platform prevents publication; a complete
fixture produces valid updater JSON and checksums.

### Step 5: Document the operator flow

Keep the procedure short:

1. generate and securely back up the updater key pair once;
2. put the private key in the `release` environment;
3. confirm the audited repository remains public before the first updater
   release;
4. bump versions and release notes;
5. optionally run local checks;
6. merge the validated release preparation into protected `main`;
7. watch the single workflow create `vX.Y.Z` and use the published build;
8. ship user-reported fixes as a new patch version.

Document key loss/compromise handling and the fact that GitHub observes ordinary
network metadata for enabled update checks.

### Step 6: Verify without publishing

Run focused unit/type/Rust/privacy/workflow checks plus `git diff --check`.
Do not run the exhaustive physical matrix. Do not merge a fake version to test
the pipeline. A real first release is an operator-authorized live validation.

## Done criteria

- [x] A protected `main` update is the only automatic release trigger, and an
      already-published manifest version exits without rebuilding.
- [ ] macOS, Linux, and Windows bundles and updater artifacts build in one run.
- [ ] One combined signed `latest.json` is published with complete assets and
  `SHA256SUMS.txt` only after every platform succeeds.
- [x] No partial public release appears after a failed matrix.
- [x] The updater check is default-off, content-free, user-controlled, and uses
  explicit download/install/restart behavior.
- [x] The public updater key is committed; only the private key is an
  operator-created GitHub secret; no GitHub variable is required.
- [x] No paid platform-signing or silent-update surface is added.
- [x] Focused deterministic checks pass; exhaustive physical certification is
  not required.

## STOP conditions

- The repository is still private at the first real updater release and no
  public artifact origin has been explicitly selected.
- The real updater key pair and secure backup do not exist.
- Automatic publication could expose a partial release.
- Any update path requires embedding GitHub or Cloudflare credentials in the
  application.
- Tauri cannot produce a supported updater artifact for one target without
  changing the agreed platform scope.
- A real versioned merge, release, visibility change, or secret mutation would
  occur without explicit operator authority.

## Maintenance notes

The release trigger is intentionally narrow to conserve Actions minutes. The
updater is a signed delivery convenience, not telemetry or platform code
signing. Prefer patch releases and user feedback over adding release machinery.
