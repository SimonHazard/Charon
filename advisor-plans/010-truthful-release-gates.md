# Plan 010: Turn release gates into measurements of production behavior

> Invoke `web-design-guidelines`, `vercel-react-best-practices`, and
> `thermo-nuclear-code-quality-review` after deterministic tests. Fix reproduced
> failures only; never relax budgets silently.

> Drift check: `git diff --stat a0543d0bc9ba49d2eb21f631d5e76104a920fd58..HEAD -- package.json bun.lock apps packages scripts docs .github plans/README.md`

## Status

- **Priority/Risk/Effort**: P1 / HIGH / XL
- **Depends on**: Plans 001 and 003-009
- **Category**: tests, performance, security, release
- **Planned at**: `a0543d0`, 2026-08-09
- **State**: TODO

## Why and current evidence

`scripts/check-performance.ts:14-31` benchmarks an ad hoc lowercase filter, not
the production NFKC/status/exact-Tag/all-token behavior (and Plan 004 moves it
to Workspace). It reports total JS only. TESTING states Web Vitals targets but
does not measure LCP/CLS or an honest interaction proxy. Release aggregate lacks
explicit Workers smoke, dependency audit, 100 MiB RSS and protocol payload gates.

Planning baseline: 60 frontend tests, 22 E2E executions, 100 Rust tests passed;
`bun audit` was the only actual failure. Current official good Web Vitals:
LCP ≤2.5 s, CLS ≤0.1, field INP ≤200 ms. Local lab must label TBT/scripted
latency as proxies, not INP: <https://web.dev/articles/vitals>. Planning-time
`@lhci/cli` was `0.15.1`; recheck and exact-pin if selected.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Unit/browser/axe | `bun run test && bun run test:e2e && bun run test:a11y` | pass |
| Performance/Workers | `bun run test:perf && bun run --cwd apps/site workers:test` | budgets pass |
| Security/privacy | `bun audit && cargo audit --file apps/desktop/src-tauri/Cargo.lock && bun run check:privacy` | zero vulnerabilities/leaks |
| Rust | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check && cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --all-targets --locked -- -D warnings && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |
| Release | `bun run verify:release` | all gates pass twice |

## Scope and workflow

In: production perf harnesses, transaction/RSS, IPC/render/bundle budgets, site
lab metrics, Workers/security, missing E2E, aggregate/docs and only fixes found
by gates. Out: features, vanity scores, RUM/telemetry, silent relaxations,
publisher certificates, updater keys, release publication, and site deployment.
This gate is secret-free; Product Plan 015 separately owns protected GitHub
release artifacts and Tauri updater signing.

- Branch: `codex/premium-loop`
- Exact commit: `test(release): measure production behavior end to end`
- No push/PR.

## Steps

1. Benchmark Plan 004's public production query/read path in release-mode Rust,
   not a TypeScript clone. Record host/build/data/warmup/samples/median/p95 and
   relative threshold. Changing production code must affect the measurement.
2. Gate Plan 002 counters: zero unchanged Attachment I/O, fixed max chunk; child
   process RSS for one 100 MiB sparse/synthetic and multi-file limit. Record
   baseline/ceiling and clean temp Workspaces.
3. Gate initial/page/body/delta/reset serialized bytes, fewer than 150 DOM rows,
   and affected render count. One update is independent of total bodies.
4. Report each production JS chunk raw/gzip/entry-lazy/contributor. Enforce entry
   ≤185 KiB, lazy ≤140 KiB, total ≤230 KiB; reject old router/cmdk/hotkey and
   dev fake IPC in production.
5. Against local Wrangler, measure mobile/desktop LCP, CLS, TBT, accessibility,
   best practices and locale/theme interaction proxy; save report, no RUM.
6. Add E2E for failed save/unmount, stale event after switch, duplicate event,
   rapid Tags, virtual focus, committed cleanup, motion reversal/lazy failure,
   canonical specimen, Workers root/404.
7. Make `verify:release` explicitly order bindings, lint/type, unit, production
   build, E2E, axe, privacy, security, performance, Workers, workflow, Rust and
   generated checks; always clean processes/ports/temp. Run twice and mutation-
   test that each subgate makes aggregate nonzero.

## Done criteria

- [ ] Perf invokes production code; Attachment I/O/RSS measured.
- [ ] IPC/render/chunk/site lab budgets exist and pass honestly.
- [ ] Workers/security/axe/privacy/race journeys in aggregate.
- [ ] Release gate passes twice and fails for each broken subgate.
- [ ] No telemetry/private content/source path enters artifacts.
- [ ] Plan/index `DONE` in exact commit.

## STOP conditions

- Metric cannot tie to production or documented proxy.
- Any serious a11y, data loss, deletion/privacy, clipboard/focus/capture failure.
- Timing remains flaky after two method corrections.
- Passing needs disabled test, ignored advisory or unexplained relaxation.
- Site metric would require production RUM.

## Maintenance

Rebaseline only for reviewed environment/product change, preserving previous
numbers/reasons. Never hide regression in the same threshold commit.
