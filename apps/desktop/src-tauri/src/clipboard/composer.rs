use super::{ClipboardError, ComposeNote, ComposedClipboard};

pub fn compose(note: &ComposeNote) -> Result<String, ClipboardError> {
    if note.body.trim().is_empty() {
        return Err(ClipboardError::EmptyBody);
    }
    let mut output = note.body.clone();
    append_metadata(&mut output, note);
    Ok(output)
}

pub(crate) fn summary(
    markdown: &str,
    note: &ComposeNote,
) -> Result<ComposedClipboard, ClipboardError> {
    Ok(ComposedClipboard {
        tag_count: u32::try_from(note.tags.len()).map_err(|_| ClipboardError::InvalidRequest)?,
        attachment_count: u32::try_from(note.attachments.len())
            .map_err(|_| ClipboardError::InvalidRequest)?,
        byte_count: u64::try_from(markdown.len()).map_err(|_| ClipboardError::InvalidRequest)?,
    })
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

    fn note(body: &str) -> ComposeNote {
        ComposeNote {
            body: body.to_owned(),
            tags: Vec::new(),
            attachments: Vec::new(),
        }
    }

    #[test]
    fn one_note_has_no_invented_heading_and_preserves_body() {
        assert_eq!(compose(&note("  body\n\n")).expect("compose"), "  body\n\n");
    }

    #[test]
    fn metadata_uses_safe_longer_backtick_delimiters() {
        let mut value = note("Body");
        value.tags = vec!["a``b".to_owned()];
        value.attachments = vec![crate::clipboard::ComposeAttachment {
            id: "a".to_owned(),
            file_name: "x`y.txt".to_owned(),
            absolute_path: "/tmp/a``b".to_owned(),
            created_at: "2026-01-01T00:00:00Z".to_owned(),
        }];
        let markdown = compose(&value).expect("compose");
        assert!(markdown.contains("``` a``b ```"));
        assert!(markdown.contains("``` /tmp/a``b ```"));
    }
}
