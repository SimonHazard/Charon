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

## 2026-08-12 compact feature alignment evidence

Plan 017's deterministic browser matrix passed in Chromium and WebKit at
400×480, 440×680, 480×720, 520×720, 720×480, and an effective 360px layout. It
covered Solarized, Light, and Dark in English and French; fine and coarse
pointers; keyboard focus and return; reduced motion; reduced transparency;
increased contrast; Selection and irreversible Delete; the expanded editor;
metadata-only Attachments; Preferences; and the anchored body-only composer.
The full browser run passed 30 tests, and the focused Axe gate passed four
major-state tests with zero serious or critical findings.

The 2026-08-12 automated evidence was:

- `bun run test:desktop -- note-screen note-list note-row note-editor capture-input preferences-panel workspace-state selection-model search motion`: 11 files and 41 tests passed.
- `bun run check`: 22 desktop files and 76 tests passed; the site check built and verified nine static routes and five media budgets.
- `bun run test:perf`: desktop JavaScript measured 205,702 gzip bytes and the 20,000-Note search median measured 17.21ms.
- `bun run check:privacy`: the production desktop and site outputs passed the content, source-path, and secret scan.

The existing public media was regenerated from the real Vite application with
only the synthetic `?fixture=media` Workspace. The capture script frames the
480px shelf without recreating product UI. The reviewed evidence paths are
`apps/site/public/media/charon-shelf-solarized.webp`,
`apps/site/public/media/charon-editor-dark.webp`, and
`apps/site/public/media/charon-demo.webm`. The two stills and the 3.04-second
video are 1440×960; the Solarized shelf, scrolled Dark Attachment section, and
the video's Write-to-Preview sequence preserve the single-column shelf,
metadata-only filenames, visible composer, and interruption-ready controls.

Native Tauri and macOS VoiceOver review was not performed in this noninteractive
executor session. Before Plan 017 can be marked DONE, a physical macOS pass must
still cover titlebar, search, Open/Done, virtual Notes, Selection, editor, Tags,
Attachments, Preferences, Delete, contextual errors, composer, normal speed,
0.25× observation, and mid-flight reversal. This is an open P1 evidence item;
no native or VoiceOver acceptance claim is recorded here.
