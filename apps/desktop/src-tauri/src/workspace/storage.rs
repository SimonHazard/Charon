use std::collections::{BTreeSet, HashMap, HashSet};
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};

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

impl RealWorkspaceStorage {
    pub(crate) fn create(root: &Path) -> Result<Self, WorkspaceError> {
        if root.as_os_str().is_empty() {
            return Err(WorkspaceError::InvalidPath);
        }
        fs::create_dir_all(root)?;
        let root = fs::canonicalize(root).map_err(|_| WorkspaceError::InvalidPath)?;
        if !root.is_dir() {
            return Err(WorkspaceError::InvalidPath);
        }
        Ok(Self { root })
    }

    pub(crate) fn open(root: &Path) -> Result<Self, WorkspaceError> {
        let root = fs::canonicalize(root).map_err(|_| WorkspaceError::InvalidPath)?;
        if !root.is_dir() {
            return Err(WorkspaceError::InvalidPath);
        }
        Ok(Self { root })
    }

    fn resolve(&self, relative: &str, allow_missing_leaf: bool) -> Result<PathBuf, WorkspaceError> {
        validate_relative(relative)?;
        let candidate = self.root.join(relative);
        let mut cursor = self.root.clone();
        for component in Path::new(relative).components() {
            cursor.push(component.as_os_str());
            match fs::symlink_metadata(&cursor) {
                Ok(metadata) => {
                    if metadata.file_type().is_symlink() {
                        return Err(WorkspaceError::InvalidPath);
                    }
                    let canonical = fs::canonicalize(&cursor)?;
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
            let canonical = fs::canonicalize(&candidate)?;
            if !canonical.starts_with(&self.root) {
                return Err(WorkspaceError::InvalidPath);
            }
            return Ok(canonical);
        }
        if !allow_missing_leaf {
            return Ok(candidate);
        }

        let parent = candidate.parent().ok_or(WorkspaceError::InvalidPath)?;
        let canonical_parent = fs::canonicalize(parent).map_err(|_| WorkspaceError::InvalidPath)?;
        if !canonical_parent.starts_with(&self.root) {
            return Err(WorkspaceError::InvalidPath);
        }
        let file_name = candidate.file_name().ok_or(WorkspaceError::InvalidPath)?;
        Ok(canonical_parent.join(file_name))
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
        let canonical = fs::canonicalize(&cursor)?;
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
        let candidate = self.root.join(relative);
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
        let canonical = fs::canonicalize(source)?;
        if canonical.starts_with(&self.root) {
            return Err(WorkspaceError::InvalidPath);
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
        let canonical = fs::canonicalize(path)?;
        if !canonical.starts_with(&self.root) {
            return Err(WorkspaceError::InvalidPath);
        }
        canonical
            .into_os_string()
            .into_string()
            .map_err(|_| WorkspaceError::InvalidPath)
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
        let mut cursor = PathBuf::new();
        for component in Path::new(relative).components() {
            cursor.push(component.as_os_str());
            state.directories.insert(path_string(&cursor)?);
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
        let parent = Path::new(relative)
            .parent()
            .map(path_string)
            .transpose()?
            .unwrap_or_default();
        let mut state = self.inner.lock().expect("memory storage lock");
        if !state.directories.contains(&parent) {
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

fn path_string(path: &Path) -> Result<String, WorkspaceError> {
    path.to_str()
        .map(str::to_owned)
        .ok_or(WorkspaceError::InvalidPath)
}

#[cfg(test)]
mod tests {
    use super::*;

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
