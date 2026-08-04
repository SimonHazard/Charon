# ADR 0009: Public Accessibility selection acquisition on macOS

## Status

Accepted for v1 as the primary macOS acquisition path. ADR 0010 supersedes this
ADR's prohibition on clipboard reads and synthetic Copy only for its bounded,
explicit fallback after this public Accessibility ladder returns no usable text.

## Context

Plan 007 physical testing proved that `AXSelectedText` on only the focused UI
element is too narrow. It works for an editable AppKit control such as TextEdit,
but static selections in WebKit and Chromium/Electron can be represented as a
text-marker range on an accessible ancestor. PDF and editor applications may
similarly expose a standard range or attach the selection to a window or
application ancestor rather than the focused leaf. Physical Chromium testing
showed that increasing the original 32-element parent walk to 128 still did not
make static page selection reliable even though editable browser chrome
succeeded directly. ADR 0010 now handles that gap without widening the
Accessibility scan further.

Apple's public macOS SDK declares `AXTextMarkerRef`, `AXTextMarkerRangeRef`,
`kAXSelectedTextMarkerRangeAttribute`, and
`kAXStringForTextMarkerRangeParameterizedAttribute` in `AXUIElement.h` and
`AXWebConstants.h`. Chromium's Cocoa accessibility adapter implements these
public attributes. Supporting them does not require a private selector,
reverse-engineering marker bytes, clipboard access, synthetic input, OCR, or
screen capture.

No general Accessibility API can extract a selection that the source surface
does not publish through its accessibility tree. Canvas-only, protected,
custom, or malformed surfaces therefore fail this primary path. ADR 0010
permits one bounded synthetic Copy attempt only when the foreground source's
ordinary Copy command may still expose the explicit user selection.

## Decision

On an authorized macOS capture gesture, the native adapter never changes source
focus. It first builds a bounded, cycle-safe candidate sequence from the
foreground focused UI element and its `AXParent` chain. If those candidates do
not expose a selection, it also considers the topmost public Accessibility
element at the current pointer and its `AXParent` chain, followed by the focused
window and focused application. Each origin is limited to 32 elements, for at
most 66 candidates. The bound remains a linear parent-only walk; it does not
enumerate children or widen the explicit focused/pointer source targets. The
Copy fallback in ADR 0010 replaces further depth increases as the compatibility
strategy.

Pointer hit-testing uses the public SDK-declared
`AXUIElementCopyElementAtPosition` on the system-wide element because
Chromium/Electron accessibility proxies do not reliably preserve a usable
application PID or return the pointed static-text element when the query is
scoped directly to their application element. The pointer location is an
explicit source target supplied by the user's completed capture gesture; the
returned topmost element may therefore belong to an application other than the
keyboard-focused one. Charon performs exactly one hit-test and a bounded parent
walk. It never enumerates applications or windows, recursively enumerates
descendants, or scans background accessibility trees.

For every candidate, the adapter attempts these public representations in order:

1. `AXSelectedText`;
2. `AXSelectedTextRange` passed to `AXStringForRange`;
3. `AXSelectedTextMarkerRange` passed to
   `AXStringForTextMarkerRange`.

The first non-empty string is returned exactly as exposed; trimming is used only
to decide whether it is empty. Unsupported attributes, AX errors, wrong Core
Foundation types, malformed ranges, whitespace-only values, and exhausted
candidates produce no capture action. Permission denial remains a distinct typed
capability state.

The Accessibility implementation uses only symbols and attribute constants
declared by the installed public SDK. It must not itself read, replace, or
restore the clipboard; suppress or synthesize keyboard events; construct or
decode opaque text-marker bytes; use private or dynamically discovered
selectors; perform OCR or screen capture; or maintain bundle-identifier-specific
extraction rules. The separate capture-specific Copy transaction is governed
exclusively by ADR 0010 and runs only after this ladder fails.

Product copy describes the feature as capturing the current selection from
applications that expose it through macOS Accessibility. Compatibility is
proved by application-family smoke tests covering AppKit, WebKit,
Chromium/Electron, code editors, and PDF text, plus a negative inaccessible-
surface case. A passing debug build is development evidence only; release
support requires the same matrix on the stable signed bundle identity.

## Consequences

- Charon covers native editable fields and the public representations commonly
  used by web engines, editors, and PDF applications without using the clipboard.
- Compatibility follows accessible behavior rather than hard-coded application
  identities, so another conforming application needs no product-specific rule.
- Bounded ancestor traversal prevents cycles and unbounded accessibility-tree
  work on the global shortcut path.
- Public pointer hit-testing reaches mouse-selected static text without moving
  the pointer, changing focus, or scanning the focused window's descendants.
- Chromium/Electron accessibility proxies remain eligible even when their
  reported process identity cannot be related reliably to the foreground app.
- The explicit pointer fallback may read the selection exposed by the topmost
  accessible element under the pointer, but it cannot discover or scan any
  other background content.
- A source that exposes no accessible selection proceeds only to ADR 0010's
  bounded Copy fallback. If that fallback is unsafe or unsuccessful, capture is
  a silent no-op and source focus remains unchanged.
- Documentation and release claims must distinguish broad public-API coverage
  from impossible extraction of inaccessible or protected content.

## Revisit when

Revisit if Apple removes or replaces a public attribute, a rendering engine
publishes selection through another documented representation, or physical
evidence shows the bounded candidate order is insufficient. Accessibility-path
expansion still requires a public SDK contract, content-free errors, no source
mutation, and the full privacy and signed-build matrix; capture-specific Copy
behavior remains isolated under ADR 0010.
