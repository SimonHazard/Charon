# ADR 0014: Unsigned distribution without paid platform certificates

## Status

Accepted on 2026-08-17 after an operator distribution decision.

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
requirement changes on every rebuild. Plan 007 recorded exactly this: each ad-hoc
rebuild changed the designated requirement, and only an explicit per-decision
reset made the grants apply again. TCC therefore treats each Charon version as a
different application, and Input Monitoring and Accessibility must be granted
again after every update. Those two permissions gate Charon's core capture
gesture, so this is a recurring product cost, not a cosmetic one.

Tauri's updater signature is unrelated to platform code signing. It is a locally
generated minisign key pair, costs nothing, and stays available if an updater is
ever accepted.

## Decision

1. Charon ships unsigned by paid platform certificates. No Apple Developer ID,
   no notarization, no Apple Developer Program membership, and no purchased
   Windows Authenticode certificate is part of the release path. macOS bundles
   keep Tauri's ad-hoc identity (`signingIdentity: "-"`); Windows and Linux
   bundles remain unsigned.
2. The signed-build promotion gate of ADR 0008 and ADR 0002 is replaced by a
   stable release-configuration gate. A capability is promoted to
   release-supported when its complete physical matrix passes against the exact
   release-configuration artifact that will be published, identified by its
   SHA-256. Ad-hoc identity does not block promotion; missing physical evidence
   still does.
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
5. Unsigned artifacts still never promote an unproved capture capability. The
   physical matrices, privacy contract, capability reporting, and per-platform
   support tiers are unchanged by this ADR.
6. Tauri updater signing stays permitted and free. A Tauri-signed update package
   is signed by a locally generated minisign key pair under its own key
   ceremony. It is explicitly not platform code signing, it is independent of
   this ADR, and it grants no exception to the local-only network contract in
   `docs/PRIVACY.md`.
7. If a paid certificate is ever purchased, restoring signature and notarization
   evidence requires a new ADR that reinstates the stronger gate and re-runs the
   affected matrices. It is never added as a hidden secret.

## Scope

This ADR decides the signing posture only. It satisfies the signature half of
Plan 015 Step 1 and leaves that plan's remaining distribution decisions open:
whether GitHub Releases becomes the only distribution and update-metadata
origin, the optional default-off metadata-only update check and its explicit
download, install, and dirty-draft-safe restart flow, and the site link to
`/releases/latest`. Plan 015 remains the place to decide those, and it must not
treat them as settled here.

This ADR supersedes, in every case only where a paid platform signature is made
the promotion condition, and replaces it with the release-configuration gate of
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

Every permission, listener, acquisition, fallback, privacy, and physical-matrix
decision in those ADRs stays authoritative. This ADR lowers no evidence
requirement other than the paid signature itself.

## Consequences

- Release evidence becomes reproducible by one operator on ordinary hardware
  with no purchased credential and no protected secret.
- macOS and Windows capabilities can reach release-supported status on physical
  evidence alone, so the support ledger can move again.
- Users meet a first-launch block on both platforms and must clear it manually.
  Some will not, and that is an accepted adoption cost of a free unsigned tool.
- macOS users regrant Input Monitoring and Accessibility after every update.
  Charon's permission surface already explains both, so the recurring flow is
  the documented one rather than a new failure state.
- Charon cannot detect or repair a tampered download. Checksums shift that
  verification to the user, and the documentation says so plainly instead of
  implying platform-level protection.
- The `release` GitHub environment holds no Apple secret, so the protected
  inputs it existed to guard are gone.

## Revisit when

Revisit if the project gains funding for an Apple Developer Program membership
or a Windows certificate, if Apple or Microsoft offer a no-cost signing path for
free software that does not weaken the privacy contract, or if the recurring TCC
regrant proves to make the capture gesture unusable in practice for real users.
