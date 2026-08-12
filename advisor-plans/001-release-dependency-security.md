# Plan 001: Remove the release dependency vulnerability baseline

> Work on `codex/premium-loop`. Update direct families one at a time with exact
> pins. Never add an unreviewed transitive override or broad migration.

> Drift check: `git diff --stat a0543d0bc9ba49d2eb21f631d5e76104a920fd58..HEAD -- package.json apps/desktop/package.json apps/site/package.json bun.lock .github/workflows/security.yml plans/README.md`

## Status

- **Priority/Risk/Effort**: P0 / MED / M
- **Depends on**: none
- **Category**: security, dependencies, CI
- **Planned at**: `a0543d0`, 2026-08-09
- **State**: TODO

## Why and current evidence

`bun audit` fails with seven advisories (3 high, 3 moderate, 1 low): vulnerable
`fast-uri 3.1.4`, `nanoid 3.3.16`, `hono 4.12.32`, and `js-yaml 4.3.0` through
Vite, Astro/check, and shadcn. The Security workflow already runs the failing
gate. Planning-time registry evidence: Astro `7.2.0`, Vite `8.2.1`, shadcn
`4.16.2`, Biome `2.5.7`, Playwright `1.62.1`, Bun `1.3.14`; these are review
inputs, not permission for a blanket update.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Baseline/security | `bun audit` | reproduce, then zero vulnerabilities |
| Graph | `bun pm ls --all` | direct owner for every vulnerable node |
| Install | `bun install --frozen-lockfile` | reproducible lock |
| Product | `bun run check && bun run build && bun run test:e2e` | exit 0 |
| Rust | `cargo audit --file apps/desktop/src-tauri/Cargo.lock` | zero vulnerabilities; warnings documented |

Suggested skills: `vercel-react-best-practices`; use
`thermo-nuclear-code-quality-review` only after the graph is clean.

## Scope and workflow

In scope: exact direct updates needed for the four nodes, lock regeneration,
ledger/workflow evidence, and caused regressions. Out: features, SSR, package
manager changes, floating versions, audit-silencing overrides, unrelated majors.

- Branch: `codex/premium-loop`
- Exact commit: `chore(deps): clear the release security baseline`
- No push/PR.

## Steps

1. Map each advisory to its direct owner and runtime/build reachability; read
   official release notes and recheck exact registry versions.
2. Update Vite/plugin, Astro/check/sitemap, and shadcn as separate families,
   preferring patched compatible releases. Regenerate only with Bun.
3. After each family, run focused tests and confirm fewer findings/no duplicate
   framework versions. Stop for a required unreviewed major.
4. Update `plans/README.md` ledger and document Rust warnings separately from
   vulnerabilities; never globally ignore future advisories.
5. Run the command table from clean processes and inspect production bundles.

## Done criteria

- [ ] `bun audit` is zero; Rust has zero vulnerabilities.
- [ ] Changed pins are exact, release-note justified, and ledger/lock consistent.
- [ ] No override, float, `latest`, caret, tilde, or mutable workflow invocation.
- [ ] Desktop/site/E2E/privacy/workflow/Rust gates pass.
- [ ] Plan/index `DONE` in the exact commit.

## STOP conditions

- Only an unreviewed major or transitive override appears to fix the advisory.
- Astro ceases to be static or runtime network code enters the site.
- Frozen lock reproduction fails twice or a new high/critical advisory appears.

## Maintenance

Run dependency security before releases and weekly. Never weaken the gate.
