const GESTURE_WINDOW_MS: u64 = 300;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ShiftKey {
    Left,
    Right,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum GestureEvent {
    ShiftDown { key: ShiftKey, is_repeat: bool },
    ShiftUp { key: ShiftKey },
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

/// Pure detector for two complete Shift taps.
///
/// Callers supply milliseconds from one monotonic clock. The detector never
/// suppresses an input event; it only reports when the normalized sequence is
/// complete.
#[derive(Debug, Default)]
pub struct DoubleShiftGesture {
    held: HeldShifts,
    current_press_started_at: Option<u64>,
    first_tap_released_at: Option<u64>,
    blocked_until_released: bool,
    last_timestamp: Option<u64>,
}

impl DoubleShiftGesture {
    #[must_use]
    pub fn handle(&mut self, event: GestureEvent, timestamp_ms: u64) -> bool {
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
            self.first_tap_released_at = None;
        }

        match event {
            GestureEvent::SecurityBoundary
            | GestureEvent::ListenerRestart
            | GestureEvent::FallbackShortcut => {
                self.reset_at(timestamp_ms);
                false
            }
            GestureEvent::OtherKey => {
                self.invalidate_current_sequence();
                false
            }
            GestureEvent::ShiftDown {
                key,
                is_repeat: true,
            } => {
                // Hardware auto-repeat cannot create an additional tap.
                if !self.held.contains(key) {
                    self.invalidate_current_sequence();
                }
                false
            }
            GestureEvent::ShiftDown {
                key,
                is_repeat: false,
            } => {
                if self.held.contains(key) || !self.held.is_empty() {
                    self.blocked_until_released = true;
                    self.first_tap_released_at = None;
                    self.current_press_started_at = None;
                } else if !self.blocked_until_released {
                    self.current_press_started_at = Some(timestamp_ms);
                }
                self.held.insert(key);
                false
            }
            GestureEvent::ShiftUp { key } => self.release(key, timestamp_ms),
        }
    }

    pub fn reset(&mut self) {
        *self = Self::default();
    }

    fn reset_at(&mut self, timestamp_ms: u64) {
        self.reset();
        self.last_timestamp = Some(timestamp_ms);
    }

    fn invalidate_current_sequence(&mut self) {
        self.first_tap_released_at = None;
        self.current_press_started_at = None;
        self.blocked_until_released = !self.held.is_empty();
    }

    fn release(&mut self, key: ShiftKey, timestamp_ms: u64) -> bool {
        if !self.held.contains(key) {
            self.invalidate_current_sequence();
            return false;
        }

        self.held.remove(key);
        if self.blocked_until_released {
            if self.held.is_empty() {
                self.blocked_until_released = false;
            }
            self.current_press_started_at = None;
            return false;
        }

        let Some(started_at) = self.current_press_started_at.take() else {
            self.first_tap_released_at = None;
            return false;
        };
        if timestamp_ms.saturating_sub(started_at) > GESTURE_WINDOW_MS {
            self.first_tap_released_at = None;
            return false;
        }

        match self.first_tap_released_at.take() {
            Some(first_release)
                if timestamp_ms.saturating_sub(first_release) <= GESTURE_WINDOW_MS =>
            {
                true
            }
            _ => {
                self.first_tap_released_at = Some(timestamp_ms);
                false
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn down(key: ShiftKey) -> GestureEvent {
        GestureEvent::ShiftDown {
            key,
            is_repeat: false,
        }
    }

    fn repeat(key: ShiftKey) -> GestureEvent {
        GestureEvent::ShiftDown {
            key,
            is_repeat: true,
        }
    }

    fn up(key: ShiftKey) -> GestureEvent {
        GestureEvent::ShiftUp { key }
    }

    fn feed(machine: &mut DoubleShiftGesture, events: &[(u64, GestureEvent)]) -> Vec<u64> {
        events
            .iter()
            .filter_map(|(time, event)| machine.handle(*event, *time).then_some(*time))
            .collect()
    }

    #[test]
    fn capture_gesture_triggers_after_two_complete_taps() {
        let triggers = feed(
            &mut DoubleShiftGesture::default(),
            &[
                (0, down(ShiftKey::Left)),
                (20, up(ShiftKey::Left)),
                (100, down(ShiftKey::Left)),
                (120, up(ShiftKey::Left)),
            ],
        );
        assert_eq!(triggers, [120]);
    }

    #[test]
    fn capture_gesture_accepts_exact_threshold_edges() {
        let triggers = feed(
            &mut DoubleShiftGesture::default(),
            &[
                (0, down(ShiftKey::Left)),
                (300, up(ShiftKey::Left)),
                (599, down(ShiftKey::Right)),
                (600, up(ShiftKey::Right)),
            ],
        );
        assert_eq!(triggers, [600]);
    }

    #[test]
    fn capture_gesture_rejects_one_millisecond_past_threshold() {
        let triggers = feed(
            &mut DoubleShiftGesture::default(),
            &[
                (0, down(ShiftKey::Left)),
                (10, up(ShiftKey::Left)),
                (300, down(ShiftKey::Left)),
                (311, up(ShiftKey::Left)),
            ],
        );
        assert!(triggers.is_empty());
    }

    #[test]
    fn capture_gesture_ignores_repeat_without_counting_it_as_a_tap() {
        let triggers = feed(
            &mut DoubleShiftGesture::default(),
            &[
                (0, down(ShiftKey::Left)),
                (20, repeat(ShiftKey::Left)),
                (40, repeat(ShiftKey::Left)),
                (60, up(ShiftKey::Left)),
                (100, down(ShiftKey::Left)),
                (120, up(ShiftKey::Left)),
            ],
        );
        assert_eq!(triggers, [120]);
    }

    #[test]
    fn capture_gesture_shift_letter_resets_until_shift_releases() {
        let triggers = feed(
            &mut DoubleShiftGesture::default(),
            &[
                (0, down(ShiftKey::Left)),
                (10, GestureEvent::OtherKey),
                (20, up(ShiftKey::Left)),
                (30, down(ShiftKey::Left)),
                (40, up(ShiftKey::Left)),
                (50, down(ShiftKey::Left)),
                (60, up(ShiftKey::Left)),
            ],
        );
        assert_eq!(triggers, [60]);
    }

    #[test]
    fn capture_gesture_accepts_left_right_tap_combinations() {
        let triggers = feed(
            &mut DoubleShiftGesture::default(),
            &[
                (0, down(ShiftKey::Left)),
                (10, up(ShiftKey::Left)),
                (20, down(ShiftKey::Right)),
                (30, up(ShiftKey::Right)),
            ],
        );
        assert_eq!(triggers, [30]);
    }

    #[test]
    fn capture_gesture_rejects_overlapping_left_right_chord() {
        let triggers = feed(
            &mut DoubleShiftGesture::default(),
            &[
                (0, down(ShiftKey::Left)),
                (10, down(ShiftKey::Right)),
                (20, up(ShiftKey::Left)),
                (30, up(ShiftKey::Right)),
                (40, down(ShiftKey::Left)),
                (50, up(ShiftKey::Left)),
                (60, down(ShiftKey::Left)),
                (70, up(ShiftKey::Left)),
            ],
        );
        assert_eq!(triggers, [70]);
    }

    #[test]
    fn capture_gesture_three_taps_trigger_once_and_start_a_new_sequence() {
        let triggers = feed(
            &mut DoubleShiftGesture::default(),
            &[
                (0, down(ShiftKey::Left)),
                (10, up(ShiftKey::Left)),
                (20, down(ShiftKey::Left)),
                (30, up(ShiftKey::Left)),
                (40, down(ShiftKey::Left)),
                (50, up(ShiftKey::Left)),
            ],
        );
        assert_eq!(triggers, [30]);
    }

    #[test]
    fn capture_gesture_long_hold_is_not_a_tap() {
        let triggers = feed(
            &mut DoubleShiftGesture::default(),
            &[
                (0, down(ShiftKey::Left)),
                (301, up(ShiftKey::Left)),
                (310, down(ShiftKey::Left)),
                (320, up(ShiftKey::Left)),
            ],
        );
        assert!(triggers.is_empty());
    }

    #[test]
    fn capture_gesture_sleep_resume_boundary_resets() {
        let triggers = feed(
            &mut DoubleShiftGesture::default(),
            &[
                (0, down(ShiftKey::Left)),
                (10, up(ShiftKey::Left)),
                (5_000, GestureEvent::SecurityBoundary),
                (5_010, down(ShiftKey::Left)),
                (5_020, up(ShiftKey::Left)),
            ],
        );
        assert!(triggers.is_empty());
    }

    #[test]
    fn capture_gesture_fallback_shortcut_cannot_duplicate_open() {
        let triggers = feed(
            &mut DoubleShiftGesture::default(),
            &[
                (0, down(ShiftKey::Left)),
                (10, up(ShiftKey::Left)),
                (20, GestureEvent::FallbackShortcut),
                (30, down(ShiftKey::Left)),
                (40, up(ShiftKey::Left)),
            ],
        );
        assert!(triggers.is_empty());
    }

    #[test]
    fn capture_gesture_listener_restart_and_clock_rewind_reset() {
        let mut machine = DoubleShiftGesture::default();
        assert!(feed(
            &mut machine,
            &[
                (100, down(ShiftKey::Left)),
                (110, up(ShiftKey::Left)),
                (120, GestureEvent::ListenerRestart),
                (130, down(ShiftKey::Left)),
                (140, up(ShiftKey::Left)),
            ],
        )
        .is_empty());
        assert!(feed(
            &mut machine,
            &[(10, down(ShiftKey::Left)), (20, up(ShiftKey::Left))],
        )
        .is_empty());
    }

    #[test]
    fn capture_gesture_unmatched_release_and_duplicate_down_reset() {
        let triggers = feed(
            &mut DoubleShiftGesture::default(),
            &[
                (0, up(ShiftKey::Left)),
                (10, down(ShiftKey::Left)),
                (20, down(ShiftKey::Left)),
                (30, up(ShiftKey::Left)),
                (40, down(ShiftKey::Left)),
                (50, up(ShiftKey::Left)),
            ],
        );
        assert!(triggers.is_empty());
    }
}
