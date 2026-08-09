use serde::{Deserialize, Serialize};
use thiserror::Error;
use ts_rs::TS;

#[derive(Debug, Error)]
pub enum PreferencesError {
    #[error("the preferences path is invalid")]
    InvalidPath,
    #[error("the preferences schema is unsupported")]
    UnsupportedSchema,
    #[error("the preferences value is invalid")]
    InvalidValue,
    #[error("a preferences I/O operation failed")]
    Io(#[source] std::io::Error),
    #[error("the preferences file could not be encoded")]
    Encoding,
}

impl From<std::io::Error> for PreferencesError {
    fn from(value: std::io::Error) -> Self {
        Self::Io(value)
    }
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(rename_all = "camelCase")]
pub struct PreferencesIpcError {
    pub code: String,
    pub message_key: String,
}

impl From<PreferencesError> for PreferencesIpcError {
    fn from(error: PreferencesError) -> Self {
        let (code, message_key) = match error {
            PreferencesError::InvalidPath => ("invalid_path", "preferences_error_invalid_path"),
            PreferencesError::UnsupportedSchema => {
                ("unsupported_schema", "preferences_error_unsupported_schema")
            }
            PreferencesError::InvalidValue => ("invalid_value", "preferences_error_invalid_value"),
            PreferencesError::Io(_) => ("io", "preferences_error_io"),
            PreferencesError::Encoding => ("encoding", "preferences_error_encoding"),
        };
        Self {
            code: code.to_owned(),
            message_key: message_key.to_owned(),
        }
    }
}
