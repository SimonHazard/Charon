# Charon release checklist

This is a short operator reminder, not a certification matrix.

- [ ] All four manifest versions contain one identical valid SemVer value.
- [ ] No GitHub Release or orphaned tag already uses `vX.Y.Z` for that value.
- [ ] Release notes describe only behavior that actually ships.
- [ ] The `release` environment contains the backed-up updater private key and
      the backed-up `MACOS_SIGNING_P12` / `MACOS_SIGNING_P12_PASSWORD` pair.
- [ ] The macOS job's "Verify the stable macOS designated requirement" step
      printed `certificate leaf = H"…"` with the recorded fingerprint, never `cdhash`.
- [ ] Apple Silicon macOS, Linux, and Windows build jobs all succeed.
- [ ] The final job finds every expected installer, updater bundle, and `.sig`.
- [ ] The final job creates `vX.Y.Z` on the merged `main` commit only after all
      release assets are complete.
- [ ] `latest.json` contains the published version, public URLs, and matching
  signature contents.
- [ ] `SHA256SUMS.txt` covers every published artifact.
- [ ] Release notes disclose macOS first launch, the one-time permission regrant
  when leaving ad-hoc builds, Windows SmartScreen, and the self-signed/unsigned
  distribution posture.
- [ ] No Note, Workspace, clipboard content, private key, or deployment secret
  appears in logs or artifacts.
- [ ] A normal installation/update is tried after publication; failures become
  issues and a new patch version rather than edits under the same tag.
