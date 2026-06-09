use std::{
    env::temp_dir,
    fs::File,
    io::{BufWriter, IsTerminal, Write, copy, stdin},
    path::{Path, PathBuf},
};

use crabapple::{
    Authentication, Backup, backup::models::manifest::manifest_plist::ManifestData,
    error::BackupError,
};
use imessage_database::{tables::table::DEFAULT_PATH_IOS, util::platform::Platform};

use crate::app::{
    contacts,
    error::RuntimeError,
    options::{OPTION_CLEARTEXT_PASSWORD, Options},
};

const MAX_IN_MEMORY_DECRYPT: u64 = 25 * 1024 * 1024;

/// Open the iOS backup, prompting for a password if it is encrypted and one was not provided.
///
/// Returns `Ok(None)` for non-iOS platforms or for unencrypted iOS backups.
pub fn decrypt_backup(options: &Options) -> Result<Option<Backup>, RuntimeError> {
    if !matches!(options.platform, Platform::iOS) {
        return Ok(None);
    }

    // Reading Manifest.plist is cheap and tells us whether the backup is encrypted
    // without needing to derive any keys.
    let manifest_data = ManifestData::from_plist(options.db_path.join("Manifest.plist"))?;

    if !manifest_data.is_encrypted {
        if options.cleartext_password.is_some() {
            return Err(RuntimeError::InvalidOptions(format!(
                "--{OPTION_CLEARTEXT_PASSWORD} was provided, but the iOS backup at {} is not encrypted.",
                options.db_path.display()
            )));
        }
        return Ok(None);
    }

    let password = match options.cleartext_password.as_deref() {
        Some(pw) => pw.to_string(),
        None => prompt_for_password()?,
    };

    eprintln!("Decrypting iOS backup...");
    eprintln!("  [1/5] Deriving backup keys...");
    let backup = match Backup::open(options.db_path.clone(), &Authentication::Password(password)) {
        Ok(backup) => backup,
        Err(BackupError::PasswordOrKeyIncorrect) => {
            return Err(RuntimeError::InvalidOptions(
                "The iOS backup password was incorrect.".to_string(),
            ));
        }
        Err(other) => return Err(other.into()),
    };

    Ok(Some(backup))
}

/// Prompt the user for the backup password, reading from the controlling terminal.
fn prompt_for_password() -> Result<String, RuntimeError> {
    if !stdin().is_terminal() {
        return Err(RuntimeError::InvalidOptions(format!(
            "No terminal available to prompt for the iOS backup password; pass --{OPTION_CLEARTEXT_PASSWORD} for non-interactive use."
        )));
    }
    eprintln!("Encrypted iOS backup detected. Enter password (input hidden):");
    rpassword::prompt_password("> ").map_err(|e| {
        RuntimeError::InvalidOptions(format!(
            "Unable to read password interactively ({e}); pass --{OPTION_CLEARTEXT_PASSWORD} for non-interactive use."
        ))
    })
}

/// Get the decrypted messages database from the iOS backup
///
/// The real name is `Library/SMS/sms.db`
pub fn get_decrypted_message_database(backup: &Backup) -> Result<PathBuf, RuntimeError> {
    let (_, file_id) = DEFAULT_PATH_IOS.split_at(3);
    eprintln!("  [2/5] Resolving messages database...");
    let file = backup.get_file(file_id)?;
    let mut decrypted_chat_db = backup.decrypt_entry_stream(&file)?;

    // Write decrypted sms.db into a platform-specific temporary directory
    let tmp_path = temp_dir().join("crabapple-sms.db");
    let mut file = File::create(&tmp_path)?;

    // Stream-decrypt directly into the temp file
    eprintln!("  [3/5] Decrypting messages database...");
    copy(&mut decrypted_chat_db, &mut file)?;
    Ok(tmp_path)
}

/// Get the decrypted contacts database from the iOS backup
///
/// The real name is `Library/AddressBook/AddressBook.sqlitedb`
pub fn get_decrypted_contacts_database(backup: &Backup) -> Result<PathBuf, RuntimeError> {
    let (_, file_id) = contacts::DEFAULT_PATH_IOS.split_at(3);
    eprintln!("  [4/5] Resolving contacts database...");
    let file = backup.get_file(file_id)?;
    let mut decrypted_contacts_db = backup.decrypt_entry_stream(&file)?;

    // Write decrypted contacts.db into a platform-specific temporary directory
    let tmp_path = temp_dir().join("crabapple-contacts.db");
    let mut file = File::create(&tmp_path)?;

    // Stream-decrypt directly into the temp file
    eprintln!("  [5/5] Decrypting contacts database...");
    copy(&mut decrypted_contacts_db, &mut file)?;

    Ok(tmp_path)
}

/// Decrypt a file from the iOS backup
pub fn decrypt_file(backup: &Backup, from: &Path) -> Result<PathBuf, RuntimeError> {
    match backup.get_file(
        from.file_name()
            .ok_or_else(|| RuntimeError::FileNameError {
                path: from.to_path_buf(),
                reason: "path has no file name component",
            })?
            .to_str()
            .ok_or_else(|| RuntimeError::FileNameError {
                path: from.to_path_buf(),
                reason: "file name is not valid UTF-8",
            })?,
    ) {
        Ok(file) => {
            let temp_dir = temp_dir().join(&file.file_id);
            let mut temp_file = File::create(&temp_dir)?;

            // Get the size of the file
            let file_size = file.metadata.size;
            // If the file is larger than 25MB, we will stream decryption from/to disk
            // otherwise, we will decrypt in memory
            if file_size > MAX_IN_MEMORY_DECRYPT {
                // Copy via disk
                let mut decryption_stream = backup.decrypt_entry_stream(&file)?;
                let mut writer = BufWriter::new(temp_file);

                // Copy all data from reader to writer
                copy(&mut decryption_stream, &mut writer)?;

                // Ensure all buffered data is flushed to disk
                writer.flush()?;
            } else {
                // Copy via memory
                let decrypted_bytes = backup.decrypt_entry(&file)?;
                temp_file.write_all(&decrypted_bytes)?;
            }

            // Ensure we remove the temporary file later
            Ok(temp_dir)
        }
        Err(why) => Err(RuntimeError::BackupError(why)),
    }
}
