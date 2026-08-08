use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

#[derive(Debug, Error)]
pub enum WorkspaceError {
    #[error("the Workspace path is invalid")]
    InvalidPath,
    #[error("the Workspace manifest is invalid")]
    InvalidManifest,
    #[error("the Workspace schema version is unsupported: {0}")]
    UnsupportedSchema(u32),
    #[error("Workspace validation failed: {0}")]
    Validation(String),
    #[error("the Workspace revision is stale (expected {expected}, actual {actual})")]
    StaleRevision { expected: u64, actual: u64 },
    #[error("a Workspace I/O operation failed")]
    Io(#[source] std::io::Error),
    #[error("Workspace recovery requires user action: {backup_location}")]
    RecoveryRequired { backup_location: String },
    #[error("deleted content cleanup requires retry")]
    DeletionCleanupRequired { transaction_id: String },
    #[error("the legacy Trash archive path already exists")]
    LegacyArchiveCollision,
    #[error("the requested Workspace value was not found: {0}")]
    NotFound(String),
    #[error("the Workspace runtime is not open")]
    NotOpen,
}

impl From<std::io::Error> for WorkspaceError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct WorkspaceIpcError {
    pub code: String,
    pub message_key: String,
    pub expected_revision: Option<u64>,
    pub actual_revision: Option<u64>,
    pub recovery_location: Option<String>,
}

impl From<WorkspaceError> for WorkspaceIpcError {
    fn from(error: WorkspaceError) -> Self {
        let mut result = Self {
            code: "workspace_unknown".to_owned(),
            message_key: "workspace_error_unknown".to_owned(),
            expected_revision: None,
            actual_revision: None,
            recovery_location: None,
        };

        match error {
            WorkspaceError::InvalidPath => {
                result.code = "invalid_path".to_owned();
                result.message_key = "workspace_error_invalid_path".to_owned();
            }
            WorkspaceError::InvalidManifest => {
                result.code = "invalid_manifest".to_owned();
                result.message_key = "workspace_error_invalid_manifest".to_owned();
            }
            WorkspaceError::UnsupportedSchema(_) => {
                result.code = "unsupported_schema".to_owned();
                result.message_key = "workspace_error_unsupported_schema".to_owned();
            }
            WorkspaceError::Validation(_) => {
                result.code = "validation".to_owned();
                result.message_key = "workspace_error_validation".to_owned();
            }
            WorkspaceError::StaleRevision { expected, actual } => {
                result.code = "stale_revision".to_owned();
                result.message_key = "workspace_error_stale_revision".to_owned();
                result.expected_revision = Some(expected);
                result.actual_revision = Some(actual);
            }
            WorkspaceError::Io(_) => {
                result.code = "io".to_owned();
                result.message_key = "workspace_error_io".to_owned();
            }
            WorkspaceError::RecoveryRequired { backup_location } => {
                result.code = "recovery_required".to_owned();
                result.message_key = "workspace_error_recovery_required".to_owned();
                result.recovery_location = Some(backup_location);
            }
            WorkspaceError::DeletionCleanupRequired { transaction_id } => {
                result.code = "deletion_cleanup_required".to_owned();
                result.message_key = "workspace_error_deletion_cleanup_required".to_owned();
                result.recovery_location = Some(format!("backups/{transaction_id}"));
            }
            WorkspaceError::LegacyArchiveCollision => {
                result.code = "legacy_archive_collision".to_owned();
                result.message_key = "workspace_error_legacy_archive_collision".to_owned();
            }
            WorkspaceError::NotFound(_) => {
                result.code = "not_found".to_owned();
                result.message_key = "workspace_error_not_found".to_owned();
            }
            WorkspaceError::NotOpen => {
                result.code = "not_open".to_owned();
                result.message_key = "workspace_error_not_open".to_owned();
            }
        }

        result
    }
}
