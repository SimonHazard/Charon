//! Files dropped on or pasted into Charon (ADR 0032).
//!
//! An application-layer adapter beside the native file picker: the operating
//! system hands Rust the file paths of a drop or of the clipboard, Rust names
//! each one by the same opaque single-use token the picker uses, and React
//! imports them through the unchanged `importNoteAttachments` command. The
//! webview never receives a path; it gets display names only. A pasted image
//! that is not a file is written once as PNG to a private temporary folder,
//! imported like any picked file, and deleted when its import ends or its
//! token expires.

use std::collections::HashMap;
use std::fs;
use std::io::BufWriter;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, Instant};

use tauri::{AppHandle, DragDropEvent, Emitter, Manager, State, Window};

use super::workspace::{
    discard_attachment_sources, register_attachment_sources, WorkspaceRuntime, PICKED_SOURCE_TTL,
};
use crate::workspace::{
    AttachmentDragEvent, AttachmentDropEvent, AttachmentSources, WorkspaceIpcError,
    MAX_ATTACHMENT_BYTES,
};

/// Emitted to the main webview while files are dragged over it.
const DRAG_EVENT: &str = "attachments://drag";
/// Emitted to the main webview when files are dropped on it.
const DROP_EVENT: &str = "attachments://drop";
/// The private folder, under the system temporary directory, that holds a
/// pasted image only until its import ends.
const TEMPORARY_FOLDER: &str = "charon-pasted";
/// The largest pasted bitmap Charon encodes (RGBA bytes), well above a 6K
/// screenshot and far below the memory a hostile clipboard could claim.
const MAX_PASTED_PIXELS_BYTES: usize = 256 * 1024 * 1024;

#[derive(Default)]
pub struct AttachmentIntakeRuntime {
    temporaries: Mutex<Temporaries>,
}

/// Temporary PNG copies of pasted images, each with the moment its token
/// expires. Only paths recorded here are ever deleted.
#[derive(Default)]
struct Temporaries(HashMap<PathBuf, Instant>);

impl Temporaries {
    fn insert(&mut self, path: PathBuf, expires_at: Instant) {
        self.0.insert(path, expires_at);
    }

    /// Forgets the recorded copies among `paths` and returns them for deletion.
    fn release<'a>(&mut self, paths: impl IntoIterator<Item = &'a str>) -> Vec<PathBuf> {
        paths
            .into_iter()
            .map(PathBuf::from)
            .filter(|path| self.0.remove(path).is_some())
            .collect()
    }

    /// Forgets the copies whose token expired by `now` and returns them.
    fn take_expired(&mut self, now: Instant) -> Vec<PathBuf> {
        let expired = self
            .0
            .iter()
            .filter(|(_, expires_at)| **expires_at <= now)
            .map(|(path, _)| path.clone())
            .collect::<Vec<_>>();
        for path in &expired {
            self.0.remove(path);
        }
        expired
    }
}

/// How long after its token expires an unused copy is deleted.
const EXPIRY_MARGIN: Duration = Duration::from_secs(1);

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

fn intake_error(code: &str) -> WorkspaceIpcError {
    WorkspaceIpcError {
        code: code.to_owned(),
        message_key: format!("workspace_error_{code}"),
        expected_revision: None,
        actual_revision: None,
        recovery_location: None,
    }
}

/// The name React may show for one file: its basename without control
/// characters. The import validates the real name again.
fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or_default()
        .chars()
        .filter(|character| !character.is_control())
        .collect()
}

fn sources_for(
    runtime: &WorkspaceRuntime,
    paths: Vec<PathBuf>,
) -> Result<AttachmentSources, WorkspaceIpcError> {
    let file_names = paths.iter().map(|path| display_name(path)).collect();
    let tokens = register_attachment_sources(runtime, paths, PICKED_SOURCE_TTL)?;
    Ok(AttachmentSources { tokens, file_names })
}

/// Reads the files, or else the bitmap, an explicit paste put on the
/// clipboard and names them by tokens. Nothing to paste is an empty result,
/// never an error; text stays with the webview's own paste.
#[tauri::command(async)]
pub fn workspace_paste_attachments(
    app: AppHandle,
    runtime: State<'_, WorkspaceRuntime>,
) -> Result<AttachmentSources, WorkspaceIpcError> {
    let mut clipboard = arboard::Clipboard::new().map_err(|_| intake_error("paste_unavailable"))?;
    let files = clipboard
        .get()
        .file_list()
        .unwrap_or_default()
        .into_iter()
        .filter(|path| path.is_absolute())
        .collect::<Vec<_>>();
    if !files.is_empty() {
        return sources_for(&runtime, files);
    }
    let Ok(image) = clipboard.get_image() else {
        return Ok(AttachmentSources::default());
    };
    let path = write_temporary_png(&app, image.width, image.height, &image.bytes)?;
    sources_for(&runtime, vec![path])
}

/// Mirrors a native file drag over the main window to its webview, in CSS
/// pixels, and turns a drop into tokens. Runs on the main thread from
/// `WindowEvent::DragDrop`.
pub fn handle_drag_drop(window: &Window, event: &DragDropEvent) {
    let scale = window.scale_factor().unwrap_or(1.0);
    match event {
        DragDropEvent::Enter { position, .. } | DragDropEvent::Over { position } => {
            let _ = window.emit(
                DRAG_EVENT,
                AttachmentDragEvent {
                    over: true,
                    x: position.x / scale,
                    y: position.y / scale,
                },
            );
        }
        DragDropEvent::Leave => {
            let _ = window.emit(
                DRAG_EVENT,
                AttachmentDragEvent {
                    over: false,
                    x: 0.0,
                    y: 0.0,
                },
            );
        }
        DragDropEvent::Drop { paths, position } => {
            let _ = window.emit(
                DRAG_EVENT,
                AttachmentDragEvent {
                    over: false,
                    x: 0.0,
                    y: 0.0,
                },
            );
            let paths = paths
                .iter()
                .filter(|path| path.is_absolute())
                .cloned()
                .collect::<Vec<_>>();
            if paths.is_empty() {
                return;
            }
            let runtime = window.app_handle().state::<WorkspaceRuntime>();
            if let Ok(sources) = sources_for(&runtime, paths) {
                let _ = window.emit(
                    DROP_EVENT,
                    AttachmentDropEvent {
                        sources,
                        x: position.x / scale,
                        y: position.y / scale,
                    },
                );
            }
        }
        _ => {}
    }
}

fn temporary_folder() -> PathBuf {
    std::env::temp_dir().join(TEMPORARY_FOLDER)
}

/// Writes one pasted RGBA bitmap as PNG into the private temporary folder and
/// remembers it until its import ends or its token expires.
fn write_temporary_png(
    app: &AppHandle,
    width: usize,
    height: usize,
    rgba: &[u8],
) -> Result<PathBuf, WorkspaceIpcError> {
    let expected = width
        .checked_mul(height)
        .and_then(|pixels| pixels.checked_mul(4))
        .filter(|&bytes| bytes > 0 && bytes <= MAX_PASTED_PIXELS_BYTES)
        .ok_or_else(|| intake_error("paste_too_large"))?;
    if rgba.len() != expected {
        return Err(intake_error("paste_unavailable"));
    }
    let (Ok(width), Ok(height)) = (u32::try_from(width), u32::try_from(height)) else {
        return Err(intake_error("paste_too_large"));
    };
    purge_expired(app);
    let folder = temporary_folder();
    create_private_folder(&folder).map_err(|_| intake_error("paste_unavailable"))?;
    let path = folder.join(format!(
        "pasted-image-{}.png",
        uuid::Uuid::new_v4().simple()
    ));
    let written = encode_png(&path, width, height, rgba);
    let too_large = fs::metadata(&path)
        .map(|metadata| metadata.len() > MAX_ATTACHMENT_BYTES)
        .unwrap_or(true);
    if written.is_err() || too_large {
        let _ = fs::remove_file(&path);
        return Err(intake_error(if too_large && written.is_ok() {
            "paste_too_large"
        } else {
            "paste_unavailable"
        }));
    }
    lock(&app.state::<AttachmentIntakeRuntime>().temporaries)
        .insert(path.clone(), Instant::now() + PICKED_SOURCE_TTL);
    schedule_expiry(app);
    Ok(path)
}

/// Deletes the copy, if it is still unused, as soon as its token expires.
fn schedule_expiry(app: &AppHandle) {
    let app = app.clone();
    let _ = thread::Builder::new()
        .name("charon-pasted-expiry".to_owned())
        .spawn(move || {
            thread::sleep(PICKED_SOURCE_TTL + EXPIRY_MARGIN);
            purge_expired(&app);
        });
}

/// Forgets tokens React will not import (a refused drop or paste, or a Note
/// that could not be created) and deletes their temporary copies at once.
#[tauri::command(async)]
pub fn workspace_discard_attachment_sources(
    app: AppHandle,
    runtime: State<'_, WorkspaceRuntime>,
    tokens: Vec<String>,
) -> Result<(), WorkspaceIpcError> {
    let paths = discard_attachment_sources(&runtime, &tokens)?;
    release_temporaries(&app, &paths);
    Ok(())
}

fn encode_png(path: &Path, width: u32, height: u32, rgba: &[u8]) -> std::io::Result<()> {
    let file = create_private_file(path)?;
    let mut encoder = png::Encoder::new(BufWriter::new(file), width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(std::io::Error::other)?;
    writer
        .write_image_data(rgba)
        .map_err(std::io::Error::other)?;
    writer.finish().map_err(std::io::Error::other)
}

#[cfg(unix)]
fn create_private_folder(folder: &Path) -> std::io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;
    match fs::DirBuilder::new().mode(0o700).create(folder) {
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => Ok(()),
        result => result,
    }
}

#[cfg(not(unix))]
fn create_private_folder(folder: &Path) -> std::io::Result<()> {
    fs::create_dir_all(folder)
}

#[cfg(unix)]
fn create_private_file(path: &Path) -> std::io::Result<fs::File> {
    use std::os::unix::fs::OpenOptionsExt;
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
}

#[cfg(not(unix))]
fn create_private_file(path: &Path) -> std::io::Result<fs::File> {
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)
}

/// Deletes the temporary copies among the source paths an import consumed.
/// Other paths are the user's own files and are never touched.
pub fn release_temporaries(app: &AppHandle, consumed: &[String]) {
    if consumed.is_empty() {
        return;
    }
    let runtime = app.state::<AttachmentIntakeRuntime>();
    let released = lock(&runtime.temporaries).release(consumed.iter().map(String::as_str));
    for path in released {
        let _ = fs::remove_file(path);
    }
}

/// Deletes temporary copies whose token expired unused.
fn purge_expired(app: &AppHandle) {
    let runtime = app.state::<AttachmentIntakeRuntime>();
    let expired = lock(&runtime.temporaries).take_expired(Instant::now());
    for path in expired {
        let _ = fs::remove_file(path);
    }
}

/// Removes copies an earlier run left behind (a crash or a forced quit before
/// their import ended). Called once at startup, before any paste.
pub fn clear_leftovers() {
    let _ = fs::remove_dir_all(temporary_folder());
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_names_drop_control_characters_and_folders() {
        assert_eq!(
            display_name(Path::new("/Users/me/Desktop/brief.pdf")),
            "brief.pdf"
        );
        assert_eq!(
            display_name(Path::new("/tmp/odd\u{7}name.txt")),
            "oddname.txt"
        );
        assert_eq!(display_name(Path::new("/")), "");
    }

    #[test]
    fn only_recorded_copies_are_released_and_only_once() {
        let mut temporaries = Temporaries::default();
        let expires_at = Instant::now() + PICKED_SOURCE_TTL;
        temporaries.insert(PathBuf::from("/tmp/charon-pasted/a.png"), expires_at);
        let released = temporaries.release(["/tmp/charon-pasted/a.png", "/Users/me/brief.pdf"]);
        assert_eq!(released, [PathBuf::from("/tmp/charon-pasted/a.png")]);
        assert!(temporaries.release(["/tmp/charon-pasted/a.png"]).is_empty());
    }

    #[test]
    fn copies_expire_with_their_token() {
        let mut temporaries = Temporaries::default();
        let now = Instant::now();
        temporaries.insert(PathBuf::from("/tmp/charon-pasted/old.png"), now);
        temporaries.insert(
            PathBuf::from("/tmp/charon-pasted/new.png"),
            now + PICKED_SOURCE_TTL,
        );
        assert_eq!(
            temporaries.take_expired(now),
            [PathBuf::from("/tmp/charon-pasted/old.png")]
        );
        assert!(temporaries.take_expired(now).is_empty());
        assert_eq!(
            temporaries.take_expired(now + PICKED_SOURCE_TTL + EXPIRY_MARGIN),
            [PathBuf::from("/tmp/charon-pasted/new.png")]
        );
    }

    #[test]
    fn a_png_round_trips_with_private_permissions() {
        let folder = tempfile::tempdir().expect("folder");
        let path = folder.path().join("image.png");
        encode_png(&path, 2, 1, &[255, 0, 0, 255, 0, 0, 255, 255]).expect("encode");
        let bytes = fs::read(&path).expect("read");
        assert_eq!(&bytes[..8], b"\x89PNG\r\n\x1a\n");
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = fs::metadata(&path).expect("metadata").permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        // An existing file is never overwritten.
        assert!(encode_png(&path, 1, 1, &[0, 0, 0, 0]).is_err());
    }
}
