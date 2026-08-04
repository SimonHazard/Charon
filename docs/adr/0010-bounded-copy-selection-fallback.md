# ADR 0010: Bounded synthetic Copy fallback for selected-text capture

## Status

Accepted for v1. This ADR supersedes the no-clipboard and no-synthetic-Copy
portions of ADRs 0002, 0006, 0008, and 0009 only for the explicit selected-text
capture transaction defined below. Their bans on automatic paste, arbitrary
input injection, clipboard monitoring, private APIs, OCR, and source-focus
changes remain active.

## Context

Physical Plan 007 testing proved that the public Accessibility ladder in ADR
0009 is useful but insufficient as the only acquisition path. It can read
editable AppKit and browser-chrome selections, yet static Chromium/Electron
content such as Chrome pages and Codex may not publish a usable selection
through the bounded public AX candidates even though the application's normal
Copy command can produce the selected text.

Further permissions, a deeper unbounded Accessibility scan, or a move from
Tauri to Electron would not change that source-application behavior. A native
application can instead ask the foreground application to perform its ordinary
Copy command, then read the resulting general pasteboard. Tin demonstrates this
public AppKit/Core Graphics technique by snapshotting the pasteboard, posting
Command-C, reading the new string, and restoring the snapshot. This technique
uses no private API, but it is more invasive than direct AX access: selected
content exists transiently on the global pasteboard, clipboard managers may
observe it, and careless restoration can overwrite a concurrent user copy.

Broad capture from Chrome, Codex, and comparable applications is a core product
requirement. The product therefore accepts a narrowly bounded, disclosed Copy
fallback while retaining direct Accessibility access as the first choice.

## Decision

An unmodified double-Shift sequence is an explicit user capture action. On
macOS, `CaptureCoordinator` first attempts ADR 0009's bounded public
Accessibility ladder. Only when that returns no usable text may the macOS
adapter execute one capture-specific synthetic Copy transaction against the
unchanged foreground source application.

The transaction must satisfy all of these invariants:

1. It is single-flight and begins only after a valid completed capture gesture,
   confirmed Input Monitoring and Accessibility consent, and a failed direct-AX
   acquisition. It never runs on launch, on a timer, from clipboard changes, or
   for Command-double-Shift.
2. It fails closed before posting input when the current candidate is a secure
   text control, the source application or foreground identity changed, or the
   existing pasteboard cannot be snapshotted completely within documented item,
   byte, and time bounds.
3. It snapshots the general pasteboard's change count and every materializable
   item/type in memory, then rechecks the change count and source identity before
   posting exactly one public Command-C key-down/key-up pair. It never posts
   Paste, changes focus, activates Charon, suppresses source events, or sends any
   other key.
4. It waits for a new pasteboard change count for a documented bounded timeout.
   A timeout, unchanged count, unsupported payload, empty/whitespace string, or
   source change creates no note. It never treats the pre-existing clipboard
   string as a selection.
5. It reads only the new text representation needed for the note. The exact
   selected body is retained; trimming is used only to reject empty content.
   Captured text and pasteboard payloads never enter logs, errors, diagnostics,
   disk caches, telemetry, or IPC except the existing typed create-note action.
6. It restores the complete snapshot only while the pasteboard still has the
   exact transaction-owned change count. If any later or concurrent write is
   observed, restoration is skipped so Charon never overwrites newer clipboard
   data. Restoration failure is a typed, content-free warning and is never
   reported as successful restoration.
7. Temporary pasteboard values and snapshots are released after the bounded
   attempt. Charon never monitors clipboard history or keeps a background
   clipboard reader.

The snapshot limits, timeout, stability check, transaction-owned change-count
rules, and restoration outcomes are constants with deterministic unit tests.
The physical acceptance matrix includes pre-existing text and rich/multi-item
pasteboards, unchanged Copy, slow Copy, a concurrent clipboard write, clipboard
manager observation, secure text, and source-focus preservation.

This capture-specific pasteboard adapter belongs to `CaptureCoordinator`.
`ClipboardComposer` remains the separate deep module for deterministic
CopyPreset formatting and explicit user-requested writes; it does not acquire
external selections or grow clipboard-history APIs.

Permission and privacy copy must say plainly that Accessibility lets Charon read
accessible selections and, when necessary, invoke the source application's Copy
command. It must disclose that selected text may appear briefly on the system
clipboard and may be visible to installed clipboard managers before Charon
restores the previous contents when safe.

Linux and Windows do not inherit a support claim from this macOS decision.
Their native accessibility, input-injection, clipboard, focus, and signed-build
behavior require separate adapters and physical evidence under ADR 0002. Tauri
remains the application shell because the fallback is a native adapter concern,
not a framework limitation.

## Consequences

- Static Chrome and Codex selections can be captured through their own normal
  Copy behavior when direct Accessibility access returns no usable text.
- The user keeps the source application focused and Charon still creates at
  most one normal Workspace note per gesture.
- Accessibility permission now authorizes both reading public AX selection data
  and the one disclosed synthetic Copy fallback; this broader capability must
  be explained honestly.
- Selected content can be observed transiently by the operating system and
  clipboard managers. Charon cannot truthfully promise that the fallback leaves
  no system-wide trace outside its own storage.
- Conditional restoration avoids overwriting a newer clipboard write, but in a
  race or restoration failure the clipboard may remain changed. The next
  visible Charon session must expose a content-free warning without revealing
  the captured value.
- Applications that block Copy, secure/protected fields, unsupported pasteboard
  states, and failed safety checks remain no-ops.
- No Electron migration, helper process, private API, screen capture, OCR, or
  broader Accessibility-tree scan is required.

## Revisit when

Revisit if Apple provides a documented cross-application selected-text API,
macOS changes synthetic Copy or pasteboard permission behavior, physical tests
show clipboard restoration can lose data, or user research rejects the
transient-pasteboard disclosure. Any replacement must preserve explicit intent,
single-flight execution, focus, content-free diagnostics, and the no-automatic-
paste guarantee.
