# Releasing Charon

## Distribution posture

Charon is a free side project distributed through public GitHub Releases. A
protected update to `main` starts the only automatic desktop workflow. It reads
the root package, desktop package, Cargo, and Tauri versions. If all four contain
one new SemVer, it builds Apple Silicon macOS, Linux, and Windows artifacts,
signs the Tauri updater bundles, creates the matching `vX.Y.Z` tag on that merged
commit, and publishes only after every platform succeeds. If the version already has a
published release, the workflow exits without rebuilding.

The application is not signed by paid platform certificates. macOS releases are
signed with the project's stable self-signed certificate (ADR 0018), so Input
Monitoring and Accessibility survive updates; Windows and Linux bundles are
unsigned. Release notes must say:

- macOS may require System Settings, Privacy & Security, Open Anyway, or
  Control-click, Open on first launch;
- the first self-signed release asks macOS users to grant Input Monitoring and
  Accessibility one last time (updates from ad-hoc builds, v0.1.x);
- Windows may show SmartScreen and require More info, Run anyway;
- these artifacts are not verified, trusted, or notarized by Apple or Microsoft;
  the macOS certificate is self-signed, not issued by Apple.

`SHA256SUMS.txt` accompanies every release. It is an integrity aid, not a
platform trust claim.

Since v0.1.3, macOS releases are native Apple Silicon (`arm64`) builds from
GitHub's `macos-15` arm64 runner. Intel Macs are outside the release target;
updater metadata contains `darwin-aarch64` and no `darwin-x86_64` entry.
v0.1.0 and v0.1.1 were Intel (`x86_64`) builds. Those installations look for a
`darwin-x86_64` entry and cannot self-update: an enabled check reports a
contextual update error, and Apple Silicon users must install the current
`.dmg` manually once.

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

AppImage, NSIS, and macOS installations can self-update. deb, rpm, and MSI
installations must download the new package from GitHub Releases and install it
the same way.

## GitHub environment and secrets

Create a GitHub Actions environment named `release` with no required reviewer.
It contains exactly:

- `TAURI_SIGNING_PRIVATE_KEY`: the complete private updater key content (the
  current key is unencrypted);
- `MACOS_SIGNING_P12`: the base64 PKCS#12 export of the self-signed
  `Charon Release Signing` certificate and its private key (ADR 0018);
- `MACOS_SIGNING_P12_PASSWORD`: that export's password.

Never name the macOS secrets `APPLE_CERTIFICATE*`: Tauri would try to import
them as an Apple-issued certificate and fail. The workflow imports the
identity itself, trusts it for code signing on the ephemeral runner only, and
refuses to publish a macOS build whose designated requirement is ad-hoc.

Generate the pair once outside the repository. Commit only the public key and
store an independent secure backup of the private key. Losing it prevents
existing installations from accepting later updates. If the key is ever
regenerated with encryption, add `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to the
environment and workflow in the same reviewed change.

GitHub supplies `secrets.GITHUB_TOKEN`; do not create it manually. The final
release job alone receives `contents: write`. No GitHub Actions variable, Apple
credential, notarization credential, or Windows certificate is required.

## macOS signing identity (once)

Create the certificate on the operator's Mac with the system LibreSSL
(`/usr/bin/openssl`); its PKCS#12 output is readable by `security import`.
OpenSSL 3 needs `-legacy` on the export.

```sh
mkdir -p ~/charon-signing && cd ~/charon-signing
cat > charon-signing.cnf <<'EOF'
[req]
distinguished_name = dn
x509_extensions = ext
prompt = no
[dn]
CN = Charon Release Signing
[ext]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
subjectKeyIdentifier = hash
EOF
/usr/bin/openssl req -x509 -newkey rsa:3072 -nodes -days 7300 \
  -config charon-signing.cnf -keyout charon-signing.key -out charon-signing.pem
/usr/bin/openssl pkcs12 -export -name "Charon Release Signing" \
  -inkey charon-signing.key -in charon-signing.pem -out charon-signing.p12
/usr/bin/openssl x509 -in charon-signing.pem -noout -fingerprint -sha1
base64 -i charon-signing.p12 | gh secret set MACOS_SIGNING_P12 --env release
gh secret set MACOS_SIGNING_P12_PASSWORD --env release
```

Choose a strong export password when prompted and enter the same one for the
second secret. Record the SHA-1 fingerprint in the release PR. Back up
`charon-signing.p12` and its password with the updater key, then delete the
working directory. Never rotate the certificate except after loss or
compromise: each new certificate costs every macOS user one regrant.

Optional local proof before the first signed release: import
`charon-signing.p12` into the login keychain, set the certificate to "Always
Trust" for Code Signing in Keychain Access, build with
`APPLE_SIGNING_IDENTITY="Charon Release Signing" bun run tauri:build -- --bundles app`,
check that `codesign -d -r - apps/desktop/src-tauri/target/release/bundle/macos/Charon.app`
prints `certificate leaf = H"…"` rather than `cdhash`, grant both permissions,
rebuild after a trivial change, and confirm they are still granted. Remove the
local trust afterwards and delete `apps/desktop/src-tauri/target/release` if
space matters.

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
   the workflow. Dispatch `quality.yml` once only when the release candidate
   needs GitHub-hosted confirmation; do not run a duplicate platform-build
   workflow.
4. Commit the release preparation and merge its validated pull request into
   protected `main`.
5. Watch the single release workflow. It creates the matching tag only after
   every asset is complete. A failed platform build produces no public partial
   release.
6. Install and use the published build. User-reported compatibility problems
   become ordinary issues and patch releases.

Run `security.yml` explicitly after dependency changes or for an occasional
audit. The site workflow verifies and deploys automatically after a protected
merge to `main`; it is not manually dispatchable and does not belong to the
desktop release chain.

Do not reuse an existing manifest version or tag for repaired binaries. Publish
a new patch version. An orphaned tag or draft release fails closed instead of
being overwritten.

## Incident handling

- Bad release: mark it as a prerelease or remove its public latest status, state
  the affected version/checksums, and publish a fixed version under a new tag.
- Updater key loss: existing installations cannot trust a replacement key;
  distribute a manual installer with a new trust root and explain the break.
- Updater key compromise: stop release jobs, remove `latest.json`, replace the
  GitHub secret, publish a security notice, and require a manual trust-root
  transition. Never use the compromised key to ship its own replacement.
- macOS signing certificate loss: create a new one (section above), replace
  both secrets, and state in the next release notes that macOS asks for Input
  Monitoring and Accessibility once more.
- macOS signing certificate compromise: stop release jobs, replace both
  secrets with a new certificate, publish a security notice, and disclose the
  one-time regrant. The old certificate satisfies the grants already stored on
  users' Macs, so say so plainly.
- Site issue: use the checked Cloudflare deployment history and keep site
  credentials out of desktop workflows.

The exact implementation milestones are recorded in
[`IMPLEMENTATION_HISTORY.md`](IMPLEMENTATION_HISTORY.md); active work is
listed in [`plans/README.md`](../plans/README.md).
