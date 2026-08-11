# Plan 008: Make the static site truthful, localized, accessible, and product-grade

> Invoke `design-taste-frontend`, `frontend-design`, `minimalist-ui`, and
> `web-design-guidelines`. Audit first. Use only real application media with
> synthetic data. Keep static Astro, site ownership and only `@charon/theme`
> sharing.

> Drift check: `git diff --stat a0543d0bc9ba49d2eb21f631d5e76104a920fd58..HEAD -- apps/site packages/theme docs/SITE.md docs/PRIVACY.md docs/platform-support.md apps/desktop/src-tauri/src/clipboard plans/README.md`

## Status

- **Priority/Risk/Effort**: P1 / MED / L
- **Depends on**: Plan 007
- **Category**: design, content, accessibility, tests
- **Planned at**: `a0543d0`, 2026-08-09
- **State**: TODO

## Why and current evidence

The site is visually restrained and uses real media, but its specimen at
`site.ts:45-46`/`141-142` shows plain `Tags:`/`Attachments:` while Rust emits
`**Tags:**` and `**Attachments:**` plus safely delimited inline code.
`BaseLayout.astro:84`/`104` hardcodes English landmark labels in French;
theme buttons have no exposed current state. Current verification misses these
contracts and the transcript does not cover the full approved demo story.

## Commands

| Purpose | Command | Expected |
|---|---|---|
| Site | `bun run test:site` | pass |
| Browser/axe | `bun run test:e2e -- --grep "site" && bun run test:a11y -- --grep "site"` | pass |
| Build | `bun run build:site` | static output |
| Boundary | `rg -n "apps/desktop|react|motion/react|@base-ui" apps/site/src apps/site/package.json` | no cross-app/runtime UI import |
| Aggregate | `bun run check && bun run build:site` | exit 0 |

Quality references: Apple product hierarchy/real media; Linear/Raycast concrete
truth; Bear/Things editorial warmth/restraint—never copy layouts, brands, assets,
testimonials, or metrics.

## Scope and workflow

In: EN/FR copy/types, canonical specimen fixtures, landmarks/current state,
theme semantics, real media/captions/transcript if visuals changed, responsive
polish, metadata/link/network/privacy tests, SITE/PRIVACY. Out: React islands,
server/API/forms/CMS/analytics/embeds/fake UI/unsupported releases.

- Branch: `codex/premium-loop`
- Exact commit: `fix(site): align the product story with real behavior`
- No push/deploy/PR.

## Steps

1. Map every home/privacy/download/platform claim to PRODUCT, PRIVACY, ADR,
   release state, or dated evidence. Reject removed features, unsupported
   double Shift, ready downloads, automatic paste/upload, placeholder origins.
2. Make both specimens canonical:

   ```markdown
   # Agent handoff

   Verify the empty state before adding another control.

   **Tags:** `Research` `Agent`

   **Attachments:**
   - `release-brief.pdf`: `/Documents/Charon/attachments/…/release-brief.pdf`
   ```

   French explanation localizes around the deterministic format. Compare an
   independent site fixture with a Rust golden assertion; no desktop import or
   shared cross-app type package.
3. Localize landmark/control state, add `aria-current="page"`, initialize/update
   theme `aria-pressed`, avoid duplicate brand announcements. Test lang, skip,
   locale, theme, invalid storage, keyboard and no-JS.
4. Re-audit editorial composition at 390/768/1280/1536, three themes, EN/FR:
   one crossing line, no overflow/orphans/clipped focus/equal card template,
   gradients/glow/marquee/parallax/scroll-jacking.
5. If Plan 007 changed visuals, recapture the real app from a disposable
   Workspace: supported capture/manual composer, live editor, Tag, Attachment
   picker, explicit copy, then human paste. Optimize AVIF/WebP/WebM/poster,
   dimensions, EN/FR captions/transcript. Otherwise document evidence and avoid
   media churn.
6. Test route parity, canonical/hreflang/JSON-LD/OG, sitemap/robots, links, 404,
   no third-party, no-JS, reduced preferences, media and privacy sentinels twice.

## Done criteria

- [ ] Specimens exactly match ClipboardComposer.
- [ ] Every claim sourced; landmarks/nav/theme state accessible in EN/FR.
- [ ] Real media current, synthetic/private-free, captioned, truthful.
- [ ] Width/theme/no-JS/reduced preferences excellent; no server/tracker/fake UI.
- [ ] All static/browser/axe/privacy/metadata gates pass twice.
- [ ] Plan/index `DONE` in exact commit.

## STOP conditions

- Claim lacks source or media needs private/unsupported behavior.
- Requires server rendering/runtime API/desktop import.
- Theme/locale cannot meet WCAG AA after two token/layout corrections.
- Motion is decorative rather than explanatory.

## Maintenance

Refresh truth/media when capture, editor, ClipboardComposer, platform or release
state changes. Site copy remains site-owned.
