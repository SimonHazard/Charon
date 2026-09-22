use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc,
};
use std::time::Duration;

pub const SELECTION_TIMEOUT: Duration = Duration::from_millis(500);
pub const MAX_SELECTION_BYTES: usize = 1024 * 1024;

/// A hung provider may retain one worker, never an unbounded series of threads.
/// Late results have no receiver and cannot create a Note.
#[derive(Default)]
pub struct SelectionGate(Arc<AtomicBool>);

impl SelectionGate {
    pub fn read(&self, task: impl FnOnce() -> Option<String> + Send + 'static) -> Option<String> {
        self.read_for(SELECTION_TIMEOUT, task)
    }

    fn read_for(
        &self,
        timeout: Duration,
        task: impl FnOnce() -> Option<String> + Send + 'static,
    ) -> Option<String> {
        if self.0.swap(true, Ordering::AcqRel) {
            return None;
        }
        let busy = self.0.clone();
        let (tx, rx) = mpsc::sync_channel(1);
        if std::thread::Builder::new()
            .name("charon-selection".into())
            .spawn(move || {
                struct Release(Arc<AtomicBool>);
                impl Drop for Release {
                    fn drop(&mut self) {
                        self.0.store(false, Ordering::Release);
                    }
                }
                let _release = Release(busy);
                let _ =
                    tx.send(task().filter(|text| {
                        !text.trim().is_empty() && text.len() <= MAX_SELECTION_BYTES
                    }));
            })
            .is_err()
        {
            self.0.store(false, Ordering::Release);
            return None;
        }
        rx.recv_timeout(timeout).ok().flatten()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stalled_provider_cannot_accumulate_workers_or_return_late_text() {
        let gate = SelectionGate::default();
        let (release, wait) = mpsc::channel();
        assert_eq!(
            gate.read_for(Duration::from_millis(10), move || {
                wait.recv().ok()?;
                Some("late".into())
            }),
            None
        );
        assert_eq!(gate.read(|| panic!("second provider must not start")), None);
        release.send(()).unwrap();
    }
    #[test]
    fn empty_and_oversized_selections_are_rejected() {
        for text in ["  ".into(), "x".repeat(MAX_SELECTION_BYTES + 1)] {
            assert_eq!(SelectionGate::default().read(move || Some(text)), None);
        }
        assert_eq!(
            SelectionGate::default().read(|| Some(" exact\n".into())),
            Some(" exact\n".into())
        );
    }
}
