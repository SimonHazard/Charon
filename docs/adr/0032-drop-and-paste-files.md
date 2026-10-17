# ADR 0032: Dropped and pasted files become Attachments

## Status

Accepted on 2026-10-17 by operator decision. Amends the Attachment rules of
`AGENTS.md`, `docs/PRODUCT.md`, and `docs/UX.md`, which allowed only the
explicit file picker and rejected drag and drop. Every other Attachment rule is
unchanged.

## Context

Agent work produces files and screenshots that belong next to a prompt, but
Charon's Attachments came only from a native picker inside an open editor. The
picker's design still holds: Rust receives source paths, React gets single-use
tokens, and the Workspace import validates and copies a bounded regular file.

## Decision

1. **Drop.** Files dragged over the main window are marked where they would
   go; dropping them is an explicit gesture. Rust handles the native drop
   event, names each path by the picker's one-shot token, and sends only the
   tokens, display names, and drop point to the webview. The webview never
   subscribes to Tauri's own path-carrying drag event.
2. **Paste.** A paste whose clipboard holds files sends no text: React asks
   `workspace_paste_attachments`, and Rust reads the clipboard's file list
   (through `arboard`, already used by the official clipboard plugin) or, when
   there is none, its bitmap. A bitmap is written once as PNG to a private
   temporary folder (owner-only permissions on macOS and Linux), imported like
   a picked file, and deleted as soon as its import ends, as soon as it is
   refused or its Note cannot be created, or when its five-minute token
   expires, by a timer that does not wait for another paste; copies an earlier
   run left behind are removed at startup. Text keeps the native paste.
3. **Target.** A drop on a Note row, or a paste inside an open editor, adds the
   files to that Note. Anywhere else it creates one Note whose body is the
   file names, in the focused Tag (ADR 0030), and adds the files to it: the
   import names the exact id that `createNote` returns as `createdNoteId`,
   never one guessed from the snapshot. Drops and pastes run one at a time,
   creation and import together, so two quick ones never share a Note.
4. The existing `importNoteAttachments` command performs every import, so the
   limits (20 per Note, 100 MiB each), regular non-symlink sources outside
   every Workspace, collision handling, and transaction contract apply as
   before. More than 20 files are refused before anything is created. Tokens
   that will not be imported (refused, or whose Note could not be created or
   import failed) go back through `workspace_discard_attachment_sources`,
   which forgets them and deletes their temporary copies.
5. Charon still never previews, executes, uploads, or shares an Attachment,
   and React never reads Attachment bytes or source paths.

## Alternatives rejected

- **Reading pasted `File` objects in the webview**: React would read file
  bytes and invent names; the contract keeps bytes in Rust.
- **An Attachment queue on the composer**: rejected by the UX contract; the
  Note is created at once instead.

## Consequences

- A pasted screenshot exists briefly as a temporary file outside the
  Workspace. Charon deletes it after the import, on refusal, or at its
  token's expiry; operating-system snapshots
  and backups of the temporary folder are outside its guarantee, as for
  deleted Notes.
- Drop targets and the new-Note overlay are part of the motion and contrast
  review.

## Revisit when

Revisit if a platform's clipboard exposes file paths Charon cannot read, or if
image previews are proposed.
