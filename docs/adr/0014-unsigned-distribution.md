# ADR 0014: Unsigned distribution without paid platform certificates

## Status

Accepted on 2026-08-17 after an operator distribution decision.

Amended on 2026-09-23 by ADR 0018: macOS releases are signed with one stable
self-signed certificate instead of the ad-hoc identity, so TCC grants survive
updates, and the `release` environment also holds that certificate. No Apple
or Microsoft credential, notarization, or paid certificate is added.

## Context

ADR 0008 made a stable Apple Developer ID signature the gate that promotes a
macOS capture capability from development-proved to release-supported. ADR 0002
made an equivalent signed-build gate the promotion condition for Windows.
`docs/RELEASING.md`, `docs/platform-support.md`, `docs/PRIVACY.md`, and the
release checklist all inherited that gate.

Both gates require a paid membership: an Apple Developer Program membership for
a Developer ID certificate and notarization, and a purchased OV or EV
certificate for Windows Authenticode. The operator has decided not to buy
either, now or later. Charon is free, has no revenue, and its distribution
posture must match that.

Left uncorrected, the contracts describe a promotion gate that will never be
satisfied. Every macOS and Windows capability would stay permanently unprovable
by its own documentation, and the release procedure would keep asking a reviewer
for signature and notarization evidence that cannot exist. That is a
documentation defect, not a real safety control.

The cost of dropping the gate is not only the first-launch warning. On macOS an
ad-hoc signature binds the designated requirement to the binary's cdhash, so the
requirement changes on every rebuild. Physical development evidence recorded
that each ad-hoc rebuild changed the designated requirement, and only an explicit per-decision
reset made the grants apply again. TCC therefore treats each Charon version as a
different application, and Input Monitoring and Accessibility must be granted
again after every update. Those two permissions gate Charon's core capture
gesture, so this is a recurring product cost, not a cosmetic one.

Tauri's updater signature is unrelated to platform code signing. It is a locally
generated key pair, costs nothing, and is required by the accepted v1 updater.

## Decision

1. Charon ships unsigned by paid platform certificates. No Apple Developer ID,
   no notarization, no Apple Developer Program membership, and no purchased
   Windows Authenticode certificate is part of the release path. macOS bundles
   keep Tauri's ad-hoc identity (`signingIdentity: "-"`); Windows and Linux
   bundles remain unsigned.
2. The signed-build promotion gate of ADR 0008 and ADR 0002 is removed. Release
   publication requires deterministic version, build, privacy, data-safety, and
   asset-completeness checks. Physical compatibility testing remains useful but
   is not a publication gate under ADR 0016.
3. Published SHA-256 checksums are the integrity mechanism. Each release records
   the checksum of every published artifact next to it, and the checklist
   verifies the installed bytes against that value. No release claims that its
   artifacts are verified, trusted, or notarized by Apple or Microsoft.
4. The first-launch bypass and the TCC regrant cost are disclosed, not
   minimized. Release notes and any future install documentation state that
   macOS blocks the first launch of a downloaded build, that the user opens it
   through System Settings, Privacy & Security, Open Anyway on macOS 15 and
   later or Control-click, Open on macOS 14, that Windows shows a SmartScreen
   warning cleared through More info, Run anyway, and that Input Monitoring and
   Accessibility must be granted again after every macOS update.
5. Unsigned artifacts never create a false capability claim. Unimplemented
   paths remain `Unsupported`; newly implemented Windows/X11 paths begin as
   `Experimental` and are refined through ordinary use and user reports.
6. Tauri updater signing stays permitted and free. A Tauri-signed update package
   is signed by a locally generated minisign key pair under its own key
   ceremony. It is explicitly not platform code signing, it is independent of
   this ADR, and it grants no exception to the local-only network contract in
   `docs/PRIVACY.md`.
7. If a paid certificate is ever purchased, restoring signature and notarization
   evidence requires a new ADR that reinstates the stronger gate and re-runs the
   affected matrices. It is never added as a hidden secret.

## Scope

This ADR decides the signing posture only. ADR 0016 separately accepts GitHub
Releases as the distribution and update-metadata origin, plus the default-off
metadata check and explicit download, install, and dirty-draft-safe restart
flow.

This ADR supersedes, in every case only where a paid platform signature is made
the promotion condition, and replaces it with the deterministic release gate of
Decision 2:

- ADR 0002, the Windows row requiring a signed-build smoke test and the revisit
  clause keyed to signed smoke-test evidence;
- ADR 0008, the stable Developer ID release gate;
- ADR 0009, release support requiring the matrix on a stable signed bundle
  identity, and the signed-build matrix required for Accessibility-path
  expansion;
- ADR 0010, the signed-build component of the Linux and Windows adapter
  requirement;
- ADR 0011 Decision 13, only where it names signed-build gates.

Every permission, listener, acquisition, fallback, and privacy decision in those
ADRs stays authoritative. ADR 0016 later changed physical matrices from release
gates into optional compatibility tools.

## Consequences

- Release artifacts can be produced by GitHub Actions without a purchased
  platform credential.
- Platform capability wording stays conservative while compatibility evolves
  through real use.
- Users meet a first-launch block on both platforms and must clear it manually.
  Some will not, and that is an accepted adoption cost of a free unsigned tool.
- macOS users regrant Input Monitoring and Accessibility after every update.
  Charon's permission surface already explains both, so the recurring flow is
  the documented one rather than a new failure state.
- Charon cannot detect or repair a tampered download. Checksums shift that
  verification to the user, and the documentation says so plainly instead of
  implying platform-level protection.
- The `release` GitHub environment holds only the Tauri updater private key.
  It never holds an Apple or Microsoft signing credential.

## Revisit when

Revisit if the project gains funding for an Apple Developer Program membership
or a Windows certificate, if Apple or Microsoft offer a no-cost signing path for
free software that does not weaken the privacy contract, or if the recurring TCC
regrant proves to make the capture gesture unusable in practice for real users.
