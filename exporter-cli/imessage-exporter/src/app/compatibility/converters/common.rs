/*!
 Defines routines common across all converters.
*/

use std::{
    fs::{copy, create_dir_all},
    path::Path,
    process::{Command, Stdio},
};

/// Run a command, ignoring output; returning [`None`] on failure.
pub(super) fn run_command(command: &str, args: Vec<&str>) -> Option<()> {
    match Command::new(command)
        .args(args)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null())
        .spawn()
    {
        Ok(mut convert) => match convert.wait() {
            Ok(_) => Some(()),
            Err(why) => {
                eprintln!("Conversion failed: {why}");
                None
            }
        },
        Err(why) => {
            eprintln!("Conversion failed: {why}");
            None
        }
    }
}

/// Get the path details formatted for a CLI argument and ensure the directory tree exists
pub(super) fn ensure_paths<'a>(from: &'a Path, to: &'a Path) -> Option<(&'a str, &'a str)> {
    // Get the path we want to copy from
    let from_path = from.to_str()?;

    // Get the path we want to write to
    let to_path = to.to_str()?;

    // Ensure the directory tree exists
    if let Some(folder) = to.parent() {
        if !folder.exists() {
            if let Err(why) = create_dir_all(folder) {
                eprintln!("Unable to create {folder:?}: {why}");
                return None;
            }
        }
    }
    Some((from_path, to_path))
}

/// Copy a file without altering it
pub(crate) fn copy_raw(from: &Path, to: &Path) {
    // Ensure the directory tree exists
    if let Some(folder) = to.parent() {
        if !folder.exists() {
            if let Err(why) = create_dir_all(folder) {
                eprintln!("Unable to create {folder:?}: {why}");
            }
        }
    }

    if let Err(why) = copy(from, to) {
        eprintln!("Unable to copy {from:?} to {to:?}: {why}");
    };
}
