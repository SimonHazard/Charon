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

The appearance follows the OS by default (ADR 0019); Light and Graphite (the
dark appearance) are explicit choices that never flip with the OS. The
approved Charon Prune, Lavender, and Cream primitives map through semantic theme
roles; product components never use raw palette values or theme conditionals.
Drawing ink colours are the exception: they are user content stored in the
Note (ADR 0021), not theme roles, shown as swatches in the drawing dialog.
Lavender is the interaction accent for focus and active controls.
It appears through semantic surfaces and boundaries, never as a decorative
vertical rail beside content.
Destructive, warning, and success colors remain semantic.

Use the platform system UI font stack with optical sizing where supported,
size-specific tracking, and tighter leading only for large headings. Use system
monospace for Markdown editing. Tabler outline icons are the sole UI icon family
with consistent stroke. Do not use Inter, painted gradients (the Note list
scroll-edge mask of ADR 0022 excepted), glow, emoji iconography, permanent
glass, oversized marketing type, generic rounded cards, or a bento grid.

Surface radius is 16px, field radius is 12px, and compact-control radius is
8px. Pills are reserved for quiet Tag chips or compact segmented semantics.
Borders, alignment, spacing, and restrained surface contrast establish
hierarchy; shadows appear only when a layer genuinely floats.

`tokens.css` alone references the Lavender ramp (`--lavender-50` to
`--lavender-900`, anchored on `--brand-lavender` at step 400); components
consume its semantic roles, including `--action-border` for a Lavender
control's silhouette. Two per-theme shadows exist: `--shadow-floating` for
transient surfaces (Popovers, Tooltips, Select, toasts) and `--shadow-modal`
for dialogs; Note rows and the composer stay shadowless. Text uses the
`--type-2xs` to `--type-xl` steps and the regular (450), medium (560), and
strong (650) weights; hit targets use the `--size-control-*` steps. These names
stay outside Tailwind's `--text-*`, `--tracking-*`, and `--leading-*`
namespaces.

## Single-shelf layout

There is one compact vertical utility shelf and no persistent navigation rail.
The supplied reference video calibrates only the shelf's narrow posture,
containment, and rhythm; Charon does not copy its proprietary chrome,
thumbnails, or composer Attachments. The first-run window is 480 by 720 logical
pixels, with a 400 by 480 logical-pixel minimum at 100% zoom. The 200% review
uses a 720px-wide native window so the effective content width remains at least
360px. User-restored window sizes remain authoritative: Charon restores only the
saved size, position, and maximized state, and the window appears once, already
in place. On macOS, closing the window hides Charon and keeps capture armed;
the Dock icon or the composer shortcut (`Cmd+Shift+Space` by default) brings
it back, and `Cmd+Q` quits. On
Windows and Linux, closing the window quits; an open drawing with unsaved
strokes first asks whether to discard them and keeps the window open. The
opt-in background mode (ADR 0023) adds one menu bar icon on macOS or one
notification area icon on Windows whose menu holds only Open Charon and Quit
Charon. While that icon exists, closing the window on Windows hides Charon and
keeps capture armed; the icon (left click on Windows), a second launch, or
the composer shortcut (`Alt+Shift+Space` by default) brings it back. Closing never hides a window without that
icon, and Linux keeps quitting on close in this release. Quit from the icon,
from Preferences, or with `Cmd+Q` (the macOS app menu's Quit) saves an open
editor first; composer text, a failed save, or a drawing with unsaved strokes
keeps Charon running and revealed, with a warning toast and the protected
text, or the drawing's discard prompt, in view. Quitting from the Dock menu or
by logging out still quits at once on macOS: AppKit terminates there without a
hook Tauri exposes.

The shelf column is at most `34rem`/544px and stays centered in wider restored
windows rather than stretching Notes across spare canvas. A minimal native drag
region sits above search on macOS/Linux; Windows uses its native title bar
without an additional webview drag strip. Help and Preferences trail the search
input inside the same surface. One virtualized stack of bounded vertical Note
surfaces fills the available middle region. The solid composer remains anchored and visible at the
bottom. Capture status toasts appear at the top of the shelf column below the
drag region, never over the composer, dismiss after 5 seconds, and can be
swiped up or right.

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
System, sun, and moon appearance buttons with localized accessible names and
Tooltips, a themed language Select (English/Français) whose list matches the
other transient surfaces on every platform, the composer shortcut with its
change and reset controls, capture permission state with an
opt-in capture-notification toggle (wherever double Shift can create a Note,
with a persistent line saying Charon cannot verify the system permission), an
experimental opt-in "Keep formatting" toggle on macOS only (ADR 0026, with a
persistent description of the extra HTML read and its plain-text fallback),
an opt-in background mode (with a visible reason and a disabled toggle where it is
unavailable, and Quit Charon while it is active), the disclosed default-off
update setting, and a quiet About footer with the
installed version, the MIT license, and two explicit links to the source
repository and contribution guide that open in the default browser; it is not
a product destination. The
update install dialog opens above Preferences, which stays open behind it to
show download progress and Restart; Cancel returns focus to the Review button.

## Compact feature map

The compact shelf remains the complete product. Every accepted job has one
home, and no workflow moves to another route, window, or inspector to escape
layout pressure.

| Job | Compact home | Required compact behavior |
| --- | --- | --- |
| Search body, Tags, and Attachment names | Full-width top search row | The clear action remains reachable and a no-result state keeps the composer visible. |
| Open and Done | Unified Note stack | Done stays in place with a checked control, muted surface, and struck-through primary text. Tag chips keep a visible boundary on the muted surface. |
| Open a Note | Main row surface | A plain click, Enter, or Space expands that Note directly; Arrow keys move native focus without creating a mode. |
| Scan and act on a Note | Bounded virtualized row | Derived title, preview, quiet Tags, Attachment count, status, Copy, Edit, and Delete remain present. |
| Edit Markdown | Expanded live Note row | Write/Preview, autosave state, close, and contextual errors stay in the same row. |
| Draw in a Note | Expanded Note, Draw button beside Markdown help | One modal drawing dialog fits 400 by 480; Preview shows validated drawings with an Edit drawing action. |
| Edit Tags | Expanded Note, stacked section | Chips wrap, the add input stays usable, and limits and errors remain local. |
| Manage Attachments | Expanded Note, stacked section | Generic file metadata, pending and error states, add, and remove remain available without previews. |
| Copy as Markdown | Direct row action | One Note keeps its body exact; completion, failure, and local-path disclosure remain contextual and reachable. |
| Permanently delete a Note | Direct row action and per-Note AlertDialog | The dialog reflows at 400px, makes the irreversible scope explicit, and keeps cleanup retry contextual. |
| Preferences | Search-trailing gear Popover | Appearance, language, Notes folder, composer shortcut change and reset, capture state, notifications, and formatting, background mode, updates, and About scroll within a 400 by 480 shelf. |
| Capture help and permissions | Search-trailing Help Popover and Preferences Capture section | Permission state and action remain visible while long disclosures use keyboard-accessible progressive disclosure. |
| Updates | Preferences and one contextual update dialog | Checks are default-off until enabled; version/notes, explicit download/install, progress, errors, and dirty-draft-safe restart fit without exposing content. On macOS the install dialog warns that macOS may ask again for Input Monitoring and Accessibility after the update (ad-hoc releases, ADR 0027). On Windows the installer closes Charon; the install button stays disabled until every draft is saved, and the installer reopens Charon. |
| Background mode | Preferences and one menu bar or notification area icon | Default-off; the icon menu holds Open and Quit only; the unavailable state explains why closing quits; Quit is draft-safe. |
| Formatted capture | Preferences Capture section (macOS only) | Default-off and marked Experimental; the description states, without hover, that the Copy fallback also reads the formatted copy and that plain text is kept when it does not match; a failed save keeps the toggle off with a local alert; no Windows or Linux control. |
| Capture notifications | Preferences Capture section and the system notification center | Default-off; one fixed "Charon" / "Note captured." notification at most every 2 s, only while the window is unfocused; no Note text; the click opens no Note; the unverifiable OS permission is stated, never guessed. |
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

Status shows the requested state on activation, stays operable while the write
settles, and returns to the stored state if the write fails. A successful Copy
swaps its icon for a check for 2.5 seconds without reflowing the row and is
announced through the shelf status region; a copy failure stays inline until
the next copy, expansion, or delete.

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
creates one Open Note on Enter, inserts a line break on `Shift+Enter`, and does
nothing for empty or whitespace-only input. The field grows with its content to
about five lines, then scrolls; pasted line breaks are preserved. It preserves
text on failure and shows retry beside the error. Longer work moves into the
same expanded Note editor after creation rather than opening another window. It
has no permanent help sentence, pre-Note Attachment queue, thumbnail strip, drag
and drop, or arbitrary preview; essential capture help remains available from
Help and Preferences.

Invoking the composer shortcut reveals Charon and focuses the composer when
global operating-system delivery is available. It is the platform default
(`Cmd+Shift+Space` on macOS, `Alt+Shift+Space` on Windows and X11) or the one
key combination the user chose in Preferences (ADR 0025). On Wayland, the
portal may assign a different shortcut, which Charon displays.

Preferences' "Write a note" row shows the active shortcut in a `kbd`. On macOS,
Windows, and X11, Change… turns a line below it into a focused recorder that
names itself "Press the new shortcut, or Escape to cancel": held modifiers
appear on key down, a letter, digit, Space, or F1–F24 (F1–F20 on macOS) with
at least two modifiers is sent at once, and any other key keeps recording with
a hint.
Escape cancels without closing Preferences and returns focus to Change…; Tab or
moving focus away leaves recording without capturing. Reset appears only for a
chosen shortcut and restores the default. A reserved, invalid, or refused
combination shows a contextual alert beside the row while the previous shortcut
stays displayed and active. A stored choice that no longer registers at launch
shows a persistent warning that the default is active. macOS adds a persistent
line that Charon cannot detect every shortcut used by macOS or other apps.
Wayland shows the portal's shortcut and says to change it in the desktop's
keyboard settings, with no Change… button. Letters follow physical key
positions, so a non-QWERTY layout may show a letter that differs from the
keycap. The recorder adds no animation.
Unmodified double Shift on macOS and experimental Windows/X11 adapters has no
surface,
creates one Note only for non-empty selected text, and never steals source
focus. When the user next reveals Charon, the shelf announces the captured
Note, scrolls to it unless an editor is open or a text field has focus, and
briefly tints its row Lavender. Capture itself stays silent unless the user
turned on capture notifications (ADR 0024). Permission denial keeps the
portable shortcut and composer usable.

## Editor expansion and enrichment

Enter, Space, a click on the main row surface, or the hover/focus pencil expands
the focused Note. The row and its pencil report the expanded state to
assistive technology and point at the editor; the pencil on an open Note moves
focus into its Markdown field (or the Write tab in Preview) and never collapses
it. Shared layout begins at the row's current on-screen position.
The editor extends the same bounded surface with no nested left rail or
decorative accent bar. A segmented Write/Preview control offers autosaving
Markdown, draft preservation, Tag editing, Attachment list/import/removal,
status, and close. Safe Preview uses TanStack Markdown for headings, emphasis,
strikethrough, lists, read-only tasks, quotes, code, tables, dividers, and
explicit line breaks, and renders the whole body: a leading `---` is a divider,
never hidden front matter. Raw HTML stays disabled; links show their
destination as inert text and images show only alternative text, without
resource requests or Attachment reads. Markdown help beside Write/Preview and
in general Help shows localized, selectable syntax examples, each verified
against the Preview, and names what the Preview does not render (HTML,
images), without changing the draft. Escape closes help first and restores its
trigger focus.

A Draw icon button sits beside the compact Markdown help. It opens a modal
dialog titled Drawing with a toolbar (Pen and Eraser, five ink swatches, three
widths, Undo, Redo, Clear), a 16:10 canvas, and Cancel plus Insert, or Save
when editing. Ink appears on pointer down and follows the pointer 1:1 through
pointer capture; the eraser removes whole strokes it passes over. Insert is
disabled until a stroke exists, and a drawing over the format limit keeps its
strokes and shows an inline error. Cancel or Escape with unsaved strokes asks
inline to discard or keep drawing, and so does closing the window on Windows
and Linux, which then stays open; without changes the dialog closes at once.
Focus returns to the Draw button or to the Edit drawing button that opened it.
In Write, Draw inserts at the caret, or edits the drawing whose block holds
the caret; a new drawing never lands inside another code block, and one the
Note leaves unclosed takes it before its opening line. Preview renders each
valid drawing as a quiet inset figure whose ink uses the text colour; a
top-level drawing carries an Edit drawing icon button, while one inside a
quote, list item, or footnote is shown without it. Invalid `svg` blocks remain
code. The dialog uses the dialog transient-surface motion and its
reduced-motion, reduced-transparency, and increased-contrast fallbacks.

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

An editor that would open below the visible list scrolls its row to the top
of the list in one instant step, so the focused Markdown field is on screen.
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
  and the functional portable shortcut and composer fallback; for capture
  notifications, Charon cannot verify the OS permission and says where to allow
  it instead.

On macOS, each permission action requests access for the current build and opens
its matching System Settings pane. Releases are ad-hoc signed (ADR 0027), so
after an update the previous build may still appear enabled while the current
process is denied; then Preferences explains how to remove the old entry, add
the current app, and relaunch. Charon reports only the native permission checks
as ready.

Coverage also includes success, external conflict, migration, interrupted
recovery, offline update checks, large files, import collisions, and Attachment
validation. Color alone never communicates state. Removing a generic Error page
means each failure stays where it can be acted on; it does not remove error or
recovery behavior.

## Keyboard contract

- Arrow keys move browser focus between visible Note row surfaces. Home and
  End move it to the first and last Note, PageUp and PageDown ten Notes up or
  down, mounting virtualized rows as needed.
- Enter or Space expands the focused Note row or activates the focused control.
- `CmdOrCtrl+A` keeps its native text-selection meaning; Charon assigns it no
  Note-list command.
- `CmdOrCtrl+F` focuses search. Escape in the search field clears the query
  and Tag filter and keeps focus there; with nothing to clear it does nothing.
- `CmdOrCtrl+C` on a focused Note row with no text selected copies that one
  Note as Markdown, exactly like its Copy button, including the disclosed
  managed local Attachment paths. A text selection, editable text, and dialogs
  keep native Copy.
- `CmdOrCtrl+S` inside the expanded editor saves its draft at once; the save
  state announces the result. Keys from the drawing and removal dialogs never
  save.
- Enter expands the focused Note, activates the focused control, or submits the
  bottom composer according to unambiguous focus context.
- `Shift+Enter` inserts a line break in the bottom composer; IME confirmation
  never submits.
- Delete or Backspace opens the irreversible confirmation for the focused Note
  row when focus is not inside editable text.
- Escape closes the topmost surface first and preserves predictable focus.
- Inside the drawing dialog, `CmdOrCtrl+Z` undoes, `Shift+CmdOrCtrl+Z` or
  `Ctrl+Y` redoes, and Escape first asks before discarding unsaved strokes.
- Unmodified `Shift`, `Shift` performs silent selected-text capture only where
  the native adapter is available or explicitly experimental and required
  permissions allow it.
- The composer shortcut reveals Charon and focuses the bottom composer when
  global delivery is available: the platform default (`Cmd+Shift+Space` on
  macOS, `Alt+Shift+Space` on Windows/X11) or the user's chosen shortcut (ADR
  0025). Wayland may display a portal-assigned shortcut instead. No other
  shortcut is configurable.

Displayed shortcut glyphs resolve from `capabilities.platform`, and Help and
Preferences always show the active composer accelerator: macOS uses `⌘ ⌃ ⌥ ⇧`,
Windows names the Windows key `Win`, and Linux names it `Super`. Keys named by
a word (Shift, Space, Home, End, Page Up, Page Down, Esc) come from Paraglide,
so French shows Maj, Espace, Début, Fin, Pg. préc., Pg. suiv., and Échap. Help
lists the Note shortcuts (`CmdOrCtrl+C`, `CmdOrCtrl+S`, Home/End,
PageUp/PageDown, Escape) under a Notes subheading; any new shortcut joins Help and this contract in the
same change. Standard editing keys local to one field or dialog
(`Shift+Enter` in the composer, undo and redo in the drawing dialog) are
exempt from Help and listed only here. Help opens focused on its own surface
at the top and scrolls within a 400 by 480 shelf.

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
`.98-.985` for Tooltips, menus, Popovers, the Select list, and dialogs,
entering over 160ms and leaving along the same path over 110ms (under reduced
motion, an opacity fade with the same easing that enters over 120ms and leaves
over 100ms); the status check and the copy
confirmation icon swap use opacity plus scale `.9`→`1` over 120 ms and leave
the way they arrived, are instant for keyboard input,
and become opacity-only under reduced motion; the captured-Note row tint,
which appears at once and fades its opacity over the surface duration
(ADR 0020); and the editor content's
critically damped transform-and-opacity transition. The row height changes
instantaneously by design so frequent pointer and keyboard expansion never waits
on layout motion. Editor content
uses the same path to expand and collapse, remains reversible at every point,
and reduced motion replaces its scale with a crossfade or static swap.

Reject list entrance and search-result motion, status-filter chrome, row
lift, hover shadow, parallax, bounce, painted gradients (the Note list
scroll-edge mask of ADR 0022 excepted), grain, composer-focus animation, fixed
gesture timelines, and animation input locks. The virtual
`<li>` remains the sole owner of Y translation; any row/editor motion belongs
to its nested surface. Virtualization keeps a stable visual placeholder while
the expanded surface owns focus.

Preferences and Markdown help use fully opaque semantic surfaces in both themes.
The Note list and confirmation dialogs reserve no empty scrollbar gutter.
Where the Note list clips content against search or the composer, that edge
alone fades the rows into the canvas through an alpha mask that paints no
colour, 0.75rem deep at the top and 1rem at the bottom (ADR 0022). A list at
rest at either end, or one that fits, shows no fade on that edge; the fade is
never animated, keyboard navigation keeps focused rows clear of it, and it is
removed under increased contrast and reduced transparency.
Dialog content and footer own their spacing; the footer spans the entire inner
width even with classic Windows scrollbars.

Only transform and opacity animate spatially; paint-only colour transitions on
the direct motion tokens are allowed for feedback states (ADR 0020).
Translucency is limited to transient
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
counts, import progress, copy success, captured Notes, and deletion result are
announced without exposing content in diagnostics. The search result count is
announced once, 300 ms after the query or Tag filter settles; only a query or
Tag change restarts it, so a Note added or deleted meanwhile keeps its own
announcement.

Any new motion is reviewed at normal speed, in slow motion, and while reversed
mid-animation. The review confirms pointer/key-down feedback, input during
settling, focus restoration, crossfade/static reduced-motion behavior, and no
layout clipping with large French text.

### Shared control polish

Lavender remains `#8f8be8`; primary controls use the semantic action, hover, and
pressed roles rather than opacity mixtures. Compact buttons and toggle items use
the 8px control radius; fields retain 12px. Tabs and pressed toggles use the
same selection surface/border/text roles and a distinct two-pixel focus ring.
Fine-pointer hover keeps three distinct levels: a quiet row surface, a clearer
control surface, and an explicit destructive surface. Active tabs and toggles
retain their selected surface when hovered, while coarse pointers expose direct
actions without sticky hover styling. Note surfaces have a quiet separator
border, with the selection border on the expanded editor. Disabled fields use
the inset surface and muted text.

Tooltips follow one rule. Every icon-only control shows a Tooltip whose text is
its short action label (its accessible name without the Note title or file name
already visible beside it), on fine-pointer hover after the provider delay and
on keyboard focus. Controls with visible text get no Tooltip, except text that
CSS truncates (Tag chips, Attachment names), whose Tooltip shows the full text;
a Tag chip names its action, "Show notes tagged" followed by the Tag. Dismiss-only
"X" controls that close or clear the surface they sit in and change no Note data
are exempt: editor Close, search clear, Tag filter clear, folder-error dismiss,
and toast close. Tag removal and Attachment removal change data and keep their
Tooltips. A Tooltip never holds the only copy of information: longer
explanations use an info toggletip, a Popover that opens on hover, click, tap,
Enter, or Space and closes with Escape, returning focus to its trigger.
Tooltips never take focus and never block typing or Escape: the Escape that
dismisses a Tooltip still reaches the surface behind it, so one press also
closes Preferences, the editor, or a dialog. A Tooltip closes when its trigger
opens a Popover, and a disabled control shows none. Coarse pointers rely on
visible controls and accessible names. Native `title` attributes are not used.
