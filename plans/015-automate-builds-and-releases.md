# Plan 015: Publish GitHub Releases with Tauri-signed updates and no paid platform certificates

> **Executor instructions**: Follow this plan step by step after Plan 014 is
> DONE and `bun run verify:release` passes twice. This plan changes an accepted
> release/signing contract, so Step 1 is a mandatory ADR gate. Do not edit code,
> workflows, or public claims until that ADR is accepted. Never print, invent,
> commit, or weaken secrets. Apple Developer ID, notarization, Windows
> Authenticode, and certificate purchase are explicitly out of scope. “Tauri
> signed” means updater-package integrity only; never imply OS publisher trust.
> Agents/workflows may build and verify artifacts but must stop before key
> ceremony, installation, tag push, draft promotion, or publication unless the
> operator separately authorizes that action. Stop on every STOP condition and
> update the index only after all done criteria pass.
>
> **Drift check (run first)**:
> `git diff --stat 7294773..HEAD -- .github scripts apps/desktop/src-tauri apps/desktop/src/features/preferences apps/desktop/src/app apps/desktop/src/lib apps/desktop/messages apps/site/src docs package.json apps/desktop/package.json bun.lock plans/README.md`
> The current repository already has quality/security/review/release workflows,
> an ad-hoc macOS bundle identity, and release runbooks. Reconcile them; do not
> follow the obsolete “nothing exists” baseline. Stop if a public updater key,
> private signing material, published release, or updater endpoint already
> exists without an ownership and rotation decision.

## Status

- **Priority**: P1
- **Effort**: XL
- **Risk**: HIGH
- **Depends on**: `plans/014-close-rapid-capture-quality-gaps.md`
- **Category**: security, dx, migration, release
- **Planned at**: commit `7294773`, 2026-08-11

## Why this matters

Charon needs one repeatable path from an approved version tag to macOS, Linux,
and Windows assets on GitHub Releases, plus a safe opt-in update experience. The
operator will not purchase Apple or Windows certificates. The release system
must therefore embrace the resulting Gatekeeper and SmartScreen warnings rather
than staying permanently blocked on unavailable credentials.

Tauri's updater signature provides a separate security property: an installed
Charon build can accept only update metadata/packages signed by Charon's updater
key. It does not provide Apple notarization, Developer ID, Authenticode, or
SmartScreen reputation. GitHub Releases is the single desktop distribution and
update-metadata origin. The static site links to GitHub's stable
`/releases/latest` route and makes no GitHub API request in the browser.

## Official constraints verified during planning

The executor must recheck these official sources before implementation because
release tooling changes:

- Tauri distribution overview:
  <https://v2.tauri.app/distribute/>
- Tauri macOS ad-hoc signing and its Gatekeeper limitation:
  <https://v2.tauri.app/distribute/sign/macos/>
- Tauri Windows code signing and SmartScreen limitation:
  <https://v2.tauri.app/distribute/sign/windows/>
- Tauri updater configuration, static `latest.json`, signatures, and GitHub
  Releases endpoint:
  <https://v2.tauri.app/plugin/updater/>
- GitHub stable latest-release and latest-asset links:
  <https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases>

Planning-time facts from those sources:

- macOS ad-hoc identity `-` binds the bundle but does not prevent macOS from
  requiring Privacy & Security approval.
- Windows without code signing may trigger SmartScreen and has no Authenticode
  publisher identity.
- Tauri updater static metadata requires a SemVer plus a URL and signature for
  each platform; the signature content is the generated `.sig` value.
- `tauri-action` can create updater artifacts and `latest.json` for GitHub
  Releases.
- GitHub exposes the latest public release at
  `https://github.com/SimonHazard/Charon/releases/latest` and an asset at
  `/releases/latest/download/<asset-name>`.

## Current state

- `.github/workflows/quality.yml` validates the desktop frontend/browser surface
  and runs Rust format/Clippy on macOS, Linux, and Windows; Rust runtime tests run
  on macOS/Linux only.
- `.github/workflows/security.yml` runs `bun audit`, workflow policy, and privacy
  checks weekly/manually.
- `.github/workflows/review-builds.yml:1-52` manually builds unsigned/ad-hoc
  review artifacts for macOS, Linux, and Windows and uploads short-lived Actions
  artifacts.
- `.github/workflows/release.yml:38-77` has one `signed-macos` job that requires
  six Apple secrets plus the two Tauri updater-key secrets. It does not publish
  Linux/Windows release assets.
- `apps/desktop/src-tauri/tauri.conf.json:52-55` already configures the macOS
  ad-hoc identity `-`; there is no updater config or `createUpdaterArtifacts`.
- `apps/desktop/src-tauri/Cargo.toml` has no updater/process plugin.
- `apps/desktop/package.json` has no updater/process JavaScript package.
- `docs/PRIVACY.md:127-141` permits only an optional, default-off update check
  limited to release metadata with explicit download/install and dirty-draft
  deferral.
- `docs/RELEASING.md:54-64` still requires Apple secrets and has no actual
  updater key/public endpoint.
- `apps/site/src/components/TextPage.astro:37` links to `/releases`, not
  `/releases/latest`; visible EN/FR copy still says release waits for platform
  signing.
- Plan 014 now defines the exact-candidate evidence model. Its manual evidence
  must exist before a public release is promoted.

## Target trust and distribution model

| Layer | Target | Required disclosure |
| --- | --- | --- |
| Source/version | Annotated `vX.Y.Z` tag plus draft GitHub Release | Human approval precedes tag push and draft promotion |
| macOS first install | `.app`/`.dmg` with Tauri/macOS ad-hoc identity | Not Developer ID, not notarized; macOS may require Privacy & Security approval and capture permissions may need regrant after update |
| Windows first install | Unsigned NSIS and/or MSI built on Windows | No Authenticode; SmartScreen warning/reputation limitation |
| Linux first install | `.deb` and AppImage from GitHub | Exact package/checksum/dependency posture; no OS publisher signature claim |
| Manual artifact integrity | `SHA256SUMS` attached to the same immutable Release | Hash proves file identity, not publisher identity |
| In-app update integrity | Tauri updater signature and committed public key | Proves update signed by Charon updater key; does not change OS trust |
| Update metadata/origin | `latest.json` attached to latest public GitHub Release | GitHub observes ordinary network metadata; no Note/Workspace data is sent |
| Website | Static link to `/releases/latest` | No browser GitHub API, runtime release inference, or fake platform trust |

## Version and dependency target

Recheck the official release index and registry before editing. At planning time
the existing Tauri core pins remain current for this repo and the updater pins
are:

| Package/crate | Exact target | Purpose |
| --- | ---: | --- |
| `tauri-plugin-updater` | `=2.10.1` | Native update check/download/install and signature verification |
| `@tauri-apps/plugin-updater` | `2.10.1` | React/app update API |
| `tauri-plugin-process` | `=2.3.1` | Explicit safe relaunch after accepted install, if required by the chosen flow |
| `@tauri-apps/plugin-process` | `2.3.1` | Frontend relaunch API, if required |

If a newer version is required for compatibility or a security fix, STOP and
update this table plus `plans/README.md` with the exact reviewed version and
official release evidence before installation. Never use a caret, tilde,
`latest`, floating Git revision, or hand-edited lockfile.

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Drift | `git diff --stat 7294773..HEAD -- .github scripts apps/desktop/src-tauri apps/desktop/src/features/preferences apps/desktop/src/app apps/desktop/src/lib apps/desktop/messages apps/site/src docs package.json apps/desktop/package.json bun.lock plans/README.md` | current state reconciled |
| Frozen install | `bun install --frozen-lockfile` | exit 0 with exact lock |
| Local release gate | `bun run verify:release` | exit 0 twice |
| Site | `bun run --cwd apps/site check && bun run build:site && bun run test:site` | exit 0 |
| Rust | `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --all-targets` | exit 0 |
| Workflow policy | `bun run check:workflows` | syntax/pin/permission/secret policy passes |
| Mutable actions | `rg -n "uses: [^#[:space:]]+@(v[0-9]|main|master|latest)" .github/workflows .github/actions` | no matches |
| Apple secret removal | `rg -n "APPLE_CERTIFICATE|APPLE_CERTIFICATE_PASSWORD|APPLE_SIGNING_IDENTITY|APPLE_ID|APPLE_PASSWORD|APPLE_TEAM_ID" .github docs plans/015-automate-builds-and-releases.md` | no active workflow/runbook requirement; historical evidence may be explicitly labeled |
| Updater endpoint | `rg -n "releases/latest/download/latest.json" apps/desktop/src-tauri docs` | one reviewed config/runbook endpoint |
| Site latest link | `rg -n "SimonHazard/Charon/releases/latest" apps/site/src` | EN/FR release CTA/link matches stable GitHub route |
| Privacy | `bun run check:privacy` | no Note/path/content/secret leak |
| Diff | `git diff --check && git status --short` | only in-scope files changed |

## Scope

**In scope**:

- New accepted ADR 0012 (or next available ADR number) and every affected
  README/product/architecture/privacy/UX/site/platform/release contract
- `.github/workflows/{quality,security,review-builds,release}.yml` and workflow
  policy tests/scripts
- Release/checksum/metadata verification scripts
- Tauri bundle/updater config, capabilities, Rust initialization, exact updater
  and optional process dependencies, Cargo lock generated by Cargo
- Typed local Preferences setting/API for default-off update checks, compact UI,
  dirty-draft deferral, download/install/relaunch state, and EN/FR strings
- Exact JavaScript dependencies and Bun lock generated by Bun
- Static site EN/FR release copy and `/releases/latest` links
- `docs/RELEASING.md`, `docs/RELEASE_CHECKLIST.md`, `docs/TESTING.md`,
  `docs/platform-support.md`, `docs/PRIVACY.md`, and changelog/release docs
- Tests for updater, workflow policy, site links/copy, privacy, and exact
  candidate artifacts
- `plans/README.md` after every done criterion passes

**Out of scope**:

- Apple Developer account/certificate, Developer ID, notarization, Mac App
  Store, Windows Authenticode/certificate, Microsoft Store, or purchasing any
  signing service
- Calling an ad-hoc/unsigned artifact “platform signed,” suppressing OS warnings,
  bypassing security controls automatically, or promising stable TCC/SmartScreen
  reputation
- Committed private keys/passwords, placeholder public key, weakened signature
  validation, silent/default-on update checks, automatic install/restart, dirty-
  draft loss, or updater downgrade
- Custom update server, CDN, release proxy, GitHub API call in the browser,
  runtime site release lookup, analytics, telemetry, crash upload, content upload,
  or stable Workspace identifier in requests
- Site hosting/deployment. Astro remains static and its Cloudflare/static host is
  owned by the separate site-hosting plan; GitHub hosts desktop releases only.
- Automatic draft promotion or publication from CI

## Git workflow

- Branch: `codex/015-github-releases-updater`
- Commits, in order:
  1. `docs(adr): accept github-only unsigned distribution`
  2. `ci: build all desktop releases on github`
  3. `feat(updater): verify github updates with tauri signing`
  4. `feat(site): link the latest github release`
  5. `docs: reconcile unsigned release operations`
- Do not push, tag, publish, promote a draft, install an artifact, generate the
  production private key, or open a pull request unless separately authorized.

## Steps

### Step 1: Accept the distribution ADR before implementation

Create ADR 0012, or the next free ADR number, with status Accepted. It must
explicitly supersede only the release-evidence/signing portions of ADR 0008 and
ADR 0011 that require stable Developer ID or signed-build promotion. Preserve
all capture permission, passive listener, bounded Copy, privacy, local-only,
shortcut, Rust-authority, and platform-capability invariants.

The ADR must decide:

1. GitHub Releases is the only desktop distribution/update-metadata origin.
2. macOS ships ad-hoc-signed and not notarized; Windows ships unsigned; Linux
   has no platform publisher-signature claim.
3. Platform warnings and permission continuity are disclosed and tested.
4. Tauri updater signing is mandatory for in-app updates and is explicitly not
   platform code signing.
5. Update checks are optional, default off, metadata-only, and user-triggered;
   download/install/restart are explicit and dirty-draft safe.
6. The static site links to GitHub `/releases/latest` without an API call.
7. Capabilities are advertised only from exact-artifact physical evidence; lack
   of paid signing may permanently keep enhanced macOS capture at a lower trust
   tier and Linux/Windows modifier capture unclaimed.
8. A future paid certificate requires a separate reviewed change and new
   evidence, not a hidden secret addition.

Update README, PRODUCT, ARCHITECTURE, PRIVACY, SITE, UX where relevant,
RELEASING, RELEASE_CHECKLIST, TESTING, and platform support in the same contract
commit. Use exact terms: “ad-hoc macOS,” “unsigned Windows,” and “Tauri-signed
update package.”

**Verify**: contract/ADR links resolve; searches find no active statement that a
paid certificate is required for Charon's chosen release posture; privacy still
permits only the optional update request.

### Step 2: Reconcile quality, security, and review CI

Keep remote Actions pinned to immutable 40-character commits and update the
action ledger only after official-source review. Preserve least privilege,
concurrency, frozen Bun, exact Rust, cache scoping, and no fork secrets.

Quality remains a PR/main gate and must not consume release secrets. Security
remains scheduled/manual. Review builds remain manual and secret-free, using
`--no-sign` where supported to produce short-lived Actions artifacts for all
current targets. Correct misleading names: macOS review artifact is ad-hoc or
unsigned-review as verified, never Developer ID; Windows is unsigned.

Do not move the timing-sensitive 20,000-Note benchmark into shared PR CI unless
Plan 014's recorded method proves it stable there. Do not add site deployment to
desktop release CI.

**Verify**: workflow policy/mutable-action scans pass; pull-request workflows
have read-only permissions and no secret references; authorized review dry run
builds each current target or records a truthful platform blocker.

### Step 3: Design and perform the protected updater key ceremony

Before code/config needs a public key, write the runbook for an operator-owned
Tauri key ceremony:

- generate one production updater keypair with the pinned Tauri CLI;
- store only `TAURI_SIGNING_PRIVATE_KEY` and
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` as protected `release` environment
  secrets with required reviewers;
- commit only the corresponding public key;
- record generation date, CLI version, public-key fingerprint, custodians,
  backup/restore procedure, test key separation, and rotation/compromise plan;
- never print or place the private key/password in shell history, logs,
  artifacts, repository variables, or files under the repo.

Production key generation is destructive/security-sensitive external state and
requires explicit operator authority. If authority is absent, finish the
runbook and STOP before introducing a placeholder public key or claiming the
updater works.

**Verify**: repository/Actions secret scan finds no private material; release
jobs reference only the two named protected secrets plus the built-in
`GITHUB_TOKEN`; public fingerprint matches the configured key.

### Step 4: Add the explicit default-off updater

Recheck and add the exact updater/process packages from Version and dependency
target using Bun and Cargo, never manual lock edits. Register the Rust plugin(s),
add only required Tauri capabilities, and configure:

- `bundle.createUpdaterArtifacts: true`;
- committed Tauri updater public key;
- endpoint
  `https://github.com/SimonHazard/Charon/releases/latest/download/latest.json`;
- HTTPS/TLS only, stable channels only, no downgrade, and bounded timeout.

Add one durable preference such as `updateChecksEnabled`, default false. It
stores no Note/Workspace data. Preferences shows current version, off/on state,
manual “Check for updates,” no-update, available version/notes/size when
provided, download progress, verification/install failure, and restart action.
All copy is EN/FR Paraglide and says GitHub receives ordinary network metadata.

Behavior rules:

- no check on mount while default off;
- enabling permits the documented check cadence only; manual check is always an
  explicit network action;
- no Note, Tag, Attachment name/bytes, path, Workspace metadata, selection,
  clipboard, locale-derived identifier, or stable device/user ID enters request
  headers/query/body;
- download/install is a second explicit action;
- signature verification is mandatory and tampering fails closed;
- dirty composer/editor or unresolved durable command defers install/restart;
- no silent restart, downgrade, or release-channel switch;
- with updater disabled, the desktop makes no network request.

Use typed content-free errors and preserve input/focus. If the updater needs a
new network request beyond GitHub release metadata/package download, STOP for a
privacy ADR.

**Verify**: unit/integration tests cover off/no-request, manual check, no update,
available update, metadata privacy, tampered signature, download error, dirty
draft deferral, explicit install/relaunch, opt-out, and offline behavior.

### Step 5: Build every public candidate in one protected GitHub Release workflow

Replace the Apple-only release job with a protected matrix that runs only after
the full gate/version consistency job. Use current GitHub-hosted runners and
explicit target/architecture labels; do not advertise an architecture the
runner did not produce.

Required current outputs, subject to verified runner support:

| Target | Bundle | Platform trust posture |
| --- | --- | --- |
| macOS | app and DMG plus updater artifact | ad-hoc identity `-`, not notarized |
| Linux | deb and AppImage plus updater artifact | unsigned platform package |
| Windows | NSIS and/or MSI plus updater artifact | unsigned, no Authenticode |

Every release-build job receives the two protected Tauri signing secrets so the
updater artifacts are signed. Apple/Windows certificate variables do not exist.
Use `tauri-action` with the same `v__VERSION__` draft release and upload all
platform artifacts. Attach `latest.json`, every `.sig`, version/build metadata,
and a generated `SHA256SUMS`. Never expose secret contents in metadata/logs.

Workflow rules:

- annotated `vX.Y.Z` tag or explicitly authorized manual candidate only;
- protected `release` environment with reviewer approval;
- gate passes before build;
- draft release only, never automatic public promotion;
- stable artifact names are unique and immutable per tag;
- all jobs use least privilege and immutable Actions;
- temp key material is cleaned in `always()`;
- failure in one supported platform keeps the draft incomplete and unpromoted;
- rerun replaces no public asset under an existing published tag.

For secret-free review/dry runs, disable updater artifact signing and upload only
short-lived Actions artifacts. Do not weaken production signing to make dry-run
reuse easier.

**Verify**: authorized dry run passes without secrets and creates no Release;
protected prerelease run creates one draft with the expected matrix, signatures,
`latest.json`, and checksums; policy proves only release jobs access secrets.

### Step 6: Prove update behavior on the actual unsigned/ad-hoc platform artifacts

With operator authority, create an older private/prerelease candidate and update
it to the newer draft. Test on every release target:

- update disabled makes no request;
- manual/opt-in check reads GitHub metadata only;
- correct update downloads, verifies the Tauri signature, installs, and relaunches
  only after explicit action;
- tampered metadata/package/signature fails before install;
- dirty draft and pending durable command defer restart;
- offline, 404, rate limit, timeout, partial download, wrong platform, wrong
  architecture, downgrade, and malformed `latest.json` are contextual failures;
- macOS records Gatekeeper/quarantine and TCC permission continuity/regrant after
  replacing an ad-hoc build;
- Windows records SmartScreen/installer behavior separately from updater
  signature success;
- rollback/yank never reuses an existing version/tag/asset.

If Tauri's updater cannot reliably install the ad-hoc macOS or unsigned Windows
artifact without weakening signature validation or silently bypassing OS
security, STOP. Keep manual GitHub updates and remove/disable the in-app install
path for that platform; do not claim parity.

**Verify**: exact older/newer artifact hashes, platform/arch, updater public-key
fingerprint, request log, signature result, install/relaunch result, and draft
state are recorded for every applicable target.

### Step 7: Point the static site to GitHub latest without runtime inference

Update the EN/FR release copy to describe the actual posture:

- releases live on GitHub;
- macOS is ad-hoc and not notarized;
- Windows is unsigned and may show SmartScreen;
- Tauri signatures protect in-app update packages, not OS publisher identity;
- Linux package/support evidence is exact and scoped;
- unsupported enhanced platform claims remain absent.

Change the release CTA/destination to
`https://github.com/SimonHazard/Charon/releases/latest` once a real public
release exists. Keep Astro static. Do not fetch GitHub at build time or runtime,
do not hardcode a version in the browser, and do not add a redirect Worker/API.
Before the first public release, the operator may keep the generic `/releases`
link in production; the plan is not DONE until the latest public route resolves.

Update site tests for exact external link, EN/FR copy, no third-party request on
page load, no GitHub API code, and no “signed installer” ambiguity.

**Verify**: site check/build/tests pass; link scan finds `/releases/latest` only
in release CTAs; network test shows page load makes no GitHub request.

### Step 8: Reconcile runbooks, incident handling, and public evidence

Rewrite `docs/RELEASING.md` as a second-operator procedure:

1. version/changelog consistency;
2. local gate twice;
3. exact-candidate checklist from Plan 014;
4. annotated tag approval/push;
5. protected environment approval;
6. draft asset/checksum/updater-signature verification;
7. manual first-install and previous-version update matrix;
8. human draft promotion;
9. verification that `/releases/latest` and `latest.json` resolve;
10. rollback/yank and new-version procedure.

Incident sections distinguish:

- updater-key compromise: stop release/update, yank latest metadata, rotate trust
  through a reviewed/manual bridge, publish notice, never use the compromised
  key as the sole authority for its replacement;
- GitHub account/repository compromise: stop distribution, revoke sessions/tokens,
  hide releases, compare hashes, publish notice;
- malicious/tampered asset: yank, investigate, new tag/version only;
- platform-warning change: suspend affected target and update public support;
- lost updater private key: manual GitHub update to a version with a new public
  key; never forge compatibility or publish an unsigned updater package.

Update platform support only from exact artifacts. macOS enhanced capture may
remain development-proved/experimental if ad-hoc identity cannot satisfy stable
permission continuity. Windows remains standard composer-only unless its own
physical evidence passes. Do not use release availability to infer capability.

**Verify**: a second operator can follow the runbook to each explicit human/
secret/install/publication gate without undocumented knowledge or paid
certificate; docs and site use the trust terms consistently.

### Step 9: Run final gates and close the plan

Run, in order:

1. updater unit/integration tests;
2. workflow policy and mutable-action scans;
3. site check/build/tests;
4. privacy scan;
5. Rust checks/tests;
6. `bun run check`;
7. `bun run verify:release` twice;
8. exact-candidate and update physical evidence using
   `advisor-plans/012-final-automation-and-manual-acceptance.md` when the advisor
   hardening queue is active, or its complete equivalent;
9. complete diff/secrets/generated-file review.

Once the protected draft exists, stop at `AWAITING OPERATOR` and hand its exact
hashes to Advisor Plan 012 rather than publishing merely to test the latest URL.
Only after that matrix passes may the operator promote the human-approved draft,
verify GitHub latest routes, and set Plan 015 to `DONE`. Publication remains an
explicit operator action; an executor without that authority must never fake
`DONE`.

## Test plan

- ADR/contracts: exact distinction among ad-hoc, unsigned, checksum, and Tauri
  updater signature; privacy remains local/default-off.
- Workflow: immutable actions, least privilege, no PR secrets, secret-free dry
  run, protected all-platform draft, complete assets/signatures/checksums.
- Updater: no-request-off, manual/opt-in check, metadata minimization, no update,
  update available, download, tamper rejection, dirty-draft deferral, explicit
  install/relaunch, offline/failure/downgrade/wrong-target cases.
- Platform: macOS ad-hoc/Gatekeeper/TCC continuity, Windows unsigned/SmartScreen,
  Linux package/install, exact previous-to-next update.
- Site: EN/FR truthful copy, `/releases/latest`, static/no API/no page-load
  GitHub request.
- Operations: version/tag/draft/promotion/latest/rollback/yank/key compromise/
  lost key procedure.

## Done criteria

- [ ] A new accepted ADR authorizes GitHub-only ad-hoc/unsigned distribution and Tauri-signed updates.
- [ ] Active contracts no longer require Apple Developer ID, notarization, Windows Authenticode, or certificate purchase.
- [ ] Quality/security/review workflows remain immutable, least-privilege, and secret-free outside protected release jobs.
- [ ] One protected GitHub Release workflow builds current macOS/Linux/Windows candidates and creates a draft only.
- [ ] macOS assets are labeled ad-hoc/not notarized; Windows assets are labeled unsigned/no Authenticode.
- [ ] `latest.json`, updater artifacts, `.sig` files, build metadata, and `SHA256SUMS` are attached to the same draft.
- [ ] Only the two Tauri updater-key secrets and built-in GitHub token are required.
- [ ] Updater dependencies/config are exact; public key is committed; private key is absent from repo/logs/artifacts.
- [ ] Update checks are default off, metadata-minimized, explicit, signature-verified, dirty-draft safe, and non-downgrading.
- [ ] Previous-to-next update and tamper rejection pass on every claimed target or that platform is truthfully manual-update-only.
- [ ] Static EN/FR site points release CTAs to GitHub `/releases/latest` with no API/runtime inference.
- [ ] Runbooks cover first install, updates, warnings, promotion, yank, rollback, compromise, rotation, and lost key.
- [ ] No tag, push, install, draft promotion, or public release occurred without operator authority.
- [ ] All automated gates pass twice and exact physical evidence is complete.
- [ ] Plan 015 is `DONE`, or `AWAITING OPERATOR` when publication authority is the only remaining condition.

## STOP conditions

Stop and report back if:

- The distribution ADR is not accepted before implementation.
- Production updater key ceremony lacks explicit operator authority or safe
  custody; never insert a placeholder key.
- Any workflow needs Apple/Windows certificate secrets, mutable Actions, broad
  permissions, PR secrets, or automatic public promotion.
- Tauri updater signature validation can be bypassed, accepts tampering or
  downgrade, installs silently, or restarts over dirty/pending state.
- A platform update cannot work with its ad-hoc/unsigned artifact without
  bypassing OS security or weakening verification; fall back to manual update.
- Site linking needs a runtime GitHub API, server adapter, Worker redirect, or
  checked-in fake release metadata.
- Platform or marketing copy would imply Developer ID, notarization,
  Authenticode, SmartScreen reputation, or enhanced capture evidence that does
  not exist.
- A new request would transmit Note, Tag, Attachment, clipboard, path, Workspace,
  selection, or stable device/user data.
- A required verification fails twice for different reasons or artifact matrix
  remains incomplete.
- Publishing, tagging, pushing, installing, key rotation, or draft promotion
  lacks authority.

## Maintenance notes

- Rotate immutable Action SHAs only through reviewed official releases.
- Re-run previous-version update, tamper rejection, and exact native matrix for
  every release.
- Keep the two trust layers visible in code review: platform package posture and
  Tauri updater signature are independent.
- Never replace an asset under a published tag. Fixes use a new version/tag.
- If paid platform signing is ever reconsidered, add it as a new evidence-backed
  capability; do not rewrite the historical ad-hoc/unsigned release record.
