use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

use super::{compose, composer::summary, ClipboardError, ComposeNote, ComposedClipboard};

pub(crate) trait ClipboardWriter {
    fn write_text(&mut self, text: &str) -> Result<(), ClipboardError>;
}

pub(crate) struct TauriClipboardWriter<'a> {
    app: &'a AppHandle,
}

impl<'a> TauriClipboardWriter<'a> {
    pub(crate) fn new(app: &'a AppHandle) -> Self {
        Self { app }
    }
}

impl ClipboardWriter for TauriClipboardWriter<'_> {
    fn write_text(&mut self, text: &str) -> Result<(), ClipboardError> {
        self.app
            .clipboard()
            .write_text(text)
            .map_err(classify_write_error)
    }
}

pub(crate) fn compose_and_write(
    writer: &mut impl ClipboardWriter,
    note: &ComposeNote,
) -> Result<ComposedClipboard, ClipboardError> {
    let markdown = compose(note)?;
    writer.write_text(&markdown)?;
    summary(&markdown, note)
}

fn classify_write_error(error: tauri_plugin_clipboard_manager::Error) -> ClipboardError {
    let message = error.to_string().to_ascii_lowercase();
    if message.contains("denied") || message.contains("permission") {
        ClipboardError::PermissionDenied
    } else if message.contains("unsupported") || message.contains("not available") {
        ClipboardError::PlatformUnavailable
    } else {
        ClipboardError::WriteFailed
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::clipboard::ComposeNote;

    #[derive(Default)]
    struct MemoryClipboardWriter {
        writes: Vec<String>,
        error: Option<ClipboardError>,
    }

    impl ClipboardWriter for MemoryClipboardWriter {
        fn write_text(&mut self, text: &str) -> Result<(), ClipboardError> {
            if let Some(error) = self.error.take() {
                return Err(error);
            }
            self.writes.push(text.to_owned());
            Ok(())
        }
    }

    fn request(body: &str) -> ComposeNote {
        ComposeNote {
            body: body.to_owned(),
            tags: Vec::new(),
            attachments: Vec::new(),
        }
    }

    #[test]
    fn clipboard_adapter_writes_composed_markdown_once() {
        let mut writer = MemoryClipboardWriter::default();
        let result = compose_and_write(&mut writer, &request("copied")).expect("write clipboard");
        assert_eq!(result.byte_count, 6);
        assert_eq!(writer.writes, ["copied"]);
    }

    #[test]
    fn clipboard_adapter_maps_denied_write_without_recording_content() {
        let mut writer = MemoryClipboardWriter {
            writes: Vec::new(),
            error: Some(ClipboardError::PermissionDenied),
        };
        assert!(matches!(
            compose_and_write(&mut writer, &request("private content")),
            Err(ClipboardError::PermissionDenied)
        ));
        assert!(writer.writes.is_empty());
    }

    #[test]
    fn clipboard_adapter_does_not_write_empty_or_invalid_compositions() {
        let mut writer = MemoryClipboardWriter::default();
        assert!(matches!(
            compose_and_write(&mut writer, &request("\n \n")),
            Err(ClipboardError::EmptyBody)
        ));
        assert!(writer.writes.is_empty());
    }
}
