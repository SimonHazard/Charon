# Charon desktop UX contract

This contract implements [ADR 0011](adr/0011-rapid-capture-product.md), as
amended by [ADR 0012](adr/0012-unified-note-shelf.md) and
[ADR 0013](adr/0013-direct-note-actions.md), under the interaction and motion
invariants of ADR 0005.

## Product posture

Charon is one calm, dense rapid-capture shelf, not a landing page inside a
window or a miniature project manager. It optimizes scan speed, keyboard
continuity, visible local ownership, and trustworthy failure recovery. Density
is 6/10, visual variance is 5/10, and motion is 4/10. Every element earns its
place beside capture, finding, light enrichment, agent-ready copy, status, or
deletion.

## Visual language

Light is the first-run default and Graphite is the dark user choice. The
approved Charon Prune, Lavender, and Cream primitives map through semantic theme
roles; product components never use raw palette values or theme conditionals.
Lavender is the interaction accent for focus and active controls.
It appears through semantic surfaces and boundaries, never as a decorative
vertical rail beside content.
Destructive, warning, and success colors remain semantic.

Use the platform system UI font stack with optical sizing where supported,
size-specific tracking, and tighter leading only for large headings. Use system
monospace for Markdown editing. Tabler outline icons are the sole UI icon family
with consistent stroke. Do not use Inter, gradients, glow, emoji iconography,
permanent glass, oversized marketing type, generic rounded cards, or a bento
grid.

Surface radius is 16px, field radius is 12px, and compact-control radius is
8px. Pills are reserved for quiet Tag chips or compact segmented semantics.
Borders, alignment, spacing, and restrained surface contrast establish
hierarchy; shadows appear only when a layer genuinely floats.

## Single-shelf layout

There is one compact vertical utility shelf and no persistent navigation rail.
The supplied reference video calibrates only the shelf's narrow posture,
containment, and rhythm; Charon does not copy its proprietary chrome,
thumbnails, or composer Attachments. The first-run window is 480 by 720 logical
pixels, with a 400 by 480 logical-pixel minimum at 100% zoom. The 200% review
uses a 720px-wide native window so the effective content width remains at least
360px. User-restored window sizes remain authoritative.

The shelf column is at most `34rem`/544px and stays centered in wider restored
windows rather than stretching Notes across spare canvas. A minimal native drag
region sits above search on macOS/Linux; Windows uses its native title bar
without an additional webview drag strip. Help and Preferences trail the search
input inside the same surface. One virtualized stack of bounded vertical Note
surfaces fills the available middle region. The solid composer remains anchored and visible at the
bottom.

```text
+----------------------------------------------+
|                                              |
+----------------------------------------------+
| [ Search Notes and Tags...       ][?][gear] |
|                                              |
| +------------------------------------------+ |
| | o  Agent handoff             copy edit x| |
| |    Verify the empty state... Agent  · 1| |
| +------------------------------------------+ |
| | ✓  Local Markdown            copy edit x| |
| |    Visible files, explicit copy...      | |
| +------------------------------------------+ |
| |             ... virtualized stack ...   | |
|                                              |
| [ Add a note...                          ^ ]|
+----------------------------------------------+

Expanded from the live Note row:
+------------------------------------------+
| o  Agent handoff              copy edit x|
| | [ Write | Preview ]    Saved      [x] | |
| |                                      | |
| | Markdown editor or safe preview       | |
| |                                      | |
| | Tags        [research] [agent] [Add] | |
| | Attachments                    [Add] | |
| | file  release-brief.pdf          [x] | |
+------------------------------------------+
```

Control labels in the diagram are structural placeholders; implementation uses
Tabler outline icons and localized accessible names, never emoji glyphs.

The minimal drag region and composer use the solid canvas. The search surface
owns Help and Preferences without a separate wordmark row; native outer-window
controls and macOS traffic-light space remain platform-owned. Lavender-backed
surfaces and borders are reserved for focus, active controls, or a successful
new-Note acknowledgement. Note rows use one semantic fill, a restrained one-
pixel border, 6-8px vertical rhythm, and no lift or shadow. They remain a list,
never a card grid.

The top chrome remains compact at large text sizes. At narrow desktop widths,
secondary Tag metadata collapses before title, preview, status, row actions,
search, errors, or the composer become unusable. French strings wrap or compact
without clipping or horizontal scrolling. Preferences is a focused transient surface
containing the active Notes folder, an explicit validated chooser, compact
sun/moon appearance buttons with localized accessible names and Tooltips, a
native language select (English/Français), capture permission state, and the
disclosed default-off update setting; it is not a product destination.

## Compact feature map

The compact shelf remains the complete product. Every accepted job has one
home, and no workflow moves to another route, window, or inspector to escape
layout pressure.

| Job | Compact home | Required compact behavior |
| --- | --- | --- |
| Search body, Tags, and Attachment names | Full-width top search row | The clear action remains reachable and a no-result state keeps the composer visible. |
| Open and Done | Unified Note stack | Done stays in place with a checked control, muted surface, and struck-through primary text. |
| Open a Note | Main row surface | A plain click, Enter, or Space expands that Note directly; Arrow keys move native focus without creating a mode. |
| Scan and act on a Note | Bounded virtualized row | Derived title, preview, quiet Tags, Attachment count, status, Copy, Edit, and Delete remain present. |
| Edit Markdown | Expanded live Note row | Write/Preview, autosave state, close, and contextual errors stay in the same row. |
| Edit Tags | Expanded Note, stacked section | Chips wrap, the add input stays usable, and limits and errors remain local. |
| Manage Attachments | Expanded Note, stacked section | Generic file metadata, pending and error states, add, and remove remain available without previews. |
| Copy as Markdown | Direct row action | One Note keeps its body exact; completion, failure, and local-path disclosure remain contextual and reachable. |
| Permanently delete a Note | Direct row action and per-Note AlertDialog | The dialog reflows at 400px, makes the irreversible scope explicit, and keeps cleanup retry contextual. |
| Preferences | Search-trailing gear Popover | Appearance, language, Notes folder, and capture state scroll within a 400 by 480 shelf. |
| Capture help and permissions | Search-trailing Help Popover and Preferences Capture section | Permission state and action remain visible while long disclosures use keyboard-accessible progressive disclosure. |
| Updates | Preferences and one contextual update dialog | Checks are default-off until enabled; version/notes, explicit download/install, progress, errors, and dirty-draft-safe restart fit without exposing content. |
| Workspace loading, empty, error, and recovery | Main shelf region | Layout-shaped progress and local recovery preserve composer or chooser priority. |
| Manual capture | Anchored body-only composer | Input survives failure, shortcut focus is immediate, and there is no Attachment queue. |

Compact layout thresholds are explicit:

- From 400 through 439px, essential row content, the Attachment count, and icon
  actions with localized Tooltips remain visible. Tag chips may collapse to an
  accessible count.
- From 440 through 519px, the normal target shows up to two quiet Tag chips and
  the Attachment count.
- At 520px and above, the same single column gains breathing room but never a
  second product column.
- At an effective 360px during the 200% review, controls may stack and metadata
  may collapse, but no action, error, disclosure, or composer is clipped.

### Compact Attachment interpretation

- A collapsed Note displays only a paperclip and count. Complete safe filenames
  may be present in its accessible summary, but no thumbnail is rendered.
- Activating the Attachment count expands the same Note and focuses its
  Attachment section. It never opens a preview, file browser, or another panel.
- Attachment import starts only from an existing Note editor and uses the
  explicit native picker followed by the Rust-owned application
  commands. The body-only composer never stages an Attachment.
- A pending import shows bounded indeterminate local progress and the validated
  display filename when the existing command makes one available. It never
  invents a percentage or adds an IPC progress stream, and only duplicate import
  intent is disabled.
- The list fits 20 Attachments and long Unicode basenames without horizontal
  product scrolling. Visual truncation preserves the complete safe name in the
  accessible label and keyboard Tooltip.
- Removal keeps the existing filename-specific irreversible confirmation and
  cleanup-retry contract.
- React never reads Attachment bytes or source paths and never offers a
  thumbnail, arbitrary MIME preview, upload, drag and drop, external execution,
  cross-Note sharing, or pre-Note Attachment state.

## Note row and direct actions

A collapsed Note row exposes body excerpt, quiet Tag chips, paperclip icon plus
Attachment count, status, and direct Copy, Edit, and Delete controls.
Information stays readable without hover; fine-pointer hover reveals the three
actions, while focus and coarse pointers expose the same controls without
relying on pointer location.

Delete opens the per-Note irreversible confirmation. Copy is an explicit direct
action and states that optional managed local paths enter the clipboard; it
never implies Attachment bytes are copied or uploaded.

Tag chips are quiet metadata, not colored categories or navigation. The
paperclip count opens or focuses the Attachment area only within the same
expanded Note. Keyboard focus keeps its own visible ring in every theme and is
never communicated by color alone. A plain click on the main surface expands
the Note; modifier clicks do not create a secondary interaction mode.

### Choosing a Notes folder

The explicit chooser opens an existing valid Workspace or creates one in an
empty directory. A nonempty unrelated directory is rejected without changes.
Switching never moves the previous Notes. The candidate is validated and the
choice remembered before replacing the active Workspace; failure preserves the
previous active space. A folder error remains inside Preferences until a
successful switch or explicit dismissal, including across typing, autosave,
refresh, chooser cancellation, and closing/reopening Preferences. Without an
active Workspace, the same failure remains actionable in the startup surface.

## Composer

The solid bottom composer is always visible, accepts a short Markdown body,
creates one Open Note on Enter, and does nothing for empty or whitespace-only
input. It preserves text on failure and shows retry beside the error. Longer
work moves into the same expanded Note editor after creation rather than
opening another window. It has no permanent help sentence, pre-Note Attachment
queue, thumbnail strip, drag and drop, or arbitrary preview; essential capture
help remains available from Help and Preferences.

Invoking `Cmd+Shift+Space` on macOS or `Alt+Shift+Space` on Windows/Linux reveals
Charon and focuses the composer when global operating-system delivery is available.
Unmodified double Shift on a proved macOS adapter has no surface,
creates one Note only for non-empty selected text, and never steals source
focus. Permission denial keeps the portable shortcut and composer usable.

## Editor expansion and enrichment

Enter, Space, a click on the main row surface, or the hover/focus pencil expands
the focused Note. Shared layout begins at the row's current on-screen position.
The editor extends the same bounded surface with no nested left rail or
decorative accent bar. A segmented Write/Preview control offers autosaving
Markdown, draft preservation, Tag editing, Attachment list/import/removal,
status, and close. Safe Preview uses TanStack Markdown for headings, emphasis,
strikethrough, lists, read-only tasks, quotes, code, and tables. Raw HTML stays disabled;
links show their destination as inert text and images show only alternative
text, without resource requests or Attachment reads. Markdown help beside
Write/Preview and in general Help shows localized syntax examples without
changing the draft. Escape closes help first and restores its trigger focus.

Tags preserve first-entered spelling and order while preventing
case-insensitive duplicates. Editing is inline and has no separate management
surface. Attachment import always starts with an explicit file picker. The
pending filename and local progress remain visible while Rust validates and
copies a bounded regular non-symlink file into the Note-owned directory.
Import failure preserves the draft, identifies the affected filename safely,
and offers retry or choose another file. Removing an Attachment opens one
concise confirmation naming its safe display filename and permanent effect,
because its managed bytes are not recoverable in Charon after commit.

Escape closes the topmost transient surface first. Closing the editor never
silently drops unsaved text; autosave status or a contextual preservation choice
must be clear. Focus returns to the originating Note when it still exists.

The expanded editor stays mounted while the shelf scrolls and stays visible in
the result when a search would otherwise exclude it, until explicitly closed.
Opening another Note first flushes the current body; a failed save keeps its
draft and retry action available. Closing a filtered-out Note returns focus to
a surviving row or the composer. Arrow keys inside Markdown, Tags, and tab
controls keep their native text-editing or control behavior. IME confirmation
does not submit the composer or add a Tag.

## Interaction states

Every flow and reusable control defines:

- loading: layout-shaped local progress while the initiating control stays
  understandable;
- empty: a specific explanation and the composer as the shortest valid action;
- error: contextual, content-free failure with preserved input and retry or
  recovery beside the operation;
- destructive: exact scope and irreversible wording for Note or Attachment
  removal;
- focus: a high-contrast visible ring independent of status;
- active: Lavender-backed controls remain distinct from focus and status;
- disabled: unavailable appearance plus an accessible reason when needed;
- permission-denied: affected capture capability, purpose, settings path, retry,
  and the functional portable shortcut and composer fallback.

Coverage also includes success, external conflict, migration, interrupted
recovery, offline update checks, large files, import collisions, and Attachment
validation. Color alone never communicates state. Removing a generic Error page
means each failure stays where it can be acted on; it does not remove error or
recovery behavior.

## Keyboard contract

- Arrow keys move browser focus between visible Note row surfaces.
- Enter or Space expands the focused Note row or activates the focused control.
- `CmdOrCtrl+A` keeps its native text-selection meaning; Charon assigns it no
  Note-list command.
- `CmdOrCtrl+F` focuses search.
- Enter expands the focused Note, activates the focused control, or submits the
  bottom composer according to unambiguous focus context.
- Delete or Backspace opens the irreversible confirmation for the focused Note
  row when focus is not inside editable text.
- Escape closes the topmost surface first and preserves predictable focus.
- Unmodified `Shift`, `Shift` performs silent selected-text capture only where
  the native adapter and required permissions are proved.
- `Cmd+Shift+Space` on macOS and `Alt+Shift+Space` on Windows/Linux reveal Charon
  and focus the bottom composer when global delivery is available.

Displayed shortcut glyphs resolve from `capabilities.platform`: Charon shows
`⌘` on macOS and `Alt` on Windows/Linux for composer focus.

Normal text editing shortcuts always win inside editable content. Commands are
reachable without a pointer. Removed or filtered rows move focus to the nearest
surviving Note or the composer.

## Irreversible deletion and recovery

Delete always opens one concise confirmation for the exact targeted Note and
states that the action cannot be undone in Charon. It does not use an extra
typed phrase or repeated warning. Cancel returns focus to the initiating Note
action and changes nothing. Confirmation commits one bounded transaction.

On success, Charon removes the Note and its managed Attachments, acknowledges
completion, and returns focus to the nearest surviving Note or the composer.
The confirmation links concise disclosure that external backups, synchronized
histories, and operating-system snapshots are
outside Charon's erasure guarantee. Failure leaves the visible Notes and input
intact and offers contextual retry or Workspace recovery.

Migration and interrupted transactions are not hidden behind deletion copy.
Schema v1 active Notes survive byte-exactly; already-trashed bodies remain in
the visible user-owned `legacy-trash-v1/` Markdown archive. Charon identifies
the archive after success, removes the bounded recovery record after
convergence, and never indexes archived bodies as active Notes.

## Motion and materials

Feedback begins on pointer or key down and targets a visible response within one
frame. Direct manipulation tracks 1:1. State transitions default to critically
damped springs, remain interruptible and reversible, and retarget from the
current presentation value. Input is never locked while motion settles.

The allowed motion foundation is exact and intentionally small: existing
button/icon press feedback at scale `.98`; origin-aware opacity plus scale
`.98-.985` for Tooltips, menus, and Popovers over 120-180ms with symmetric
exit; and the editor content's critically damped transform-and-opacity
transition. The row height changes instantaneously by design so frequent
pointer and keyboard expansion never waits on layout motion. Editor content
uses the same path to expand and collapse, remains reversible at every point,
and reduced motion replaces its scale with a crossfade or static swap.

Reject list entrance and search-result motion, status-filter chrome, row
lift, hover shadow, parallax, bounce, gradients, grain, composer-focus
animation, fixed gesture timelines, and animation input locks. The virtual
`<li>` remains the sole owner of Y translation; any row/editor motion belongs
to its nested surface. Virtualization keeps a stable visual placeholder while
the expanded surface owns focus.

Preferences and Markdown help use fully opaque semantic surfaces in both themes.
The Note list and confirmation dialogs reserve no empty scrollbar gutter.
Dialog content and footer own their spacing; the footer spans the entire inner
width even with classic Windows scrollbars.

Only transform and opacity animate. Translucency is limited to transient
Popovers, menus, Tooltips, dialogs, and toasts where it communicates hierarchy,
is never stacked, and has solid semantic fallbacks. The drag region, shelf,
search, Notes, and composer stay solid. With `prefers-reduced-motion`, shared
travel, scale, springs, parallax, and momentum become a short opacity crossfade
or static swap. With reduced transparency, transient materials become solid.
Increased contrast adds clear boundaries without changing information
architecture.

Keyboard-triggered editor and transient-surface changes are immediate. Pointer
interactions retain the restrained existing motion; popover scaling uses the
same transform property as its transition, with the trigger as its origin.

## Accessibility and acceptance review

Review keyboard-only use, screen-reader names and announcements, larger text,
EN/FR strings, Light/Graphite, reduced motion, reduced transparency,
increased contrast, loading, empty, failure, destructive, focus, active,
disabled, and permission-denied states. Note counts, status, Tags, Attachment
counts, import progress, copy success, and deletion result are announced without
exposing content in diagnostics.

Any new motion is reviewed at normal speed, in slow motion, and while reversed
mid-animation. The review confirms pointer/key-down feedback, input during
settling, focus restoration, crossfade/static reduced-motion behavior, and no
layout clipping with large French text.
