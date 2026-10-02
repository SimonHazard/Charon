# ADR 0027: Return macOS releases to Tauri's ad-hoc identity

## Status

Accepted on 2026-10-02 by operator decision. Supersedes ADR 0018 before any
release used it: no self-signed certificate or signing secret was ever
created, and every published macOS build (v0.1.0 to v0.1.3) is ad-hoc. ADR
0014 Decision 1 and the macOS half of ADR 0016 Decision 6 apply again as
written. ADR 0018 stays in the repository as the documented, ready-to-adopt
path to a stable free identity.

## Context

ADR 0018 (2026-09-23) chose one long-lived self-signed code-signing
certificate so that the designated requirement of every release names that
certificate instead of the binary's `cdhash`, and macOS keeps Input
Monitoring and Accessibility across updates. It costs the operator a
certificate to create, back up, and never lose, two `release` secrets, a
runner step that trusts the certificate through `sudo`, an incident procedure
for loss or compromise, and it was never proven on a user's Mac.

Tauri's official macOS signing guide
(<https://v2.tauri.app/distribute/sign/macos/>) documents two paths: an
Apple-issued certificate (Apple Developer Program membership, Developer ID,
and notarization), and ad-hoc signing with `signingIdentity: "-"` when there is
no Apple account. Self-signed certificates are not part of that guide, and
Tauri's own certificate import accepts only Apple-issued names. The operator
pays for no Apple or Microsoft developer licence (ADR 0014) and asked on
2026-10-02 to stay on what Tauri documents.

## Decision

1. macOS release builds use Tauri's ad-hoc identity:
   `APPLE_SIGNING_IDENTITY: '-'` in the release workflow and
   `bundle.macOS.signingIdentity: "-"` in `tauri.conf.json`. No Apple
   credential, Developer ID, notarization, self-signed certificate, or macOS
   signing secret is used. The `release` environment holds only the Tauri
   updater key.
2. The release workflow verifies the ad-hoc bundle signature with
   `codesign --verify --deep --strict` before upload, so an Apple Silicon
   bundle never ships unsigned. Workflow regression checks require the ad-hoc
   identity and that verification, and forbid `APPLE_CERTIFICATE`,
   `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_API_KEY`, and `MACOS_SIGNING_P12`.
3. Each release has a new `cdhash`, so macOS may ask again for Input
   Monitoring and Accessibility after every update. Charon discloses it: the
   macOS install dialog warns before the update (the notice plan 052 had
   removed is restored), Preferences keeps the per-permission actions and the
   help for a stale entry of an earlier build, and release notes say it.
4. Gatekeeper behaviour is unchanged: the first launch still requires
   Privacy & Security, Open Anyway (or Control-click, Open on macOS 14). No
   text may claim that Apple verifies, trusts, or notarizes Charon.
5. Tauri updater signatures are unaffected: update artifacts stay verified
   against the public key in `tauri.conf.json`.

## Consequences

- Nothing to create, back up, rotate, or leak beyond the updater key; the
  release workflow is shorter and needs no `sudo` trust step.
- macOS users grant Input Monitoring and Accessibility again after each
  update, the cost ADR 0014 accepted. Until they do, double-Shift capture is
  unavailable; the composer and the composer shortcut keep working.
- Plan 052 ("Retire the per-update macOS permission notice") is rejected.

### The cleaner path, kept on record

A stable identity removes the per-update regrant without any paid licence.
ADR 0018 describes it, and `docs/RELEASING.md` ("Not used: stable self-signed
identity") keeps the certificate procedure. Adopting it later means: create
the certificate and the two `release` secrets, restore the import and
designated-requirement steps of PR #62 (commit `e64689f`) in
`.github/workflows/release.yml` and `scripts/check-workflows.ts`, remove the
per-update notice, and write a new ADR superseding this one. A paid Developer
ID with notarization would also remove the Gatekeeper step; it needs a new ADR
under ADR 0014.

## Revisit when

Revisit if user reports show that the per-update regrant makes double-Shift
capture unusable in practice, if a future macOS release refuses ad-hoc
signed applications, or if the operator decides to adopt the stable identity
of ADR 0018 or a paid Developer ID.
