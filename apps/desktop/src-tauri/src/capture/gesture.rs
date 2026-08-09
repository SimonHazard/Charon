const GESTURE_WINDOW_MS: u64 = 300;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ShiftKey {
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CaptureGestureIntent {
    CaptureSelection,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GestureEvent {
    ShiftDown {
        key: ShiftKey,
        is_repeat: bool,
        command_held: bool,
    },
    ShiftUp {
        key: ShiftKey,
        command_held: bool,
    },
    CommandChanged {
        held: bool,
    },
    OtherKey,
    FallbackShortcut,
    SecurityBoundary,
    ListenerRestart,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
struct HeldShifts(u8);

impl HeldShifts {
    fn bit(key: ShiftKey) -> u8 {
        match key {
            ShiftKey::Left => 1,
            ShiftKey::Right => 2,
        }
    }

    fn contains(self, key: ShiftKey) -> bool {
        self.0 & Self::bit(key) != 0
    }

    fn insert(&mut self, key: ShiftKey) {
        self.0 |= Self::bit(key);
    }

    fn remove(&mut self, key: ShiftKey) {
        self.0 &= !Self::bit(key);
    }

    fn is_empty(self) -> bool {
        self.0 == 0
    }
}

/// Pure detector for two complete Shift taps with one consistent Command state.
///
/// Callers supply milliseconds from one monotonic clock. The detector never
/// suppresses an input event; it only reports a completed normalized intent.
#[derive(Debug, Default)]
pub struct DoubleShiftGesture {
    held: HeldShifts,
    current_press_started_at: Option<u64>,
    first_tap_released_at: Option<u64>,
    sequence_command_held: Option<bool>,
    blocked_until_released: bool,
    last_timestamp: Option<u64>,
}

impl DoubleShiftGesture {
    #[must_use]
    pub fn handle(
        &mut self,
        event: GestureEvent,
        timestamp_ms: u64,
    ) -> Option<CaptureGestureIntent> {
        if self
            .last_timestamp
            .is_some_and(|previous| timestamp_ms < previous)
        {
            self.reset();
        }
        self.last_timestamp = Some(timestamp_ms);

        if self
            .first_tap_released_at
            .is_some_and(|first| timestamp_ms.saturating_sub(first) > GESTURE_WINDOW_MS)
        {
            self.clear_sequence();
        }

        match event {
            GestureEvent::SecurityBoundary
            | GestureEvent::ListenerRestart
            | GestureEvent::FallbackShortcut => {
                self.reset_at(timestamp_ms);
                None
            }
            GestureEvent::CommandChanged { held } => {
                if self
                    .sequence_command_held
                    .is_some_and(|current| current != held)
                {
                    self.invalidate_current_sequence();
                }
                None
            }
            GestureEvent::OtherKey => {
                self.invalidate_current_sequence();
                None
            }
            GestureEvent::ShiftDown {
                key,
                is_repeat: true,
                ..
            } => {
                if !self.held.contains(key) {
                    self.invalidate_current_sequence();
                }
                None
            }
            GestureEvent::ShiftDown {
                key,
                is_repeat: false,
                command_held,
            } => {
                if self.held.contains(key) || !self.held.is_empty() {
                    self.blocked_until_released = true;
                    self.clear_sequence();
                } else if !self.blocked_until_released {
                    if self
                        .sequence_command_held
                        .is_some_and(|current| current != command_held)
                    {
                        self.clear_sequence();
                    }
                    self.sequence_command_held.get_or_insert(command_held);
                    self.current_press_started_at = Some(timestamp_ms);
                }
                self.held.insert(key);
                None
            }
            GestureEvent::ShiftUp { key, command_held } => {
                self.release(key, command_held, timestamp_ms)
            }
        }
    }

    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn reset_at(&mut self, timestamp_ms: u64) {
        self.reset();
        self.last_timestamp = Some(timestamp_ms);
    }

    fn clear_sequence(&mut self) {
        self.first_tap_released_at = None;
        self.current_press_started_at = None;
        self.sequence_command_held = None;
    }

    fn invalidate_current_sequence(&mut self) {
        self.clear_sequence();
        self.blocked_until_released = !self.held.is_empty();
    }

    fn release(
        &mut self,
        key: ShiftKey,
        command_held: bool,
        timestamp_ms: u64,
    ) -> Option<CaptureGestureIntent> {
        if !self.held.contains(key) {
            self.invalidate_current_sequence();
            return None;
        }

        self.held.remove(key);
        if self.blocked_until_released {
            if self.held.is_empty() {
                self.blocked_until_released = false;
            }
            self.current_press_started_at = None;
            return None;
        }

        if self.sequence_command_held != Some(command_held) {
            self.clear_sequence();
            return None;
        }

        let Some(started_at) = self.current_press_started_at.take() else {
            self.clear_sequence();
            return None;
        };
        if timestamp_ms.saturating_sub(started_at) > GESTURE_WINDOW_MS {
            self.clear_sequence();
            return None;
        }

        match self.first_tap_released_at.take() {
            Some(first_release)
                if timestamp_ms.saturating_sub(first_release) <= GESTURE_WINDOW_MS =>
            {
                self.clear_sequence();
                (!command_held).then_some(CaptureGestureIntent::CaptureSelection)
            }
            _ => {
                self.first_tap_released_at = Some(timestamp_ms);
                None
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn down(key: ShiftKey, command_held: bool) -> GestureEvent {
        GestureEvent::ShiftDown {
            key,
            is_repeat: false,
            command_held,
        }
    }

    fn repeat(key: ShiftKey, command_held: bool) -> GestureEvent {
        GestureEvent::ShiftDown {
            key,
            is_repeat: true,
            command_held,
        }
    }

    fn up(key: ShiftKey, command_held: bool) -> GestureEvent {
        GestureEvent::ShiftUp { key, command_held }
    }

    fn feed(
        machine: &mut DoubleShiftGesture,
        events: &[(u64, GestureEvent)],
    ) -> Vec<(u64, CaptureGestureIntent)> {
        events
            .iter()
            .filter_map(|(time, event)| machine.handle(*event, *time).map(|intent| (*time, intent)))
            .collect()
    }

    fn taps(command_held: bool) -> [(u64, GestureEvent); 4] {
        [
            (0, down(ShiftKey::Left, command_held)),
            (20, up(ShiftKey::Left, command_held)),
            (100, down(ShiftKey::Left, command_held)),
            (120, up(ShiftKey::Left, command_held)),
        ]
    }

    #[test]
    fn unmodified_double_shift_requests_selection_capture() {
        assert_eq!(
            feed(&mut DoubleShiftGesture::default(), &taps(false)),
            [(120, CaptureGestureIntent::CaptureSelection)]
        );
    }

    #[test]
    fn command_double_shift_is_not_a_product_shortcut() {
        assert!(feed(&mut DoubleShiftGesture::default(), &taps(true)).is_empty());
    }

    #[test]
    fn exact_threshold_edges_are_accepted() {
        let events = [
            (0, down(ShiftKey::Left, false)),
            (300, up(ShiftKey::Left, false)),
            (599, down(ShiftKey::Right, false)),
            (600, up(ShiftKey::Right, false)),
        ];
        assert_eq!(
            feed(&mut DoubleShiftGesture::default(), &events),
            [(600, CaptureGestureIntent::CaptureSelection)]
        );
    }

    #[test]
    fn one_millisecond_past_threshold_is_rejected() {
        let events = [
            (0, down(ShiftKey::Left, false)),
            (10, up(ShiftKey::Left, false)),
            (300, down(ShiftKey::Left, false)),
            (311, up(ShiftKey::Left, false)),
        ];
        assert!(feed(&mut DoubleShiftGesture::default(), &events).is_empty());
    }

    #[test]
    fn repeat_and_hold_never_create_a_tap() {
        let repeat_events = [
            (0, down(ShiftKey::Left, false)),
            (20, repeat(ShiftKey::Left, false)),
            (40, repeat(ShiftKey::Left, false)),
            (60, up(ShiftKey::Left, false)),
            (100, down(ShiftKey::Left, false)),
            (120, up(ShiftKey::Left, false)),
        ];
        assert_eq!(
            feed(&mut DoubleShiftGesture::default(), &repeat_events),
            [(120, CaptureGestureIntent::CaptureSelection)]
        );

        let hold_events = [
            (0, down(ShiftKey::Left, false)),
            (301, up(ShiftKey::Left, false)),
            (310, down(ShiftKey::Left, false)),
            (320, up(ShiftKey::Left, false)),
        ];
        assert!(feed(&mut DoubleShiftGesture::default(), &hold_events).is_empty());
    }

    #[test]
    fn shift_letter_resets_until_shift_releases() {
        let events = [
            (0, down(ShiftKey::Left, false)),
            (10, GestureEvent::OtherKey),
            (20, up(ShiftKey::Left, false)),
            (30, down(ShiftKey::Left, false)),
            (40, up(ShiftKey::Left, false)),
            (50, down(ShiftKey::Left, false)),
            (60, up(ShiftKey::Left, false)),
        ];
        assert_eq!(
            feed(&mut DoubleShiftGesture::default(), &events),
            [(60, CaptureGestureIntent::CaptureSelection)]
        );
    }

    #[test]
    fn left_and_right_taps_are_accepted_but_an_overlap_is_rejected() {
        let combination = [
            (0, down(ShiftKey::Left, false)),
            (10, up(ShiftKey::Left, false)),
            (20, down(ShiftKey::Right, false)),
            (30, up(ShiftKey::Right, false)),
        ];
        assert_eq!(
            feed(&mut DoubleShiftGesture::default(), &combination),
            [(30, CaptureGestureIntent::CaptureSelection)]
        );

        let overlap = [
            (0, down(ShiftKey::Left, false)),
            (10, down(ShiftKey::Right, false)),
            (20, up(ShiftKey::Left, false)),
            (30, up(ShiftKey::Right, false)),
            (40, down(ShiftKey::Left, false)),
            (50, up(ShiftKey::Left, false)),
            (60, down(ShiftKey::Left, false)),
            (70, up(ShiftKey::Left, false)),
        ];
        assert_eq!(
            feed(&mut DoubleShiftGesture::default(), &overlap),
            [(70, CaptureGestureIntent::CaptureSelection)]
        );
    }

    #[test]
    fn command_state_changes_reset_the_sequence() {
        let events = [
            (0, down(ShiftKey::Left, false)),
            (10, up(ShiftKey::Left, false)),
            (20, GestureEvent::CommandChanged { held: true }),
            (30, down(ShiftKey::Left, true)),
            (40, up(ShiftKey::Left, true)),
            (50, down(ShiftKey::Left, true)),
            (60, up(ShiftKey::Left, true)),
        ];
        assert!(feed(&mut DoubleShiftGesture::default(), &events).is_empty());

        let changed_while_held = [
            (0, down(ShiftKey::Left, false)),
            (5, GestureEvent::CommandChanged { held: true }),
            (10, up(ShiftKey::Left, true)),
            (20, down(ShiftKey::Left, true)),
            (30, up(ShiftKey::Left, true)),
        ];
        assert!(feed(&mut DoubleShiftGesture::default(), &changed_while_held).is_empty());
    }

    #[test]
    fn three_taps_trigger_once_and_start_a_new_sequence() {
        let events = [
            (0, down(ShiftKey::Left, false)),
            (10, up(ShiftKey::Left, false)),
            (20, down(ShiftKey::Left, false)),
            (30, up(ShiftKey::Left, false)),
            (40, down(ShiftKey::Left, false)),
            (50, up(ShiftKey::Left, false)),
        ];
        assert_eq!(
            feed(&mut DoubleShiftGesture::default(), &events),
            [(30, CaptureGestureIntent::CaptureSelection)]
        );
    }

    #[test]
    fn boundaries_shortcut_restart_and_clock_rewind_reset() {
        for boundary in [
            GestureEvent::SecurityBoundary,
            GestureEvent::FallbackShortcut,
            GestureEvent::ListenerRestart,
        ] {
            let events = [
                (0, down(ShiftKey::Left, false)),
                (10, up(ShiftKey::Left, false)),
                (20, boundary),
                (30, down(ShiftKey::Left, false)),
                (40, up(ShiftKey::Left, false)),
            ];
            assert!(feed(&mut DoubleShiftGesture::default(), &events).is_empty());
        }

        let mut machine = DoubleShiftGesture::default();
        assert!(feed(
            &mut machine,
            &[
                (100, down(ShiftKey::Left, false)),
                (110, up(ShiftKey::Left, false)),
                (10, down(ShiftKey::Left, false)),
                (20, up(ShiftKey::Left, false)),
            ],
        )
        .is_empty());
    }

    #[test]
    fn unmatched_release_and_duplicate_down_reset() {
        let events = [
            (0, up(ShiftKey::Left, false)),
            (10, down(ShiftKey::Left, false)),
            (20, down(ShiftKey::Left, false)),
            (30, up(ShiftKey::Left, false)),
            (40, down(ShiftKey::Left, false)),
            (50, up(ShiftKey::Left, false)),
        ];
        assert!(feed(&mut DoubleShiftGesture::default(), &events).is_empty());
    }
}
