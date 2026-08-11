# Plan 004: Replace full Workspace snapshot churn with a scalable read protocol

> Accept ADR 0013 before changing typed IPC. Preserve React → versioned
> commands/queries → Workspace. Generate bindings; no persisted database or old
> full-snapshot compatibility wrapper.

> Drift check: `git diff --stat a0543d0bc9ba49d2eb21f631d5e76104a920fd58..HEAD -- docs/adr docs/ARCHITECTURE.md docs/PRODUCT.md apps/desktop/src-tauri/src/workspace apps/desktop/src-tauri/src/ipc apps/desktop/src/bindings apps/desktop/src/app apps/desktop/src/features/notes plans/README.md`

## Status

- **Priority/Risk/Effort**: P1 / HIGH / XL
- **Depends on**: Plan 003
- **Category**: architecture, performance, IPC, tests
- **Planned at**: `a0543d0`, 2026-08-09
- **State**: TODO

## Why and current evidence

The contract permits 100,000 Notes and 10 MiB bodies. `model.rs:231-272` clones
every body into `WorkspaceSnapshot`; `WorkspaceChangedEvent` embeds the full
snapshot at 159-162; `mod.rs:575-590` eagerly loads all bodies; each command
creates/emits another full replacement. One mutation is O(total content).

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Workspace/IPC | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked workspace ipc::workspace` | pass |
| Bindings | `bun run bindings:generate && bun run bindings:check` | current |
| Desktop | `bun run test:desktop -- workspace-context search note-list clipboard` | pass |
| Scale | `bun run test:perf` | production budgets pass |
| Aggregate | `bun run check && cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` | exit 0 |

Suggested skills: `vercel-react-best-practices`, then
`thermo-nuclear-code-quality-review` for DTO/version growth.

## Scope and workflow

In: ADR 0013, lazy body access, ephemeral local search/read model, paged
summaries, body-on-open, revisioned deltas/reset, store adaptation, bindings and
scale tests. Out: schema v2 changes, persisted indexes/SQLite, network search,
hierarchy/order, cross-app types.

- Branch: `codex/premium-loop`
- Exact commit: `perf(workspace): add a scalable note read protocol`
- No push/PR.

## Steps

1. Accept ADR 0013: bounded paged summaries (ID/status/timestamps/Tags/
   Attachment metadata/bounded excerpt), body query by ID/revision, ephemeral
   Workspace-owned content search, revision-tied cursor, minimal deltas, and one
   reset after missed/out-of-order events. Update architecture: React owns query
   intent/presentation, Workspace owns local content evaluation.
2. Keep manifest metadata in memory; stream-validate body limits/UTF-8 and lazily
   load/cache only active mutation/editor/query slices. Any normalized index is
   memory-only, bounded, invalidated, and separately measured.
3. Add versioned Open/Done/text/exact-Tag/cursor/page queries and body fetch.
   Define canonical Unicode normalization in Rust. Clipboard remains in Rust.
4. Commands/events return affected summaries/IDs and revision, not full state.
   Coalesce watcher bursts into reset or contiguous deltas.
5. Adapt desktop to a small revisioned store; page virtual results, fetch one
   editor body, use generation tokens, and dedupe result/event application.
6. Measure 0/1/20k/maximum-metadata fixtures: initial and mutation IPC bytes,
   query/body latency, allocations/RSS, renders/DOM. Never allocate a 100k ×
   10 MiB synthetic fixture.

## Done criteria

- [ ] ADR 0013 accepted; ownership/version/reset explicit.
- [ ] Full bodies no longer enter initial/result/event snapshots.
- [ ] One mutation payload/work is independent of total body bytes.
- [ ] Search is local, paged, Unicode-tested, behaviorally compatible.
- [ ] Editor/clipboard/watcher/Selection are revision-safe; no persisted index.
- [ ] Bindings, scale, desktop, Rust and aggregate gates pass.
- [ ] Plan/index `DONE` in exact commit.

## STOP conditions

- Requires a persisted database/index without new privacy/persistence decision.
- UI must receive all bodies, or delta loss can leave partial silent state.
- Clipboard/migration stops preserving body bytes exactly.
- Typed boundary changes without generated bindings/reset strategy.

## Maintenance

Keep payload/allocation tests in CI; summaries gain fields only for visible use.
