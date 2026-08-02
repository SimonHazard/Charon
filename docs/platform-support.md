# Platform capture support

This document is the evidence ledger for ADRs 0002, 0006, 0008, 0009, and
0010. A capability is `supported` only after the exact final build passes its
complete physical matrix. Runtime capability reporting remains authoritative.

## Current support state

| Platform | Standard editor reveal | Modifier gestures | Selected-text acquisition | Product status |
| --- | --- | --- | --- | --- |
| macOS 14+ | Implemented; final-build smoke pending | Native passive double-Shift listener implemented; corrected false-positive matrix pending | AX-first hybrid adapter is IN PROGRESS. Direct AX is partially proved; bounded Copy fallback from ADR 0010 is planned but not yet implemented or physically accepted. | Main Notes input and default Workspace are usable. Do not advertise global selected-text capture yet. |
| Linux X11 | Pinned Tauri implementation compiles; no physical X11 evidence | Not implemented | Not implemented | Main Notes input and in-app editor command only; global claims unproved. |
| Linux Wayland | Compositor/portal dependent; no local evidence | No universal modifier-only protocol accepted | Not implemented | Main Notes input and in-app editor command only. |
| Windows | Pinned Tauri implementation compiles; no signed Windows evidence | Not implemented | Not implemented | Main Notes input and in-app editor command only; global claims unproved. |

The macOS fallback does not create a Linux or Windows support claim. Each target
needs its own accessibility, input, clipboard, focus, permission, and signed-
build evidence before promotion.

## macOS evidence collected during Plan 007

Environment first recorded on 2026-07-31 and retested on 2026-08-03:

- macOS 26.5 (25F71), arm64;
- Tauri CLI 2.11.4 and Rust crate 2.11.5;
- bundle identifier `dev.charon.app`;
- explicitly ad-hoc signed debug bundle;
- previously recorded executable SHA-256
  `3ebc05d79ae0cde5acdbaa7c035dc7430c75de771dacadfb64925c1115044b73`.

That hash identifies an intermediate build only. It is not evidence for ADR
0010 and must be replaced after the final hybrid implementation is built.

### Permission and gesture findings

- Accessibility alone did not allow the passive modifier listener. ADR 0008
  corrected the model: `CGPreflightListenEventAccess`/
  `CGRequestListenEventAccess` gate Input Monitoring, while
  `AXIsProcessTrusted`/`AXIsProcessTrustedWithOptions` separately gate selected-
  text acquisition.
- TCC logs for the corrected bundle showed both capabilities authorized. Further
  broad permission resets did not make static Chrome or Codex selection appear
  through Accessibility and are not an accepted compatibility strategy.
- Command held throughout double Shift physically revealed Charon's main editor.
- Direct AX acquisition physically worked in TextEdit/AppKit and the editable
  Chrome URL field.
- Static selected text in a Chrome page and selected Codex conversation text did
  not create a note through the public AX ladder. Increasing the parent walk
  from 32 to 128 and adding pointer hit-testing did not make those cases pass.
- The accepted response is ADR 0010's bounded synthetic source Copy transaction,
  not a deeper tree scan, a private API, another TCC permission, Electron, or a
  privileged helper.

### Acquisition decision

The final macOS adapter must:

1. try ADR 0009's bounded public Accessibility ladder first;
2. only after a no-selection result, snapshot the complete current pasteboard
   within Plan 007's bounds;
3. post one public Command-C to the unchanged foreground application;
4. read only a newly produced text value within the bounded timeout;
5. restore the snapshot only while the pasteboard still has the transaction-
   owned change count;
6. skip restoration rather than overwrite a concurrent clipboard write;
7. never post Paste, monitor clipboard history, log content, or steal focus.

The transient clipboard value may be visible to an installed clipboard manager.
That limitation is disclosed in `docs/PRIVACY.md` and is part of the release
acceptance, not something the implementation can guarantee away.

## Final macOS acceptance matrix

All rows below must be rerun against one final debug bundle after ADR 0010 is
implemented. Replace `Pending` with a dated result, acquisition path, build
identifier/hash, and clipboard/focus outcome. A failure blocks Plan 007.

| Case | Result |
| --- | --- |
| Fresh launch opens or safely creates the visible default Workspace | Passed on intermediate build; rerun final build |
| Portable accelerator reveals the main empty editor from another app | Pending final build |
| Command-double-Shift reveals one empty editor and creates no note | Passed on intermediate build; rerun final build |
| False-positive gestures do not trigger | Pure tests pass; physical final build pending |
| Empty selection creates nothing | Pending final build |
| TextEdit/AppKit selection creates one note through direct AX and leaves clipboard unchanged | Direct AX passed on intermediate build; rerun final build |
| Chrome URL field creates one note through direct AX | Direct AX passed on intermediate build; rerun final build |
| Static Chrome page selection creates one note through bounded Copy, preserves focus, restores text clipboard | Pending implementation |
| Codex conversation selection creates one note through bounded Copy, preserves focus, restores clipboard | Pending implementation |
| Safari/WebKit static text | Pending final build |
| VS Code/Cursor editor text when installed | Pending final build |
| Preview PDF text | Pending final build |
| Rich/multi-item pasteboard restores exactly | Pending implementation |
| Concurrent clipboard write is never overwritten | Pending implementation |
| Unchanged, blocked, or slow Copy creates nothing safely | Pending implementation |
| Secure field and canvas-only source create nothing | Pending implementation |
| Manual Notes input creates one note and preserves failure text | UI tests pass; physical final build pending |
| Restart registers one listener, worker, and accelerator | Coordinator tests partial; physical final build pending |

Ad-hoc debug evidence is development-only. Plan 012 must repeat the same matrix
on the stable Developer ID signed and notarized artifact before the macOS feature
is advertised as release-supported.

## References

- [ADR 0010](adr/0010-bounded-copy-selection-fallback.md)
- [Tin SelectionCapture.swift](https://github.com/enzofrasca/tin/blob/main/Tin/Services/SelectionCapture.swift)
- [Apple Input Monitoring request API](https://developer.apple.com/documentation/coregraphics/cgrequestlisteneventaccess())
- [Apple Accessibility trust API](https://developer.apple.com/documentation/applicationservices/1459186-axisprocesstrustedwithoptions)
- [Apple NSPasteboard changeCount](https://developer.apple.com/documentation/appkit/nspasteboard/changecount)
- [Apple CGEvent posting](https://developer.apple.com/documentation/coregraphics/cgevent/post(tap:))
- [Tauri global shortcut plugin](https://v2.tauri.app/plugin/global-shortcut/)
- [Tauri macOS code signing](https://v2.tauri.app/distribute/sign/macos/)
