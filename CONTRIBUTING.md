# Contributing to Charon

Thanks for taking the time to help. Charon is a small local-first side project,
so contributions should stay focused, reviewable, and consistent with the
product and privacy contracts.

Simon Hazard (`@SimonHazard`) is the principal maintainer and decides what is
merged into `main`. Opening a pull request does not imply that a proposal will
be accepted, but constructive bug reports and narrowly scoped improvements are
welcome.

## Before opening a pull request

1. Search existing issues and pull requests.
2. Open an issue before a large feature, persistence change, new network
   request, platform capability, or product-direction change.
3. Read `AGENTS.md`, `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`,
   `docs/PRIVACY.md`, and the relevant UX, site, ADR, and active-plan material.
4. Never include Note text, selected text, clipboard contents, Attachment
   bytes, private keys, tokens, or sensitive filesystem paths in an issue,
   test fixture, log, screenshot, or pull request.

Security vulnerabilities belong in [GitHub private vulnerability
reporting](https://github.com/SimonHazard/Charon/security/advisories/new), not a
public issue.

## Development

Use Bun for JavaScript and TypeScript and Cargo for Rust. Requirements and the
basic setup are listed in the [README](README.md#develop).

```sh
bun install --frozen-lockfile
bun run check
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked
```

Run narrower checks while iterating, then run the checks relevant to the files
you changed. Do not hand-edit generated lockfiles, Paraglide output, `ts-rs`
bindings, build artifacts, or coverage output.

## Pull requests

- Fork the repository and create a focused branch.
- Keep one concern per pull request and explain the user-visible effect.
- Add proportionate tests and update the contracts when behavior changes.
- Complete the pull-request template and keep the Quality check green.
- Expect review feedback and avoid unrelated formatting or dependency churn.
- Do not publish releases, deploy the site, or add secrets from a contribution.

By contributing, you agree that your contribution is licensed under the
repository's [MIT License](LICENSE).
