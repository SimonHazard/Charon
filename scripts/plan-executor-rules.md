# Plan executor rules

You are executing exactly ONE plan from `plans/`, in a fresh session. You have no
memory of any earlier plan. `plans/execution/*.md` is the only history you get.

## Order of work

1. Read every `plans/execution/*.md`. That is what earlier runs changed, decided, and left open.
2. Read `AGENTS.md`, the docs it lists in its reading order, `plans/README.md`, then your plan in full.
3. Run the plan's drift check. A mismatch is a STOP condition.
4. Implement the plan, step by step, in its own order.
5. Verify (see below).
6. Update this plan's status row in `plans/README.md`.
7. Write your journal entry (see below). Mandatory, including when you stop or fail.

## Verification

Run, at minimum:

- `bun run lint`
- `bun run typecheck`
- `bun run test`
- `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked` when Rust changed

Plus every verification command the plan itself names. Record each command and its real result
in `## Vérifications`. Never write that a check passed without having run it. `bun run test:e2e`
is known-blocked in this environment: record it as not run rather than skipping it silently.

## Decisions

- **Decide alone**: implementation detail, naming, internal ordering, test shape, error wording
  already covered by an existing message file.
- **Never decide alone**: anything that touches an ADR, the product boundary in `plans/README.md`,
  privacy, persistence, deletion, or a platform contract. Do every other part of the plan, then
  write the open question in `## Questions`.
- **Stop**: a STOP condition fires, the drift check mismatches, a check you did not break is red,
  or a step needs Windows, Linux, or physical hardware you do not have. Use status `blocked` or
  `awaiting-operator` and say exactly what is missing.

Prefer a smaller honest result over a larger claimed one. A plan finished at 70% with the other
30% named in `## Reste à faire` is worth more than a plan marked done on unverified work.

## Boundaries

- Never `git push`, tag, deploy, open a pull request, or write to `.env`.
- Do not commit. The runner commits after you exit.
- Do not touch any other plan's scope, even when the fix looks trivial. Write it in `## Questions`.
- Do not weaken a contract, delete a test, or relax a gate to make a check pass.

## Journal entry (mandatory)

Write `plans/execution/<id>.md`, where `<id>` is the three-digit plan number. Write it in French,
in short bullets. No long paragraphs. One idea per bullet. Assume the reader has not read the plan.

```markdown
---
plan: '021'
title: Titre court de ce que le plan a fait
status: done
commit_subject: 'fix(desktop): rendre la persistance portable'
---

## Fait
- Ce qui a changé, en clair. Un fichier ou une zone par bullet.

## Décisions
- **La décision** — pourquoi, en une phrase.

## Dérives
- Ce qui ne correspondait pas au plan, et ce que tu as fait à la place.

## Questions
- Une question précise pour l'opérateur, avec l'option que tu recommandes.

## Reste à faire
- Ce qui n'est pas fait, et pourquoi.

## Vérifications
- `bun run test` — OK (312 tests)
- `bun run test:e2e` — non lancé (serveur Playwright bloqué ici)
```

`status` is one of `done`, `partial`, `blocked`, `awaiting-operator`, `failed`.
`commit_subject` follows the repository's Conventional Commit style.
Leave a section with a single `- Rien.` bullet rather than deleting it.
