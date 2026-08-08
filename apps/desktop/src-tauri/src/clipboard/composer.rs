use std::collections::HashSet;

use super::{ClipboardError, ComposeNote, ComposedClipboard};

pub fn compose(notes: &[ComposeNote]) -> Result<String, ClipboardError> {
    validate(notes)?;
    let multiple = notes.len() > 1;
    let sections = notes
        .iter()
        .enumerate()
        .map(|(index, note)| {
            let body = if multiple {
                normalize_separator_edge(&note.body)
            } else {
                note.body.clone()
            };
            let mut section = if multiple {
                format!("## Note {}\n\n{body}", index + 1)
            } else {
                body
            };
            append_metadata(&mut section, note);
            section
        })
        .collect::<Vec<_>>();
    Ok(sections.join("\n\n---\n\n"))
}

pub(crate) fn summary(
    markdown: &str,
    notes: &[ComposeNote],
) -> Result<ComposedClipboard, ClipboardError> {
    Ok(ComposedClipboard {
        note_count: u32::try_from(notes.len()).map_err(|_| ClipboardError::InvalidRequest)?,
        tag_count: u32::try_from(notes.iter().map(|note| note.tags.len()).sum::<usize>())
            .map_err(|_| ClipboardError::InvalidRequest)?,
        attachment_count: u32::try_from(
            notes
                .iter()
                .map(|note| note.attachments.len())
                .sum::<usize>(),
        )
        .map_err(|_| ClipboardError::InvalidRequest)?,
        byte_count: u64::try_from(markdown.len()).map_err(|_| ClipboardError::InvalidRequest)?,
    })
}

fn validate(notes: &[ComposeNote]) -> Result<(), ClipboardError> {
    if notes.is_empty() {
        return Err(ClipboardError::EmptySelection);
    }
    if notes.iter().all(|note| note.body.trim().is_empty()) {
        return Err(ClipboardError::AllBodiesEmpty);
    }
    let mut ids = HashSet::new();
    for note in notes {
        if note.id.is_empty() || note.body.trim().is_empty() || !ids.insert(&note.id) {
            return Err(ClipboardError::InvalidRequest);
        }
    }
    Ok(())
}

fn append_metadata(output: &mut String, note: &ComposeNote) {
    if !note.tags.is_empty() {
        output.push_str("\n\n**Tags:** ");
        output.push_str(
            &note
                .tags
                .iter()
                .map(|tag| inline_code(tag))
                .collect::<Vec<_>>()
                .join(" "),
        );
    }
    if !note.attachments.is_empty() {
        output.push_str("\n\n**Attachments:**");
        let mut attachments = note.attachments.iter().collect::<Vec<_>>();
        attachments.sort_by(|left, right| {
            left.created_at
                .cmp(&right.created_at)
                .then(left.id.cmp(&right.id))
        });
        for attachment in attachments {
            output.push_str("\n- ");
            output.push_str(&inline_code(&attachment.file_name));
            output.push_str(": ");
            output.push_str(&inline_code(&attachment.absolute_path));
        }
    }
}

fn normalize_separator_edge(body: &str) -> String {
    let lines = body.split_inclusive('\n').collect::<Vec<_>>();
    let first = lines
        .iter()
        .position(|line| !line.trim().is_empty())
        .unwrap_or(0);
    let last = lines
        .iter()
        .rposition(|line| !line.trim().is_empty())
        .unwrap_or(first);
    lines[first..=last]
        .concat()
        .trim_end_matches(['\r', '\n'])
        .to_owned()
}

fn inline_code(value: &str) -> String {
    let longest = value
        .split(|character| character != '`')
        .map(str::len)
        .max()
        .unwrap_or(0);
    let delimiter = "`".repeat(longest + 1);
    format!("{delimiter} {value} {delimiter}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn note(id: &str, body: &str) -> ComposeNote {
        ComposeNote {
            id: id.to_owned(),
            body: body.to_owned(),
            tags: Vec::new(),
            attachments: Vec::new(),
        }
    }

    #[test]
    fn one_note_has_no_invented_heading_and_preserves_body() {
        assert_eq!(
            compose(&[note("one", "  body\n\n")]).expect("compose"),
            "  body\n\n"
        );
    }

    #[test]
    fn multiple_notes_are_ordered_and_separator_edges_are_normalized() {
        assert_eq!(
            compose(&[note("one", "\nFirst\n\n"), note("two", "\nDeux\n")]).expect("compose"),
            "## Note 1\n\nFirst\n\n---\n\n## Note 2\n\nDeux"
        );
    }

    #[test]
    fn metadata_uses_safe_longer_backtick_delimiters() {
        let mut value = note("one", "Body");
        value.tags = vec!["a``b".to_owned()];
        value.attachments = vec![crate::clipboard::ComposeAttachment {
            id: "a".to_owned(),
            file_name: "x`y.txt".to_owned(),
            absolute_path: "/tmp/a``b".to_owned(),
            created_at: "2026-01-01T00:00:00Z".to_owned(),
        }];
        let markdown = compose(&[value]).expect("compose");
        assert!(markdown.contains("``` a``b ```"));
        assert!(markdown.contains("``` /tmp/a``b ```"));
    }
}
