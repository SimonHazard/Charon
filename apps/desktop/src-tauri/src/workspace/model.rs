use std::collections::{HashMap, HashSet};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use ts_rs::TS;
use uuid::Uuid;

use super::error::WorkspaceError;

pub const SCHEMA_VERSION: u32 = 1;
pub const MAX_MANIFEST_BYTES: usize = 64 * 1024 * 1024;
pub const MAX_NOTE_BYTES: usize = 10 * 1024 * 1024;
pub const MAX_ACTIVE_NOTES: usize = 100_000;
pub const MAX_SECTIONS: usize = 10_000;
const MAX_SAFE_INTEGER: i64 = 9_007_199_254_740_991;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistedManifest {
    pub schema_version: u32,
    pub workspace_id: String,
    pub revision: u64,
    pub sections: Vec<PersistedSection>,
    pub notes: Vec<PersistedNote>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistedSection {
    pub id: String,
    pub name: String,
    pub sort_key: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistedNote {
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
pub struct SectionDto {
    pub id: String,
    pub name: String,
    pub sort_key: i64,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct NoteDto {
    pub id: String,
    pub section_id: String,
    pub body: String,
    pub status: NoteStatus,
    pub sort_key: i64,
    pub created_at: String,
    pub updated_at: String,
    pub completed_at: Option<String>,
    pub trashed_at: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceSnapshot {
    pub schema_version: u32,
    pub workspace_id: String,
    pub revision: u64,
    pub sections: Vec<SectionDto>,
    pub notes: Vec<NoteDto>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
#[ts(rename_all = "snake_case")]
pub enum WorkspaceHealthIssueKind {
    MissingNote,
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
    pub(crate) fn empty(
        workspace_id: String,
        section_id: String,
        initial_section_name: String,
        now: String,
    ) -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            workspace_id,
            revision: 0,
            sections: vec![PersistedSection {
                id: section_id,
                name: initial_section_name,
                sort_key: 0,
                created_at: now.clone(),
                updated_at: now,
            }],
            notes: Vec::new(),
        }
    }

    pub(crate) fn validate(&self, bodies: &HashMap<String, String>) -> Result<(), WorkspaceError> {
        if self.schema_version != SCHEMA_VERSION {
            return Err(WorkspaceError::UnsupportedSchema(self.schema_version));
        }
        validate_uuid(&self.workspace_id, "workspaceId")?;
        if self.revision > MAX_SAFE_INTEGER as u64 {
            return Err(WorkspaceError::Validation(
                "revision exceeds the IPC integer limit".to_owned(),
            ));
        }
        if self.sections.is_empty() {
            return Err(WorkspaceError::Validation(
                "a Workspace requires at least one section".to_owned(),
            ));
        }
        if self.sections.len() > MAX_SECTIONS {
            return Err(WorkspaceError::Validation("too many sections".to_owned()));
        }
        if self
            .notes
            .iter()
            .filter(|note| note.trashed_at.is_none())
            .count()
            > MAX_ACTIVE_NOTES
        {
            return Err(WorkspaceError::Validation(
                "too many active notes".to_owned(),
            ));
        }

        let mut section_ids = HashSet::new();
        for section in &self.sections {
            validate_uuid(&section.id, "section id")?;
            validate_name(&section.name)?;
            validate_sort_key(section.sort_key)?;
            validate_timestamp(&section.created_at)?;
            validate_timestamp(&section.updated_at)?;
            if !section_ids.insert(&section.id) {
                return Err(WorkspaceError::Validation(
                    "duplicate section id".to_owned(),
                ));
            }
        }

        let mut note_ids = HashSet::new();
        for note in &self.notes {
            validate_uuid(&note.id, "note id")?;
            validate_uuid(&note.section_id, "note section id")?;
            validate_sort_key(note.sort_key)?;
            if !section_ids.contains(&note.section_id) {
                return Err(WorkspaceError::Validation(
                    "note references a missing section".to_owned(),
                ));
            }
            validate_timestamp(&note.created_at)?;
            validate_timestamp(&note.updated_at)?;
            validate_optional_timestamp(note.completed_at.as_deref())?;
            validate_optional_timestamp(note.trashed_at.as_deref())?;
            match note.status {
                NoteStatus::Open if note.completed_at.is_some() => {
                    return Err(WorkspaceError::Validation(
                        "an open note cannot have completedAt".to_owned(),
                    ));
                }
                NoteStatus::Done if note.completed_at.is_none() => {
                    return Err(WorkspaceError::Validation(
                        "a done note requires completedAt".to_owned(),
                    ));
                }
                _ => {}
            }
            if !note_ids.insert(&note.id) {
                return Err(WorkspaceError::Validation("duplicate note id".to_owned()));
            }
            let body = bodies.get(&note.id).ok_or_else(|| {
                WorkspaceError::Validation(format!("missing note body for {}", note.id))
            })?;
            validate_body(body)?;
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
    ) -> Result<WorkspaceSnapshot, WorkspaceError> {
        self.validate(bodies)?;
        let mut sections = self
            .sections
            .iter()
            .map(SectionDto::from)
            .collect::<Vec<_>>();
        sections.sort_by(|left, right| {
            left.sort_key
                .cmp(&right.sort_key)
                .then(left.created_at.cmp(&right.created_at))
                .then(left.id.cmp(&right.id))
        });

        let section_order = sections
            .iter()
            .enumerate()
            .map(|(index, section)| (section.id.as_str(), index))
            .collect::<HashMap<_, _>>();
        let mut notes = self
            .notes
            .iter()
            .map(|note| NoteDto {
                id: note.id.clone(),
                section_id: note.section_id.clone(),
                body: bodies.get(&note.id).cloned().unwrap_or_default(),
                status: note.status,
                sort_key: note.sort_key,
                created_at: note.created_at.clone(),
                updated_at: note.updated_at.clone(),
                completed_at: note.completed_at.clone(),
                trashed_at: note.trashed_at.clone(),
            })
            .collect::<Vec<_>>();
        notes.sort_by(|left, right| {
            section_order
                .get(left.section_id.as_str())
                .cmp(&section_order.get(right.section_id.as_str()))
                .then(left.sort_key.cmp(&right.sort_key))
                .then(left.created_at.cmp(&right.created_at))
                .then(left.id.cmp(&right.id))
        });

        Ok(WorkspaceSnapshot {
            schema_version: self.schema_version,
            workspace_id: self.workspace_id.clone(),
            revision: self.revision,
            sections,
            notes,
        })
    }
}

impl From<&PersistedSection> for SectionDto {
    fn from(value: &PersistedSection) -> Self {
        Self {
            id: value.id.clone(),
            name: value.name.clone(),
            sort_key: value.sort_key,
            created_at: value.created_at.clone(),
            updated_at: value.updated_at.clone(),
        }
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

pub(crate) fn validate_name(value: &str) -> Result<(), WorkspaceError> {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed.len() > 256 || trimmed.contains('\0') {
        return Err(WorkspaceError::Validation(
            "section names must contain 1 to 256 valid bytes".to_owned(),
        ));
    }
    Ok(())
}

pub(crate) fn validate_body(value: &str) -> Result<(), WorkspaceError> {
    if value.len() > MAX_NOTE_BYTES || value.contains('\0') {
        return Err(WorkspaceError::Validation(
            "note body exceeds the v1 limit or contains NUL".to_owned(),
        ));
    }
    Ok(())
}

fn validate_sort_key(value: i64) -> Result<(), WorkspaceError> {
    if !(-MAX_SAFE_INTEGER..=MAX_SAFE_INTEGER).contains(&value) {
        return Err(WorkspaceError::Validation(
            "sort key exceeds the IPC integer limit".to_owned(),
        ));
    }
    Ok(())
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

    let parse =
        |range: std::ops::Range<usize>| -> u32 { value[range].parse::<u32>().unwrap_or_default() };
    let year = parse(0..4);
    let month = parse(5..7);
    let day = parse(8..10);
    let hour = parse(11..13);
    let minute = parse(14..16);
    let second = parse(17..19);
    let leap = year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
    let month_days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    if year == 0
        || !(1..=12).contains(&month)
        || day == 0
        || day > month_days[(month - 1) as usize]
        || hour > 23
        || minute > 59
        || second > 59
    {
        return Err(WorkspaceError::Validation(
            "timestamp contains an invalid UTC date".to_owned(),
        ));
    }
    Ok(())
}

fn validate_optional_timestamp(value: Option<&str>) -> Result<(), WorkspaceError> {
    value.map_or(Ok(()), validate_timestamp)
}

pub(crate) fn now_utc() -> String {
    let seconds = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64;
    timestamp_from_unix(seconds)
}

fn timestamp_from_unix(seconds: i64) -> String {
    let days = seconds.div_euclid(86_400);
    let seconds_of_day = seconds.rem_euclid(86_400);
    let (year, month, day) = civil_from_days(days);
    let hour = seconds_of_day / 3_600;
    let minute = (seconds_of_day % 3_600) / 60;
    let second = seconds_of_day % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z")
}

// Howard Hinnant's civil calendar conversion, adapted to Unix epoch days.
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
    let section_id = "a4ad6d74-ea60-45df-a0ad-2c6f82c271f9".to_owned();
    let workspace_id = "b7cb56b9-748e-48c8-a23d-0bf5f2d61248".to_owned();
    (
        PersistedManifest::empty(
            workspace_id,
            section_id,
            "Inbox".to_owned(),
            "2026-07-30T12:00:00Z".to_owned(),
        ),
        HashMap::new(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persisted_manifest_round_trips_without_note_bodies() {
        let (manifest, bodies) = fixture_manifest();
        let json = serde_json::to_string_pretty(&manifest).expect("serialize manifest");
        assert!(!json.contains("body"));
        let decoded: PersistedManifest = serde_json::from_str(&json).expect("deserialize manifest");
        assert_eq!(decoded, manifest);
        assert!(decoded.snapshot(&bodies).is_ok());
    }

    #[test]
    fn rejects_invalid_status_timestamp_invariant() {
        let (mut manifest, mut bodies) = fixture_manifest();
        let note_id = "fef8abcc-7047-4a35-a070-b6d9f0eca026".to_owned();
        manifest.notes.push(PersistedNote {
            id: note_id.clone(),
            section_id: manifest.sections[0].id.clone(),
            status: NoteStatus::Done,
            sort_key: 0,
            created_at: "2026-07-30T12:00:00Z".to_owned(),
            updated_at: "2026-07-30T12:00:00Z".to_owned(),
            completed_at: None,
            trashed_at: None,
        });
        bodies.insert(note_id, "body".to_owned());
        assert!(matches!(
            manifest.validate(&bodies),
            Err(WorkspaceError::Validation(_))
        ));
    }

    #[test]
    fn validates_v1_payload_boundaries() {
        assert!(validate_body(&"x".repeat(MAX_NOTE_BYTES)).is_ok());
        assert!(validate_body(&"x".repeat(MAX_NOTE_BYTES + 1)).is_err());
    }

    #[test]
    fn validates_v1_collection_boundaries() {
        let (mut manifest, mut bodies) = fixture_manifest();
        let section_id = manifest.sections[0].id.clone();
        for index in 0..MAX_ACTIVE_NOTES {
            let id = Uuid::new_v4().to_string();
            manifest.notes.push(PersistedNote {
                id: id.clone(),
                section_id: section_id.clone(),
                status: NoteStatus::Open,
                sort_key: i64::try_from(index).expect("safe test sort key"),
                created_at: "2026-07-30T12:00:00Z".to_owned(),
                updated_at: "2026-07-30T12:00:00Z".to_owned(),
                completed_at: None,
                trashed_at: None,
            });
            bodies.insert(id, String::new());
        }
        assert!(manifest.validate(&bodies).is_ok());
        let extra_id = Uuid::new_v4().to_string();
        manifest.notes.push(PersistedNote {
            id: extra_id.clone(),
            section_id,
            status: NoteStatus::Open,
            sort_key: 0,
            created_at: "2026-07-30T12:00:00Z".to_owned(),
            updated_at: "2026-07-30T12:00:00Z".to_owned(),
            completed_at: None,
            trashed_at: None,
        });
        bodies.insert(extra_id, String::new());
        assert!(manifest.validate(&bodies).is_err());

        let (mut manifest, bodies) = fixture_manifest();
        while manifest.sections.len() < MAX_SECTIONS {
            manifest.sections.push(PersistedSection {
                id: Uuid::new_v4().to_string(),
                name: "Section".to_owned(),
                sort_key: 0,
                created_at: "2026-07-30T12:00:00Z".to_owned(),
                updated_at: "2026-07-30T12:00:00Z".to_owned(),
            });
        }
        assert!(manifest.validate(&bodies).is_ok());
        manifest.sections.push(PersistedSection {
            id: Uuid::new_v4().to_string(),
            name: "Too many".to_owned(),
            sort_key: 0,
            created_at: "2026-07-30T12:00:00Z".to_owned(),
            updated_at: "2026-07-30T12:00:00Z".to_owned(),
        });
        assert!(manifest.validate(&bodies).is_err());
    }

    #[test]
    fn generated_timestamps_are_rfc3339_utc() {
        let timestamp = timestamp_from_unix(0);
        assert_eq!(timestamp, "1970-01-01T00:00:00Z");
        assert!(validate_timestamp(&timestamp).is_ok());
        assert_eq!(timestamp_from_unix(1_775_046_896), "2026-04-01T12:34:56Z");
    }
}
