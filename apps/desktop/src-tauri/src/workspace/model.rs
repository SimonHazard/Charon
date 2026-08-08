use std::collections::{HashMap, HashSet};
use std::path::{Component, Path};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::error::WorkspaceError;

pub const SCHEMA_VERSION: u32 = 2;
pub const MAX_MANIFEST_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_NOTE_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_ACTIVE_NOTES: usize = 100_000;
pub const MAX_TAGS_PER_NOTE: usize = 16;
pub const MAX_TAG_SCALARS: usize = 48;
pub const MAX_ATTACHMENTS_PER_NOTE: usize = 20;
pub const MAX_ATTACHMENT_BYTES: u64 = 100 * 1024 * 1024;
const MAX_SAFE_INTEGER: u64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PersistedManifest {
    pub schema_version: u32,
    pub workspace_id: String,
    pub revision: u64,
    pub notes: Vec<PersistedNote>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PersistedNote {
    pub id: String,
    pub status: NoteStatus,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub tags: Vec<String>,
    pub attachments: Vec<PersistedAttachment>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct PersistedAttachment {
    pub id: String,
    pub file_name: String,
    pub relative_path: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LegacyV1Manifest {
    pub schema_version: u32,
    pub workspace_id: String,
    pub revision: u64,
    pub sections: Vec<LegacyV1Section>,
    pub notes: Vec<LegacyV1Note>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LegacyV1Section {
    pub id: String,
    pub name: String,
    pub sort_key: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct LegacyV1Note {
    pub id: String,
    pub section_id: String,
    pub status: NoteStatus,
    pub sort_key: i64,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub trashed_at: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "lowercase")]
#[ts(rename_all = "lowercase")]
pub enum NoteStatus {
    Open,
    Done,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct AttachmentDto {
    pub id: String,
    pub file_name: String,
    pub relative_path: String,
    pub created_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct NoteDto {
    pub id: String,
    pub body: String,
    pub status: NoteStatus,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub tags: Vec<String>,
    pub attachments: Vec<AttachmentDto>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub schema_version: u32,
    pub workspace_id: String,
    pub revision: u64,
    pub notes: Vec<NoteDto>,
    pub legacy_archive_created: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum WorkspaceHealthIssueKind {
    MissingNote,
    MissingAttachment,
    InvalidNote,
    InvalidManifest,
    ImportCandidate,
    RecoveryRequired,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceHealthIssue {
    pub kind: WorkspaceHealthIssueKind,
    pub resource_id: Option<String>,
    pub message_key: String,
}

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceHealth {
    pub is_healthy: bool,
    pub issues: Vec<WorkspaceHealthIssue>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceChangedEvent {
    pub revision: u64,
    pub snapshot: WorkspaceSnapshot,
}

impl PersistedManifest {
    pub(crate) fn empty(workspace_id: String) -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            workspace_id,
            revision: 0,
            notes: Vec::new(),
        }
    }

    pub(crate) fn validate(&self, bodies: &HashMap<String, String>) -> Result<(), WorkspaceError> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(WorkspaceError::UnsupportedSchema(self.schema_version));
        }
        validate_uuid(&self.workspace_id, "workspaceId")?;
        if self.revision > MAX_SAFE_INTEGER {
            return Err(WorkspaceError::Validation(
                "revision exceeds the IPC integer limit".to_owned(),
            ));
        }
        if self.notes.len() > MAX_ACTIVE_NOTES {
            return Err(WorkspaceError::Validation(
                "too many active notes".to_owned(),
            ));
        }
        let mut note_ids = HashSet::new();
        for note in &self.notes {
            validate_uuid(&note.id, "note id")?;
            if !note_ids.insert(&note.id) {
                return Err(WorkspaceError::Validation("duplicate note id".to_owned()));
            }
            validate_timestamp(&note.created_at)?;
            validate_timestamp(&note.updated_at)?;
            validate_optional_timestamp(note.completed_at.as_deref())?;
            validate_status_timestamp(note.status, note.completed_at.as_deref())?;
            validate_tags(&note.tags)?;
            if note.attachments.len() > MAX_ATTACHMENTS_PER_NOTE {
                return Err(WorkspaceError::Validation(
                    "too many attachments".to_owned(),
                ));
            }
            let mut attachment_ids = HashSet::new();
            for attachment in &note.attachments {
                validate_uuid(&attachment.id, "attachment id")?;
                if !attachment_ids.insert(&attachment.id) {
                    return Err(WorkspaceError::Validation(
                        "duplicate attachment id".to_owned(),
                    ));
                }
                validate_file_name(&attachment.file_name)?;
                validate_timestamp(&attachment.created_at)?;
                validate_managed_path(&note.id, &attachment.id, &attachment.relative_path)?;
            }
            validate_body(
                bodies
                    .get(&note.id)
                    .ok_or_else(|| WorkspaceError::Validation("missing note body".to_owned()))?,
            )?;
        }
        if bodies.keys().any(|id| !note_ids.contains(id)) {
            return Err(WorkspaceError::Validation(
                "a note body has no manifest entry".to_owned(),
            ));
        }
        Ok(())
    }

    pub(crate) fn snapshot(
        &self,
        bodies: &HashMap<String, String>,
        legacy_archive_created: bool,
    ) -> Result<WorkspaceSnapshot, WorkspaceError> {
        self.validate(bodies)?;
        let mut notes = self
            .notes
            .iter()
            .map(|note| NoteDto {
                id: note.id.clone(),
                body: bodies[&note.id].clone(),
                status: note.status,
                created_at: note.created_at.clone(),
                updated_at: note.updated_at.clone(),
                completed_at: note.completed_at.clone(),
                tags: note.tags.clone(),
                attachments: note
                    .attachments
                    .iter()
                    .map(|attachment| AttachmentDto {
                        id: attachment.id.clone(),
                        file_name: attachment.file_name.clone(),
                        relative_path: attachment.relative_path.clone(),
                        created_at: attachment.created_at.clone(),
                    })
                    .collect(),
            })
            .collect::<Vec<_>>();
        notes.sort_by(|left, right| {
            right
                .created_at
                .cmp(&left.created_at)
                .then(left.id.cmp(&right.id))
        });
        Ok(WorkspaceSnapshot {
            schema_version: self.schema_version,
            workspace_id: self.workspace_id.clone(),
            revision: self.revision,
            notes,
            legacy_archive_created,
        })
    }
}

impl LegacyV1Manifest {
    pub(crate) fn validate(&self, bodies: &HashMap<String, String>) -> Result<(), WorkspaceError> {
        if self.schema_version != 1 {
            return Err(WorkspaceError::UnsupportedSchema(self.schema_version));
        }
        validate_uuid(&self.workspace_id, "workspaceId")?;
        if self.revision > MAX_SAFE_INTEGER || self.notes.len() > MAX_ACTIVE_NOTES {
            return Err(WorkspaceError::InvalidManifest);
        }
        let mut section_ids = HashSet::new();
        for section in &self.sections {
            validate_uuid(&section.id, "legacy section id")?;
            if section.name.trim().is_empty()
                || section.name.contains('\0')
                || !section_ids.insert(&section.id)
            {
                return Err(WorkspaceError::InvalidManifest);
            }
            validate_timestamp(&section.created_at)?;
            validate_timestamp(&section.updated_at)?;
        }
        if section_ids.is_empty() {
            return Err(WorkspaceError::InvalidManifest);
        }
        let mut note_ids = HashSet::new();
        for note in &self.notes {
            validate_uuid(&note.id, "legacy note id")?;
            if !note_ids.insert(&note.id) || !section_ids.contains(&note.section_id) {
                return Err(WorkspaceError::InvalidManifest);
            }
            validate_timestamp(&note.created_at)?;
            validate_timestamp(&note.updated_at)?;
            validate_optional_timestamp(note.completed_at.as_deref())?;
            validate_optional_timestamp(note.trashed_at.as_deref())?;
            validate_status_timestamp(note.status, note.completed_at.as_deref())?;
            validate_body(
                bodies
                    .get(&note.id)
                    .ok_or(WorkspaceError::InvalidManifest)?,
            )?;
        }
        if bodies.keys().any(|id| !note_ids.contains(id)) {
            return Err(WorkspaceError::InvalidManifest);
        }
        Ok(())
    }
}

pub(crate) fn validate_uuid(value: &str, field: &str) -> Result<(), WorkspaceError> {
    let uuid = Uuid::parse_str(value)
        .map_err(|_| WorkspaceError::Validation(format!("{field} must be a UUID v4")))?;
    if uuid.get_version_num() != 4 || uuid.to_string() != value.to_ascii_lowercase() {
        return Err(WorkspaceError::Validation(format!(
            "{field} must be a canonical UUID v4"
        )));
    }
    Ok(())
}

pub(crate) fn validate_body(value: &str) -> Result<(), WorkspaceError> {
    if value.len() > MAX_NOTE_BYTES || value.contains('\0') {
        Err(WorkspaceError::Validation(
            "note body exceeds the limit or contains NUL".to_owned(),
        ))
    } else {
        Ok(())
    }
}

pub(crate) fn normalize_tags(tags: Vec<String>) -> Result<Vec<String>, WorkspaceError> {
    let normalized = tags
        .into_iter()
        .map(|tag| tag.trim().to_owned())
        .collect::<Vec<_>>();
    validate_tags(&normalized)?;
    Ok(normalized)
}

pub(crate) fn validate_tags(tags: &[String]) -> Result<(), WorkspaceError> {
    if tags.len() > MAX_TAGS_PER_NOTE {
        return Err(WorkspaceError::Validation("too many tags".to_owned()));
    }
    let mut seen = HashSet::new();
    for tag in tags {
        if tag.is_empty()
            || tag.trim() != tag
            || tag.chars().count() > MAX_TAG_SCALARS
            || tag
                .chars()
                .any(|value| value.is_control() || matches!(value, '\n' | '\r'))
        {
            return Err(WorkspaceError::Validation("invalid tag".to_owned()));
        }
        if !seen.insert(tag.to_lowercase()) {
            return Err(WorkspaceError::Validation("duplicate tag".to_owned()));
        }
    }
    Ok(())
}

pub(crate) fn validate_file_name(value: &str) -> Result<(), WorkspaceError> {
    if value.is_empty()
        || value == "."
        || value == ".."
        || value.contains(['/', '\\'])
        || value.chars().any(char::is_control)
    {
        Err(WorkspaceError::Validation(
            "invalid attachment filename".to_owned(),
        ))
    } else {
        Ok(())
    }
}

pub(crate) fn validate_managed_path(
    note_id: &str,
    attachment_id: &str,
    value: &str,
) -> Result<(), WorkspaceError> {
    if value.contains('\\')
        || Path::new(value).is_absolute()
        || Path::new(value)
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err(WorkspaceError::InvalidPath);
    }
    let mut parts = value.split('/');
    if parts.next() != Some("attachments") || parts.next() != Some(note_id) {
        return Err(WorkspaceError::InvalidPath);
    }
    let Some(file_name) = parts.next() else {
        return Err(WorkspaceError::InvalidPath);
    };
    if parts.next().is_some()
        || !(file_name == attachment_id
            || file_name
                .strip_prefix(attachment_id)
                .is_some_and(|suffix| suffix.starts_with('.') && suffix.len() > 1))
    {
        return Err(WorkspaceError::InvalidPath);
    }
    Ok(())
}

fn validate_status_timestamp(
    status: NoteStatus,
    completed_at: Option<&str>,
) -> Result<(), WorkspaceError> {
    match (status, completed_at) {
        (NoteStatus::Open, Some(_)) => Err(WorkspaceError::Validation(
            "an open note cannot have completedAt".to_owned(),
        )),
        (NoteStatus::Done, None) => Err(WorkspaceError::Validation(
            "a done note requires completedAt".to_owned(),
        )),
        _ => Ok(()),
    }
}

pub(crate) fn validate_timestamp(value: &str) -> Result<(), WorkspaceError> {
    let bytes = value.as_bytes();
    let valid_shape = bytes.len() == 20
        && bytes[4] == b'-'
        && bytes[7] == b'-'
        && bytes[10] == b'T'
        && bytes[13] == b':'
        && bytes[16] == b':'
        && bytes[19] == b'Z'
        && bytes.iter().enumerate().all(|(index, byte)| {
            matches!(index, 4 | 7 | 10 | 13 | 16 | 19) || byte.is_ascii_digit()
        });
    if !valid_shape {
        return Err(WorkspaceError::Validation(
            "timestamps must be RFC 3339 UTC seconds".to_owned(),
        ));
    }
    Ok(())
}

fn validate_optional_timestamp(value: Option<&str>) -> Result<(), WorkspaceError> {
    value.map_or(Ok(()), validate_timestamp)
}

pub(crate) fn now_utc() -> String {
    timestamp_from_unix(
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64,
    )
}

fn timestamp_from_unix(seconds: i64) -> String {
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}Z",
        seconds_of_day / 3_600,
        (seconds_of_day % 3_600) / 60,
        seconds_of_day % 60
    )
}

fn civil_from_days(days_since_epoch: i64) -> (i64, i64, i64) {
    let z = days_since_epoch + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = z - era * 146_097;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let mut year = year_of_era + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let month_prime = (5 * day_of_year + 2) / 153;
    let day = day_of_year - (153 * month_prime + 2) / 5 + 1;
    let month = month_prime + if month_prime < 10 { 3 } else { -9 };
    year += i64::from(month <= 2);
    (year, month, day)
}

#[cfg(test)]
pub(crate) fn fixture_manifest() -> (PersistedManifest, HashMap<String, String>) {
    (
        PersistedManifest::empty("b7cb56b9-748e-48c8-a23d-0bf5f2d61248".to_owned()),
        HashMap::new(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tags_are_bounded_ordered_and_case_insensitive() {
        assert_eq!(
            normalize_tags(vec![" First ".to_owned(), "second".to_owned()]).expect("tags"),
            vec!["First", "second"]
        );
        assert!(normalize_tags(vec!["First".to_owned(), "first".to_owned()]).is_err());
        assert!(normalize_tags(vec!["x".repeat(49)]).is_err());
    }

    #[test]
    fn managed_paths_are_identity_bound() {
        assert!(
            validate_managed_path("note", "attachment", "attachments/note/attachment.txt").is_ok()
        );
        assert!(
            validate_managed_path("note", "attachment", "attachments/other/attachment.txt")
                .is_err()
        );
    }
}
