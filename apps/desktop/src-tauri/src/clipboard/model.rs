use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ComposeRequest {
    pub expected_revision: u64,
    pub note_id: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComposeAttachment {
    pub id: String,
    pub file_name: String,
    pub absolute_path: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ComposeNote {
    pub body: String,
    pub tags: Vec<String>,
    pub attachments: Vec<ComposeAttachment>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct ComposedClipboard {
    pub tag_count: u32,
    pub attachment_count: u32,
    pub byte_count: u64,
}
