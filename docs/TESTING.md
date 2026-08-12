# Testing Charon

`bun run verify:release` is the consolidated local release gate. It verifies
generated Rust-to-TypeScript bindings, formatting, type safety, desktop and site
unit suites, static builds, Chromium and WebKit user journeys, serious/critical
axe findings, privacy sentinels, focused performance budgets, Rust formatting,
Clippy, and Rust tests.

Browser tests use only the deterministic `?fixture=media` Workspace. Its Notes,
Tags, Attachment names, paths, and timestamps are synthetic. The fixture is
compiled only by the Vite development server and is eliminated from production
builds. Browser tests never invoke Tauri or touch a real Workspace.

## Performance reference

The reference host is Apple Silicon macOS, measured from a clean production
build with Bun 1.3.12. The gate budgets total desktop JavaScript at 230 KiB gzip
and measures a direct 20,000-Note body, Tag, and Attachment-name scan across nine
runs with a median below 50 ms. The virtual list component separately asserts
fewer than 150 rendered rows. Browser media reserves width and height to keep
layout shift below the site target of 0.1.

Native capture latency, Accessibility behavior, the bounded 700 ms Copy
fallback, 100 MiB Attachment peak memory, and signed artifact behavior remain
physical protocols because a browser fixture cannot prove operating-system
behavior.

## Accessibility protocols

- macOS VoiceOver: traverse titlebar, search, Open/Done, virtual Note list,
  expanded editor, Preferences, permanent Delete confirmation, and composer.
  Record focus order, accessible names, selection state, error announcement,
  and focus return.
- Linux Orca: repeat standard shortcut, composer, search, status, Note actions,
  Preferences, and Delete confirmation. Do not test or claim modifier-only
  selected-text capture.
- At 200% WebView zoom, confirm no action or contextual error is clipped and the
  bottom composer stays visible.

## 2026-08-11 compact shelf review

Plan 016 was reviewed against the supplied reference only as posture and rhythm
calibration. No proprietary chrome, thumbnail, or composer Attachment behavior
was copied.

| Surface | Before | After | Review result |
|---|---|---|---|
| Titlebar | 52px translucent chrome, 7rem wordmark, modal Help | 48px solid chrome, 5.5rem wordmark, anchored Help Popover, Help and Preferences Tooltips | Native drag region and macOS traffic-light inset remain intact; press feedback begins on pointer/key down |
| Toolbar | Search, status, and Selection competed on one wide row | Search owns the first row; Base UI Open/Done and Selection share a non-scrolling second row | EN/FR labels fit at 400px; focus and pressed state remain distinct |
| Note stack | One filled scrolling viewport with divider rows | Transparent virtual viewport containing bounded 6-8px-rhythm surfaces | 20,000-Note virtualization remains under 150 rendered rows; no lift or row shadow |
| Note metadata | Up to three Tags shared the trailing row width | Two Tags maximum at normal width, Tags collapse first at 400px, Attachment remains count-only | Title, one-line preview, status, Actions, and an accessible metadata summary remain available |
| Composer | Transient material plus permanent capture hint | Solid anchored body-only field with contextual errors above it | Enter, whitespace no-op, pending guard, failure preservation, retry, and portable focus remain unchanged |
| Transients | Mixed fixed utility animation classes | Origin-aware symmetric transform/opacity states using the 160ms transient role | Reduced motion removes scale, reduced transparency is solid, increased contrast strengthens boundaries, and input stays available during exit |

Chromium and WebKit passed the compact geometry journeys at 400×480, 480×720,
544×720, and 720×480, plus a 720px native-width synthetic 200% review. The
same review covered Solarized, Light, and Dark in EN and FR at 400px and 480px,
keyboard focus/return, a coarse pointer, reduced motion, reduced transparency,
increased contrast, semantic surfaces, no horizontal overflow, and zero
serious/critical Axe findings.

The rendered shelf was inspected at Solarized 480×720, Dark 480×720, and Light
FR 400×720. The hierarchy, French compaction, Tag collapse, Attachment count,
empty vertical space, and anchored composer matched the calm-readiness target.
No public site media was regenerated; Plan 017 owns that evidence refresh.

A separate native profile using identifier `dev.simonhazard.charon.plan016`
opened at exactly 480×720. After resizing to 640×600, quitting normally, and
relaunching the same profile, the window-state plugin restored 640×600 instead
of applying the first-run dimensions again. The temporary profile was moved to
the macOS Trash as `Charon-plan016-test-profile-20260811` after review.
