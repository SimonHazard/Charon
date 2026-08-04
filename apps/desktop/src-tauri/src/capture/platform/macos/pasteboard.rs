use std::cmp;
use std::thread;
use std::time::{Duration, Instant};

use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use objc2::rc::{autoreleasepool, Retained};
use objc2::runtime::ProtocolObject;
use objc2_app_kit::{
    NSPasteboard, NSPasteboardItem, NSPasteboardTypeString, NSPasteboardWriting, NSWorkspace,
};
use objc2_foundation::{NSArray, NSData, NSString};

use crate::capture::{CaptureWarning, CapturedSelection};

pub(super) const MAX_PASTEBOARD_ITEMS: usize = 32;
pub(super) const MAX_TYPES_PER_ITEM: usize = 64;
pub(super) const MAX_SNAPSHOT_BYTES: usize = 64 * 1024 * 1024;
pub(super) const SNAPSHOT_TIMEOUT_MS: u64 = 150;
pub(super) const COPY_TIMEOUT_MS: u64 = 500;
const COPY_STABILITY_MS: u64 = 25;
const COPY_POLL_INTERVAL_MS: u64 = 10;
const ANSI_C_KEYCODE: u16 = 8;

#[derive(Clone, Debug, Eq, PartialEq)]
struct PasteboardEntry {
    type_name: String,
    data: Vec<u8>,
}

impl PasteboardEntry {
    fn byte_len(&self) -> Option<usize> {
        self.type_name.len().checked_add(self.data.len())
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct PasteboardSnapshot {
    change_count: i64,
    items: Vec<Vec<PasteboardEntry>>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum SnapshotError {
    Unavailable,
    ItemLimit,
    TypeLimit,
    ByteLimit,
    Timeout,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum EntryReadError {
    Unavailable,
    ByteLimit,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum RestoreOutcome {
    Restored,
    Changed,
    Failed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum StabilityOutcome {
    Stable(i64),
    ConcurrentWrite,
}

trait PasteboardPort {
    fn now_ms(&self) -> u64;
    fn wait_ms(&mut self, duration_ms: u64);
    fn foreground_process_id(&mut self) -> Option<i32>;
    fn change_count(&mut self) -> i64;
    fn begin_snapshot(&mut self) -> Result<usize, SnapshotError>;
    fn item_type_count(&mut self, item_index: usize) -> Result<usize, SnapshotError>;
    fn read_item_type(
        &mut self,
        item_index: usize,
        type_index: usize,
        remaining_bytes: usize,
    ) -> Result<PasteboardEntry, EntryReadError>;
    fn end_snapshot(&mut self);
    fn post_copy(&mut self) -> Result<(), ()>;
    fn read_string(&mut self) -> Option<String>;
    fn restore_if_unchanged(
        &mut self,
        expected_change_count: i64,
        snapshot: &PasteboardSnapshot,
    ) -> RestoreOutcome;
}

pub(super) fn foreground_process_id() -> Option<i32> {
    autoreleasepool(|_| {
        let application = NSWorkspace::sharedWorkspace().frontmostApplication()?;
        let process_id = application.processIdentifier();
        (process_id > 0).then_some(process_id)
    })
}

pub(super) fn capture_selection(source_process_id: i32) -> CapturedSelection {
    autoreleasepool(|_| {
        let mut port = SystemPasteboardPort::new();
        capture_with_port(&mut port, source_process_id)
    })
}

fn capture_with_port(port: &mut impl PasteboardPort, source_process_id: i32) -> CapturedSelection {
    if port.foreground_process_id() != Some(source_process_id) {
        return CapturedSelection::default();
    }

    let snapshot = match take_snapshot(port) {
        Ok(snapshot) => snapshot,
        Err(_) => return CapturedSelection::default(),
    };

    if port.change_count() != snapshot.change_count
        || port.foreground_process_id() != Some(source_process_id)
        || port.post_copy().is_err()
    {
        return CapturedSelection::default();
    }

    let copy_started_at = port.now_ms();
    let transaction_count = loop {
        let current = port.change_count();
        if current != snapshot.change_count {
            break current;
        }
        let elapsed = port.now_ms().saturating_sub(copy_started_at);
        if elapsed >= COPY_TIMEOUT_MS {
            return CapturedSelection::default();
        }
        port.wait_ms(cmp::min(
            COPY_POLL_INTERVAL_MS,
            COPY_TIMEOUT_MS.saturating_sub(elapsed),
        ));
    };

    let stable_count = match wait_for_stable_change_count(port, transaction_count) {
        StabilityOutcome::Stable(count) => count,
        StabilityOutcome::ConcurrentWrite => {
            return CapturedSelection {
                body: None,
                warning: Some(CaptureWarning::ClipboardNotRestored),
            };
        }
    };
    let body = port.read_string().filter(|value| !value.trim().is_empty());
    let warning = match port.restore_if_unchanged(stable_count, &snapshot) {
        RestoreOutcome::Restored => None,
        RestoreOutcome::Changed | RestoreOutcome::Failed => {
            Some(CaptureWarning::ClipboardNotRestored)
        }
    };
    CapturedSelection { body, warning }
}

fn wait_for_stable_change_count(
    port: &mut impl PasteboardPort,
    transaction_change_count: i64,
) -> StabilityOutcome {
    let stable_since = port.now_ms();
    loop {
        let stable_for = port.now_ms().saturating_sub(stable_since);
        if stable_for >= COPY_STABILITY_MS {
            return StabilityOutcome::Stable(transaction_change_count);
        }
        port.wait_ms(cmp::min(
            COPY_POLL_INTERVAL_MS,
            COPY_STABILITY_MS.saturating_sub(stable_for),
        ));
        let current = port.change_count();
        if current != transaction_change_count {
            return StabilityOutcome::ConcurrentWrite;
        }
    }
}

fn take_snapshot(port: &mut impl PasteboardPort) -> Result<PasteboardSnapshot, SnapshotError> {
    let started_at = port.now_ms();
    let change_count = port.change_count();
    let item_count = match port.begin_snapshot() {
        Ok(count) => count,
        Err(error) => {
            port.end_snapshot();
            return Err(error);
        }
    };
    let result = (|| {
        check_snapshot_time(port, started_at)?;
        if item_count > MAX_PASTEBOARD_ITEMS {
            return Err(SnapshotError::ItemLimit);
        }

        let mut total_bytes = 0_usize;
        let mut items = Vec::with_capacity(item_count);
        for item_index in 0..item_count {
            let type_count = port.item_type_count(item_index)?;
            check_snapshot_time(port, started_at)?;
            if type_count > MAX_TYPES_PER_ITEM {
                return Err(SnapshotError::TypeLimit);
            }
            let mut entries = Vec::with_capacity(type_count);
            for type_index in 0..type_count {
                let remaining = MAX_SNAPSHOT_BYTES.saturating_sub(total_bytes);
                let entry = match port.read_item_type(item_index, type_index, remaining) {
                    Ok(entry) => entry,
                    Err(EntryReadError::Unavailable) => return Err(SnapshotError::Unavailable),
                    Err(EntryReadError::ByteLimit) => return Err(SnapshotError::ByteLimit),
                };
                total_bytes = total_bytes
                    .checked_add(entry.byte_len().ok_or(SnapshotError::ByteLimit)?)
                    .filter(|total| *total <= MAX_SNAPSHOT_BYTES)
                    .ok_or(SnapshotError::ByteLimit)?;
                check_snapshot_time(port, started_at)?;
                entries.push(entry);
            }
            items.push(entries);
        }
        Ok(PasteboardSnapshot {
            change_count,
            items,
        })
    })();
    port.end_snapshot();
    result
}

fn check_snapshot_time(port: &impl PasteboardPort, started_at: u64) -> Result<(), SnapshotError> {
    if port.now_ms().saturating_sub(started_at) > SNAPSHOT_TIMEOUT_MS {
        Err(SnapshotError::Timeout)
    } else {
        Ok(())
    }
}

struct SystemPasteboardPort {
    pasteboard: Retained<NSPasteboard>,
    started_at: Instant,
    prepared_items: Option<Retained<NSArray<NSPasteboardItem>>>,
}

impl SystemPasteboardPort {
    fn new() -> Self {
        Self {
            pasteboard: NSPasteboard::generalPasteboard(),
            started_at: Instant::now(),
            prepared_items: None,
        }
    }

    fn prepared_item(
        &self,
        item_index: usize,
    ) -> Result<Retained<NSPasteboardItem>, SnapshotError> {
        let items = self
            .prepared_items
            .as_ref()
            .ok_or(SnapshotError::Unavailable)?;
        if item_index >= items.count() {
            return Err(SnapshotError::Unavailable);
        }
        Ok(items.objectAtIndex(item_index))
    }

    fn build_restore_objects(
        snapshot: &PasteboardSnapshot,
    ) -> Option<Retained<NSArray<ProtocolObject<dyn NSPasteboardWriting>>>> {
        let mut writers = Vec::with_capacity(snapshot.items.len());
        for entries in &snapshot.items {
            let item = NSPasteboardItem::new();
            for entry in entries {
                let pasteboard_type = NSString::from_str(&entry.type_name);
                let data = NSData::with_bytes(&entry.data);
                if !item.setData_forType(&data, &pasteboard_type) {
                    return None;
                }
            }
            writers.push(ProtocolObject::from_retained(item));
        }
        Some(NSArray::from_retained_slice(&writers))
    }
}

impl PasteboardPort for SystemPasteboardPort {
    fn now_ms(&self) -> u64 {
        u64::try_from(self.started_at.elapsed().as_millis()).unwrap_or(u64::MAX)
    }

    fn wait_ms(&mut self, duration_ms: u64) {
        thread::sleep(Duration::from_millis(duration_ms));
    }

    fn foreground_process_id(&mut self) -> Option<i32> {
        foreground_process_id()
    }

    fn change_count(&mut self) -> i64 {
        i64::try_from(self.pasteboard.changeCount()).unwrap_or(i64::MAX)
    }

    fn begin_snapshot(&mut self) -> Result<usize, SnapshotError> {
        self.prepared_items = self.pasteboard.pasteboardItems();
        Ok(self
            .prepared_items
            .as_ref()
            .map_or(0, |items| items.count()))
    }

    fn item_type_count(&mut self, item_index: usize) -> Result<usize, SnapshotError> {
        Ok(self.prepared_item(item_index)?.types().count())
    }

    fn read_item_type(
        &mut self,
        item_index: usize,
        type_index: usize,
        remaining_bytes: usize,
    ) -> Result<PasteboardEntry, EntryReadError> {
        let item = self
            .prepared_item(item_index)
            .map_err(|_| EntryReadError::Unavailable)?;
        let types = item.types();
        if type_index >= types.count() {
            return Err(EntryReadError::Unavailable);
        }
        let pasteboard_type = types.objectAtIndex(type_index);
        let type_name = pasteboard_type.to_string();
        let data = item
            .dataForType(&pasteboard_type)
            .ok_or(EntryReadError::Unavailable)?;
        let required = type_name
            .len()
            .checked_add(data.len())
            .ok_or(EntryReadError::ByteLimit)?;
        if required > remaining_bytes {
            return Err(EntryReadError::ByteLimit);
        }
        Ok(PasteboardEntry {
            type_name,
            data: data.to_vec(),
        })
    }

    fn end_snapshot(&mut self) {
        self.prepared_items = None;
    }

    fn post_copy(&mut self) -> Result<(), ()> {
        let down_source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)?;
        let up_source = CGEventSource::new(CGEventSourceStateID::HIDSystemState)?;
        let down = CGEvent::new_keyboard_event(down_source, ANSI_C_KEYCODE, true)?;
        let up = CGEvent::new_keyboard_event(up_source, ANSI_C_KEYCODE, false)?;
        down.set_flags(CGEventFlags::CGEventFlagCommand);
        up.set_flags(CGEventFlags::CGEventFlagCommand);
        down.post(CGEventTapLocation::HID);
        up.post(CGEventTapLocation::HID);
        Ok(())
    }

    fn read_string(&mut self) -> Option<String> {
        // SAFETY: this is a public, process-lifetime AppKit constant.
        self.pasteboard
            .stringForType(unsafe { NSPasteboardTypeString })
            .map(|value| value.to_string())
    }

    fn restore_if_unchanged(
        &mut self,
        expected_change_count: i64,
        snapshot: &PasteboardSnapshot,
    ) -> RestoreOutcome {
        let Some(objects) = Self::build_restore_objects(snapshot) else {
            return RestoreOutcome::Failed;
        };
        if i64::try_from(self.pasteboard.changeCount()).unwrap_or(i64::MAX) != expected_change_count
        {
            return RestoreOutcome::Changed;
        }
        self.pasteboard.clearContents();
        if objects.count() == 0 || self.pasteboard.writeObjects(&objects) {
            RestoreOutcome::Restored
        } else {
            RestoreOutcome::Failed
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[derive(Clone)]
    struct FakeType {
        entry: PasteboardEntry,
        logical_bytes: usize,
        available: bool,
    }

    impl FakeType {
        fn new(type_name: &str, data: &[u8]) -> Self {
            Self {
                entry: PasteboardEntry {
                    type_name: type_name.to_owned(),
                    data: data.to_vec(),
                },
                logical_bytes: type_name.len() + data.len(),
                available: true,
            }
        }
    }

    #[derive(Clone)]
    struct ScheduledChange {
        at_ms: u64,
        count: i64,
        string: Option<String>,
    }

    struct FakePasteboardPort {
        now_ms: u64,
        foreground_checks: Vec<Option<i32>>,
        foreground_index: usize,
        count: i64,
        change_count_checks: usize,
        change_on_check: Option<(usize, i64, Option<String>)>,
        string: Option<String>,
        items: Vec<Vec<FakeType>>,
        begin_delay_ms: u64,
        read_delay_ms: u64,
        changes: Vec<ScheduledChange>,
        posted_copy: usize,
        fail_post: bool,
        before_restore_count: Option<i64>,
        fail_restore: bool,
        restored: Option<PasteboardSnapshot>,
        snapshot_ended: usize,
    }

    impl Default for FakePasteboardPort {
        fn default() -> Self {
            Self {
                now_ms: 0,
                foreground_checks: vec![Some(42), Some(42)],
                foreground_index: 0,
                count: 7,
                change_count_checks: 0,
                change_on_check: None,
                string: Some("old clipboard".to_owned()),
                items: vec![vec![FakeType::new(
                    "public.utf8-plain-text",
                    b"old clipboard",
                )]],
                begin_delay_ms: 0,
                read_delay_ms: 0,
                changes: Vec::new(),
                posted_copy: 0,
                fail_post: false,
                before_restore_count: None,
                fail_restore: false,
                restored: None,
                snapshot_ended: 0,
            }
        }
    }

    impl FakePasteboardPort {
        fn selection_at(mut self, at_ms: u64, count: i64, string: Option<&str>) -> Self {
            self.changes.push(ScheduledChange {
                at_ms,
                count,
                string: string.map(str::to_owned),
            });
            self
        }

        fn apply_changes(&mut self) {
            let mut applied = 0;
            for change in &self.changes {
                if change.at_ms > self.now_ms {
                    break;
                }
                self.count = change.count;
                self.string = change.string.clone();
                applied += 1;
            }
            self.changes.drain(0..applied);
        }
    }

    impl PasteboardPort for FakePasteboardPort {
        fn now_ms(&self) -> u64 {
            self.now_ms
        }
        fn wait_ms(&mut self, duration_ms: u64) {
            self.now_ms += duration_ms;
            self.apply_changes();
        }
        fn foreground_process_id(&mut self) -> Option<i32> {
            let value = self
                .foreground_checks
                .get(self.foreground_index)
                .copied()
                .flatten()
                .or_else(|| self.foreground_checks.last().copied().flatten());
            self.foreground_index += 1;
            value
        }
        fn change_count(&mut self) -> i64 {
            self.change_count_checks += 1;
            if self
                .change_on_check
                .as_ref()
                .is_some_and(|(check, _, _)| *check == self.change_count_checks)
            {
                if let Some((_, count, string)) = self.change_on_check.take() {
                    self.count = count;
                    self.string = string;
                }
            }
            self.apply_changes();
            self.count
        }
        fn begin_snapshot(&mut self) -> Result<usize, SnapshotError> {
            self.now_ms += self.begin_delay_ms;
            Ok(self.items.len())
        }
        fn item_type_count(&mut self, item_index: usize) -> Result<usize, SnapshotError> {
            self.items
                .get(item_index)
                .map(Vec::len)
                .ok_or(SnapshotError::Unavailable)
        }
        fn read_item_type(
            &mut self,
            item_index: usize,
            type_index: usize,
            remaining_bytes: usize,
        ) -> Result<PasteboardEntry, EntryReadError> {
            self.now_ms += self.read_delay_ms;
            let value = self
                .items
                .get(item_index)
                .and_then(|item| item.get(type_index))
                .ok_or(EntryReadError::Unavailable)?;
            if !value.available {
                return Err(EntryReadError::Unavailable);
            }
            if value.logical_bytes > remaining_bytes {
                return Err(EntryReadError::ByteLimit);
            }
            Ok(value.entry.clone())
        }
        fn end_snapshot(&mut self) {
            self.snapshot_ended += 1;
        }
        fn post_copy(&mut self) -> Result<(), ()> {
            if self.fail_post {
                return Err(());
            }
            self.posted_copy += 1;
            Ok(())
        }
        fn read_string(&mut self) -> Option<String> {
            self.string.clone()
        }
        fn restore_if_unchanged(
            &mut self,
            expected_change_count: i64,
            snapshot: &PasteboardSnapshot,
        ) -> RestoreOutcome {
            if let Some(count) = self.before_restore_count.take() {
                self.count = count;
            }
            if self.count != expected_change_count {
                return RestoreOutcome::Changed;
            }
            if self.fail_restore {
                return RestoreOutcome::Failed;
            }
            self.restored = Some(snapshot.clone());
            RestoreOutcome::Restored
        }
    }

    fn capture(port: &mut FakePasteboardPort) -> CapturedSelection {
        capture_with_port(port, 42)
    }

    #[test]
    fn empty_and_rich_multi_item_snapshots_restore_completely() {
        for items in [
            Vec::new(),
            vec![
                vec![
                    FakeType::new("public.utf8-plain-text", b"old"),
                    FakeType::new("public.rtf", b"{\\rtf old}"),
                ],
                vec![FakeType::new("public.png", &[1, 2, 3, 4])],
            ],
        ] {
            let expected_items = items
                .iter()
                .map(|item| {
                    item.iter()
                        .map(|entry| entry.entry.clone())
                        .collect::<Vec<_>>()
                })
                .collect::<Vec<_>>();
            let mut port = FakePasteboardPort {
                items,
                ..FakePasteboardPort::default()
            }
            .selection_at(10, 8, Some("new selection"));
            assert_eq!(
                capture(&mut port),
                CapturedSelection::from_body("new selection".to_owned())
            );
            assert_eq!(port.restored.expect("restored").items, expected_items);
        }
    }

    #[test]
    fn snapshot_item_type_byte_and_time_limits_fail_before_copy() {
        let mut cases = Vec::new();
        cases.push(FakePasteboardPort {
            items: vec![Vec::new(); MAX_PASTEBOARD_ITEMS + 1],
            ..FakePasteboardPort::default()
        });
        cases.push(FakePasteboardPort {
            items: vec![vec![FakeType::new("type", b""); MAX_TYPES_PER_ITEM + 1]],
            ..FakePasteboardPort::default()
        });
        let mut oversized = FakeType::new("type", b"tiny allocation");
        oversized.logical_bytes = MAX_SNAPSHOT_BYTES + 1;
        cases.push(FakePasteboardPort {
            items: vec![vec![oversized]],
            ..FakePasteboardPort::default()
        });
        cases.push(FakePasteboardPort {
            begin_delay_ms: SNAPSHOT_TIMEOUT_MS + 1,
            ..FakePasteboardPort::default()
        });

        for mut port in cases {
            assert_eq!(capture(&mut port), CapturedSelection::default());
            assert_eq!(port.posted_copy, 0);
            assert_eq!(port.snapshot_ended, 1);
        }
    }

    #[test]
    fn unavailable_snapshot_type_fails_closed() {
        let mut unavailable = FakeType::new("type", b"secret");
        unavailable.available = false;
        let mut port = FakePasteboardPort {
            items: vec![vec![unavailable]],
            ..FakePasteboardPort::default()
        };
        assert_eq!(capture(&mut port), CapturedSelection::default());
        assert_eq!(port.posted_copy, 0);
    }

    #[test]
    fn unchanged_delayed_and_exact_timeout_copy_are_bounded() {
        let mut unchanged = FakePasteboardPort::default();
        assert_eq!(capture(&mut unchanged), CapturedSelection::default());
        assert_eq!(unchanged.now_ms, COPY_TIMEOUT_MS);
        assert!(unchanged.restored.is_none());

        for at_ms in [120, COPY_TIMEOUT_MS] {
            let mut delayed =
                FakePasteboardPort::default().selection_at(at_ms, 8, Some("selected"));
            assert_eq!(
                capture(&mut delayed),
                CapturedSelection::from_body("selected".to_owned())
            );
            assert!(delayed.restored.is_some());
        }

        let mut too_slow =
            FakePasteboardPort::default().selection_at(COPY_TIMEOUT_MS + 1, 8, Some("too late"));
        assert_eq!(capture(&mut too_slow), CapturedSelection::default());
        assert!(too_slow.restored.is_none());
    }

    #[test]
    fn same_string_with_a_new_count_is_a_valid_selection() {
        let mut port = FakePasteboardPort::default().selection_at(10, 8, Some("old clipboard"));
        assert_eq!(
            capture(&mut port),
            CapturedSelection::from_body("old clipboard".to_owned())
        );
    }

    #[test]
    fn empty_new_payload_restores_without_creating_a_note() {
        let mut port = FakePasteboardPort::default().selection_at(10, 8, Some("  \n"));
        assert_eq!(capture(&mut port), CapturedSelection::default());
        assert!(port.restored.is_some());
    }

    #[test]
    fn second_change_during_stability_is_treated_as_concurrent() {
        let mut port = FakePasteboardPort::default()
            .selection_at(10, 8, Some("intermediate"))
            .selection_at(30, 9, Some("final"));
        assert_eq!(
            capture(&mut port),
            CapturedSelection {
                body: None,
                warning: Some(CaptureWarning::ClipboardNotRestored),
            }
        );
        assert_eq!(port.now_ms, 30);
        assert_eq!(port.count, 9);
        assert!(port.restored.is_none());
    }

    #[test]
    fn source_or_pasteboard_change_before_post_sends_no_copy() {
        let mut changed_source = FakePasteboardPort {
            foreground_checks: vec![Some(42), Some(99)],
            ..FakePasteboardPort::default()
        };
        assert_eq!(capture(&mut changed_source), CapturedSelection::default());
        assert_eq!(changed_source.posted_copy, 0);

        let mut changed_pasteboard = FakePasteboardPort {
            change_on_check: Some((2, 9, Some("concurrent".to_owned()))),
            ..FakePasteboardPort::default()
        };
        assert_eq!(
            capture(&mut changed_pasteboard),
            CapturedSelection::default()
        );
        assert_eq!(changed_pasteboard.posted_copy, 0);
    }

    #[test]
    fn concurrent_write_before_restore_is_never_overwritten() {
        let mut port = FakePasteboardPort {
            before_restore_count: Some(99),
            ..FakePasteboardPort::default()
        }
        .selection_at(10, 8, Some("selected"));
        assert_eq!(
            capture(&mut port),
            CapturedSelection {
                body: Some("selected".to_owned()),
                warning: Some(CaptureWarning::ClipboardNotRestored),
            }
        );
        assert!(port.restored.is_none());
        assert_eq!(port.count, 99);
    }

    #[test]
    fn restoration_failure_is_a_content_free_warning() {
        let mut port = FakePasteboardPort {
            fail_restore: true,
            ..FakePasteboardPort::default()
        }
        .selection_at(10, 8, Some("private selected body"));
        let result = capture(&mut port);
        assert_eq!(result.warning, Some(CaptureWarning::ClipboardNotRestored));
        assert!(!format!("{:?}", SnapshotError::Unavailable).contains("private selected body"));
    }

    #[test]
    fn post_failure_never_retries() {
        let mut port = FakePasteboardPort {
            fail_post: true,
            ..FakePasteboardPort::default()
        };
        assert_eq!(capture(&mut port), CapturedSelection::default());
        assert_eq!(port.posted_copy, 0);
    }
}
