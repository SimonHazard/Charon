use std::collections::BTreeSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use notify::{Config, PollWatcher, RecommendedWatcher, RecursiveMode, Watcher};
use uuid::Uuid;

use super::error::WorkspaceError;

const DEBOUNCE: Duration = Duration::from_millis(75);
const MAX_PENDING_PATHS: usize = 10_000;

pub(crate) struct WatchDrain {
    pub paths: Vec<PathBuf>,
    pub full_reload: bool,
}

pub(crate) struct WorkspaceWatcher {
    pending: Arc<Mutex<BTreeSet<PathBuf>>>,
    overflow: Arc<AtomicBool>,
    stop: Sender<()>,
    worker: Option<JoinHandle<()>>,
}

impl WorkspaceWatcher {
    pub(crate) fn start(root: &Path) -> Result<Self, WorkspaceError> {
        let (raw_tx, raw_rx) = mpsc::channel::<PathBuf>();
        let pending = Arc::new(Mutex::new(BTreeSet::new()));
        let overflow = Arc::new(AtomicBool::new(false));
        let worker_pending = Arc::clone(&pending);
        let worker_overflow = Arc::clone(&overflow);
        let (stop_tx, stop_rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let watched_root =
            super::storage::simplify_canonical(root).map_err(WorkspaceError::from)?;
        let worker = thread::Builder::new()
            .name("charon-workspace-watch".to_owned())
            .spawn(move || {
                enum ActiveWatcher {
                    Native { _watcher: RecommendedWatcher },
                    Poll { _watcher: PollWatcher },
                }

                let sentinel_path =
                    watched_root.join(format!(".charon-watch-ready-{}.tmp", Uuid::new_v4()));
                let callback_sentinel = sentinel_path.clone();
                let native_raw_tx = raw_tx.clone();
                let (sentinel_tx, sentinel_rx) = mpsc::sync_channel(1);
                let native =
                    notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
                        if let Ok(event) = result {
                            for path in event.paths {
                                if path == callback_sentinel {
                                    let _ = sentinel_tx.try_send(());
                                }
                                let _ = native_raw_tx.send(path);
                            }
                        }
                    })
                    .and_then(|mut watcher| {
                        watcher.watch(&watched_root, RecursiveMode::Recursive)?;
                        std::fs::write(&sentinel_path, b"ready").map_err(notify::Error::io)?;
                        let observed = sentinel_rx.recv_timeout(Duration::from_millis(500)).is_ok();
                        let _ = std::fs::remove_file(&sentinel_path);
                        if observed {
                            Ok(watcher)
                        } else {
                            Err(notify::Error::generic(
                                "native watcher readiness signal timed out",
                            ))
                        }
                    });

                let active_watcher = match native {
                    Ok(watcher) => ActiveWatcher::Native { _watcher: watcher },
                    Err(_) => {
                        let callback_tx = raw_tx;
                        let watcher_result: notify::Result<PollWatcher> = PollWatcher::new(
                            move |result: notify::Result<notify::Event>| {
                                if let Ok(event) = result {
                                    for path in event.paths {
                                        let _ = callback_tx.send(path);
                                    }
                                }
                            },
                            Config::default()
                                .with_poll_interval(Duration::from_millis(100))
                                .with_compare_contents(true),
                        );
                        let Ok(mut watcher) = watcher_result else {
                            let _ = ready_tx.send(false);
                            return;
                        };
                        if watcher
                            .watch(&watched_root, RecursiveMode::Recursive)
                            .is_err()
                        {
                            let _ = ready_tx.send(false);
                            return;
                        }
                        ActiveWatcher::Poll { _watcher: watcher }
                    }
                };
                let _active_watcher = active_watcher;
                let _ = ready_tx.send(true);

                loop {
                    if stop_rx.try_recv().is_ok() {
                        break;
                    }
                    let first = match raw_rx.recv_timeout(Duration::from_millis(25)) {
                        Ok(path) => path,
                        Err(RecvTimeoutError::Timeout) => continue,
                        Err(RecvTimeoutError::Disconnected) => break,
                    };
                    let mut paths = vec![first];
                    let deadline = Instant::now() + DEBOUNCE;
                    while let Some(remaining) = deadline.checked_duration_since(Instant::now()) {
                        match raw_rx.recv_timeout(remaining) {
                            Ok(path) => paths.push(path),
                            Err(RecvTimeoutError::Timeout | RecvTimeoutError::Disconnected) => {
                                break
                            }
                        }
                    }
                    paths.retain(|path| relevant(&watched_root, path));
                    paths.sort();
                    paths.dedup();
                    if !paths.is_empty() {
                        let Ok(mut queued) = worker_pending.lock() else {
                            worker_overflow.store(true, Ordering::Release);
                            continue;
                        };
                        if queued.len().saturating_add(paths.len()) > MAX_PENDING_PATHS {
                            queued.clear();
                            worker_overflow.store(true, Ordering::Release);
                        } else if !worker_overflow.load(Ordering::Acquire) {
                            queued.extend(paths);
                        }
                    }
                }
            })?;

        match ready_rx.recv_timeout(Duration::from_secs(2)) {
            Ok(true) => Ok(Self {
                pending,
                overflow,
                stop: stop_tx,
                worker: Some(worker),
            }),
            _ => {
                let _ = stop_tx.send(());
                let _ = worker.join();
                Err(WorkspaceError::Io(std::io::Error::other(
                    "failed to initialize the Workspace watcher",
                )))
            }
        }
    }

    pub(crate) fn drain(&self) -> WatchDrain {
        let full_reload = self.overflow.swap(false, Ordering::AcqRel);
        let paths = self
            .pending
            .lock()
            .map(|mut pending| std::mem::take(&mut *pending).into_iter().collect())
            .unwrap_or_default();
        WatchDrain { paths, full_reload }
    }

    pub(crate) fn stop(&mut self) {
        let _ = self.stop.send(());
        if let Some(worker) = self.worker.take() {
            let _ = worker.join();
        }
    }
}

impl Drop for WorkspaceWatcher {
    fn drop(&mut self) {
        self.stop();
    }
}

fn relevant(root: &Path, path: &Path) -> bool {
    let Ok(relative) = path.strip_prefix(root) else {
        return false;
    };
    let parts: Vec<&str> = relative
        .components()
        .filter_map(|component| component.as_os_str().to_str())
        .collect();
    relevant_components(&parts)
}

fn relevant_components(parts: &[&str]) -> bool {
    if parts.first() == Some(&"backups") {
        return false;
    }
    if parts.iter().any(|part| part.starts_with(".charon-")) {
        return false;
    }
    match parts {
        ["charon.workspace.json"] => true,
        ["notes", rest @ ..] => rest.last().is_some_and(|leaf| leaf.ends_with(".md")),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::thread;

    use super::*;

    fn poll(watcher: &WorkspaceWatcher) -> Vec<PathBuf> {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let drained = watcher.drain();
            if !drained.paths.is_empty() || Instant::now() >= deadline {
                return drained.paths;
            }
            thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn filters_components_independently_of_platform_separators() {
        assert!(relevant_components(&["notes", "x.md"]));
        assert!(relevant_components(&["notes", "sub", "x.md"]));
        assert!(!relevant_components(&["backups", "t", "m"]));
        assert!(!relevant_components(&["notes", ".charon-x.md"]));
        assert!(relevant_components(&["charon.workspace.json"]));
        assert!(!relevant_components(&["attachments", "n", "a.png"]));
    }

    #[test]
    fn coalesces_external_bursts_and_observes_deletion() {
        let root = tempfile::tempdir().expect("tempdir");
        let canonical_root =
            crate::workspace::storage::simplify_canonical(root.path()).expect("canonical root");
        fs::create_dir(canonical_root.join("notes")).expect("notes");
        let note = canonical_root.join("notes/fef8abcc-7047-4a35-a070-b6d9f0eca026.md");
        fs::write(&note, "one").expect("initial note");
        let mut watcher = WorkspaceWatcher::start(&canonical_root).expect("watcher");
        fs::write(&note, "two").expect("edit one");
        fs::write(&note, "three").expect("edit two");
        let paths = poll(&watcher);
        assert_eq!(paths, vec![note.clone()]);

        fs::remove_file(&note).expect("delete");
        assert_eq!(poll(&watcher), vec![note]);
        watcher.stop();
        assert!(watcher.worker.is_none());
    }

    #[test]
    fn ignores_transaction_paths() {
        let root = tempfile::tempdir().expect("tempdir");
        let canonical_root =
            crate::workspace::storage::simplify_canonical(root.path()).expect("canonical root");
        fs::create_dir(canonical_root.join("notes")).expect("notes");
        let note = canonical_root.join("notes/.charon-transaction.md");
        let mut watcher = WorkspaceWatcher::start(&canonical_root).expect("watcher");
        fs::write(&note, "self write").expect("write");
        thread::sleep(DEBOUNCE + Duration::from_millis(100));
        assert!(watcher.drain().paths.is_empty());
        watcher.stop();
    }

    #[test]
    fn overflow_requests_one_full_reload_and_clears_the_queue() {
        let watcher = WorkspaceWatcher {
            pending: Arc::new(Mutex::new(
                (0..MAX_PENDING_PATHS)
                    .map(|index| PathBuf::from(format!("notes/{index}.md")))
                    .collect(),
            )),
            overflow: Arc::new(AtomicBool::new(true)),
            stop: mpsc::channel().0,
            worker: None,
        };
        let first = watcher.drain();
        assert!(first.full_reload);
        assert_eq!(first.paths.len(), MAX_PENDING_PATHS);
        let second = watcher.drain();
        assert!(!second.full_reload);
        assert!(second.paths.is_empty());
    }
}
