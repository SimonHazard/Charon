# ADR 0004: Bun monorepo and static Astro site

## Status

Accepted for v1.

## Context

Charon has two applications with different runtime needs: a React and Tauri
desktop app, and a public product site that should emit static HTML. They share
a visual identity but not component behavior, localization catalogs, native
capabilities, or release cadence. The repository does not yet need a remote
build graph or a family of shared packages.

## Decision

Use Bun workspaces and one root lockfile. Root scripts orchestrate checks, while
`apps/desktop` and `apps/site` own their runtime dependencies and configs. Bun
workspaces are sufficient because there are two apps, one small shared package,
and no demonstrated need for a separate task runner or remote cache.

Use Astro static output for `apps/site`. It has no server adapter, runtime API,
account backend, CMS, analytics, or form. Static output matches the privacy
promise, minimizes operational surface, and makes localized pages and verified
release links deployable as ordinary files.

Share only `packages/theme`, which exports semantic CSS variables, theme names,
and radius and motion contracts. A shared React component package is rejected:
desktop behavior belongs to Base UI and React, while Astro should produce
framework-light static HTML and use real application media. Neither app imports
the other.

The root and desktop pin TypeScript `7.0.2`. `apps/site` temporarily pins
TypeScript `6.0.3` because `@astrojs/check` does not yet declare TypeScript 7
compatibility. This is an isolated compatibility exception and Bun resolution
must be verified per workspace.

## Consequences

- The monorepo remains easy to install and reason about with Bun-only JavaScript
  commands.
- Theme identity can remain consistent without coupling React to Astro.
- Desktop Motion runtime and native types cannot leak into the site.
- Site translations, components, and content remain site-owned.
- TypeScript versions differ temporarily and require an explicit removal check
  when Astro Check adds TypeScript 7 support.

## Revisit when

Revisit if two real consumers need another stable framework-neutral contract,
if repository scale demonstrates a task-graph requirement, or when
`@astrojs/check` supports TypeScript 7. A dynamic backend, CMS, analytics, or
shared cross-framework components require a new decision before implementation.
