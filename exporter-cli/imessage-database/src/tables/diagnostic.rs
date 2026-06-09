/*!
 This module contains data structures returned by diagnostic queries on iMessage database tables.
*/

/// Diagnostic data for the `handle` table
#[derive(Debug)]
pub struct HandleDiagnostic {
    /// The total number of handles in the table
    pub total_handles: usize,
    /// The number of distinct `person_centric_id` values in the handle table
    pub handles_with_multiple_ids: usize,
    /// The number of handles that were deduplicated into canonical handles
    pub total_duplicated: usize,
}

/// Diagnostic data for the `message` table
#[derive(Debug)]
pub struct MessageDiagnostic {
    /// The total number of messages in the table
    pub total_messages: usize,
    /// The number of messages not associated with any chat
    pub messages_without_chat: usize,
    /// The number of messages that belong to more than one chat
    pub messages_in_multiple_chats: usize,
    /// The number of recently deleted messages that are still recoverable
    pub recoverable_messages: usize,
    /// The raw `date` value of the earliest message, or `None` if the table is empty
    pub first_message_date: Option<i64>,
    /// The raw `date` value of the most recent message, or `None` if the table is empty
    pub last_message_date: Option<i64>,
}

/// Diagnostic data for the `attachment` table
#[derive(Debug)]
pub struct AttachmentDiagnostic {
    /// The total number of attachments in the table
    pub total_attachments: usize,
    /// The sum of `total_bytes` for all attachments referenced in the table
    pub total_bytes_referenced: u64,
    /// The total size of attachment files present on disk
    pub total_bytes_on_disk: u64,
    /// The number of attachments with missing files (no path or file not found)
    pub missing_files: usize,
    /// The number of attachments with no path provided in the table
    pub no_path_provided: usize,
}

impl AttachmentDiagnostic {
    /// The number of attachments where a path was provided but no file was found at that location
    #[must_use]
    pub fn no_file_located(&self) -> usize {
        self.missing_files.saturating_sub(self.no_path_provided)
    }

    /// The percentage of attachments that are missing, or `None` if there are no attachments
    #[must_use]
    pub fn missing_percent(&self) -> Option<f64> {
        if self.total_attachments > 0 {
            Some(self.missing_files as f64 / self.total_attachments as f64 * 100.0)
        } else {
            None
        }
    }
}

/// Diagnostic data for chat-handle relationships (thread/chat deduplication)
#[derive(Debug)]
pub struct ChatHandleDiagnostic {
    /// The total number of chats in the table
    pub total_chats: usize,
    /// The number of chats that were deduplicated
    pub total_duplicated: usize,
    /// The number of chats that have messages but no associated handles
    pub chats_with_no_handles: usize,
}
