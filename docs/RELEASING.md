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
| `actions/configure-pages` | `v6.0.0` | `45bfe0192ca1faeb007ade9deae92b16b8254a0d` | Pages configuration |
| `actions/upload-pages-artifact` | `v5.0.0` | `fc324d3547104276b827a68afc52ff2a11cc49c9` | Static artifact |
| `actions/deploy-pages` | `v5.0.0` | `cd2ce8fcbc39b97be8ca5fce6e763baed58fa128` | Protected Pages deployment |
| `step-security/harden-runner` | `v2.20.1` | `b09bb98e06d4d774595224525879c09bc6e98c40` | Runner egress audit |

`actions/download-artifact` at `v8.0.1` was reviewed at commit
`3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c` and is not currently needed.

## Protected inputs

Create a GitHub environment named `release` with required reviewers. Add only
these Actions secrets: `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`,
`APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`,
`TAURI_SIGNING_PRIVATE_KEY`, and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Store no
certificate, password, private updater key, or notarization credential in Git,
artifacts, logs, repository variables, or Pages.

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
6. Promote the draft and latest metadata only after those checks. Refresh the
   checked-in static release state in a reviewed change.

## Rollback and incidents

- To roll back Pages, redeploy a previously verified Pages artifact or revert
  the site commit. Do not add a runtime redirect service.
- To yank a release, mark it prerelease or draft, remove it from checked-in site
  metadata, and state the reason. Never replace an asset under the same tag.
- For a signing or updater key compromise, stop release jobs, remove the public
  latest metadata, revoke affected certificates/keys, rotate protected secrets,
  publish a security notice, and require a new version and trust root. Do not
  use the compromised key to ship its own replacement.
- GitHub observes ordinary network metadata when a user explicitly checks a
  release or update. Charon sends no Note, Tag, Attachment byte, Workspace path,
  or stable Workspace identifier.
