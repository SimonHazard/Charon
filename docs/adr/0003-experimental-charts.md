# ADR 0003: Experimental charts boundary

## Status

Superseded in full by ADR 0011. Insights and TanStack Charts are intentionally
rejected for v1, not deferred as an optional feature.

## Context

TanStack Charts and `@tanstack/react-charts` are selected at version `0.0.0`.
That release is too new to become a dependency of capture, editing, search,
copy, recovery, or persisted domain data. Insights can still be useful when it
is isolated and removable.

## Decision

Charts are allowed only in an optional `Insights` route behind a feature flag.
A local adapter translates Charon-owned, derived insight values into chart
inputs. TanStack types, components, and assumptions remain at that route's
edge and never appear in Workspace DTOs, persisted JSON, Markdown, or the core
domain.

Disabling the feature flag removes the route and chart bundle without changing
any core workflow. Insights are computed locally from Workspace snapshots and
must not add analytics, telemetry, or network traffic.

## Consequences

- Experimental package churn cannot block the core product.
- The chart integration is replaceable and lazy-loadable.
- The adapter adds a small translation layer, but keeps persisted and IPC
  contracts independent of TanStack Charts.
- Insights need their own empty, loading, error, disabled, and accessibility
  states.

## Revisit when

Revisit after TanStack Charts reaches a stable non-zero release and this adapter
has one release cycle of production evidence. Graduation still requires bundle,
accessibility, rendering, and migration review.
