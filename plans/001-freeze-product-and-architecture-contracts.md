# Plan 001: Freeze the product, domain, privacy, UX, and architecture contracts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If a
> STOP condition occurs, stop and report; do not improvise. When done, update
> this plan's row in `plans/README.md`.
>
> **Drift check (run first)**: this plan was written on unborn `main`, so no SHA
> exists. Run `git status --short` and `git rev-parse --verify HEAD`. The expected
> baseline is only `plans/**` plus a failed HEAD lookup. If product or source
> files already exist, stop and compare them with this plan before editing.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction, docs
- **Planned at**: unborn `main` (no commit), 2026-07-30

## Why this matters

This is a greenfield, agent-built desktop product. Without short, explicit
contracts, later agents will independently redefine note semantics, privacy,
platform support, and visual direction. These documents turn those decisions
into reviewable constraints before scaffolding makes them expensive to change.

## Current state

- The repository contains only `.git/` and `plans/`.
- The working product name is `Charon`.
- User requirements are captured in `plans/README.md`; no README, product spec,
  architecture document, ADR, privacy notice, or agent guide exists.
- The selected architecture is local Markdown plus a manifest, with deep
  `Workspace`, `CaptureCoordinator`, and `ClipboardComposer` modules.
- The repository will be a Bun workspace monorepo with `apps/desktop`,
  `apps/site`, and one framework-neutral `packages/theme` package.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Baseline | `git status --short` | only `plans/**` before work |
| File check | `test -f README.md && test -f AGENTS.md && test -f docs/PRODUCT.md && test -f docs/ARCHITECTURE.md && test -f docs/UX.md && test -f docs/SITE.md && test -f docs/PRIVACY.md` | exit 0 |
| Contract check | `rg -n "Workspace|CaptureCoordinator|ClipboardComposer|local-only|Shift" README.md AGENTS.md docs` | matches in all relevant documents |

## Suggested executor toolkit

- Use `improve-codebase-architecture` if available to challenge the proposed
  module boundaries, but keep the accepted vocabulary below unless a new ADR
  records the change.
- Use `design-taste-frontend` only for the visual language section, not as a
  substitute for product-app UX.
- Use `apple-design` to define the desktop motion, material, typography,
  interruption, and accessibility-preference contract.

## Scope

**In scope**:

- `README.md`
- `AGENTS.md`
- `docs/PRODUCT.md`
- `docs/ARCHITECTURE.md`
- `docs/UX.md`
- `docs/SITE.md`
- `docs/PRIVACY.md`
- `docs/adr/0001-local-workspace.md`
- `docs/adr/0002-platform-capture.md`
- `docs/adr/0003-experimental-charts.md`
- `docs/adr/0004-bun-monorepo-and-astro-site.md`
- `docs/adr/0005-fluid-desktop-motion.md`

**Out of scope**:

- Any application source, configuration, dependency, lockfile, or CI workflow.
- Branding assets, a marketing site, cloud sync, accounts, telemetry, and
  automatic injection into third-party applications.

## Git workflow

- Branch: `codex/001-product-contracts`
- Commit: one conventional commit, `docs: define Charon product contracts`
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Write the product and domain contract

Create `docs/PRODUCT.md` with target users, jobs to be done, non-goals, and this
v1 domain model:

- `Workspace`: one user-selected directory and one schema version.
- `Section`: stable UUID, name, sort key, created/updated timestamps.
- `Note`: stable UUID, section UUID, Markdown body, `open|done` status, sort key,
  created/updated/completed timestamps, optional `trashedAt`.
- `Selection`: ephemeral ordered note IDs, never persisted.
- `CopyPreset`: `plain`, `bulleted`, `numbered`, `task-list`, or `sectioned`.
- `Merge`: create one composite note in a chosen section, then move sources to
  trash in the same recoverable transaction. Preview and confirmation required.
- `Delete`: move to trash; permanent deletion is a separate confirmed command.

Include acceptance journeys for quick capture, editing, search, keyboard range
selection, bulk completion, bulk trash, undo, merge preview, copy as list,
theme/language switching, workspace recovery, and permission denial.

Add a public-site journey: a visitor understands the product and privacy promise,
watches a real capture/copy demo, switches EN/FR and theme, verifies platform
support, and reaches a real signed download or GitHub Release without tracking.

**Verify**: `rg -n "^## (Users|Jobs|Domain model|V1 journeys|Non-goals)" docs/PRODUCT.md` -> five matches.

### Step 2: Record the deep-module architecture

Create `docs/ARCHITECTURE.md` and ADR 0001. Specify:

- Rust is the domain and filesystem authority; React never reads or writes note
  files directly.
- The Workspace directory contains `charon.workspace.json`, `notes/<uuid>.md`,
  and `backups/`; writes use same-directory temporary files plus atomic rename.
- `Workspace` absorbs parsing, validation, ordering, schema migration, command
  application, backups, file watching, conflict detection, and recovery.
- IPC exposes versioned DTOs generated by `ts-rs`; persisted JSON and Markdown
  shapes are not the frontend API.
- React receives a workspace snapshot and domain events. It owns only ephemeral
  view state such as selection, open panels, command palette, and draft text.
- Real-filesystem and in-memory Workspace adapters are the two justified seams.
- CaptureCoordinator and ClipboardComposer are separate deep modules. Avoid
  entity-per-repository, wrapper-per-command, or generic service layers.

Include a Mermaid component diagram and a dependency rule: UI -> application
commands -> domain modules -> adapters, never the reverse.

Add the monorepo container boundary:

```text
apps/desktop -> packages/theme
apps/site    -> packages/theme
```

Neither app may import from the other. `packages/theme` exports CSS variables,
theme names, and motion/radius contracts only. It has no framework or native
dependency. Root scripts orchestrate workspaces; app packages own their runtime
dependencies and configs.

**Verify**: `rg -n "atomic rename|in-memory|ts-rs|dependency rule" docs/ARCHITECTURE.md docs/adr/0001-local-workspace.md` -> at least four matches.

### Step 3: Record platform, privacy, and experimental-feature decisions

Create ADR 0002 with a support table:

- macOS 14+: double Shift and selected-text capture after Accessibility consent;
  standard fallback accelerator always available.
- Linux X11: standard global accelerator; double Shift only if a proved native
  adapter passes smoke tests.
- Linux Wayland: do not promise modifier-only global shortcuts; keep a visible
  fallback and in-app shortcut.
- Windows: standard global accelerator first; double Shift and selected-text
  capture only after a signed-build smoke test.

State that `Shift`, `Shift` is a sequence of modifier key events and cannot be
registered as a normal Tauri accelerator. Record `CmdOrCtrl+Shift+Space` as the
default fallback. Create ADR 0003: TanStack Charts `0.0.0` is allowed only in
the optional Insights route behind a feature flag and a local adapter.

Create `docs/PRIVACY.md`: local files, no account, sync, analytics, telemetry,
or crash upload; clipboard and accessibility use are explicit; update checks
are the only optional network request and must be disclosed and user-controlled.

Create ADR 0004 for the monorepo and Astro site. Record why Bun workspaces are
enough, why the site uses Astro static output, why only theme tokens are shared,
why a React component package is rejected, and why `apps/site` temporarily pins
TypeScript 6.0.3 for `@astrojs/check` while desktop remains on TypeScript 7.0.2.

**Verify**: `rg -n "Wayland|CmdOrCtrl\+Shift\+Space|0\.0\.0|no analytics|update" docs/adr docs/PRIVACY.md` -> all five concepts match.

### Step 4: Freeze the UX and visual language

Create `docs/UX.md` for a dense desktop product, not a landing page:

- System UI font stack; no Inter, gradients, glow, permanent glass, or rounded
  card grid.
- Cold off-white/silver light theme, graphite dark theme, and classic Solarized
  semantics, all with one cobalt action accent.
- Semantic CSS tokens only. Surface radius 14px, field radius 10px, compact
  control radius 8px. Borders and spacing create hierarchy.
- Main shell: 240px section rail, flexible note work area, optional contextual
  inspector. Quick capture: centered 560px window.
- Density 6/10, visual variance 5/10, motion 4/10. Movement is restrained but
  physical: immediate press feedback, critically damped spring transitions,
  interruptible/reversible state changes, and transform/opacity animation only.
- Every flow defines loading, empty, error, destructive, focus, selected,
 disabled, and permission-denied states.
- Tabler outline icons, no emoji as UI iconography.

Create `docs/SITE.md` for the Astro landing site. Design read: product landing
for developers and agent users, premium Apple-like but restrained, using the
same cold-luxury tokens as the desktop. Set variance 7, motion 5, density 3.
Specify an asymmetric hero with a real app image, one real demo video lower on
the page, varied section layouts, no equal three-card row, no fake UI, no stock
testimonial/logo claims, no gradients/glow, and zero em-dash characters in
visible copy. Use a system sans stack, one cobalt accent, 14/10/8px radius rules,
opacity/transform motion only, and reduced-motion/transparency fallbacks.

Create ADR 0005 for the desktop motion system. Record these invariants from the
`apple-design` review:

- feedback begins on pointer/key down and visible response targets one frame,
  never a delayed click-only acknowledgement;
- direct manipulation stays 1:1, then release may project momentum and hand its
  measured velocity into a spring; non-gesture UI defaults to critical damping
  and no decorative bounce;
- every animation is interruptible and retargets from the current presentation
  value rather than restarting from a stale endpoint; input is never locked
  while motion finishes;
- entrances and exits use symmetric paths and an origin related to their
  trigger; rubber-banding, if a later gesture genuinely needs it, is visual only
  and uses roughly 10px hysteresis before state changes;
- translucent material is reserved for navigation or transient floating layers,
  never stacked decoration; solid fallbacks cover reduced transparency and
  increased contrast;
- reduced motion preserves hierarchy with instant state changes and short fades.

The ADR must keep Motion's React runtime inside `apps/desktop`; `packages/theme`
may export CSS custom properties and preference media-query defaults only. Define
three profiles, not per-component magic numbers: direct feedback, surface
transition, and gesture release. Require slow-motion and mid-animation reversal
review before accepting a new interaction pattern.

Site information architecture: `/` English, `/fr/` French, localized privacy
and download pages, plus a changelog/release destination. Static output only,
no accounts, form, cookie banner, analytics, CMS, or runtime API. SEO includes
localized canonical/hreflang, sitemap, robots, Open Graph based on real app media,
and SoftwareApplication structured data containing only verified claims.

Document keyboard behavior: arrow navigation, Space toggles selection, Shift
extends a range, `CmdOrCtrl+A` selects visible results, Enter edits, `CmdOrCtrl+C`
copies using the default preset when focus is not in editable text, Delete moves
selection to trash, Escape closes the topmost surface.

**Verify**: `rg -n "Solarized|560px|reduced-motion|CmdOrCtrl\+A|permission-denied" docs/UX.md` -> all five matches.

### Step 5: Create human and agent entry points

Create `README.md` with product summary, privacy promise, tiered platform
support, monorepo map, the planned stack, and links to every document. Create
`AGENTS.md` with:

- Required reading order and domain vocabulary.
- Bun-only JS commands, Cargo commands, exact-pin policy, generated-file rules,
  Base UI `render` rather than Radix `asChild`, semantic-token-only styling,
  Paraglide-only user-facing strings, and no direct filesystem access in React.
- Workspace ownership rules: desktop and site never import each other; only
  `@charon/theme` is shared; Astro stays static and uses real app media.
- A preflight checklist: read current plan, verify drift, update tests, run
  `bun run check`, `cargo test`, and update the plan status.
- A rule to create an ADR before changing persistence, privacy, shortcut support,
  or the experimental chart boundary.
- A rule to use `apple-design` for desktop gestures/motion and to reject
  `transition: all`, gesture state implemented with timers, animation input locks,
  raw scroll listeners, and fixed keyframe timelines for interruptible behavior.

**Verify**: run the File check and Contract check from the command table -> both exit 0.

## Test plan

- This plan is documentation-only. Test internal consistency with the exact
  `rg` checks above.
- Confirm every ADR contains `Status`, `Context`, `Decision`, `Consequences`, and
  `Revisit when` headings.
- Verification: `for f in docs/adr/*.md; do rg -q "^## Status" "$f" && rg -q "^## Decision" "$f" || exit 1; done` -> exit 0.

## Done criteria

- [ ] All twelve scoped files exist.
- [ ] Product journeys and destructive semantics are explicit.
- [ ] Architecture names and dependency direction are consistent.
- [ ] Platform claims include the Wayland limitation and fallback.
- [ ] Privacy discloses permissions, clipboard, and optional update traffic.
- [ ] Visual tokens, layout, motion, and full state coverage are documented.
- [ ] Astro IA, static/privacy boundary, real-media rule, SEO, EN/FR, and theme
  sharing are explicit.
- [ ] `git status --short` shows no non-document files other than `plans/**`.
- [ ] This plan's row in `plans/README.md` is `DONE`.

## STOP conditions

- A product source or config file already exists and contradicts these contracts.
- The operator selects cloud sync, automatic paste, a different persistence
  model, or different merge/delete semantics.
- The operator wants shared cross-framework components, a dynamic site backend,
  analytics, or a CMS without revisiting ADR 0004.
- Any requested behavior would require collecting user content or telemetry.
- A verification fails twice after correcting a documentation error.

## Maintenance notes

- Reviewers should challenge domain semantics now, not after migrations exist.
- Revisit ADR 0002 when Wayland exposes a stable desktop portal for the required
  modifier-only sequence.
- Revisit ADR 0003 after TanStack Charts reaches a stable non-zero release and
  the integration has one release cycle of production evidence.
