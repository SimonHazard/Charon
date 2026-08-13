# Releasing Charon

Charon releases are human-approved. No agent or workflow promotes a public
release, installs an artifact, enables an update, or changes public platform
claims without an operator decision and evidence from the exact artifact.

## Distribution posture

Charon is free. No Mac App Store or Microsoft Store listing is planned. macOS
ships, if approved, as a direct app or DMG; local and review builds use Tauri's
ad-hoc identity until an optional Developer ID and notarization path is supplied.
Windows review artifacts may remain unsigned and must disclose the resulting
SmartScreen warning. Unsigned artifacts never promote an unproved capture
capability or enable an unsigned updater path.

GitHub Releases is the desktop distribution destination. An annotated `vX.Y.Z`
tag runs the protected Tauri workflow, which creates a draft GitHub Release and
uploads the signed macOS app and DMG for human verification. Unsigned macOS,
Linux, and Windows review bundles are available only through the manual review
workflow. The static site is deployed separately through the checked Cloudflare
Workers Static Assets configuration from Plan 018. A push to `main` deploys it
only when site-affecting paths changed.

The quality workflow runs the Rust test suite on macOS and Linux. Windows still
formats and runs Clippy across all targets, including test targets; runtime
filesystem tests remain blocked by unresolved Windows path, directory-sync, and
watcher semantics. This compile-only gate is not Windows release evidence.
Frontend and browser jobs validate the desktop app only. The separate site
workflow typechecks, tests, builds, validates Wrangler, and deploys production
from `main`; the full local release gate continues to cover both desktop and
site. It never runs on pull requests and creates no preview deployment.
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

Create a GitHub environment named `release` with required reviewers. Add only
these Actions secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`,
`TAURI_SIGNING_PRIVATE_KEY`, and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Store no
certificate, password, private updater key, or notarization credential in Git,
artifacts, logs, or repository variables.

The updater public key and real endpoint may enter Tauri configuration only
after the first protected key ceremony. Until then, updater dependencies and UI
remain absent. This is deliberate: a placeholder key or unsigned update path is
not a feature.

## Release procedure

1. Bump Cargo and Tauri versions to the same semver and update the localized
   changelog with facts that will ship.
2. Run `bun run verify:release` twice from clean processes. Complete every
   applicable row in `docs/RELEASE_CHECKLIST.md`.
3. Create an annotated `vX.Y.Z` tag only after review. Push the tag only with
   publication authority.
4. Approve the protected `release` environment. The workflow creates a draft,
   never a public release.
5. A human downloads checksums and signed artifacts, verifies macOS signature
   and notarization, installs each supported artifact, repeats native capture,
   clipboard, focus, Workspace, edit, copy, and Delete smoke, then records IDs.
6. Promote the draft and latest metadata only after those checks. The current
   site remains front-page only; exposing a release link requires a separately
   reviewed site change.

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
- For a signing or updater key compromise, stop release jobs, remove the public
  latest metadata, revoke affected certificates/keys, rotate protected secrets,
  publish a security notice, and require a new version and trust root. Do not
  use the compromised key to ship its own replacement.
- GitHub observes ordinary network metadata when a user explicitly checks a
  release or update. Charon sends no Note, Tag, Attachment byte, Workspace path,
  or stable Workspace identifier.
