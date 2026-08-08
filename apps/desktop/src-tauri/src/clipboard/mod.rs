mod adapter;
mod composer;
mod error;
mod model;

pub(crate) use adapter::{compose_and_write, TauriClipboardWriter};
pub use composer::compose;
pub use error::{ClipboardError, ClipboardIpcError};
pub use model::{ComposeAttachment, ComposeNote, ComposeRequest, ComposedClipboard};
