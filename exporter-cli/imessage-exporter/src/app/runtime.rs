/*!
 The main app runtime.
*/

use std::{
    cmp::min,
    collections::{BTreeSet, HashMap, HashSet},
    fs::create_dir_all,
    path::PathBuf,
};

use fdlimit::raise_fd_limit;
use fs2::available_space;
use rusqlite::Connection;

use crate::{
    app::{
        compatibility::attachment_manager::AttachmentManagerMode, error::RuntimeError,
        export_type::ExportType, options::Options, sanitizers::sanitize_filename,
    },
    Exporter, HTML, TXT,
};

use imessage_database::{
    error::table::TableError,
    tables::{
        attachment::Attachment,
        chat::Chat,
        chat_handle::ChatToHandle,
        handle::Handle,
        messages::Message,
        table::{
            get_connection, get_db_size, Cacheable, Deduplicate, Diagnostic, ATTACHMENTS_DIR, ME,
            ORPHANED, UNKNOWN,
        },
    },
    util::{dates::get_offset, size::format_file_size},
};

const MAX_LENGTH: usize = 235;

/// Stores the application state and handles application lifecycle
pub struct Config {
    /// Map of chatroom ID to chatroom information
    pub chatrooms: HashMap<i32, Chat>,
    /// Map of chatroom ID to an internal unique chatroom ID
    pub real_chatrooms: HashMap<i32, i32>,
    /// Map of chatroom ID to chatroom participants
    pub chatroom_participants: HashMap<i32, BTreeSet<i32>>,
    /// Map of participant ID to contact info
    pub participants: HashMap<i32, String>,
    /// Map of participant ID to an internal unique participant ID
    pub real_participants: HashMap<i32, i32>,
    /// Messages that are tapbacks (reactions) to other messages
    pub tapbacks: HashMap<String, HashMap<usize, Vec<Message>>>,
    /// App configuration options
    pub options: Options,
    /// Global date offset used by the iMessage database:
    pub offset: i64,
    /// The connection we use to query the database
    pub db: Connection,
}

impl Config {
    /// Get a deduplicated chat ID or a default value
    pub fn conversation(&self, message: &Message) -> Option<(&Chat, &i32)> {
        match message.chat_id.or(message.deleted_from) {
            Some(chat_id) => {
                if let Some(chatroom) = self.chatrooms.get(&chat_id) {
                    self.real_chatrooms.get(&chat_id).map(|id| (chatroom, id))
                } else {
                    eprintln!("Chat ID {chat_id} does not exist in chat table!");
                    None
                }
            }
            // No chat_id provided
            None => None,
        }
    }

    /// Get the attachment path for the current session
    pub fn attachment_path(&self) -> PathBuf {
        let mut path = self.options.export_path.clone();
        path.push(ATTACHMENTS_DIR);
        path
    }

    /// Get the attachment path for a specific chat ID
    pub fn conversation_attachment_path(&self, chat_id: Option<i32>) -> String {
        if let Some(chat_id) = chat_id {
            if let Some(real_id) = self.real_chatrooms.get(&chat_id) {
                return real_id.to_string();
            }
        }
        String::from(ORPHANED)
    }

    /// Generate a file path for an attachment
    ///
    /// If the attachment was copied, use that path
    /// if not, default to the filename
    pub fn message_attachment_path(&self, attachment: &Attachment) -> String {
        // Build a relative filepath from the fully qualified one on the `Attachment`
        match &attachment.copied_path {
            Some(path) => {
                if let Ok(relative_path) = path.strip_prefix(&self.options.export_path) {
                    return relative_path.display().to_string();
                }
                path.display().to_string()
            }
            None => attachment
                .resolved_attachment_path(
                    &self.options.platform,
                    &self.options.db_path,
                    self.options.attachment_root.as_deref(),
                )
                .unwrap_or_else(|| attachment.filename().to_string()),
        }
    }

    /// Get a relative path for the provided file.
    pub fn relative_path(&self, path: PathBuf) -> Option<String> {
        if let Ok(relative_path) = path.strip_prefix(&self.options.export_path) {
            return Some(relative_path.display().to_string());
        }
        Some(path.display().to_string())
    }

    /// Get a filename for a chat, possibly using cached data.
    ///
    /// If the chat has an assigned name, use that, truncating if necessary.
    ///
    /// If it does not, first try and make a flat list of its members. Failing that, use the unique `chat_identifier` field.
    pub fn filename(&self, chatroom: &Chat) -> String {
        let mut filename = match &chatroom.display_name() {
            // If there is a display name, use that
            Some(name) => {
                format!(
                    "{} - {}",
                    &name[..min(MAX_LENGTH, name.len())],
                    chatroom.rowid
                )
            }
            // Fallback if there is no name set
            None => {
                if let Some(participants) = self.chatroom_participants.get(&chatroom.rowid) {
                    self.filename_from_participants(participants)
                } else {
                    eprintln!(
                        "Found error: message chat ID {} has no members!",
                        chatroom.rowid
                    );
                    chatroom.chat_identifier.clone()
                }
            }
        };

        // Add the extension to the filename
        if let Some(export_type) = &self.options.export_type {
            filename.push_str(export_type.extension());
        }

        sanitize_filename(&filename)
    }

    /// Generate a filename from a set of participants, truncating if the name is too long
    ///
    /// - All names:
    ///   - Contact 1, Contact 2
    /// - Truncated Names
    ///   - Contact 1, Contact 2, ... Contact 13 and 4 others
    fn filename_from_participants(&self, participants: &BTreeSet<i32>) -> String {
        let mut added = 0;
        let mut out_s = String::with_capacity(MAX_LENGTH);
        for participant_id in participants {
            let participant = self.who(Some(*participant_id), false, &None);
            if participant.len() + out_s.len() < MAX_LENGTH {
                if !out_s.is_empty() {
                    out_s.push_str(", ");
                }
                out_s.push_str(participant);
                added += 1;
            } else {
                let extra = format!(", and {} others", participants.len() - added);
                let space_remaining = extra.len() + out_s.len();
                if space_remaining >= MAX_LENGTH {
                    out_s.replace_range((MAX_LENGTH - extra.len()).., &extra);
                } else if out_s.is_empty() {
                    out_s.push_str(&participant[..MAX_LENGTH]);
                } else {
                    out_s.push_str(&extra);
                }
                break;
            }
        }
        out_s
    }

    /// Create a new instance of the application
    ///
    /// # Example:
    ///
    /// ```
    /// use crate::app::{
    ///    options::{from_command_line, Options},
    ///    runtime::Config,
    /// };
    ///
    /// let args = from_command_line();
    /// let options = Options::from_args(&args);
    /// let app = Config::new(options).unwrap();
    /// ```
    pub fn new(options: Options) -> Result<Config, RuntimeError> {
        let conn = get_connection(&options.get_db_path()).map_err(RuntimeError::DatabaseError)?;
        eprintln!("Building cache...");
        eprintln!("  [1/4] Caching chats...");
        let chatrooms = Chat::cache(&conn).map_err(RuntimeError::DatabaseError)?;
        eprintln!("  [2/4] Caching chatrooms...");
        let chatroom_participants =
            ChatToHandle::cache(&conn).map_err(RuntimeError::DatabaseError)?;
        eprintln!("  [3/4] Caching participants...");
        let participants = Handle::cache(&conn).map_err(RuntimeError::DatabaseError)?;
        eprintln!("  [4/4] Caching tapbacks...");
        let tapbacks = Message::cache(&conn).map_err(RuntimeError::DatabaseError)?;
        eprintln!("Cache built!");

        Ok(Config {
            chatrooms,
            real_chatrooms: ChatToHandle::dedupe(&chatroom_participants),
            chatroom_participants,
            real_participants: Handle::dedupe(&participants),
            participants,
            tapbacks,
            options,
            offset: get_offset(),
            db: conn,
        })
    }

    /// Convert comma separated list of participant strings into table chat IDs using
    ///   1) filter `self.participant` keys based on the values (by comparing to user values)
    ///   2) get the chat IDs keys from `self.chatroom_participants` for values that contain the selected handle_ids
    ///   3) send those chat and handle IDs to the query context so they are included in the message table filters
    pub(crate) fn resolve_filtered_handles(&mut self) {
        if let Some(conversation_filter) = &self.options.conversation_filter {
            let groups = conversation_filter.split(';').collect::<Vec<&str>>();
            let mut all_included_chatrooms: BTreeSet<i32> = BTreeSet::new();
            let mut all_included_handles: BTreeSet<i32> = BTreeSet::new();

            for group in groups {
                let parsed_handle_filter = group.split(',').collect::<Vec<&str>>();
                let mut current_group_included_handles: BTreeSet<i32> = BTreeSet::new();
                let mut filter_to_handles: HashMap<String, BTreeSet<i32>> = HashMap::new();

                // First: Scan the list of participants for included handle IDs for the current group
                for included_name_filter_str in &parsed_handle_filter {
                    let clean_filter =
                        included_name_filter_str.replace(['+', ' ', '(', ')', '-'], "");
                    let mut found_match_for_current_filter = false;
                    for (handle_id, handle_name_str) in &self.participants {
                        let clean_handle = handle_name_str.replace(['+', ' ', '(', ')', '-'], "");

                        // Determine if it's a potential phone number comparison (long enough, no '@')
                        let is_potential_phone_comparison = clean_handle.len() >= 10
                            && clean_filter.len() >= 10
                            && !clean_handle.contains('@')
                            && !clean_filter.contains('@');

                        let is_match = if is_potential_phone_comparison {
                            // Phone number suffix matching
                            let handle_suffix =
                                &clean_handle[clean_handle.len().saturating_sub(10)..];
                            let filter_suffix =
                                &clean_filter[clean_filter.len().saturating_sub(10)..];
                            handle_suffix == filter_suffix
                        } else {
                            // Exact match for emails or other non-phone/short identifiers
                            clean_handle == clean_filter
                        };

                        if is_match {
                            current_group_included_handles.insert(*handle_id);
                            filter_to_handles
                                .entry(clean_filter.clone())
                                .or_default()
                                .insert(*handle_id);
                            found_match_for_current_filter = true;
                        }
                    }
                    if !found_match_for_current_filter {
                        eprintln!(
                            "Warning: No matching handle found for filter '{}' in group '{}'",
                            included_name_filter_str, group
                        );
                    }
                }

                // Verify we found a set of handles for each filter string in this group
                if filter_to_handles.len() != parsed_handle_filter.len()
                    && !parsed_handle_filter.is_empty()
                {
                    eprintln!("Warning: Not all filters in group '{}' matched to handles. Skipping this group.", group);
                    continue;
                }

                // Second, scan the list of chatrooms
                for (chat_id, chat_participants) in &self.chatroom_participants {
                    if parsed_handle_filter.len() == 1 {
                        // DM case
                        // Chat must have exactly one participant, and that participant must be in current_group_included_handles
                        if chat_participants.len() == 1
                            && chat_participants.is_subset(&current_group_included_handles)
                        {
                            all_included_chatrooms.insert(*chat_id);
                        }
                    } else {
                        // Group chat case
                        // Check if the chat_participants are an exact match to the current_group_included_handles
                        // This means:
                        // 1. The number of participants in the chat must be equal to the number of filters in the group.
                        // 2. Every handle_id in chat_participants must be present in current_group_included_handles.
                        // 3. Every filter in the group must be represented by at least one handle in chat_participants.

                        if chat_participants.len() == parsed_handle_filter.len()
                            && chat_participants.is_subset(&current_group_included_handles)
                        {
                            // To ensure each filter is represented, we check that the set of all handles resolved from all filters
                            // is equivalent to the chat participants.
                            // This is implicitly handled if chat_participants.len() == parsed_handle_filter.len()
                            // and each filter successfully mapped to at least one handle in current_group_included_handles
                            // which is then a subset of chat_participants.
                            // A more robust check for exact group match:
                            let mut group_filters_represented_in_chat = true;
                            if !filter_to_handles.is_empty() {
                                // only if we have filters to check against
                                for handles_for_one_filter in filter_to_handles.values() {
                                    if chat_participants
                                        .intersection(handles_for_one_filter)
                                        .next()
                                        .is_none()
                                    {
                                        group_filters_represented_in_chat = false;
                                        break;
                                    }
                                }
                            } else if !parsed_handle_filter.is_empty() {
                                // if filter_to_handles is empty but parsed_handle_filter was not, it means no handles were found for any filter.
                                group_filters_represented_in_chat = false;
                            }

                            if group_filters_represented_in_chat {
                                all_included_chatrooms.insert(*chat_id);
                            }
                        }
                    }
                }
                all_included_handles.extend(current_group_included_handles);
            }

            self.options
                .query_context
                .set_selected_handle_ids(all_included_handles);
            self.options
                .query_context
                .set_selected_chat_ids(all_included_chatrooms.clone());

            if all_included_chatrooms.is_empty() {
                eprintln!("No chatrooms were found with the supplied contacts.");
                std::process::exit(0);
            }

            self.log_filtered_handles_and_chats()
        }
    }

    /// If we set some filtered chatrooms, emit how many will be included in the export
    fn log_filtered_handles_and_chats(&self) {
        if let (Some(selected_handle_ids), Some(selected_chat_ids)) = (
            &self.options.query_context.selected_handle_ids,
            &self.options.query_context.selected_chat_ids,
        ) {
            let unique_handle_ids: HashSet<Option<&i32>> = selected_handle_ids
                .iter()
                .map(|handle_id| self.real_participants.get(handle_id))
                .collect();

            let mut unique_chat_ids: HashSet<String> = HashSet::new();
            for selected_chat_id in selected_chat_ids {
                if let Some(participants) = self.chatroom_participants.get(selected_chat_id) {
                    unique_chat_ids.insert(self.filename_from_participants(participants));
                }
            }

            eprintln!(
                "Filtering for {} handle{} across {} chatrooms...",
                unique_handle_ids.len(),
                if unique_handle_ids.len() != 1 {
                    "s"
                } else {
                    ""
                },
                unique_chat_ids.len()
            );
        }
    }

    /// Ensure there is available disk space for the requested export
    fn ensure_free_space(&self) -> Result<(), RuntimeError> {
        // Export size is usually about 6% the size of the db; we divide by 10 to over-estimate about 10% of the total size
        // for some safe headroom
        let total_db_size =
            get_db_size(&self.options.db_path).map_err(RuntimeError::DatabaseError)?;
        let mut estimated_export_size = total_db_size / 10;

        let free_space_at_location =
            available_space(&self.options.export_path).map_err(RuntimeError::DiskError)?;

        // Validate that there is enough disk space free to write the export
        if let AttachmentManagerMode::Disabled = self.options.attachment_manager.mode {
            if estimated_export_size >= free_space_at_location {
                return Err(RuntimeError::NotEnoughAvailableSpace(
                    estimated_export_size,
                    free_space_at_location,
                ));
            }
        } else {
            let total_attachment_size =
                Attachment::get_total_attachment_bytes(&self.db, &self.options.query_context)
                    .map_err(RuntimeError::DatabaseError)?;
            estimated_export_size += total_attachment_size;
            if (estimated_export_size + total_attachment_size) >= free_space_at_location {
                return Err(RuntimeError::NotEnoughAvailableSpace(
                    estimated_export_size + total_attachment_size,
                    free_space_at_location,
                ));
            }
        };

        println!(
            "Estimated export size: {}",
            format_file_size(estimated_export_size)
        );

        Ok(())
    }

    /// Handles diagnostic tests for database
    fn run_diagnostic(&self) -> Result<(), TableError> {
        println!("\niMessage Database Diagnostics\n");
        Handle::run_diagnostic(&self.db)?;
        Message::run_diagnostic(&self.db)?;
        Attachment::run_diagnostic(&self.db, &self.options.db_path, &self.options.platform)?;
        ChatToHandle::run_diagnostic(&self.db)?;

        // Global Diagnostics
        println!("Global diagnostic data:");

        let total_db_size = get_db_size(&self.options.db_path)?;
        println!(
            "    Total database size: {}",
            format_file_size(total_db_size)
        );

        let unique_handles: HashSet<i32> =
            HashSet::from_iter(self.real_participants.values().cloned());
        let duplicated_handles = self.participants.len() - unique_handles.len();
        if duplicated_handles > 0 {
            println!("    Duplicated contacts: {duplicated_handles}");
        }

        let unique_chats: HashSet<i32> = HashSet::from_iter(self.real_chatrooms.values().cloned());
        let duplicated_chats = self.chatrooms.len() - unique_chats.len();
        if duplicated_chats > 0 {
            println!("    Duplicated chats: {duplicated_chats}");
        }

        println!("\nEnvironment Diagnostics\n");
        self.options.attachment_manager.diagnostic();

        Ok(())
    }

    /// Start the app given the provided set of options. This will either run
    /// diagnostic tests on the database or export data to the specified file type.
    ///
    // # Example:
    ///
    /// ```
    /// use crate::app::{
    ///    options::{from_command_line, Options},
    ///    runtime::Config,
    /// };
    ///
    /// let args = from_command_line();
    /// let options = Options::from_args(&args);
    /// let app = Config::new(options).unwrap();
    /// app.start();
    /// ```
    pub fn start(&self) -> Result<(), RuntimeError> {
        if self.options.diagnostic {
            self.run_diagnostic().map_err(RuntimeError::DatabaseError)?;
        } else if self.options.list_contacts {
            self.list_contacts_and_chats()
                .map_err(RuntimeError::DatabaseError)?;
        } else if let Some(export_type) = &self.options.export_type {
            // Ensure that if we want to filter on things, we have stuff to filter for
            if let Some(filters) = &self.options.conversation_filter {
                if !self.options.query_context.has_filters() {
                    return Err(RuntimeError::InvalidOptions(format!(
                        "Selected filter `{}` does not match any participants!",
                        filters
                    )));
                }
            }

            // Ensure the path we want to export to exists
            create_dir_all(&self.options.export_path).map_err(RuntimeError::DiskError)?;

            // Ensure the path we want to copy attachments to exists, if requested
            if !matches!(
                self.options.attachment_manager.mode,
                AttachmentManagerMode::Disabled
            ) {
                create_dir_all(self.attachment_path()).map_err(RuntimeError::DiskError)?;
            }

            // Ensure there is enough free disk space to write the export
            if !self.options.ignore_disk_space {
                self.ensure_free_space()?;
            }

            // Ensure we have enough file handles to export
            let _ = raise_fd_limit();

            // Create exporter, pass it data we care about, then kick it off
            match export_type {
                ExportType::Html => {
                    HTML::new(self)?.iter_messages()?;
                }
                ExportType::Txt => {
                    TXT::new(self)?.iter_messages()?;
                }
            }
        }
        println!("Done!");
        Ok(())
    }

    /// List all contacts and group chats with message counts and latest dates
    fn list_contacts_and_chats(&self) -> Result<(), TableError> {
        use imessage_database::util::dates::{format, get_local_time};

        // Get message counts and latest dates for each chat
        let sql = "
            SELECT
                chat.rowid as chat_id,
                chat.display_name,
                chat.chat_identifier,
                COUNT(DISTINCT message.ROWID) as message_count,
                MAX(message.date) as last_message_date,
                GROUP_CONCAT(DISTINCT handle.id) as participants
            FROM chat
            JOIN chat_message_join ON chat.ROWID = chat_message_join.chat_id
            JOIN message ON chat_message_join.message_id = message.ROWID
            LEFT JOIN chat_handle_join ON chat.ROWID = chat_handle_join.chat_id
            LEFT JOIN handle ON chat_handle_join.handle_id = handle.ROWID
            GROUP BY chat.ROWID
            HAVING message_count >= 1
            ORDER BY last_message_date DESC
        ";

        // First get all the rows
        let mut stmt = self.db.prepare(sql).map_err(TableError::Chat)?;
        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, i32>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i32>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            })
            .map_err(TableError::Chat)?;

        // Collect all rows into a Vec to avoid multiple queries
        let all_chats: Vec<_> = rows.collect::<Result<_, _>>().map_err(TableError::Chat)?;

        // Count individual and group chats
        let mut individual_count = 0;
        let mut group_count = 0;

        for (_, _, _, _, _, participants_str_opt) in &all_chats {
            if let Some(participants_str) = participants_str_opt {
                let participant_count = participants_str.split(',').count();
                if participant_count > 1 {
                    group_count += 1;
                } else {
                    individual_count += 1;
                }
            } else {
                // Assuming a chat with no participants listed in chat_handle_join is an individual chat (e.g. with a deleted contact)
                // or a chat that only contains the user themselves.
                individual_count += 1;
            }
        }

        println!("Total DMs: {}", individual_count);
        println!("Total Group Chats: {}", group_count);
        println!("Total Chats: {}", individual_count + group_count);

        // First pass - print individual chats
        for (
            _,
            display_name,
            chat_identifier,
            message_count,
            last_message_date,
            participants_str_opt,
        ) in &all_chats
        {
            let is_group_chat = if let Some(participants_str) = participants_str_opt {
                participants_str.split(',').count() > 1
            } else {
                false // Treat as individual if no participants listed
            };

            if !is_group_chat {
                let date = get_local_time(last_message_date, &self.offset)
                    .map(|d| format(&Ok(d)))
                    .unwrap_or_else(|_| String::from("Unknown"));
                // For individual chats, participants_str_opt might be Some(handle_id_str) or None
                // If Some, use it. If None, it might be a chat with self or a deleted contact; use chat_identifier.
                let contact_id = participants_str_opt.as_deref().unwrap_or(chat_identifier);
                println!("CONTACT|{}|{}|{}", contact_id, message_count, date);
            }
        }

        // Second pass - print group chats
        for (
            _,
            display_name,
            chat_identifier,
            message_count,
            last_message_date,
            participants_str_opt,
        ) in &all_chats
        {
            if let Some(participants_str) = participants_str_opt {
                if participants_str.split(',').count() > 1 {
                    let name = display_name
                        .clone()
                        .unwrap_or_else(|| chat_identifier.clone());
                    let name = if name.is_empty() {
                        chat_identifier.clone()
                    } else {
                        name
                    };
                    let date = get_local_time(last_message_date, &self.offset)
                        .map(|d| format(&Ok(d)))
                        .unwrap_or_else(|_| String::from("Unknown"));

                    println!(
                        "GROUP|{}|{}|{}|{}",
                        name, message_count, date, participants_str
                    );
                }
            }
        }
        Ok(())
    }

    /// Determine who sent a message
    pub fn who<'a, 'b: 'a>(
        &'a self,
        handle_id: Option<i32>,
        is_from_me: bool,
        destination_caller_id: &'b Option<String>,
    ) -> &'a str {
        if is_from_me {
            if self.options.use_caller_id {
                return destination_caller_id.as_deref().unwrap_or(ME);
            }
            return self.options.custom_name.as_deref().unwrap_or(ME);
        } else if let Some(handle_id) = handle_id {
            return match self.participants.get(&handle_id) {
                Some(contact) => contact,
                None => UNKNOWN,
            };
        }
        UNKNOWN
    }
}

#[cfg(test)]
impl Config {
    pub fn fake_app(options: Options) -> Config {
        let connection = get_connection(&options.db_path).unwrap();
        Config {
            chatrooms: HashMap::new(),
            real_chatrooms: HashMap::new(),
            chatroom_participants: HashMap::new(),
            participants: HashMap::new(),
            real_participants: HashMap::new(),
            tapbacks: HashMap::new(),
            options,
            offset: get_offset(),
            db: connection,
        }
    }

    pub fn fake_message() -> Message {
        Message {
            rowid: i32::default(),
            guid: String::default(),
            text: None,
            service: Some("iMessage".to_string()),
            handle_id: Some(i32::default()),
            destination_caller_id: None,
            subject: None,
            date: i64::default(),
            date_read: i64::default(),
            date_delivered: i64::default(),
            is_from_me: false,
            is_read: false,
            item_type: 0,
            other_handle: None,
            share_status: false,
            share_direction: None,
            group_title: None,
            group_action_type: 0,
            associated_message_guid: None,
            associated_message_type: Some(i32::default()),
            balloon_bundle_id: None,
            expressive_send_style_id: None,
            thread_originator_guid: None,
            thread_originator_part: None,
            date_edited: 0,
            associated_message_emoji: None,
            chat_id: None,
            num_attachments: 0,
            deleted_from: None,
            num_replies: 0,
            components: None,
            edited_parts: None,
        }
    }

    pub(crate) fn fake_attachment() -> Attachment {
        Attachment {
            rowid: 0,
            filename: Some("a/b/c/d.jpg".to_string()),
            uti: Some("public.png".to_string()),
            mime_type: Some("image/png".to_string()),
            transfer_name: Some("d.jpg".to_string()),
            total_bytes: 100,
            is_sticker: false,
            hide_attachment: 0,
            emoji_description: None,
            copied_path: None,
        }
    }
}

#[cfg(test)]
mod filename_tests {
    use crate::{app::runtime::MAX_LENGTH, Config, Options};

    use imessage_database::tables::chat::Chat;

    use std::collections::BTreeSet;

    fn fake_chat() -> Chat {
        Chat {
            rowid: 0,
            chat_identifier: "Default".to_string(),
            service_name: Some(String::new()),
            display_name: None,
        }
    }

    #[test]
    fn can_create() {
        let mut options = Options::fake_options(crate::app::export_type::ExportType::Html);
        // Disable the export
        options.export_type = None;
        let app = Config::fake_app(options);
        app.start().unwrap();
    }

    #[test]
    fn can_get_filename_good() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let mut app = Config::fake_app(options);

        // Create participant data
        app.participants.insert(10, "Person 10".to_string());
        app.participants.insert(11, "Person 11".to_string());

        // Add participants
        let mut people = BTreeSet::new();
        people.insert(10);
        people.insert(11);

        // Get filename
        let filename = app.filename_from_participants(&people);
        assert_eq!(filename, "Person 10, Person 11".to_string());
        assert!(filename.len() <= MAX_LENGTH);
    }

    #[test]
    fn can_get_filename_long_multiple() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let mut app = Config::fake_app(options);

        // Create participant data
        app.participants.insert(
            10,
            "Person With An Extremely and Excessively Long Name 10".to_string(),
        );
        app.participants.insert(
            11,
            "Person With An Extremely and Excessively Long Name 11".to_string(),
        );
        app.participants.insert(
            12,
            "Person With An Extremely and Excessively Long Name 12".to_string(),
        );
        app.participants.insert(
            13,
            "Person With An Extremely and Excessively Long Name 13".to_string(),
        );
        app.participants.insert(
            14,
            "Person With An Extremely and Excessively Long Name 14".to_string(),
        );
        app.participants.insert(
            15,
            "Person With An Extremely and Excessively Long Name 15".to_string(),
        );
        app.participants.insert(
            16,
            "Person With An Extremely and Excessively Long Name 16".to_string(),
        );
        app.participants.insert(
            17,
            "Person With An Extremely and Excessively Long Name 17".to_string(),
        );

        // Add participants
        let mut people = BTreeSet::new();
        people.insert(10);
        people.insert(11);
        people.insert(12);
        people.insert(13);
        people.insert(14);
        people.insert(15);
        people.insert(16);
        people.insert(17);

        // Get filename
        let filename = app.filename_from_participants(&people);
        assert_eq!(filename, "Person With An Extremely and Excessively Long Name 10, Person With An Extremely and Excessively Long Name 11, Person With An Extremely and Excessively Long Name 12, Person With An Extremely and Excessively Long Name 13, and 4 others".to_string());
        assert!(filename.len() <= MAX_LENGTH);
    }

    #[test]
    fn can_get_filename_single_long() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let mut app = Config::fake_app(options);

        // Create participant data
        app.participants.insert(10, "He slipped his key into the lock, and we all very quietly entered the cell. The sleeper half turned, and then settled down once more into a deep slumber. Holmes stooped to the water-jug, moistened his sponge, and then rubbed it twice vigorously across and down the prisoner's face.".to_string());

        // Add 1 person
        let mut people = BTreeSet::new();
        people.insert(10);

        // Get filename
        let filename = app.filename_from_participants(&people);
        assert_eq!(filename, "He slipped his key into the lock, and we all very quietly entered the cell. The sleeper half turned, and then settled down once more into a deep slumber. Holmes stooped to the water-jug, moistened his sponge, and then rubbed it twice v".to_string());
        assert!(filename.len() <= MAX_LENGTH);
    }

    #[test]
    fn can_get_filename_chat_display_name_long() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let app = Config::fake_app(options);

        // Create chat
        let mut chat = fake_chat();
        chat.display_name = Some("Life is infinitely stranger than anything which the mind of man could invent. We would not dare to conceive the things which are really mere commonplaces of existence. If we could fly out of that window hand in hand, hover over this great city, gently remove the roofs".to_string());

        // Get filename
        let filename = app.filename(&chat);
        assert_eq!(
            filename,
            "Life is infinitely stranger than anything which the mind of man could invent. We would not dare to conceive the things which are really mere commonplaces of existence. If we could fly out of that window hand in hand, hover over this gr - 0.html"
        );
    }

    #[test]
    fn can_get_filename_chat_display_name_normal() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let app = Config::fake_app(options);

        // Create chat
        let mut chat = fake_chat();
        chat.display_name = Some("Test Chat Name".to_string());

        // Get filename
        let filename = app.filename(&chat);
        assert_eq!(filename, "Test Chat Name - 0.html");
    }

    #[test]
    fn can_get_filename_chat_display_name_short() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let app = Config::fake_app(options);

        // Create chat
        let mut chat = fake_chat();
        chat.display_name = Some("🤠".to_string());

        // Get filename
        let filename = app.filename(&chat);
        assert_eq!(filename, "🤠 - 0.html");
    }

    #[test]
    fn can_get_filename_chat_participants() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let mut app = Config::fake_app(options);

        // Create chat
        let chat = fake_chat();

        // Create participant data
        app.participants.insert(10, "Person 10".to_string());
        app.participants.insert(11, "Person 11".to_string());

        // Add participants
        let mut people = BTreeSet::new();
        people.insert(10);
        people.insert(11);
        app.chatroom_participants.insert(chat.rowid, people);

        // Get filename
        let filename = app.filename(&chat);
        assert_eq!(filename, "Person 10, Person 11.html");
    }

    #[test]
    fn can_get_filename_chat_no_participants() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let app = Config::fake_app(options);

        // Create chat
        let chat = fake_chat();

        // Get filename
        let filename = app.filename(&chat);
        assert_eq!(filename, "Default.html");
    }
}

#[cfg(test)]
mod who_tests {
    use crate::{Config, Options};
    use imessage_database::tables::chat::Chat;

    fn fake_chat() -> Chat {
        Chat {
            rowid: 0,
            chat_identifier: "Default".to_string(),
            service_name: Some(String::new()),
            display_name: None,
        }
    }

    #[test]
    fn can_get_who_them() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let mut app = Config::fake_app(options);

        // Create participant data
        app.participants.insert(10, "Person 10".to_string());

        // Get participant name
        let who = app.who(Some(10), false, &None);
        assert_eq!(who, "Person 10".to_string());
    }

    #[test]
    fn can_get_who_them_missing() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let app = Config::fake_app(options);

        // Get participant name
        let who = app.who(Some(10), false, &None);
        assert_eq!(who, "Unknown".to_string());
    }

    #[test]
    fn can_get_who_me() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let app = Config::fake_app(options);

        // Get participant name
        let who = app.who(Some(0), true, &None);
        assert_eq!(who, "Me".to_string());
    }

    #[test]
    fn can_get_who_me_caller_id() {
        let mut options = Options::fake_options(crate::app::export_type::ExportType::Html);
        options.use_caller_id = true;
        let app = Config::fake_app(options);

        // Get participant name
        let caller_id = Some("test".to_string());
        let who = app.who(Some(0), true, &caller_id);
        assert_eq!(who, "test".to_string());
    }

    #[test]
    fn can_get_who_me_custom() {
        let mut options = Options::fake_options(crate::app::export_type::ExportType::Html);
        options.custom_name = Some("Name".to_string());
        let app = Config::fake_app(options);

        // Get participant name
        let who = app.who(Some(0), true, &None);
        assert_eq!(who, "Name".to_string());
    }

    #[test]
    fn can_get_who_none_me() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let app = Config::fake_app(options);

        // Get participant name
        let who = app.who(None, true, &None);
        assert_eq!(who, "Me".to_string());
    }

    #[test]
    fn can_get_who_me_none_caller_id() {
        let mut options = Options::fake_options(crate::app::export_type::ExportType::Html);
        options.use_caller_id = true;
        let app = Config::fake_app(options);

        // Get participant name
        let caller_id = Some("test".to_string());
        let who = app.who(None, true, &caller_id);
        assert_eq!(who, "test".to_string());
    }

    #[test]
    fn can_get_who_none_them() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let app = Config::fake_app(options);

        // Get participant name
        let who = app.who(None, false, &None);
        assert_eq!(who, "Unknown".to_string());
    }

    #[test]
    fn can_get_chat_valid() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let mut app = Config::fake_app(options);

        // Create chat
        let chat = fake_chat();
        app.chatrooms.insert(chat.rowid, chat);
        app.real_chatrooms.insert(0, 0);

        // Create message
        let mut message = Config::fake_message();
        message.chat_id = Some(0);

        // Get filename
        let (_, id) = app.conversation(&message).unwrap();
        assert_eq!(id, &0);
    }

    #[test]
    fn can_get_chat_valid_deleted() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let mut app = Config::fake_app(options);

        // Create chat
        let chat = fake_chat();
        app.chatrooms.insert(chat.rowid, chat);
        app.real_chatrooms.insert(0, 0);

        // Create message
        let mut message = Config::fake_message();
        message.chat_id = None;
        message.deleted_from = Some(0);

        // Get filename
        let (_, id) = app.conversation(&message).unwrap();
        assert_eq!(id, &0);
    }

    #[test]
    fn can_get_chat_invalid() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let mut app = Config::fake_app(options);

        // Create chat
        let chat = fake_chat();
        app.chatrooms.insert(chat.rowid, chat);
        app.real_chatrooms.insert(0, 0);

        // Create message
        let mut message = Config::fake_message();
        message.chat_id = Some(1);

        // Get filename
        let room = app.conversation(&message);
        assert!(room.is_none());
    }

    #[test]
    fn can_get_chat_none() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let mut app = Config::fake_app(options);

        // Create chat
        let chat = fake_chat();
        app.chatrooms.insert(chat.rowid, chat);
        app.real_chatrooms.insert(0, 0);

        // Create message
        let mut message = Config::fake_message();
        message.chat_id = None;
        message.deleted_from = None;

        // Get filename
        let room = app.conversation(&message);
        assert!(room.is_none());
    }
}

#[cfg(test)]
mod directory_tests {
    use crate::{Config, Options};
    use std::path::PathBuf;

    #[test]
    fn can_get_valid_attachment_sub_dir() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let mut app = Config::fake_app(options);

        // Create chatroom ID
        app.real_chatrooms.insert(0, 0);

        // Get subdirectory
        let sub_dir = app.conversation_attachment_path(Some(0));
        assert_eq!(String::from("0"), sub_dir);
    }

    #[test]
    fn can_get_invalid_attachment_sub_dir() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let mut app = Config::fake_app(options);

        // Create chatroom ID
        app.real_chatrooms.insert(0, 0);

        // Get subdirectory
        let sub_dir = app.conversation_attachment_path(Some(1));
        assert_eq!(String::from("orphaned"), sub_dir);
    }

    #[test]
    fn can_get_missing_attachment_sub_dir() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let mut app = Config::fake_app(options);

        // Create chatroom ID
        app.real_chatrooms.insert(0, 0);

        // Get subdirectory
        let sub_dir = app.conversation_attachment_path(None);
        assert_eq!(String::from("orphaned"), sub_dir);
    }

    #[test]
    fn can_get_path_not_copied() {
        let options = Options::fake_options(crate::app::export_type::ExportType::Html);
        let app = Config::fake_app(options);

        // Create attachment
        let attachment = Config::fake_attachment();

        let result = app.message_attachment_path(&attachment);
        let expected = String::from("a/b/c/d.jpg");
        assert_eq!(result, expected);
    }

    #[test]
    fn can_get_path_copied() {
        let mut options = Options::fake_options(crate::app::export_type::ExportType::Html);
        // Set an export path
        options.export_path = PathBuf::from("/Users/ReagentX/exports");

        let app = Config::fake_app(options);

        // Create attachment
        let mut attachment = Config::fake_attachment();
        let mut full_path = PathBuf::from("/Users/ReagentX/exports/attachments");
        full_path.push(attachment.filename());
        attachment.copied_path = Some(full_path);

        let result = app.message_attachment_path(&attachment);
        let expected = String::from("attachments/d.jpg");
        assert_eq!(result, expected);
    }

    #[test]
    fn can_get_path_copied_bad() {
        let mut options = Options::fake_options(crate::app::export_type::ExportType::Html);
        // Set an export path
        options.export_path = PathBuf::from("/Users/ReagentX/exports");

        let app = Config::fake_app(options);

        // Create attachment
        let mut attachment = Config::fake_attachment();
        attachment.copied_path = Some(PathBuf::from(attachment.filename.as_ref().unwrap()));

        let result = app.message_attachment_path(&attachment);
        let expected = String::from("a/b/c/d.jpg");
        assert_eq!(result, expected);
    }
}

#[cfg(test)]
mod chat_filter_tests {
    use std::collections::BTreeSet;

    use crate::{app::export_type::ExportType, Config, Options};

    #[test]
    fn can_generate_filter_string_multiple() {
        let mut options = Options::fake_options(ExportType::Html);
        options.conversation_filter = Some(String::from("Person 10,Person 11,Person 12"));

        let mut app = Config::fake_app(options);

        // Add some test data
        app.participants.insert(10, "Person 10".to_string()); // Included
        app.participants.insert(11, "Person 11".to_string()); // Included
        app.participants.insert(12, "Person 12".to_string()); // Included
        app.participants.insert(13, "Person 13".to_string()); // Excluded

        // Chatroom 1: Included
        let mut chatroom_1 = BTreeSet::new();
        chatroom_1.insert(10);
        app.chatroom_participants.insert(1, chatroom_1);

        // Chatroom 2: Included
        let mut chatroom_2 = BTreeSet::new();
        chatroom_2.insert(11);
        app.chatroom_participants.insert(2, chatroom_2);

        // Chatroom 3: Included
        let mut chatroom_3 = BTreeSet::new();
        chatroom_3.insert(12);
        app.chatroom_participants.insert(3, chatroom_3);

        // Chatroom 4: Excluded
        let mut chatroom_4 = BTreeSet::new();
        chatroom_4.insert(13);
        app.chatroom_participants.insert(4, chatroom_4);

        // Chatroom 5: Included
        let mut chatroom_5 = BTreeSet::new();
        chatroom_5.insert(10);
        chatroom_5.insert(11);
        app.chatroom_participants.insert(5, chatroom_5);

        // Chatroom 6: Included
        let mut chatroom_6 = BTreeSet::new();
        chatroom_6.insert(12);
        chatroom_6.insert(13); // Even though this person is excluded, the above person is
        app.chatroom_participants.insert(6, chatroom_6);

        app.resolve_filtered_handles();
        // For the test, sort the output so it is always the same

        assert_eq!(
            app.options.query_context.selected_handle_ids,
            Some(BTreeSet::from([10, 11, 12]))
        );
        assert_eq!(
            app.options.query_context.selected_chat_ids,
            Some(BTreeSet::from([1, 2, 3, 5, 6]))
        );
    }

    #[test]
    fn can_generate_filter_string_single() {
        let mut options = Options::fake_options(ExportType::Html);
        options.conversation_filter = Some(String::from("Person 13"));

        let mut app = Config::fake_app(options);

        // Add some test data
        app.participants.insert(10, "Person 10".to_string()); // Excluded
        app.participants.insert(11, "Person 11".to_string()); // Excluded
        app.participants.insert(12, "Person 12".to_string()); // Excluded
        app.participants.insert(13, "Person 13".to_string()); // Included

        // Chatroom 1: Excluded
        let mut chatroom_1 = BTreeSet::new();
        chatroom_1.insert(10);
        app.chatroom_participants.insert(1, chatroom_1);

        // Chatroom 2: Excluded
        let mut chatroom_2 = BTreeSet::new();
        chatroom_2.insert(11);
        app.chatroom_participants.insert(2, chatroom_2);

        // Chatroom 3: Excluded
        let mut chatroom_3 = BTreeSet::new();
        chatroom_3.insert(12);
        app.chatroom_participants.insert(3, chatroom_3);

        // Chatroom 4: Included
        let mut chatroom_4 = BTreeSet::new();
        chatroom_4.insert(13);
        app.chatroom_participants.insert(4, chatroom_4);

        // Chatroom 5: Excluded
        let mut chatroom_5 = BTreeSet::new();
        chatroom_5.insert(10);
        chatroom_5.insert(11);
        app.chatroom_participants.insert(5, chatroom_5);

        // Chatroom 6: Included
        let mut chatroom_6 = BTreeSet::new();
        chatroom_6.insert(12);
        chatroom_6.insert(13); // Even though this person is excluded, the above person is
        app.chatroom_participants.insert(6, chatroom_6);

        app.resolve_filtered_handles();
        // For the test, sort the output so it is always the same

        assert_eq!(
            app.options.query_context.selected_handle_ids,
            Some(BTreeSet::from([13]))
        );
        assert_eq!(
            app.options.query_context.selected_chat_ids,
            Some(BTreeSet::from([4, 6]))
        );
    }
}
