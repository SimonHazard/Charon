# Releasing Charon

Charon releases are human-approved. No agent or workflow promotes a public
release, installs an artifact, enables an update, or changes public platform
claims without an operator decision and evidence from the exact artifact.

## Distribution posture

Charon is free and ships unsigned. ADR 0014 accepted that no Apple Developer ID,
notarization, or purchased Windows certificate is part of the release path. No
Mac App Store or Microsoft Store listing is planned. macOS ships as a direct app
or DMG under Tauri's ad-hoc identity; Windows and Linux artifacts are unsigned.
Every published artifact must disclose its first-launch warning. Unsigned
artifacts never promote an unproved capture capability or enable an unsigned
updater path.

Two costs are disclosed, never minimized. macOS blocks the first launch of a
downloaded build: the user opens it through System Settings, Privacy & Security,
Open Anyway on macOS 15 and later, or Control-click, Open on macOS 14. Windows
shows a SmartScreen warning cleared through More info, Run anyway. Separately,
an ad-hoc signature binds the designated requirement to the binary, so TCC
treats each version as a different app and macOS users must grant Input
Monitoring and Accessibility again after every update.

Published SHA-256 checksums are the integrity mechanism. Record the checksum of
every artifact next to it and never claim that a release is verified, trusted,
or notarized by Apple or Microsoft.

GitHub Releases is the desktop distribution destination. Releases are created as
drafts and promoted only by a human. Unsigned macOS, Linux, and Windows review
bundles are available through the manual review workflow. The static site is
deployed separately through the checked Cloudflare Workers Static Assets
configuration from Plan 018. A push to `main` deploys it only when
site-affecting paths changed.

The path-filtered quality workflow consolidates routine desktop validation on
one bounded Ubuntu job. It covers lint, types, unit tests, the production build,
privacy, Rust formatting/Clippy/tests, generated bindings, and Chromium desktop
journeys. It does not build platform bundles or constitute macOS, Windows, or
release evidence. The secret-free manual review workflow remains the place to
produce short-lived macOS, Linux, and Windows artifacts when an exact candidate
is actually needed.

On each supported build host, `bun run tauri:build` now produces the native
unsigned review installers selected by `tauri.conf.json`: `.app` and `.dmg` on
macOS, `.deb`, AppImage, and `.rpm` on Linux, and NSIS plus MSI on Windows. The
Windows installers embed the small WebView2 bootstrapper, so installation works
offline when the WebView2 runtime is already present, as it is by default on
Windows 11. These artifacts carry no signed-publisher, trusted, verified, or
notarized claim.

The separate `Portability` workflow runs Rust formatting, Clippy, and tests on
macOS and Windows whenever `src-tauri` changes; `Quality` runs the same Rust
gate on Linux. These compile-and-test results do not constitute physical or
release evidence for any platform.

The separate site workflow typechecks, tests, builds, validates Wrangler, and
deploys production from `main`; the full local release gate continues to cover
both desktop and site as well as Chromium and WebKit. It never runs on pull
requests and creates no preview deployment.
The timing-sensitive performance budget remains in `bun run verify:release`
rather than PR CI, where shared-runner contention makes the 20k-search benchmark
non-deterministic.

## Immutable action ledger

Resolved from official repositories on 2026-08-09. Each workflow uses the
40-character commit, with the reviewed release tag retained as a comment.

| Repository | Reviewed release | Commit | Purpose |
|---|---|---|---|
| `actions/checkout` | `v7.0.1` | `3d3c42e5aac5ba805825da76410c181273ba90b1` | Source checkout |
| `oven-sh/setup-bun` | `v2.2.0` | `0c5077e51419868618aeaa5fe8019c62421857d6` | Bun 1.3.12 setup |
| `dtolnay/rust-toolchain` | `stable` resolved 2026-08-09 | `4360b52568e2003a75bf9bc1d59f33a8e3fc893c` | Rustfmt and Clippy |
| `Swatinem/rust-cache` | `v2.9.2` | `6323deb102c322ba6fcbdcafc7e3dddab59af2b6` | Cargo cache |
| `actions/upload-artifact` | `v7.0.1` | `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` | Review artifacts |
| `tauri-apps/tauri-action` | `action-v1.0.0` | `1deb371b0cd8bd54025b384f1cd735e725c4060f` | Desktop bundles and draft release |
| `step-security/harden-runner` | `v2.20.1` | `b09bb98e06d4d774595224525879c09bc6e98c40` | Runner egress audit |

`actions/download-artifact` at `v8.0.1` was reviewed at commit
`3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c` and is not currently needed.

## Protected inputs

The desktop release needs no signing secret. ADR 0014 removed every Apple input,
so `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` are not created, not stored,
and not referenced. A `release` environment with required reviewers remains
useful as a human approval gate, but it guards no credential.

Tauri updater signing is unaffected and free. Its minisign key pair is generated
locally and has no relationship to Apple or Microsoft signing. If an updater is
ever accepted, `TAURI_SIGNING_PRIVATE_KEY` and
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` are the only release secrets, and the
updater public key and real endpoint may enter Tauri configuration only after
that key ceremony. Until then, updater dependencies and UI remain absent. This
is deliberate: a placeholder key or unsigned update path is not a feature.

Store no private updater key in Git, artifacts, logs, or repository variables.

`.github/workflows/release.yml` references exactly one secret, the automatic
`GITHUB_TOKEN`. It pins `APPLE_SIGNING_IDENTITY` to the literal ad-hoc `-`, as
`review-builds.yml` already did, so a changed `tauri.conf.json` cannot make a
release attempt a signature that cannot exist.

## Release procedure

The procedure needs no credential beyond ordinary GitHub write access, so it
runs locally on the operator's machine. It does not depend on Actions.

Two equivalent paths produce the same draft. Pushing a `vX.Y.Z` tag runs
`release.yml`, which gates on `verify:release`, builds the ad-hoc bundles,
creates the draft, and uploads `SHA256SUMS.txt`; steps 3, 4, and 6 below are
then already done. Without Actions, run every step by hand. Either way a human
performs steps 7 and 8.

1. Bump Cargo and Tauri versions to the same semver and update the localized
   changelog with facts that will ship. `scripts/check-release-version.ts`
   enforces tag/Tauri/Cargo consistency only when `GITHUB_REF_NAME` is set, so
   confirm the two manifests by hand when releasing locally.
2. Run `bun run verify:release` twice from clean processes. Complete every
   applicable row in `docs/RELEASE_CHECKLIST.md`.
3. Build the exact candidate with `bun run tauri:build`; the checked-in
   `bundle.targets` selects the platform-native unsigned installers for the
   current host.
4. Record the SHA-256 of every artifact that will be published, as
   `SHA256SUMS.txt`, plus the checksum of the executable inside the app bundle
   for the support ledger. These are the release's only integrity evidence,
   because nothing in the artifact carries a platform signature.
5. Create an annotated `vX.Y.Z` tag only after review. Push the tag only with
   publication authority.
6. Create a draft release and upload the artifacts and `SHA256SUMS.txt`, for
   example with `gh release create vX.Y.Z --draft`. Never create a public
   release directly. The draft body must already carry the disclosures required
   by step 8.
7. A human installs each published artifact from the draft, clears the
   first-launch block the way a user will, confirms the installed bytes match
   the recorded SHA-256, grants Input Monitoring and Accessibility again,
   repeats native capture, clipboard, focus, Workspace, edit, copy, and Delete
   smoke, then records the artifact IDs.
8. Promote the draft and latest metadata only after those checks. Release notes
   must state the first-launch bypass, the SmartScreen warning where Windows
   artifacts ship, and the permission regrant. The current site remains
   front-page only; exposing a release link requires a separately reviewed site
   change.

## Rollback and incidents

- Site publication uses `apps/site/wrangler.jsonc` as source of truth. GitHub's
  `site-production` environment stores only `CLOUDFLARE_ACCOUNT_ID` and a scoped
  `CLOUDFLARE_API_TOKEN`; neither value enters source or logs. Each matching
  push to `main` validates and deploys the exact static build. Use Wrangler
  deployment rollback when needed. Do not add a runtime redirect service or a
  preview deployment.
- To yank a release, mark it prerelease or draft, remove any public site link if
  one was later introduced, and state the reason. Never replace an asset under
  the same tag.
- Charon cannot revoke a published unsigned artifact. There is no certificate to
  revoke and no platform kill switch, so a bad build is withdrawn by yanking the
  release, publishing the affected checksums in the notice, and shipping a new
  version. Say so plainly rather than implying platform-level recall.
- For an updater key compromise, if an updater exists, stop release jobs, remove
  the public latest metadata, revoke the affected key, rotate the protected
  secret, publish a security notice, and require a new version and trust root.
  Do not use the compromised key to ship its own replacement.
- GitHub observes ordinary network metadata when a user explicitly checks a
  release or update. Charon sends no Note, Tag, Attachment byte, Workspace path,
  or stable Workspace identifier.
