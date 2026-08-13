# Plan 018: Host the static site on Cloudflare Workers

> **Executor instructions**: The operator explicitly reprioritized this plan on
> 2026-08-12 before Plan 017 and authorized production publication. On
> 2026-08-13, the operator rejected preview deployments and required automatic
> production deployment only after a matching push to `main`. Preserve ADR
> 0004's static-only boundary, the public-site privacy contract, and every
> verified-claim gate from Plan 013. Use Bun only, pin Wrangler exactly, keep its
> configuration as source of truth, and never print, copy, or commit Cloudflare
> credentials. Stop on every STOP condition.
>
> **Drift check (run first)**:
> `git diff --stat c4d2f32..HEAD -- README.md docs/ARCHITECTURE.md docs/PRIVACY.md docs/SITE.md docs/RELEASING.md apps/site .github/workflows/site-deploy.yml scripts/check-workflows.ts package.json bun.lock .gitignore plans/README.md`
> The expected baseline is the completed static site with GitHub Pages defaults,
> no Wrangler dependency or configuration, no Cloudflare deployment, and a clean
> worktree. Stop if the site gained a runtime API, tracker, form, dynamic adapter,
> conflicting canonical origin, or overlapping user changes.

## Status

- **State**: AWAITING OPERATOR — add the two GitHub environment secrets, turn
  off Cloudflare Network Error Logging, then authorize this branch to reach
  `main` and confirm the first matching workflow run
- **Priority**: P1, explicitly reprioritized by the operator
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/013-build-brand-led-static-site.md`
- **Category**: hosting, privacy, operations, tests
- **Planned at**: commit `c4d2f32`, 2026-08-12; automation contract revised 2026-08-13

## Why this matters

The completed Astro site needs one reproducible public home at
`https://charon.simonhazard.com`. Cloudflare Workers Static Assets can publish
the existing ordinary static files without adding a Worker script, server
adapter, runtime API, analytics, or client-side release lookup.

There is one production surface only. The `workers.dev` route and Preview URLs
are disabled. A GitHub Actions workflow deploys after a push to `main` only when
the site, shared theme, root manifest, lockfile, or deployment workflow changed.
It never runs on a pull request and never uploads an undeployed version.

The Cloudflare host may necessarily process ordinary HTTP connection metadata;
Charon does not add Cloudflare Web Analytics, application telemetry, persistent
Worker logs, Network Error Logging, or content collection.

## Current state

- `apps/site/astro.config.mjs` now emits static output for
  `https://charon.simonhazard.com` at the root path.
- `charon-site` was created from the locally validated static artifact on
  2026-08-12 and the custom domain was attached. The production-only config was
  applied on 2026-08-13; the custom domain serves the verified artifact and the
  `workers.dev` hostname returns 404.
- Wrangler OAuth for `simon.hazard@outlook.fr` is local external state. It must
  remain outside the repository and cannot authenticate non-interactive CI.
- The uncommitted Plan 018 work initially enabled preview URLs, but the operator
  rejected that direction before a preview version was uploaded.
- The checked workflow exists locally; its GitHub environment secrets and first
  authorized `main` run remain external operator steps.
- Cloudflare still emitted `Report-To` and `NEL` headers after deployment, so
  the account-level Network Error Logging toggle remains an operator step.
- Plan 015 explicitly leaves site hosting to this separate plan.

## Fixed deployment contract

| Concern | Decision |
| --- | --- |
| Worker | `charon-site` |
| Production origin | `https://charon.simonhazard.com` |
| Output | Astro static files in `apps/site/dist` |
| Cloudflare runtime | Static Assets only, no `main` Worker script |
| 404 behavior | Nearest checked-in `404.html` with HTTP 404 |
| HTML routing | Automatic trailing-slash handling for directory indexes |
| Production route | Cloudflare Custom Domain `charon.simonhazard.com` |
| `workers.dev` | Disabled |
| Preview URLs | Disabled; no aliased, branch, PR, or versioned preview |
| Observability | Persistent Worker observability, Web Analytics, and NEL disabled |
| Tool telemetry | Wrangler metrics and dependency instrumentation disabled |
| Local authentication | Wrangler OAuth only; never committed |
| CI authentication | GitHub `site-production` environment secrets `CLOUDFLARE_ACCOUNT_ID` and scoped `CLOUDFLARE_API_TOKEN` |
| Wrangler | Exact `4.122.0` app-owned development dependency |
| Automation event | Push to `main` with a matching site-affecting path only |
| GitHub permissions | Read-only repository contents |

## Commands you will need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install | `bun install --frozen-lockfile` | exact Wrangler pin resolves from the generated lock |
| Site check | `bun run --cwd apps/site check` | zero Astro/TypeScript errors |
| Site tests | `bun run test:site` | canonical, privacy, assets, config, and link checks pass |
| Static build | `bun run build:site` | root-relative static `apps/site/dist` produced |
| Wrangler config | `bun run check:site:cloudflare` | assets-only dry run with no bindings |
| Workflow policy | `bun run check:workflows` | immutable actions, read-only permissions, no PR secret use |
| Aggregate | `bun run check` | repository lint, type, and tests pass |
| Rust regression | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | unchanged native/domain tests pass |
| Production deploy | `bun run deploy:site` | custom domain receives the exact validated build |
| Final diff | `git diff --check && git status --short` | only in-scope source/config/docs changes |

## Scope

**In scope**:

- `apps/site/astro.config.mjs`, `apps/site/package.json`, exact Bun lock update
- One app-owned `apps/site/wrangler.jsonc` for Static Assets, custom domain,
  disabled alternate routes, 404 handling, and disabled observability
- One `.github/workflows/site-deploy.yml` triggered by path-filtered pushes to
  `main`, using existing immutable action pins and read-only GitHub permissions
- Root deploy orchestration scripts and `.gitignore` for local Wrangler state
- Site verification updates for the production origin, root base, and disabled
  `workers.dev` and preview contract
- Hosting, automation, and privacy disclosure in `docs/SITE.md`,
  `docs/PRIVACY.md`, `docs/RELEASING.md`, README, and localized privacy copy
- External creation of `charon-site`, its custom domain, a narrowly scoped
  Cloudflare API token, and two GitHub `site-production` environment secrets
- `plans/README.md` status and fixed Wrangler ledger row

**Out of scope**:

- Any preview deployment, `workers.dev` site, branch alias, PR deployment,
  Cloudflare Access application, or Workers Builds Git integration
- A Worker script, runtime API, redirect Worker, server adapter, SSR, database,
  storage binding, account, form, CMS, analytics, telemetry, or page-load GitHub API
- Desktop release/update work, changing download availability, platform claims,
  or implementing Plan 015
- Broad Cloudflare credentials, repository write permissions, automatic commits,
  pushing this branch, or opening a pull request
- Committing OAuth files, account tokens, account IDs, generated `dist`, local
  Wrangler logs/state, or dashboard-only configuration drift

## Git workflow

- Branch: `codex/018-cloudflare-site-hosting`
- Commits, in order:
  1. `docs(hosting): define cloudflare publication contract`
  2. `ci(site): deploy main to cloudflare workers`
  3. `docs(site): disclose cloudflare hosting metadata`
- Do not push or open a pull request unless separately authorized.

## Steps

### Step 1: Freeze the hosting and privacy contract

Record the fixed deployment contract in this plan and update the relevant site
and privacy documents. Preserve the exact meaning of “no analytics”: the site
contains no analytics client, tracker, pixel, fingerprinting, behavioral event,
or Worker request log. Disclose that Cloudflare necessarily processes ordinary
connection metadata to serve the public site. Do not imply that visiting a
public website makes no network request or that Charon controls external browser,
DNS, or hosting-provider logs.

The production site remains cookie-free. There is no Access application because
there is no preview or private deployment.

**Verify**: privacy/content tests pass and searches find no tracker, analytics
script, external embed, runtime fetch, preview, or secret.

### Step 2: Keep one production-only Static Assets configuration

Pin Wrangler `4.122.0` in `apps/site` and regenerate `bun.lock` with Bun. Add
one Wrangler JSONC configuration with:

- Worker name `charon-site`;
- compatibility date `2026-08-12`;
- `workers_dev` and `preview_urls` explicitly `false`;
- Custom Domain `charon.simonhazard.com`;
- `assets.directory` set to `./dist`;
- `assets.not_found_handling` set to `404-page`;
- `assets.html_handling` set to `auto-trailing-slash`;
- persistent observability disabled;
- Wrangler usage metrics and dependency instrumentation disabled;
- no `main`, bindings, variables, secrets, or runtime code.

Set Astro's default origin to the production origin and its default base to `/`,
while preserving explicit environment overrides for isolated tests. Keep a
checked manual production deploy command and a CI-only command that deploys the
already validated build. Do not define a preview command.

**Verify**: install, site check/test/build, config dry run, and raw output URL
checks pass. `git diff` contains no credential, account token, or generated
`dist` file.

### Step 3: Add path-filtered production deployment

Create one GitHub Actions workflow with these exact boundaries:

- event is `push` to `main` only;
- paths are the workflow itself, `apps/site/**`, `packages/theme/**`, root
  `package.json`, and `bun.lock`;
- no `pull_request`, branch preview, version upload, or manual unverified deploy;
- concurrency group `site-production` cancels an obsolete in-flight deployment;
- repository permissions are `contents: read` only;
- immutable reviewed action SHAs are reused from the repository ledger;
- Bun `1.3.12` installs the frozen lock, then site tests, static build/config
  validation, and production deploy run in order;
- only the deploy step receives `CLOUDFLARE_ACCOUNT_ID` and
  `CLOUDFLARE_API_TOKEN` from the `site-production` environment.

Create the Cloudflare token from the official `Edit Cloudflare Workers`
template, restricted to Simon's account and the `simonhazard.com` zone. Store
the token and account ID only as GitHub environment secrets. Do not reuse the
interactive OAuth credential or expose either value in workflow output.

**Verify**: workflow policy passes, there is no PR secret use or mutable action,
and a non-matching main push cannot start the workflow.

### Step 4: Prove and apply the production-only configuration

Run the complete local verification. Deploy once with the approved local OAuth
session to disable the already-created Worker's `workers.dev` route and Preview
URLs before CI takes over. Confirm the custom domain remains active and public,
TLS succeeds, localized pages and media load, unknown paths return the checked
404, and the removed `workers.dev` hostname no longer serves Charon.

Disable Cloudflare Network Error Logging in the dashboard if it remains enabled
for the zone; do not add Worker code merely to remove an infrastructure header.

**Verify**: `https://charon.simonhazard.com` serves the checked artifact and no
alternate Worker hostname or preview deployment is active.

### Step 5: Close the plan

Run the complete site, workflow, aggregate, Cargo, privacy, and diff checks
again. The plan may reach `DONE` only after:

1. the two GitHub environment secrets exist;
2. this branch reaches `main` through an authorized push/merge;
3. a matching main commit triggers the workflow;
4. the workflow succeeds and production serves that commit.

Until then, mark the plan `AWAITING OPERATOR` with the exact missing external
step. Do not push, create secrets from broad credentials, or open a pull request
without separate authority.

## Test plan

- Config: exact Worker name/date/domain/assets/404/HTML handling, disabled
  `workers.dev`/preview/observability/instrumentation, no runtime binding or secret.
- Build: production canonical origin, root base, localized routes, sitemap,
  robots, custom 404, media, and release-link truth.
- Workflow: main-only push, exact path filters, immutable actions, read-only
  GitHub permission, frozen Bun install, verification before deploy, secrets
  scoped only to deploy step, no PR or preview event.
- Privacy: no analytics/tracker/runtime fetch; Cloudflare metadata disclosure;
  no Access or preview cookie claim.
- Production: HTTPS, page/status/link/media checks, no alternate Worker route.
- Regression: site check/test/build, workflow policy, aggregate Bun check, Cargo
  test, diff and secret review.

## Done criteria

- [ ] Plan is explicitly prioritized before Plan 017 and reconciles the operator's no-preview decision.
- [ ] Wrangler `4.122.0` is pinned exactly and the Bun lock is tool-generated.
- [ ] Astro defaults to `https://charon.simonhazard.com/` with root-relative output.
- [ ] `charon-site` serves only checked static assets with custom 404 handling.
- [ ] `workers.dev` and Preview URLs are explicitly disabled.
- [ ] Production is public at `https://charon.simonhazard.com` with valid HTTPS.
- [ ] A path-filtered GitHub Actions workflow deploys matching pushes to `main` only.
- [ ] Workflow actions are immutable, GitHub permissions are read-only, and verification precedes deployment.
- [ ] A scoped Cloudflare token and account ID exist only as `site-production` environment secrets.
- [ ] No Worker runtime, backend, analytics, tracker, form, CMS, runtime API, Access app, or preview exists.
- [ ] Hosting metadata processing is disclosed without weakening desktop privacy.
- [ ] No credential, account token, local Wrangler state, or generated output is committed.
- [ ] All site, workflow, aggregate, Cargo, production, privacy, and diff checks pass.
- [ ] One matching main push completes the workflow and production serves that commit.
- [ ] `plans/README.md` marks Plan 018 `DONE` only after the external CI proof.

## STOP conditions

Stop and report back if:

- the `simonhazard.com` zone is absent from or not writable by the connected account;
- `charon.simonhazard.com` has a conflicting DNS record, route, Worker, or service;
- publication would require a runtime Worker, server adapter, redirect API, tracker,
  form, analytics client, or unsupported release/download claim;
- the validated static build differs from the uploaded artifact;
- a secret, OAuth file, account token, or private identifier would enter source,
  logs, command output, or an artifact;
- the CI token cannot be restricted to the intended account and zone;
- the workflow would run on pull requests, deploy non-site main changes, need
  repository write permission, or create any preview;
- any required site, privacy, aggregate, Cargo, domain, TLS, or workflow check fails;
- a push, secret creation, or pull request becomes necessary without separate
  operator authority.

## Maintenance notes

- Treat `apps/site/wrangler.jsonc` as the Worker configuration source of truth.
- Every production deploy rebuilds and verifies source before Wrangler runs.
- Update Wrangler only through an exact reviewed pin and the fixed version ledger.
- Rotate the scoped Cloudflare token in the GitHub `site-production` environment
  without changing workflow source.
- If previews are reconsidered, update this plan and privacy contract before
  enabling any `workers.dev`, version, branch, or PR hostname.
