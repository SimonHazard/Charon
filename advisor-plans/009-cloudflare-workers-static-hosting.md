# Plan 009: Move static hosting from GitHub Pages to Cloudflare Workers

> Keep Astro `output: 'static'`. Use Workers Static Assets without Worker script
> or Astro server adapter. Pin Wrangler exactly with Bun. Config/workflows are in
> scope; actual deployment still needs operator authority and protected secrets.

> Drift check: `git diff --stat a0543d0bc9ba49d2eb21f631d5e76104a920fd58..HEAD -- apps/site .github/workflows docs/SITE.md docs/RELEASING.md docs/PRIVACY.md plans/015-automate-builds-and-releases.md plans/README.md package.json bun.lock`

## Status

- **Priority/Risk/Effort**: P1 / MED / M
- **Depends on**: Plan 008
- **Category**: hosting, CI, security, docs
- **Planned at**: `a0543d0`, 2026-08-09
- **State**: TODO

## Why and current evidence

`astro.config.mjs:6-10` defaults to GitHub origin/base and
`.github/workflows/pages.yml` deploys Pages. RELEASING/Plan 015 describe Pages.
The intended Workers architecture is still SSG: Wrangler uploads `dist`, assets
serve before Worker code, and a custom 404 uses `404-page` handling.

Official docs reviewed 2026-08-09:

- <https://developers.cloudflare.com/workers/static-assets/>
- <https://developers.cloudflare.com/workers/static-assets/routing/static-site-generation/>
- <https://developers.cloudflare.com/workers/wrangler/configuration/>

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Site | `bun run test:site` | pass |
| Dry run | `bun run --cwd apps/site workers:dry-run` | validates without upload |
| Local/smoke | `bun run --cwd apps/site workers:dev` and `bun run --cwd apps/site workers:test` | routes/assets/404 pass |
| Policy/privacy | `bun run check:workflows && bun run check:privacy` | pass |
| Aggregate | `bun run check && bun run build:site` | exit 0 |

## Scope and workflow

In: exact Wrangler, assets-only JSONC, local/dry-run scripts/tests, origin/base,
protected immutable workflow, Pages removal, runbooks/current Plan 015. Out:
server adapter, Worker main/Functions/KV/D1/R2/analytics/observability, domain
purchase, production deploy or secret creation.

- Branch: `codex/premium-loop`
- Exact commit: `ci(site): target cloudflare workers static assets`
- No push/deploy/PR.

## Steps

1. Recheck docs/registry; unless superseded compatibly, pin `wrangler: "4.120.0"`
   and ledger. Create `apps/site/wrangler.jsonc` with schema, stable name,
   `compatibility_date: "2026-08-09"`, and only:

   ```json
   { "assets": { "directory": "./dist", "not_found_handling": "404-page" } }
   ```

   No `main`, binding, `run_worker_first`, compatibility flags, observability.
2. Use production base `/`; production canonical origin is explicit reviewed
   input and local test origin deterministic. Remove GitHub base/origin from
   output and fix sitemap/robots/manifest/media/hreflang links.
3. Build once and smoke `/`, `/fr/`, localized privacy/download/changelog,
   hashed/media assets, sitemap/robots/manifest, HTTP 404, canonical, security
   headers and zero third-party request. Own startup/cleanup; no account call.
4. Delete Pages workflow/unused action ledger. Add read-only PR/push quality+
   dry-run. Add separate `workflow_dispatch` deploy using checked-in Wrangler,
   `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, protected
   `cloudflare-production`, full site gate, least privilege, no PR deploy.
5. Update SITE/RELEASING/PRIVACY/Plan 015/launch/checklists and rollback. State
   Cloudflare sees ordinary web request metadata while site has no account,
   form, analytics, content upload or app runtime API.

## Done criteria

- [ ] Static Astro; exact assets-only config, no Worker/server code.
- [ ] Custom 404 returns 404; localized root routes/assets pass locally.
- [ ] Active Pages config/workflow/runbooks removed or corrected.
- [ ] Deploy is protected/manual/least-privilege/secret-safe.
- [ ] Local/dry-run needs no account; privacy/workflow/site gates pass.
- [ ] Plan/index `DONE` in exact commit.

## STOP conditions

- Static routes require Worker/server code.
- Deploy needs broad/plaintext/PR secrets or lacks origin/domain decision.
- Cloudflare feature adds analytics/logging/storage/runtime API.
- Any actual deployment lacks explicit authority.

## Maintenance

Advance compatibility date only in review; rerun preview/404/links on routing,
locale or Wrangler changes.
