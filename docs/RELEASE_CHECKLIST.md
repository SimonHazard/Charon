# Charon release checklist

This is a short operator reminder, not a certification matrix.

- [ ] All four manifest versions equal the annotated `vX.Y.Z` tag.
- [ ] Release notes describe only behavior that actually ships.
- [ ] The repository is public before the first updater-enabled release.
- [ ] The `release` environment contains the backed-up updater key and password.
- [ ] macOS, Linux, and Windows build jobs all succeed.
- [ ] The final job finds every expected installer, updater bundle, and `.sig`.
- [ ] `latest.json` contains the published version, public URLs, and matching
  signature contents.
- [ ] `SHA256SUMS.txt` covers every published artifact.
- [ ] Release notes disclose macOS first launch and permission regrant, Windows
  SmartScreen, and the unsigned/ad-hoc distribution posture.
- [ ] No Note, Workspace, clipboard content, private key, or deployment secret
  appears in logs or artifacts.
- [ ] A normal installation/update is tried after publication; failures become
  issues and a new patch version rather than edits under the same tag.
