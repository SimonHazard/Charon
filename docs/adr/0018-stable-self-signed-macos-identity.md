# ADR 0018: Stable self-signed macOS signing identity

## Status

Accepted on 2026-09-23 by operator decision. Amends ADR 0014 Decision 1 and
its `release` environment consequence, and the macOS half of ADR 0016
Decision 6. Every other part of ADR 0014 stays authoritative: no Apple
Developer ID, notarization, Apple Developer Program membership, or purchased
certificate.

## Context

ADR 0014 accepted Tauri's ad-hoc identity (`signingIdentity: "-"`) and its
recurring cost: an ad-hoc signature's designated requirement is the binary's
`cdhash`, so every rebuild is a different application to TCC, and macOS users
must grant Input Monitoring and Accessibility again after every update. ADR
0014's "Revisit when" names exactly this cost. The operator decided on
2026-09-23 that the regrant must stop.

TCC stores the designated requirement of the code it grants, and later checks
new code against it. A signature made with a certificate yields a requirement
of the form `identifier "dev.simonhazard.charon" and certificate leaf = H"…"`,
which stays identical across builds as long as the same certificate signs
them. A self-signed code-signing certificate costs nothing, needs no Apple
account, and gives that stable requirement.

Verified on 2026-09-23:

- Tauri's official macOS signing guide
  (<https://v2.tauri.app/distribute/sign/macos/>) covers Apple-issued
  certificates and ad-hoc signing only, and warns that ad-hoc signing does not
  avoid the Privacy & Security steps.
- Tauri CLI 2.11.4 lets `APPLE_SIGNING_IDENTITY` override
  `bundle.macOS.signingIdentity`
  (`crates/tauri-cli/src/interface/rust.rs`). Its `APPLE_CERTIFICATE` import
  only accepts Apple-issued names ("Developer ID Application:",
  "Apple Development:", …; `crates/tauri-macos-sign/src/keychain/identity.rs`),
  so a self-signed certificate must be imported by the workflow, not by Tauri.
- On a local Mac, `codesign` refuses a self-signed identity that is not
  trusted for code signing ("no identity found", `CSSMERR_TP_NOT_TRUSTED`), by
  name or by SHA-1. The signing machine must trust the certificate for code
  signing. GitHub's macOS runners are ephemeral and allow that through `sudo`.

## Decision

1. Released macOS builds are signed with one long-lived self-signed
   code-signing certificate, common name `Charon Release Signing`, owned by the
   operator. Its PKCS#12 export and password are the `release` environment
   secrets `MACOS_SIGNING_P12` and `MACOS_SIGNING_P12_PASSWORD`. They are never
   named `APPLE_CERTIFICATE*`, which Tauri would try to import as an Apple
   certificate.
2. The release workflow imports that identity into a temporary keychain, trusts
   the certificate for code signing on the ephemeral runner only, and builds
   with `APPLE_SIGNING_IDENTITY` set to the common name. Tauri keeps hardened
   runtime and applies no entitlement change.
3. The workflow fails closed: missing secrets, an identity that `codesign`
   cannot use, or a built `Charon.app` whose designated requirement contains
   `cdhash` or does not name the imported certificate's SHA-1 stops the release
   before any asset is uploaded. An ad-hoc release can never ship silently.
4. `bundle.macOS.signingIdentity` stays `"-"` in `tauri.conf.json`, so local and
   contributor builds remain ad-hoc and need no secret.
5. The certificate is rotated only when it is lost or compromised. Rotation, or
   the first switch from ad-hoc, costs every macOS user one more regrant, which
   the release notes disclose.
6. Nothing changes for Gatekeeper: the certificate is not Apple-issued, builds
   are not notarized, and the first launch still requires Privacy & Security,
   Open Anyway (or Control-click, Open on macOS 14). No text may claim that
   Apple verifies, trusts, or notarizes Charon.

## Consequences

- After the first signed release, updates keep Input Monitoring and
  Accessibility. The release that switches from ad-hoc asks one last time.
- The `release` environment holds the Tauri updater key and the macOS signing
  PKCS#12 plus its password. Neither is an Apple or Microsoft credential.
- The operator backs up the PKCS#12 and its password outside Git, like the
  updater key. Losing it costs one regrant, not user data or update trust.
- A compromised certificate lets an attacker sign code that satisfies the
  requirement TCC stored for Charon, and so inherits its grants on machines
  where Charon already holds them. Response: stop releases,
  replace the secret with a new certificate, publish a notice, and accept one
  regrant.
- Windows and Linux are unchanged and remain unsigned.
- Behaviour on a user Mac that does not trust the certificate (launch, TCC
  persistence across an update) is checked on the first signed release and
  recorded in `docs/platform-support.md`. If it fails, revert the workflow to
  ad-hoc (`APPLE_SIGNING_IDENTITY: '-'`) through a new ADR and a patch release.

## Revisit when

Revisit if the self-signed signature is rejected by a future macOS release, if
TCC stops keeping grants for it, or if the project funds a Developer ID
certificate (which would need a new ADR under ADR 0014).
