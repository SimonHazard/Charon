use std::path::{Path, PathBuf};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use notify::{Config, PollWatcher, RecommendedWatcher, RecursiveMode, Watcher};
use uuid::Uuid;

use super::error::WorkspaceError;

const DEBOUNCE: Duration = Duration::from_millis(75);
pub(crate) struct WorkspaceWatcher {
    batches: Receiver<Vec<PathBuf>>,
    stop: Sender<()>,
    worker: Option<JoinHandle<()>>,
}

impl WorkspaceWatcher {
    pub(crate) fn start(root: &Path) -> Result<Self, WorkspaceError> {
        let (raw_tx, raw_rx) = mpsc::channel::<PathBuf>();
        let (batch_tx, batch_rx) = mpsc::channel();
        let (stop_tx, stop_rx) = mpsc::channel();
        let (ready_tx, ready_rx) = mpsc::sync_channel(1);
        let watched_root = std::fs::canonicalize(root).map_err(WorkspaceError::from)?;
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
                    if !paths.is_empty() && batch_tx.send(paths).is_err() {
                        break;
                    }
                }
            })?;

        match ready_rx.recv_timeout(Duration::from_secs(2)) {
            Ok(true) => Ok(Self {
                batches: batch_rx,
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

    pub(crate) fn drain(&self) -> Vec<PathBuf> {
        let mut paths = Vec::new();
        while let Ok(mut batch) = self.batches.try_recv() {
            paths.append(&mut batch);
        }
        paths.sort();
        paths.dedup();
        paths
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
    let relative = relative.to_string_lossy();
    if relative.starts_with("backups/")
        || relative
            .split('/')
            .any(|component| component.starts_with(".charon-"))
    {
        return false;
    }
    relative == "charon.workspace.json"
        || (relative.starts_with("notes/") && relative.ends_with(".md"))
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::thread;

    use super::*;

    fn poll(watcher: &WorkspaceWatcher) -> Vec<PathBuf> {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let paths = watcher.drain();
            if !paths.is_empty() || Instant::now() >= deadline {
                return paths;
            }
            thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn coalesces_external_bursts_and_observes_deletion() {
        let root = tempfile::tempdir().expect("tempdir");
        let canonical_root = fs::canonicalize(root.path()).expect("canonical root");
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
        let canonical_root = fs::canonicalize(root.path()).expect("canonical root");
        fs::create_dir(canonical_root.join("notes")).expect("notes");
        let note = canonical_root.join("notes/.charon-transaction.md");
        let mut watcher = WorkspaceWatcher::start(&canonical_root).expect("watcher");
        fs::write(&note, "self write").expect("write");
        thread::sleep(DEBOUNCE + Duration::from_millis(100));
        assert!(watcher.drain().is_empty());
        watcher.stop();
    }
}
