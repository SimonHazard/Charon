use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};

use super::error::WorkspaceError;
use super::model::{validate_file_name, MAX_ATTACHMENT_BYTES};

pub(crate) struct ExternalFile {
    pub identity: String,
    pub file_name: String,
    pub extension: Option<String>,
    pub bytes: Vec<u8>,
}

pub(crate) trait WorkspaceStorage: Send + Sync {
    fn root(&self) -> Option<&Path>;
    fn create_dir_all(&self, relative: &str) -> Result<(), WorkspaceError>;
    fn read(&self, relative: &str) -> Result<Vec<u8>, WorkspaceError>;
    fn write_synced(&self, relative: &str, contents: &[u8]) -> Result<(), WorkspaceError>;
    fn rename(&self, from: &str, to: &str) -> Result<(), WorkspaceError>;
    fn remove_file(&self, relative: &str) -> Result<(), WorkspaceError>;
    fn remove_dir_all(&self, relative: &str) -> Result<(), WorkspaceError>;
    fn remove_dir_if_empty(&self, relative: &str) -> Result<(), WorkspaceError>;
    fn exists(&self, relative: &str) -> Result<bool, WorkspaceError>;
    fn list(&self, relative: &str) -> Result<Vec<String>, WorkspaceError>;
    fn sync_dir(&self, relative: &str) -> Result<(), WorkspaceError>;
    fn read_external_regular(&self, source: &str) -> Result<ExternalFile, WorkspaceError>;
    fn canonical_managed_path(&self, relative: &str) -> Result<String, WorkspaceError>;
}

pub(crate) struct RealWorkspaceStorage {
    root: PathBuf,
}

#[doc(hidden)]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StorageFailure {
    AttachmentOpen,
    AttachmentRead,
    AttachmentWrite,
    ShortCopy,
    Sync,
    Rename,
    Manifest,
    Cleanup,
}

pub(crate) struct FailingWorkspaceStorage {
    inner: RealWorkspaceStorage,
    failure: StorageFailure,
    fired: AtomicBool,
}

impl FailingWorkspaceStorage {
    pub(crate) fn new(inner: RealWorkspaceStorage, failure: StorageFailure) -> Self {
        Self {
            inner,
            failure,
            fired: AtomicBool::new(false),
        }
    }

    fn fail_once(&self, condition: bool) -> Result<(), WorkspaceError> {
        if condition && !self.fired.swap(true, Ordering::SeqCst) {
            return Err(WorkspaceError::Io(std::io::Error::new(
                std::io::ErrorKind::Interrupted,
                "injected Workspace storage interruption",
            )));
        }
        Ok(())
    }
}

impl RealWorkspaceStorage {
    pub(crate) fn create(root: &Path) -> Result<Self, WorkspaceError> {
        if root.as_os_str().is_empty() {
            return Err(WorkspaceError::InvalidPath);
        }
        fs::create_dir_all(root)?;
        let root = simplify_canonical(root).map_err(|_| WorkspaceError::InvalidPath)?;
        if !root.is_dir() {
            return Err(WorkspaceError::InvalidPath);
        }
        Ok(Self { root })
    }

    pub(crate) fn open(root: &Path) -> Result<Self, WorkspaceError> {
        let root = simplify_canonical(root).map_err(|_| WorkspaceError::InvalidPath)?;
        if !root.is_dir() {
            return Err(WorkspaceError::InvalidPath);
        }
        Ok(Self { root })
    }

    fn resolve(&self, relative: &str, allow_missing_leaf: bool) -> Result<PathBuf, WorkspaceError> {
        validate_relative(relative)?;
        let candidate = join_relative(&self.root, relative);
        let mut cursor = self.root.clone();
        for component in Path::new(relative).components() {
            cursor.push(component.as_os_str());
            match fs::symlink_metadata(&cursor) {
                Ok(metadata) => {
                    if metadata.file_type().is_symlink() {
                        return Err(WorkspaceError::InvalidPath);
                    }
                    let canonical = simplify_canonical(&cursor)?;
                    if !canonical.starts_with(&self.root) {
                        return Err(WorkspaceError::InvalidPath);
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
                Err(error) => return Err(error.into()),
            }
        }
        if candidate.exists() {
            let metadata = fs::symlink_metadata(&candidate)?;
            if metadata.file_type().is_symlink() {
                return Err(WorkspaceError::InvalidPath);
            }
            let canonical = simplify_canonical(&candidate)?;
            if !canonical.starts_with(&self.root) {
                return Err(WorkspaceError::InvalidPath);
            }
            return Ok(canonical);
        }
        if !allow_missing_leaf {
            return Ok(candidate);
        }

        let (parent, leaf) = split_relative_leaf(relative)?;
        let parent_path = parent.map_or_else(
            || self.root.clone(),
            |parent| join_relative(&self.root, parent),
        );
        let canonical_parent =
            simplify_canonical(&parent_path).map_err(|_| WorkspaceError::InvalidPath)?;
        if !canonical_parent.starts_with(&self.root) {
            return Err(WorkspaceError::InvalidPath);
        }
        Ok(canonical_parent.join(leaf))
    }
}

impl WorkspaceStorage for RealWorkspaceStorage {
    fn root(&self) -> Option<&Path> {
        Some(&self.root)
    }

    fn create_dir_all(&self, relative: &str) -> Result<(), WorkspaceError> {
        validate_relative(relative)?;
        let mut cursor = self.root.clone();
        for component in Path::new(relative).components() {
            let Component::Normal(part) = component else {
                return Err(WorkspaceError::InvalidPath);
            };
            cursor.push(part);
            if cursor.exists() {
                let metadata = fs::symlink_metadata(&cursor)?;
                if metadata.file_type().is_symlink() || !metadata.is_dir() {
                    return Err(WorkspaceError::InvalidPath);
                }
            } else {
                fs::create_dir(&cursor)?;
            }
        }
        let canonical = simplify_canonical(&cursor)?;
        if !canonical.starts_with(&self.root) {
            return Err(WorkspaceError::InvalidPath);
        }
        Ok(())
    }

    fn read(&self, relative: &str) -> Result<Vec<u8>, WorkspaceError> {
        let path = self.resolve(relative, false)?;
        let metadata = fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(WorkspaceError::InvalidPath);
        }
        fs::read(path).map_err(WorkspaceError::from)
    }

    fn write_synced(&self, relative: &str, contents: &[u8]) -> Result<(), WorkspaceError> {
        let path = self.resolve(relative, true)?;
        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(path)?;
        file.write_all(contents)?;
        file.flush()?;
        file.sync_all()?;
        Ok(())
    }

    fn rename(&self, from: &str, to: &str) -> Result<(), WorkspaceError> {
        let from = self.resolve(from, false)?;
        let to = self.resolve(to, true)?;
        if from.parent() != to.parent() {
            return Err(WorkspaceError::Validation(
                "atomic replacement paths must share a directory".to_owned(),
            ));
        }
        fs::rename(from, to)?;
        Ok(())
    }

    fn remove_file(&self, relative: &str) -> Result<(), WorkspaceError> {
        let path = self.resolve(relative, false)?;
        if path.exists() {
            fs::remove_file(path)?;
        }
        Ok(())
    }

    fn remove_dir_all(&self, relative: &str) -> Result<(), WorkspaceError> {
        let path = self.resolve(relative, false)?;
        if path != self.root && path.exists() {
            fs::remove_dir_all(path)?;
        }
        Ok(())
    }

    fn remove_dir_if_empty(&self, relative: &str) -> Result<(), WorkspaceError> {
        let path = self.resolve(relative, false)?;
        if path.exists() && fs::read_dir(&path)?.next().is_none() {
            fs::remove_dir(path)?;
        }
        Ok(())
    }

    fn exists(&self, relative: &str) -> Result<bool, WorkspaceError> {
        validate_relative(relative)?;
        let candidate = join_relative(&self.root, relative);
        if !candidate.exists() {
            return Ok(false);
        }
        self.resolve(relative, false).map(|_| true)
    }

    fn list(&self, relative: &str) -> Result<Vec<String>, WorkspaceError> {
        let path = self.resolve(relative, false)?;
        if !path.exists() {
            return Ok(Vec::new());
        }
        let mut result = Vec::new();
        for entry in fs::read_dir(path)? {
            let entry = entry?;
            let metadata = entry.file_type()?;
            if metadata.is_symlink() {
                return Err(WorkspaceError::InvalidPath);
            }
            let name = entry
                .file_name()
                .into_string()
                .map_err(|_| WorkspaceError::InvalidPath)?;
            result.push(name);
        }
        result.sort();
        Ok(result)
    }

    fn sync_dir(&self, relative: &str) -> Result<(), WorkspaceError> {
        let path = if relative.is_empty() {
            self.root.clone()
        } else {
            self.resolve(relative, false)?
        };
        #[cfg(unix)]
        File::open(path)?.sync_all()?;
        #[cfg(not(unix))]
        let _ = path;
        Ok(())
    }

    fn read_external_regular(&self, source: &str) -> Result<ExternalFile, WorkspaceError> {
        let source = Path::new(source);
        let symlink = fs::symlink_metadata(source)?;
        if symlink.file_type().is_symlink() || !symlink.is_file() {
            return Err(WorkspaceError::InvalidPath);
        }
        let canonical = simplify_canonical(source)?;
        if canonical.starts_with(&self.root) {
            return Err(WorkspaceError::InvalidPath);
        }
        for directory in canonical.ancestors().skip(1) {
            match fs::symlink_metadata(directory.join("charon.workspace.json")) {
                Ok(_) => return Err(WorkspaceError::InvalidPath),
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => return Err(error.into()),
            }
        }
        let before = fs::metadata(&canonical)?;
        if !before.is_file() || before.len() > MAX_ATTACHMENT_BYTES {
            return Err(WorkspaceError::Validation(
                "attachment source is not a bounded regular file".to_owned(),
            ));
        }
        let file_name = canonical
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or(WorkspaceError::InvalidPath)?
            .to_owned();
        validate_file_name(&file_name)?;
        let extension = safe_extension(&file_name);
        let mut file = File::open(&canonical)?;
        let mut bytes = Vec::with_capacity(usize::try_from(before.len()).unwrap_or_default());
        std::io::Read::by_ref(&mut file)
            .take(MAX_ATTACHMENT_BYTES + 1)
            .read_to_end(&mut bytes)?;
        let after = file.metadata()?;
        if bytes.len() as u64 != before.len()
            || bytes.len() as u64 > MAX_ATTACHMENT_BYTES
            || after.len() != before.len()
            || after.modified().ok() != before.modified().ok()
        {
            return Err(WorkspaceError::Validation(
                "attachment source changed while copying".to_owned(),
            ));
        }
        Ok(ExternalFile {
            identity: canonical.to_string_lossy().into_owned(),
            file_name,
            extension,
            bytes,
        })
    }

    fn canonical_managed_path(&self, relative: &str) -> Result<String, WorkspaceError> {
        let path = self.resolve(relative, false)?;
        let metadata = fs::symlink_metadata(&path)?;
        if metadata.file_type().is_symlink() || !metadata.is_file() {
            return Err(WorkspaceError::InvalidPath);
        }
        let canonical = simplify_canonical(&path)?;
        if !canonical.starts_with(&self.root) {
            return Err(WorkspaceError::InvalidPath);
        }
        safe_path_string(canonical)
    }
}

impl WorkspaceStorage for FailingWorkspaceStorage {
    fn root(&self) -> Option<&Path> {
        self.inner.root()
    }

    fn create_dir_all(&self, relative: &str) -> Result<(), WorkspaceError> {
        self.inner.create_dir_all(relative)
    }

    fn read(&self, relative: &str) -> Result<Vec<u8>, WorkspaceError> {
        self.inner.read(relative)
    }

    fn write_synced(&self, relative: &str, contents: &[u8]) -> Result<(), WorkspaceError> {
        self.fail_once(
            self.failure == StorageFailure::AttachmentWrite
                && relative.contains("/next/attachments/"),
        )?;
        self.inner.write_synced(relative, contents)
    }

    fn rename(&self, from: &str, to: &str) -> Result<(), WorkspaceError> {
        self.fail_once(
            (self.failure == StorageFailure::Rename && from.starts_with("attachments/"))
                || (self.failure == StorageFailure::Manifest && to == "charon.workspace.json"),
        )?;
        self.inner.rename(from, to)
    }

    fn remove_file(&self, relative: &str) -> Result<(), WorkspaceError> {
        self.inner.remove_file(relative)
    }

    fn remove_dir_all(&self, relative: &str) -> Result<(), WorkspaceError> {
        self.fail_once(
            self.failure == StorageFailure::Cleanup
                && relative.starts_with("backups/")
                && relative != "backups/migration-v1-v2",
        )?;
        self.inner.remove_dir_all(relative)
    }

    fn remove_dir_if_empty(&self, relative: &str) -> Result<(), WorkspaceError> {
        self.inner.remove_dir_if_empty(relative)
    }

    fn exists(&self, relative: &str) -> Result<bool, WorkspaceError> {
        self.inner.exists(relative)
    }

    fn list(&self, relative: &str) -> Result<Vec<String>, WorkspaceError> {
        self.inner.list(relative)
    }

    fn sync_dir(&self, relative: &str) -> Result<(), WorkspaceError> {
        self.fail_once(
            self.failure == StorageFailure::Sync
                && relative.starts_with("backups/")
                && relative != "backups/migration-v1-v2",
        )?;
        self.inner.sync_dir(relative)
    }

    fn read_external_regular(&self, source: &str) -> Result<ExternalFile, WorkspaceError> {
        self.fail_once(matches!(
            self.failure,
            StorageFailure::AttachmentOpen
                | StorageFailure::AttachmentRead
                | StorageFailure::ShortCopy
        ))?;
        self.inner.read_external_regular(source)
    }

    fn canonical_managed_path(&self, relative: &str) -> Result<String, WorkspaceError> {
        self.inner.canonical_managed_path(relative)
    }
}

#[derive(Clone, Default)]
pub(crate) struct MemoryWorkspaceStorage {
    inner: Arc<Mutex<MemoryState>>,
}

#[derive(Default)]
struct MemoryState {
    files: HashMap<String, Vec<u8>>,
    directories: HashSet<String>,
    external_files: HashMap<String, (String, Vec<u8>)>,
}

impl MemoryWorkspaceStorage {
    pub(crate) fn new() -> Self {
        let storage = Self::default();
        storage
            .inner
            .lock()
            .expect("memory storage lock")
            .directories
            .insert(String::new());
        storage
    }

    pub(crate) fn with_external_files(files: Vec<(String, String, Vec<u8>)>) -> Self {
        let storage = Self::new();
        storage
            .inner
            .lock()
            .expect("memory storage lock")
            .external_files
            .extend(
                files
                    .into_iter()
                    .map(|(identity, file_name, bytes)| (identity, (file_name, bytes))),
            );
        storage
    }
}

impl WorkspaceStorage for MemoryWorkspaceStorage {
    fn root(&self) -> Option<&Path> {
        None
    }

    fn create_dir_all(&self, relative: &str) -> Result<(), WorkspaceError> {
        validate_relative(relative)?;
        let mut state = self.inner.lock().expect("memory storage lock");
        let mut cursor = String::new();
        for part in relative.split('/').filter(|part| !part.is_empty()) {
            if !cursor.is_empty() {
                cursor.push('/');
            }
            cursor.push_str(part);
            state.directories.insert(cursor.clone());
        }
        Ok(())
    }

    fn read(&self, relative: &str) -> Result<Vec<u8>, WorkspaceError> {
        validate_relative(relative)?;
        self.inner
            .lock()
            .expect("memory storage lock")
            .files
            .get(relative)
            .cloned()
            .ok_or_else(|| WorkspaceError::Io(std::io::Error::from(std::io::ErrorKind::NotFound)))
    }

    fn write_synced(&self, relative: &str, contents: &[u8]) -> Result<(), WorkspaceError> {
        validate_relative(relative)?;
        let parent = split_relative_leaf(relative)?.0.unwrap_or_default();
        let mut state = self.inner.lock().expect("memory storage lock");
        if !state.directories.contains(parent) {
            return Err(WorkspaceError::Io(std::io::Error::from(
                std::io::ErrorKind::NotFound,
            )));
        }
        state.files.insert(relative.to_owned(), contents.to_vec());
        Ok(())
    }

    fn rename(&self, from: &str, to: &str) -> Result<(), WorkspaceError> {
        validate_relative(from)?;
        validate_relative(to)?;
        if Path::new(from).parent() != Path::new(to).parent() {
            return Err(WorkspaceError::Validation(
                "atomic replacement paths must share a directory".to_owned(),
            ));
        }
        let mut state = self.inner.lock().expect("memory storage lock");
        let contents = state.files.remove(from).ok_or_else(|| {
            WorkspaceError::Io(std::io::Error::from(std::io::ErrorKind::NotFound))
        })?;
        state.files.insert(to.to_owned(), contents);
        Ok(())
    }

    fn remove_file(&self, relative: &str) -> Result<(), WorkspaceError> {
        validate_relative(relative)?;
        self.inner
            .lock()
            .expect("memory storage lock")
            .files
            .remove(relative);
        Ok(())
    }

    fn remove_dir_all(&self, relative: &str) -> Result<(), WorkspaceError> {
        validate_relative(relative)?;
        let prefix = format!("{relative}/");
        let mut state = self.inner.lock().expect("memory storage lock");
        state
            .files
            .retain(|path, _| path != relative && !path.starts_with(&prefix));
        state
            .directories
            .retain(|path| path != relative && !path.starts_with(&prefix));
        Ok(())
    }

    fn remove_dir_if_empty(&self, relative: &str) -> Result<(), WorkspaceError> {
        validate_relative(relative)?;
        let prefix = format!("{relative}/");
        let mut state = self.inner.lock().expect("memory storage lock");
        if !state.files.keys().any(|path| path.starts_with(&prefix))
            && !state
                .directories
                .iter()
                .any(|path| path != relative && path.starts_with(&prefix))
        {
            state.directories.remove(relative);
        }
        Ok(())
    }

    fn exists(&self, relative: &str) -> Result<bool, WorkspaceError> {
        validate_relative(relative)?;
        let state = self.inner.lock().expect("memory storage lock");
        Ok(state.files.contains_key(relative) || state.directories.contains(relative))
    }

    fn list(&self, relative: &str) -> Result<Vec<String>, WorkspaceError> {
        validate_relative(relative)?;
        let prefix = if relative.is_empty() {
            String::new()
        } else {
            format!("{relative}/")
        };
        let state = self.inner.lock().expect("memory storage lock");
        let mut names = BTreeSet::new();
        for path in state.files.keys().chain(state.directories.iter()) {
            if let Some(remainder) = path.strip_prefix(&prefix) {
                if !remainder.is_empty() {
                    names.insert(remainder.split('/').next().unwrap_or_default().to_owned());
                }
            }
        }
        Ok(names.into_iter().collect())
    }

    fn sync_dir(&self, relative: &str) -> Result<(), WorkspaceError> {
        validate_relative(relative)?;
        Ok(())
    }

    fn read_external_regular(&self, source: &str) -> Result<ExternalFile, WorkspaceError> {
        let state = self.inner.lock().expect("memory storage lock");
        let (file_name, bytes) = state
            .external_files
            .get(source)
            .ok_or(WorkspaceError::InvalidPath)?;
        if bytes.len() as u64 > MAX_ATTACHMENT_BYTES {
            return Err(WorkspaceError::Validation(
                "attachment source is too large".to_owned(),
            ));
        }
        validate_file_name(file_name)?;
        Ok(ExternalFile {
            identity: source.to_owned(),
            file_name: file_name.clone(),
            extension: safe_extension(file_name),
            bytes: bytes.clone(),
        })
    }

    fn canonical_managed_path(&self, relative: &str) -> Result<String, WorkspaceError> {
        validate_relative(relative)?;
        if !self
            .inner
            .lock()
            .expect("memory storage lock")
            .files
            .contains_key(relative)
        {
            return Err(WorkspaceError::InvalidPath);
        }
        Ok(format!("/memory-workspace/{relative}"))
    }
}

fn safe_extension(file_name: &str) -> Option<String> {
    let extension = Path::new(file_name).extension()?.to_str()?;
    (!extension.is_empty()
        && extension.len() <= 16
        && extension.chars().all(|value| value.is_ascii_alphanumeric()))
    .then(|| extension.to_ascii_lowercase())
}

fn safe_path_string(path: PathBuf) -> Result<String, WorkspaceError> {
    let value = path
        .into_os_string()
        .into_string()
        .map_err(|_| WorkspaceError::InvalidPath)?;
    if value.chars().any(char::is_control) {
        return Err(WorkspaceError::InvalidPath);
    }
    Ok(value)
}

/// Strips the Windows verbatim prefix (`\\?\` or `\\?\UNC\`) from a path
/// string. Compiled and unit-tested on every platform (pure string logic);
/// a no-op for paths without the prefix.
pub(crate) fn strip_verbatim_prefix(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(rest) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{rest}"));
    }
    if let Some(rest) = text.strip_prefix(r"\\?\") {
        return PathBuf::from(rest);
    }
    path.to_path_buf()
}

/// Canonicalizes, then applies `strip_verbatim_prefix`, so results can be
/// joined with `/`-relative paths and shown to users on every platform.
pub(crate) fn simplify_canonical(path: &Path) -> std::io::Result<PathBuf> {
    fs::canonicalize(path).map(|canonical| strip_verbatim_prefix(&canonical))
}

fn validate_relative(relative: &str) -> Result<(), WorkspaceError> {
    if relative.is_empty() {
        return Ok(());
    }
    let path = Path::new(relative);
    if path.is_absolute()
        || path
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(WorkspaceError::InvalidPath);
    }
    Ok(())
}

fn join_relative(root: &Path, relative: &str) -> PathBuf {
    let mut path = root.to_path_buf();
    for part in relative.split('/').filter(|part| !part.is_empty()) {
        path.push(part);
    }
    path
}

/// Splits a validated `/`-relative path into (parent, leaf).
/// `"notes/a.md"` → `(Some("notes"), "a.md")`; `"a.md"` → `(None, "a.md")`.
/// Returns `InvalidPath` for an empty leaf (`""`, `"notes/"`).
fn split_relative_leaf(relative: &str) -> Result<(Option<&str>, &str), WorkspaceError> {
    let (parent, leaf) = match relative.rsplit_once('/') {
        Some((parent, leaf)) => (Some(parent), leaf),
        None => (None, relative),
    };
    if leaf.is_empty() {
        return Err(WorkspaceError::InvalidPath);
    }
    Ok((parent, leaf))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_windows_verbatim_prefixes() {
        assert_eq!(
            strip_verbatim_prefix(Path::new(r"\\?\C:\Users\x\Charon")),
            PathBuf::from(r"C:\Users\x\Charon")
        );
        assert_eq!(
            strip_verbatim_prefix(Path::new(r"\\?\UNC\server\share\Charon")),
            PathBuf::from(r"\\server\share\Charon")
        );
        assert_eq!(
            strip_verbatim_prefix(Path::new("/tmp/x")),
            PathBuf::from("/tmp/x")
        );
    }

    #[test]
    fn rejects_control_characters_in_canonical_paths() {
        assert!(matches!(
            safe_path_string(PathBuf::from("/tmp/managed\nattachment.txt")),
            Err(WorkspaceError::InvalidPath)
        ));
        assert!(matches!(
            safe_path_string(PathBuf::from("/tmp/managed\u{0007}attachment.txt")),
            Err(WorkspaceError::InvalidPath)
        ));
    }

    #[test]
    fn real_storage_rejects_sources_from_another_workspace() {
        let active = tempfile::tempdir().expect("active Workspace");
        let other = tempfile::tempdir().expect("other Workspace");
        fs::write(other.path().join("charon.workspace.json"), "{}").expect("marker");
        fs::write(other.path().join("source.txt"), "private").expect("source");
        let storage = RealWorkspaceStorage::create(active.path()).expect("storage");

        assert!(matches!(
            storage.read_external_regular(&other.path().join("source.txt").to_string_lossy()),
            Err(WorkspaceError::InvalidPath)
        ));
    }

    #[test]
    fn memory_storage_rejects_traversal() {
        let storage = MemoryWorkspaceStorage::new();
        assert!(matches!(
            storage.read("../outside"),
            Err(WorkspaceError::InvalidPath)
        ));
        assert!(matches!(
            storage.write_synced("/outside", b"x"),
            Err(WorkspaceError::InvalidPath)
        ));
    }

    #[test]
    fn memory_storage_uses_forward_slash_keys_on_every_platform() {
        let storage = MemoryWorkspaceStorage::new();
        storage.create_dir_all("backups/tx/previous").expect("dirs");
        storage
            .write_synced("backups/tx/previous/manifest.json", b"{}")
            .expect("write");
        assert_eq!(
            storage.list("backups").expect("list"),
            vec!["tx".to_owned()]
        );
        assert!(storage
            .exists("backups/tx/previous/manifest.json")
            .expect("exists"));
    }

    #[test]
    fn managed_paths_never_expose_a_windows_verbatim_prefix() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let storage = RealWorkspaceStorage::create(workspace.path()).expect("storage");
        storage
            .create_dir_all("attachments/note-id")
            .expect("attachment directory");
        std::fs::write(
            workspace
                .path()
                .join("attachments/note-id/attachment-id.txt"),
            b"attachment",
        )
        .expect("attachment file");

        let path = storage
            .canonical_managed_path("attachments/note-id/attachment-id.txt")
            .expect("canonical managed path");
        assert!(!path.starts_with(r"\\?\"));
    }

    #[cfg(unix)]
    #[test]
    fn real_storage_rejects_symlink_escapes() {
        use std::os::unix::fs::symlink;

        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let outside = tempfile::tempdir().expect("outside tempdir");
        let storage = RealWorkspaceStorage::create(workspace.path()).expect("storage");
        symlink(outside.path(), workspace.path().join("escape")).expect("create symlink");
        assert!(matches!(
            storage.read("escape/secret"),
            Err(WorkspaceError::InvalidPath)
        ));
    }
}
