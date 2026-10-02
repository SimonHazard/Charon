//! Validation of the one user-chosen reveal-and-focus-composer accelerator
//! (ADR 0025). Pure: no I/O, no registration, and no error that echoes the
//! rejected text.

use super::{CaptureError, PlatformKind};

/// The longest accelerator Charon accepts or stores, in bytes.
pub const MAX_ACCELERATOR_LEN: usize = 64;

/// Whether the user may replace the composer accelerator here. The Wayland
/// portal owns its trigger, so Charon never rebinds it.
pub fn configurable(platform: PlatformKind) -> bool {
    matches!(
        platform,
        PlatformKind::Macos | PlatformKind::Windows | PlatformKind::LinuxX11
    )
}

/// Combinations the operating system or common editing commands already use.
/// A policy constant: changing it needs a unit-test update and an ADR note.
fn reserved(platform: PlatformKind) -> &'static [&'static str] {
    match platform {
        PlatformKind::Macos => &[
            "Cmd+Shift+3",
            "Cmd+Shift+4",
            "Cmd+Shift+5",
            "Cmd+Shift+Z",
            "Cmd+Ctrl+Q",
            "Cmd+Ctrl+Space",
        ],
        PlatformKind::Windows => &["Ctrl+Shift+Z", "Super+Shift+S"],
        PlatformKind::LinuxX11 => &["Ctrl+Shift+Z", "Ctrl+Alt+T", "Ctrl+Alt+L"],
        PlatformKind::LinuxWayland | PlatformKind::Unknown => &[],
    }
}

/// Modifier positions in canonical order: Cmd (macOS) or Super, Ctrl, Alt, Shift.
const COMMAND: usize = 0;
const CONTROL: usize = 1;
const ALT: usize = 2;
const SHIFT: usize = 3;

fn modifier(token: &str, platform: PlatformKind) -> Option<usize> {
    let macos = platform == PlatformKind::Macos;
    match token.to_ascii_uppercase().as_str() {
        "CMDORCTRL" | "COMMANDORCONTROL" if macos => Some(COMMAND),
        "CMDORCTRL" | "COMMANDORCONTROL" => Some(CONTROL),
        "CMD" | "COMMAND" | "SUPER" | "META" => Some(COMMAND),
        "CTRL" | "CONTROL" => Some(CONTROL),
        "ALT" | "OPTION" => Some(ALT),
        "SHIFT" => Some(SHIFT),
        _ => None,
    }
}

/// The canonical key name, or `None` for anything Charon does not accept.
/// Letters and digits name physical key positions, as the platform backends do.
fn key(token: &str, platform: PlatformKind) -> Option<String> {
    let upper = token.to_ascii_uppercase();
    let bare = upper
        .strip_prefix("KEY")
        .filter(|rest| rest.len() == 1)
        .or_else(|| upper.strip_prefix("DIGIT").filter(|rest| rest.len() == 1))
        .unwrap_or(&upper);
    let mut chars = bare.chars();
    if let (Some(single), None) = (chars.next(), chars.next()) {
        return single.is_ascii_alphanumeric().then(|| single.to_string());
    }
    if bare == "SPACE" {
        return Some("Space".to_owned());
    }
    // The macOS shortcut backend maps no key beyond F20.
    let highest = if platform == PlatformKind::Macos {
        20
    } else {
        24
    };
    bare.strip_prefix('F')
        .filter(|number| !number.starts_with('0'))
        .and_then(|number| number.parse::<u8>().ok())
        .filter(|number| (1..=highest).contains(number))
        .map(|number| format!("F{number}"))
}

/// Validates an accelerator and returns its canonical form: modifiers in the
/// order Cmd (macOS) or Super, Ctrl, Alt, Shift, then exactly one key.
pub fn normalize(input: &str, platform: PlatformKind) -> Result<String, CaptureError> {
    if !configurable(platform) {
        return Err(CaptureError::ShortcutNotConfigurable);
    }
    if input.is_empty() || input.len() > MAX_ACCELERATOR_LEN || !input.is_ascii() {
        return Err(CaptureError::InvalidShortcut);
    }
    let tokens: Vec<&str> = input.split('+').map(str::trim).collect();
    if tokens.iter().any(|token| token.is_empty()) {
        return Err(CaptureError::InvalidShortcut);
    }
    let (key_token, modifier_tokens) = tokens.split_last().ok_or(CaptureError::InvalidShortcut)?;
    let mut held = [false; 4];
    for token in modifier_tokens {
        let position = modifier(token, platform).ok_or(CaptureError::InvalidShortcut)?;
        if std::mem::replace(&mut held[position], true) {
            return Err(CaptureError::InvalidShortcut);
        }
    }
    let key = key(key_token, platform).ok_or(CaptureError::InvalidShortcut)?;
    let count = held.iter().filter(|modifier| **modifier).count();
    if count < 2 || !(held[COMMAND] || held[CONTROL] || held[ALT]) {
        return Err(CaptureError::InvalidShortcut);
    }
    let command = if platform == PlatformKind::Macos {
        "Cmd"
    } else {
        "Super"
    };
    let canonical = [command, "Ctrl", "Alt", "Shift"]
        .into_iter()
        .zip(held)
        .filter_map(|(name, pressed)| pressed.then_some(name))
        .chain(std::iter::once(key.as_str()))
        .collect::<Vec<_>>()
        .join("+");
    if reserved(platform).contains(&canonical.as_str()) {
        return Err(CaptureError::ShortcutReserved);
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture::coordinator::composer_shortcut;

    fn invalid(input: &str, platform: PlatformKind) -> bool {
        matches!(
            normalize(input, platform),
            Err(CaptureError::InvalidShortcut)
        )
    }

    #[test]
    fn both_platform_defaults_are_valid() {
        assert_eq!(
            normalize(composer_shortcut(PlatformKind::Macos), PlatformKind::Macos).unwrap(),
            "Cmd+Shift+Space"
        );
        for platform in [PlatformKind::Windows, PlatformKind::LinuxX11] {
            assert_eq!(
                normalize(composer_shortcut(platform), platform).unwrap(),
                "Alt+Shift+Space"
            );
        }
    }

    #[test]
    fn modifiers_are_case_insensitive_and_canonically_ordered() {
        assert_eq!(
            normalize("ctrl+alt+n", PlatformKind::Windows).unwrap(),
            "Ctrl+Alt+N"
        );
        assert_eq!(
            normalize("Shift+Alt+KeyN", PlatformKind::Windows).unwrap(),
            "Alt+Shift+N"
        );
        assert_eq!(
            normalize(" Shift + Option + Command + Digit7 ", PlatformKind::Macos).unwrap(),
            "Cmd+Alt+Shift+7"
        );
        assert_eq!(
            normalize("Meta+Control+f13", PlatformKind::LinuxX11).unwrap(),
            "Super+Ctrl+F13"
        );
    }

    #[test]
    fn cmd_or_ctrl_and_the_command_key_follow_the_platform() {
        assert_eq!(
            normalize("CmdOrCtrl+Alt+N", PlatformKind::Macos).unwrap(),
            "Cmd+Alt+N"
        );
        assert_eq!(
            normalize("CommandOrControl+Alt+N", PlatformKind::Windows).unwrap(),
            "Ctrl+Alt+N"
        );
        assert_eq!(
            normalize("Super+Ctrl+N", PlatformKind::Macos).unwrap(),
            "Cmd+Ctrl+N"
        );
        assert_eq!(
            normalize("Cmd+Alt+N", PlatformKind::Windows).unwrap(),
            "Super+Alt+N"
        );
    }

    #[test]
    fn accepts_letters_digits_space_and_function_keys() {
        for (input, expected) in [
            ("Ctrl+Alt+a", "Ctrl+Alt+A"),
            ("Ctrl+Alt+KeyZ", "Ctrl+Alt+Z"),
            ("Ctrl+Alt+0", "Ctrl+Alt+0"),
            ("Ctrl+Alt+Digit9", "Ctrl+Alt+9"),
            ("Ctrl+Alt+space", "Ctrl+Alt+Space"),
            ("Ctrl+Alt+F1", "Ctrl+Alt+F1"),
            ("Ctrl+Alt+F24", "Ctrl+Alt+F24"),
        ] {
            assert_eq!(normalize(input, PlatformKind::Windows).unwrap(), expected);
        }
        assert_eq!(
            normalize("Cmd+Ctrl+F20", PlatformKind::Macos).unwrap(),
            "Cmd+Ctrl+F20"
        );
        assert!(invalid("Cmd+Ctrl+F21", PlatformKind::Macos));
        for key in [
            "F0", "F25", "F01", "Enter", "Tab", "Escape", "KeyAB", "Digit10",
        ] {
            assert!(invalid(&format!("Ctrl+Alt+{key}"), PlatformKind::Windows));
        }
    }

    #[test]
    fn rejects_malformed_and_weak_accelerators() {
        for input in [
            "",
            "Cmd+F",
            "Shift+Alt",
            "Ctrl+Alt+Enter",
            "Ctrl++",
            "Ctrl+Ctrl+N",
            "CmdOrCtrl+Ctrl+N",
            "Ctrl+N+Alt",
            "Ctrl+Alt+N+M",
            "Alt+Shift+Ctrl",
            "Shift+Shift+N",
            "N",
            "Ctrl+Alt+é",
            "Ctrl+Alt+\u{0}",
        ] {
            assert!(invalid(input, PlatformKind::Windows), "{input:?}");
        }
        // Shift with one other modifier counts only when that one is Cmd, Super, Ctrl, or Alt.
        assert!(invalid("Shift+N", PlatformKind::Macos));
        let too_long = format!("Ctrl+Alt+{}N", " ".repeat(MAX_ACCELERATOR_LEN - 9));
        assert_eq!(too_long.len(), MAX_ACCELERATOR_LEN + 1);
        assert!(invalid(&too_long, PlatformKind::Windows));
        let longest = format!("Ctrl+Alt+{}N", " ".repeat(MAX_ACCELERATOR_LEN - 10));
        assert_eq!(longest.len(), MAX_ACCELERATOR_LEN);
        assert_eq!(
            normalize(&longest, PlatformKind::Windows).unwrap(),
            "Ctrl+Alt+N"
        );
    }

    #[test]
    fn each_reserved_combination_is_refused_on_its_platform() {
        for platform in [
            PlatformKind::Macos,
            PlatformKind::Windows,
            PlatformKind::LinuxX11,
        ] {
            for combination in reserved(platform) {
                assert!(
                    matches!(
                        normalize(combination, platform),
                        Err(CaptureError::ShortcutReserved)
                    ),
                    "{combination}"
                );
            }
        }
        assert!(matches!(
            normalize("Shift+CmdOrCtrl+Z", PlatformKind::Macos),
            Err(CaptureError::ShortcutReserved)
        ));
        assert!(matches!(
            normalize("Alt+Ctrl+t", PlatformKind::LinuxX11),
            Err(CaptureError::ShortcutReserved)
        ));
        // Reserved lists are per platform.
        assert_eq!(
            normalize("Ctrl+Alt+T", PlatformKind::Windows).unwrap(),
            "Ctrl+Alt+T"
        );
    }

    #[test]
    fn wayland_and_unknown_platforms_are_not_configurable() {
        for platform in [PlatformKind::LinuxWayland, PlatformKind::Unknown] {
            assert!(!configurable(platform));
            assert!(matches!(
                normalize("Ctrl+Alt+N", platform),
                Err(CaptureError::ShortcutNotConfigurable)
            ));
        }
    }
}
