# Releasing Charon

> The workflow and updater client are implemented. The first real tag remains
> the live validation of the three hosted runners and must be operator-authorized.

## Distribution posture

Charon is a free side project distributed through public GitHub Releases. A
validated `vX.Y.Z` tag starts the only automatic desktop workflow. It builds
macOS, Linux, and Windows artifacts, signs the Tauri updater bundles, and
publishes only after every platform succeeds.

The application is not signed by paid platform certificates. macOS uses Tauri's
ad-hoc identity; Windows and Linux bundles are unsigned. Release notes must say:

- macOS may require System Settings, Privacy & Security, Open Anyway, or
  Control-click, Open on first launch;
- macOS users may need to grant Input Monitoring and Accessibility again after
  an update because the ad-hoc identity changes;
- Windows may show SmartScreen and require More info, Run anyway;
- these artifacts are not verified, trusted, or notarized by Apple or Microsoft.

`SHA256SUMS.txt` accompanies every release. It is an integrity aid, not a
platform trust claim.

## Integrated updater

The Tauri updater reads:

`https://github.com/SimonHazard/Charon/releases/latest/download/latest.json`

Update checks are initially disabled. After the user enables them, Charon checks
at startup and on explicit request. The request contains no Note, Tag,
Attachment, Workspace path, stable Workspace identifier, or behavioral event.
Download and installation require explicit confirmation, and restart waits
until editor and composer drafts are safe.

Tauri verifies updater artifacts with the public key committed in
`tauri.conf.json`. This updater signature is separate from Apple or Microsoft
code signing.

## GitHub environment and secrets

Create a GitHub Actions environment named `release` with no required reviewer.
For Charon's unencrypted updater key, it contains exactly:

- `TAURI_SIGNING_PRIVATE_KEY`: the complete private updater key content.

Generate the pair once outside the repository. Commit only the public key and
store an independent secure backup of the private key. Losing it prevents
existing installations from accepting later updates. If the key is ever
regenerated with encryption, add `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to the
environment and workflow in the same reviewed change.

GitHub supplies `secrets.GITHUB_TOKEN`; do not create it manually. The final
release job alone receives `contents: write`. No GitHub Actions variable, Apple
credential, notarization credential, or Windows certificate is required.

The separate `site-production` environment contains only
`CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Desktop release jobs never
receive them.

## Release procedure

1. Update the version in `package.json`, `apps/desktop/package.json`,
   `apps/desktop/src-tauri/Cargo.toml`, and
   `apps/desktop/src-tauri/tauri.conf.json`.
2. Write short factual release notes.
3. Optionally run local checks appropriate to the change. Data-safety, privacy,
   version, updater-signature, and asset-completeness checks are never skipped by
   the workflow.
4. Commit the release preparation.
5. Create and push one annotated tag: `git tag -a vX.Y.Z -m "Charon vX.Y.Z"`
   then `git push origin vX.Y.Z`.
6. Watch the single release workflow. A failed platform build produces no public
   partial release.
7. Install and use the published build. User-reported compatibility problems
   become ordinary issues and patch releases.

Do not use an existing tag for repaired binaries. Publish a new patch version.
Do not push a real release tag without explicit operator authority.

## Incident handling

- Bad release: mark it as a prerelease or remove its public latest status, state
  the affected version/checksums, and publish a fixed version under a new tag.
- Updater key loss: existing installations cannot trust a replacement key;
  distribute a manual installer with a new trust root and explain the break.
- Updater key compromise: stop release jobs, remove `latest.json`, replace the
  GitHub secret, publish a security notice, and require a manual trust-root
  transition. Never use the compromised key to ship its own replacement.
- Site issue: use the checked Cloudflare deployment history and keep site
  credentials out of desktop workflows.

The exact implementation milestones are recorded in
[`IMPLEMENTATION_HISTORY.md`](IMPLEMENTATION_HISTORY.md); active release work is
listed in [`plans/README.md`](../plans/README.md).
