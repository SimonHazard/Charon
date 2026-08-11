# Plan 006: Close desktop command, Tag, focus, and preview correctness gaps

> Use Base UI `render`, Tabler outline icons and Paraglide. Failures are local,
> content-free, input-preserving, retryable—never a generic Error route.

> Drift check: `git diff --stat a0543d0bc9ba49d2eb21f631d5e76104a920fd58..HEAD -- apps/desktop/src/features/notes apps/desktop/src/components apps/desktop/messages apps/desktop/src/paraglide apps/desktop/src-tauri/src/workspace plans/README.md`

## Status

- **Priority/Risk/Effort**: P1 / MED / L
- **Depends on**: Plan 005
- **Category**: correctness, accessibility, UX, tests
- **Planned at**: `a0543d0`, 2026-08-09
- **State**: TODO

## Why and current evidence

`note-list.tsx:65-71` scrolls the active Note but does not focus it; rows are
`tabIndex={-1}`. `note-screen.tsx:300-307` and row status calls discard errors.
`note-editor.tsx:126-149` sends full Tag arrays from stale props. Client uses
locale-sensitive lowercase while Rust uses Unicode `to_lowercase`. Preview
returns orphan `<li>` at `note-preview.tsx:23-24`.

## Commands and references

| Purpose | Command | Expected |
|---|---|---|
| Notes | `bun run test:desktop -- note-list note-row note-editor note-preview selection search tags` | pass |
| Axe/E2E | `bun run test:a11y && bun run test:e2e -- --grep "keyboard|error|tag|preview"` | pass |
| Quality | `bun run --cwd apps/desktop typecheck && bun run check` | exit 0 |

Suggested skills: `web-design-guidelines`, `shadcn`.

- Base UI composition: <https://base-ui.com/react/handbook/composition>
- TanStack React Virtual:
  <https://tanstack.com/virtual/latest/docs/framework/react/react-virtual>

## Scope and workflow

In: roving/active focus, local pending/error states, intent-safe Tags, canonical
normalization ownership, semantic safe preview, focus/selection distinction,
localization/tests. Out: Tag registry, WYSIWYG, routes/global toasts.

- Branch: `codex/premium-loop`
- Exact commit: `fix(desktop): align keyboard and command semantics`
- No push/PR.

## Steps

1. Choose roving `tabIndex` or `aria-activedescendant`; virtual Arrow navigation
   scrolls/measures/focuses without free-running timer. Review React 19
   `useFlushSync` behavior from installed TanStack docs before option changes.
2. Replace fire-and-forget mutations with handlers owning same-intent pending,
   localized error/Retry and focus. Assert no `unhandledrejection`.
3. Use `addNoteTag`/`removeNoteTag` intents or coordinator rebase, never stale
   arrays. Native is authoritative; shared generated corpus covers Turkish I, ß,
   composed accents, emoji, controls, 16/17 and 48/49 scalars.
4. Group bullets/tasks into valid lists or use existing safe renderer; raw HTML/
   script remains inert, arbitrary Attachments never render.
5. Audit loading, empty, error, destructive, focus, selected, disabled,
   permission-denied, cleanup and reset in EN/FR/themes; focus returns correctly.

## Done criteria

- [ ] DOM/AT/visual focus cannot diverge from active Note.
- [ ] Every mutation handles rejection locally; no unhandled Promise.
- [ ] Rapid/Unicode Tags follow native contract without lost updates.
- [ ] Preview HTML is valid and safe; states/focus/selection distinguishable.
- [ ] Unit/E2E/axe/type/aggregate pass; plan/index `DONE` in exact commit.

## STOP conditions

- Requires rendering all virtual Notes or makes client authoritative over Rust.
- Error/input is hidden/dropped globally.
- Preview enables raw HTML/script/Attachment rendering.
- Any visible copy bypasses Paraglide.

## Maintenance

Every async command enters error/focus matrices. Keep Selection, active focus,
editor expansion and persisted status separate.
