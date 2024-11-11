/*!
Errors that can happen during the application's runtime
*/

use std::{
    fmt::{Display, Formatter, Result},
    io::Error as IoError,
    path::PathBuf,
};

use imessage_database::{error::table::TableError, util::size::format_file_size};

use crate::app::options::OPTION_BYPASS_FREE_SPACE_CHECK;

/// Errors that can happen during the application's runtime
#[derive(Debug)]
pub enum RuntimeError {
    InvalidOptions(String),
    CreateError(IoError, PathBuf),
    DiskError(IoError),
    DatabaseError(TableError),
    NotEnoughAvailableSpace(u64, u64),
}

impl Display for RuntimeError {
    fn fmt(&self, fmt: &mut Formatter<'_>) -> Result {
        match self {
            RuntimeError::InvalidOptions(why) => write!(fmt, "Invalid options!\n{why}"),
            RuntimeError::CreateError(why, path) => write!(fmt, "{why}: {path:?}"),
            RuntimeError::DiskError(why) => write!(fmt, "{why}"),
            RuntimeError::DatabaseError(why) => write!(fmt, "{why}"),
            RuntimeError::NotEnoughAvailableSpace(estimated_bytes, available_bytes) => {
                write!(
                    fmt, 
                    "Not enough free disk space!\nEstimated export size: {}\nDisk space available: {}\nPass `--{}` to ignore\n",
                    format_file_size(*estimated_bytes),
                    format_file_size(*available_bytes),
                    OPTION_BYPASS_FREE_SPACE_CHECK
                )
            }
        }
    }
}
