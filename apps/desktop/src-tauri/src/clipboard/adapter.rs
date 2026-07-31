use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

use super::{compose, ClipboardError, ComposeRequest, ComposedClipboard};

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
    request: &ComposeRequest,
) -> Result<ComposedClipboard, ClipboardError> {
    let composed = compose(request)?;
    writer.write_text(&composed.markdown)?;
    Ok(composed)
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
    use crate::clipboard::{ComposeNote, ComposeOptions, CopyPreset};

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

    fn request(body: &str) -> ComposeRequest {
        ComposeRequest {
            notes: vec![ComposeNote {
                id: "note-id".to_owned(),
                section_name: "Inbox".to_owned(),
                body: body.to_owned(),
                selection_order: 0,
            }],
            preset: CopyPreset::Plain,
            options: ComposeOptions::default(),
        }
    }

    #[test]
    fn clipboard_adapter_writes_composed_markdown_once() {
        let mut writer = MemoryClipboardWriter::default();
        let result = compose_and_write(&mut writer, &request("copied")).expect("write clipboard");
        assert_eq!(result.markdown, "copied");
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
            Err(ClipboardError::AllBodiesEmpty)
        ));
        assert!(writer.writes.is_empty());

        let mut empty = request("value");
        empty.notes.clear();
        assert!(matches!(
            compose_and_write(&mut writer, &empty),
            Err(ClipboardError::EmptySelection)
        ));
        assert!(writer.writes.is_empty());
    }
}
