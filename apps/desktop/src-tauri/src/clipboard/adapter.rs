use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;

use super::{compose, composer::summary, ClipboardError, ComposeNote, ComposedClipboard};

pub(crate) trait ClipboardWriter {
    fn write_text(&mut self, text: &str) -> Result<(), ClipboardError>;
    fn write_image(&mut self, rgba: Vec<u8>, width: u32, height: u32)
        -> Result<(), ClipboardError>;
}

/// The largest drawing image Charon copies (ADR 0033): Preview renders a drawing at most at
/// twice its 4,096-unit viewBox limit, and the PNG stays far below this many bytes.
pub(crate) const MAX_DRAWING_PNG_BYTES: usize = 8 * 1024 * 1024;
const MAX_DRAWING_IMAGE_SIDE: u32 = 8_192;

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

    fn write_image(
        &mut self,
        rgba: Vec<u8>,
        width: u32,
        height: u32,
    ) -> Result<(), ClipboardError> {
        self.app
            .clipboard()
            .write_image(&tauri::image::Image::new_owned(rgba, width, height))
            .map_err(classify_write_error)
    }
}

/// Copies one rendered drawing as an image (ADR 0033): the webview renders the validated
/// drawing to PNG, Rust decodes it within bounds and performs one explicit clipboard write.
/// It never reads Note files or Attachments and never changes a Note.
pub(crate) fn write_drawing_png(
    writer: &mut impl ClipboardWriter,
    png: &[u8],
) -> Result<(), ClipboardError> {
    if png.is_empty() || png.len() > MAX_DRAWING_PNG_BYTES {
        return Err(ClipboardError::InvalidRequest);
    }
    let (rgba, width, height) = decode_rgba(png).ok_or(ClipboardError::InvalidRequest)?;
    writer.write_image(rgba, width, height)
}

fn decode_rgba(png_bytes: &[u8]) -> Option<(Vec<u8>, u32, u32)> {
    let mut decoder = png::Decoder::new(std::io::Cursor::new(png_bytes));
    decoder.set_transformations(png::Transformations::normalize_to_color8());
    let mut reader = decoder.read_info().ok()?;
    let (width, height) = {
        let info = reader.info();
        (info.width, info.height)
    };
    if width == 0
        || height == 0
        || width > MAX_DRAWING_IMAGE_SIDE
        || height > MAX_DRAWING_IMAGE_SIDE
    {
        return None;
    }
    let mut buffer = vec![0; reader.output_buffer_size()?];
    let frame = reader.next_frame(&mut buffer).ok()?;
    let pixels = &buffer[..frame.buffer_size()];
    let rgba = match frame.color_type {
        png::ColorType::Rgba => pixels.to_vec(),
        png::ColorType::Rgb => pixels
            .chunks_exact(3)
            .flat_map(|pixel| [pixel[0], pixel[1], pixel[2], 255])
            .collect(),
        png::ColorType::GrayscaleAlpha => pixels
            .chunks_exact(2)
            .flat_map(|pixel| [pixel[0], pixel[0], pixel[0], pixel[1]])
            .collect(),
        png::ColorType::Grayscale => pixels
            .iter()
            .flat_map(|&value| [value, value, value, 255])
            .collect(),
        png::ColorType::Indexed => return None,
    };
    (rgba.len() == width as usize * height as usize * 4).then_some((rgba, width, height))
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
        images: Vec<(Vec<u8>, u32, u32)>,
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

        fn write_image(
            &mut self,
            rgba: Vec<u8>,
            width: u32,
            height: u32,
        ) -> Result<(), ClipboardError> {
            if let Some(error) = self.error.take() {
                return Err(error);
            }
            self.images.push((rgba, width, height));
            Ok(())
        }
    }

    fn png_of(width: u32, height: u32, rgba: &[u8]) -> Vec<u8> {
        let mut bytes = Vec::new();
        let mut encoder = png::Encoder::new(&mut bytes, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().expect("header");
        writer.write_image_data(rgba).expect("pixels");
        writer.finish().expect("finish");
        bytes
    }

    #[test]
    fn a_drawing_png_becomes_one_rgba_image_write() {
        let mut writer = MemoryClipboardWriter::default();
        let pixels = [255, 255, 255, 255, 36, 21, 35, 255];
        write_drawing_png(&mut writer, &png_of(2, 1, &pixels)).expect("copy drawing");
        assert_eq!(writer.images, [(pixels.to_vec(), 2, 1)]);
        assert!(writer.writes.is_empty());
    }

    #[test]
    fn a_drawing_image_that_is_not_a_bounded_png_is_refused_before_writing() {
        let mut writer = MemoryClipboardWriter::default();
        for invalid in [
            Vec::new(),
            b"not a png".to_vec(),
            vec![0; MAX_DRAWING_PNG_BYTES + 1],
        ] {
            assert!(matches!(
                write_drawing_png(&mut writer, &invalid),
                Err(ClipboardError::InvalidRequest)
            ));
        }
        assert!(writer.images.is_empty());
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
            error: Some(ClipboardError::PermissionDenied),
            ..MemoryClipboardWriter::default()
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
