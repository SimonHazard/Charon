use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "kebab-case")]
#[ts(rename_all = "kebab-case")]
pub enum CopyPreset {
    /// Join normalized note bodies with one blank line.
    Plain,
    /// Render each note as one top-level unordered-list item.
    Bulleted,
    /// Render each note as one sequentially numbered top-level item.
    Numbered,
    /// Render each note as one unchecked Markdown task.
    TaskList,
    /// Group note bodies under headings in first-seen section order.
    Sectioned,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ComposeNote {
    pub id: String,
    pub section_name: String,
    pub body: String,
    /// Zero-based order in the ephemeral Selection.
    pub selection_order: u32,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ComposeOptions {
    pub preview_character_limit: u32,
}

impl Default for ComposeOptions {
    fn default() -> Self {
        Self {
            preview_character_limit: 240,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ComposeRequest {
    pub notes: Vec<ComposeNote>,
    pub preset: CopyPreset,
    pub options: ComposeOptions,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ComposedClipboard {
    pub markdown: String,
    pub note_count: u32,
    pub omitted_empty_count: u32,
    pub preview: String,
}
