use std::collections::HashSet;

use super::{ClipboardError, ComposeNote, ComposeRequest, ComposedClipboard, CopyPreset};

const MIN_PREVIEW_CHARACTERS: u32 = 32;
const MAX_PREVIEW_CHARACTERS: u32 = 1_000;

pub fn compose(request: &ComposeRequest) -> Result<ComposedClipboard, ClipboardError> {
    validate_request(request)?;

    let mut notes = request.notes.iter().collect::<Vec<_>>();
    notes.sort_by_key(|note| note.selection_order);

    let normalized = notes
        .into_iter()
        .filter_map(|note| {
            let body = normalize_body(&note.body);
            (!body.is_empty()).then_some((note, body))
        })
        .collect::<Vec<_>>();
    let omitted_empty_count = request.notes.len().saturating_sub(normalized.len());

    if normalized.is_empty() {
        return Err(ClipboardError::AllBodiesEmpty);
    }

    let markdown = match request.preset {
        CopyPreset::Plain => compose_plain(&normalized),
        CopyPreset::Bulleted => compose_list(&normalized, |_| "- ".to_owned()),
        CopyPreset::Numbered => compose_list(&normalized, |index| format!("{}. ", index + 1)),
        CopyPreset::TaskList => compose_list(&normalized, |_| "- [ ] ".to_owned()),
        CopyPreset::Sectioned => compose_sectioned(&normalized),
    };
    let preview = truncate_preview(&markdown, request.options.preview_character_limit as usize);

    Ok(ComposedClipboard {
        markdown,
        note_count: u32::try_from(normalized.len()).map_err(|_| ClipboardError::InvalidRequest)?,
        omitted_empty_count: u32::try_from(omitted_empty_count)
            .map_err(|_| ClipboardError::InvalidRequest)?,
        preview,
    })
}

fn validate_request(request: &ComposeRequest) -> Result<(), ClipboardError> {
    if request.notes.is_empty() {
        return Err(ClipboardError::EmptySelection);
    }
    if !(MIN_PREVIEW_CHARACTERS..=MAX_PREVIEW_CHARACTERS)
        .contains(&request.options.preview_character_limit)
    {
        return Err(ClipboardError::InvalidRequest);
    }

    let mut ids = HashSet::with_capacity(request.notes.len());
    let mut orders = HashSet::with_capacity(request.notes.len());
    for note in &request.notes {
        if note.id.is_empty()
            || note.section_name.trim().is_empty()
            || !ids.insert(note.id.as_str())
            || !orders.insert(note.selection_order)
        {
            return Err(ClipboardError::InvalidRequest);
        }
    }

    Ok(())
}

fn normalize_body(body: &str) -> String {
    let normalized = body.replace("\r\n", "\n");
    let lines = normalized.split('\n').collect::<Vec<_>>();
    let Some(first) = lines.iter().position(|line| !line.trim().is_empty()) else {
        return String::new();
    };
    let last = lines
        .iter()
        .rposition(|line| !line.trim().is_empty())
        .expect("a first non-blank line guarantees a last one");
    lines[first..=last].join("\n")
}

fn compose_plain(notes: &[(&ComposeNote, String)]) -> String {
    notes
        .iter()
        .map(|(_, body)| body.as_str())
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn compose_list(notes: &[(&ComposeNote, String)], marker: impl Fn(usize) -> String) -> String {
    notes
        .iter()
        .enumerate()
        .map(|(index, (_, body))| {
            let prefix = marker(index);
            let continuation = " ".repeat(prefix.chars().count());
            let mut lines = body.split('\n');
            let first = lines.next().unwrap_or_default();
            let mut item = format!("{prefix}{first}");
            for line in lines {
                item.push('\n');
                item.push_str(&continuation);
                item.push_str(line);
            }
            item
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn compose_sectioned(notes: &[(&ComposeNote, String)]) -> String {
    let mut section_order = Vec::<&str>::new();
    for (note, _) in notes {
        if !section_order.contains(&note.section_name.as_str()) {
            section_order.push(&note.section_name);
        }
    }

    section_order
        .into_iter()
        .map(|section| {
            let bodies = notes
                .iter()
                .filter(|(note, _)| note.section_name == section)
                .map(|(_, body)| body.as_str())
                .collect::<Vec<_>>()
                .join("\n\n");
            format!("## {section}\n\n{bodies}")
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn truncate_preview(markdown: &str, limit: usize) -> String {
    let mut chars = markdown.chars();
    let preview = chars.by_ref().take(limit).collect::<String>();
    if chars.next().is_some() {
        format!("{preview}…")
    } else {
        preview
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clipboard::{ComposeOptions, CopyPreset};

    fn request(preset: CopyPreset, notes: &[(&str, &str, &str, u32)]) -> ComposeRequest {
        ComposeRequest {
            notes: notes
                .iter()
                .map(|(id, section, body, selection_order)| ComposeNote {
                    id: (*id).to_owned(),
                    section_name: (*section).to_owned(),
                    body: (*body).to_owned(),
                    selection_order: *selection_order,
                })
                .collect(),
            preset,
            options: ComposeOptions::default(),
        }
    }

    #[test]
    fn clipboard_composer_plain_normalizes_newlines_and_selection_order() {
        let result = compose(&request(
            CopyPreset::Plain,
            &[
                ("second", "Inbox", "\r\nβeta\r\n\r\n", 1),
                ("first", "Inbox", "\n  Alpha  \n", 0),
            ],
        ))
        .expect("compose plain");

        assert_eq!(result.markdown, "  Alpha  \n\nβeta");
        assert_eq!(result.note_count, 2);
        assert_eq!(result.omitted_empty_count, 0);
    }

    #[test]
    fn clipboard_composer_bulleted_preserves_fences_and_nested_lists() {
        let result = compose(&request(
            CopyPreset::Bulleted,
            &[(
                "one",
                "Inbox",
                "Use this:\n```rust\nfn main() {}\n```\n- nested",
                0,
            )],
        ))
        .expect("compose bullets");

        assert_eq!(
            result.markdown,
            "- Use this:\n  ```rust\n  fn main() {}\n  ```\n  - nested"
        );
    }

    #[test]
    fn clipboard_composer_numbered_and_task_lists_have_marker_width_indentation() {
        let numbered = compose(&ComposeRequest {
            notes: (0..10)
                .map(|index| ComposeNote {
                    id: format!("id-{index}"),
                    section_name: "Inbox".to_owned(),
                    body: "line one\nline two".to_owned(),
                    selection_order: index,
                })
                .collect(),
            preset: CopyPreset::Numbered,
            options: ComposeOptions::default(),
        })
        .expect("compose numbered");
        assert!(numbered.markdown.contains("10. line one\n    line two"));

        let tasks = compose(&request(
            CopyPreset::TaskList,
            &[("one", "Inbox", "task\ncontinuation", 0)],
        ))
        .expect("compose task list");
        assert_eq!(tasks.markdown, "- [ ] task\n      continuation");
    }

    #[test]
    fn clipboard_composer_sectioned_uses_first_seen_section_order() {
        let result = compose(&request(
            CopyPreset::Sectioned,
            &[
                ("one", "Research", "Un lien [sûr](https://example.test)", 0),
                ("two", "Ideas", "Deux", 1),
                ("three", "Research", "Trois", 2),
            ],
        ))
        .expect("compose sections");

        assert_eq!(
            result.markdown,
            "## Research\n\nUn lien [sûr](https://example.test)\n\nTrois\n\n## Ideas\n\nDeux"
        );
    }

    #[test]
    fn clipboard_composer_omits_empty_bodies_and_rejects_all_empty() {
        let result = compose(&request(
            CopyPreset::Plain,
            &[
                ("empty", "Inbox", " \n\t", 0),
                ("kept", "Inbox", "value", 1),
            ],
        ))
        .expect("compose non-empty note");
        assert_eq!(result.markdown, "value");
        assert_eq!(result.note_count, 1);
        assert_eq!(result.omitted_empty_count, 1);

        assert!(matches!(
            compose(&request(
                CopyPreset::Plain,
                &[("empty", "Inbox", "\r\n \r\n", 0)]
            )),
            Err(ClipboardError::AllBodiesEmpty)
        ));
    }

    #[test]
    fn clipboard_composer_preview_is_unicode_safe() {
        let mut request = request(CopyPreset::Plain, &[("one", "Inbox", "éclair 🍎 suite", 0)]);
        request.options.preview_character_limit = 32;
        let result = compose(&request).expect("compose preview");
        assert_eq!(result.preview, "éclair 🍎 suite");
    }

    #[test]
    fn clipboard_composer_rejects_empty_or_ambiguous_requests() {
        assert!(matches!(
            compose(&ComposeRequest {
                notes: Vec::new(),
                preset: CopyPreset::Plain,
                options: ComposeOptions::default(),
            }),
            Err(ClipboardError::EmptySelection)
        ));
        assert!(matches!(
            compose(&request(
                CopyPreset::Plain,
                &[
                    ("duplicate", "Inbox", "one", 0),
                    ("duplicate", "Inbox", "two", 1)
                ]
            )),
            Err(ClipboardError::InvalidRequest)
        ));
    }
}
