/*!
 This module represents the chat to handle join table.
*/

use std::collections::{BTreeSet, HashMap, HashSet};

use crate::{
    error::table::TableError,
    tables::{
        diagnostic::ChatHandleDiagnostic,
        table::{CHAT_HANDLE_JOIN, CHAT_MESSAGE_JOIN, Cacheable, Table},
    },
    util::union_find::UnionFind,
};
use rusqlite::{CachedStatement, Connection, Result, Row};

// MARK: Struct
/// Represents a single row in the `chat_handle_join` table.
#[derive(Debug)]
pub struct ChatToHandle {
    chat_id: i32,
    handle_id: i32,
}

impl Table for ChatToHandle {
    fn from_row(row: &Row) -> Result<ChatToHandle> {
        Ok(ChatToHandle {
            chat_id: row.get("chat_id")?,
            handle_id: row.get("handle_id")?,
        })
    }

    fn get(db: &'_ Connection) -> Result<CachedStatement<'_>, TableError> {
        Ok(db.prepare_cached(&format!("SELECT * FROM {CHAT_HANDLE_JOIN}"))?)
    }
}

// MARK: Cache
impl Cacheable for ChatToHandle {
    type K = i32;
    type V = BTreeSet<i32>;
    /// Generate a hashmap containing each chatroom's ID pointing to a `BTreeSet` of participant handle IDs
    ///
    /// # Example:
    ///
    /// ```no_run
    /// use imessage_database::util::dirs::default_db_path;
    /// use imessage_database::tables::table::{Cacheable, get_connection};
    /// use imessage_database::tables::chat_handle::ChatToHandle;
    ///
    /// let db_path = default_db_path();
    /// let conn = get_connection(&db_path).unwrap();
    /// let chatrooms = ChatToHandle::cache(&conn);
    /// ```
    fn cache(db: &Connection) -> Result<HashMap<Self::K, Self::V>, TableError> {
        let mut cache: HashMap<i32, BTreeSet<i32>> = HashMap::new();

        let mut rows = ChatToHandle::get(db)?;
        for mapping in ChatToHandle::rows(&mut rows, [])? {
            let joiner = mapping?;
            if let Some(handles) = cache.get_mut(&joiner.chat_id) {
                handles.insert(joiner.handle_id);
            } else {
                let mut data_to_cache = BTreeSet::new();
                data_to_cache.insert(joiner.handle_id);
                cache.insert(joiner.chat_id, data_to_cache);
            }
        }

        Ok(cache)
    }
}

// MARK: Diagnostic
impl ChatToHandle {
    /// Compute diagnostic data for the Chat to Handle join table
    ///
    /// Get the number of chats referenced in the messages table
    /// that do not exist in this join table:
    ///
    /// # Example:
    ///
    /// ```no_run
    /// use imessage_database::util::dirs::default_db_path;
    /// use imessage_database::tables::table::get_connection;
    /// use imessage_database::tables::chat_handle::ChatToHandle;
    ///
    /// let db_path = default_db_path();
    /// let conn = get_connection(&db_path).unwrap();
    /// ChatToHandle::run_diagnostic(&conn);
    /// ```
    pub fn run_diagnostic(db: &Connection) -> Result<ChatHandleDiagnostic, TableError> {
        // Get the Chat IDs that are associated with messages
        let mut statement_message_chats =
            db.prepare(&format!("SELECT DISTINCT chat_id from {CHAT_MESSAGE_JOIN}"))?;
        let statement_message_chat_rows =
            statement_message_chats.query_map([], |row: &Row| -> Result<i32> { row.get(0) })?;
        let mut unique_chats_from_messages: HashSet<i32> = HashSet::new();
        statement_message_chat_rows.into_iter().for_each(|row| {
            if let Ok(row) = row {
                unique_chats_from_messages.insert(row);
            }
        });

        // Get the Chat IDs that are associated with handles
        let mut statement_handle_chats =
            db.prepare(&format!("SELECT DISTINCT chat_id from {CHAT_HANDLE_JOIN}"))?;
        let statement_handle_chat_rows =
            statement_handle_chats.query_map([], |row: &Row| -> Result<i32> { row.get(0) })?;
        let mut unique_chats_from_handles: HashSet<i32> = HashSet::new();
        statement_handle_chat_rows.into_iter().for_each(|row| {
            if let Ok(row) = row {
                unique_chats_from_handles.insert(row);
            }
        });

        // Cache all chats
        let all_chats = Self::cache(db)?;

        // Cache chatroom participants
        let chat_handle_lookup = ChatToHandle::get_chat_lookup_map(db)?;

        // Deduplicate chatroom participants
        let real_chatrooms = ChatToHandle::dedupe(&all_chats, &chat_handle_lookup)?;

        // Calculate total duplicated chats
        let total_duplicated =
            all_chats.len() - HashSet::<&i32>::from_iter(real_chatrooms.values()).len();

        // Find the set difference
        let chats_with_no_handles = unique_chats_from_messages
            .difference(&unique_chats_from_handles)
            .count();

        Ok(ChatHandleDiagnostic {
            total_chats: all_chats.len(),
            total_duplicated,
            chats_with_no_handles,
        })
    }
}

impl ChatToHandle {
    /// Get the chat lookup map from the database, if it exists
    ///
    /// This is used to map chat IDs that are split across services to a canonical chat ID
    /// for deduplication purposes.
    ///
    /// # Example:
    ///
    /// ```no_run
    /// use imessage_database::util::dirs::default_db_path;
    /// use imessage_database::tables::table::get_connection;
    /// use imessage_database::tables::chat_handle::ChatToHandle;
    ///
    /// let db_path = default_db_path();
    /// let conn = get_connection(&db_path).unwrap();
    /// ChatToHandle::get_chat_lookup_map(&conn);
    /// ```
    pub fn get_chat_lookup_map(conn: &Connection) -> Result<HashMap<i32, i32>, TableError> {
        // Query `chat_lookup`, if it exists, to merge chat IDs split across services
        let mut stmt = conn.prepare(
            "
WITH RECURSIVE
  adj AS (
    SELECT DISTINCT a.chat AS u, b.chat AS v
    FROM chat_lookup a
    JOIN chat_lookup b
      ON a.identifier = b.identifier
  ),
  reach(root, chat) AS (
    SELECT u AS root, v AS chat FROM adj
    UNION
    SELECT r.root, a.v
    FROM reach r
    JOIN adj a ON a.u = r.chat
  ),
  canon AS (
    SELECT chat, MAX(root) AS canonical_chat
    FROM reach
    GROUP BY chat
  )
SELECT chat, canonical_chat
FROM canon
ORDER BY chat;
        ",
        );
        let mut chat_lookup_map: HashMap<i32, i32> = HashMap::new();

        if let Ok(statement) = stmt.as_mut() {
            // Build chat lookup map
            let chat_lookup_rows = statement.query_map([], |row| {
                let chat: i32 = row.get(0)?;
                let canonical: i32 = row.get(1)?;
                Ok((chat, canonical))
            });

            // Populate chat lookup map
            if let Ok(chat_lookup_rows) = chat_lookup_rows {
                for row in chat_lookup_rows {
                    let (chat_id, canonical_chat) = row?;
                    chat_lookup_map.insert(chat_id, canonical_chat);
                }
            }
        }
        Ok(chat_lookup_map)
    }

    /// Given the initial set of duplicated chats, deduplicate them based on the participants
    ///
    /// This returns a new hashmap that maps the real chat ID to a new deduplicated unique chat ID
    /// that represents a single chat for all of the same participants, even if they have multiple handles.
    ///
    /// Assuming no new chat-handle relationships have been written to the database, deduplicated data is deterministic across runs.
    ///
    /// # Example:
    ///
    /// ```no_run
    /// use std::collections::HashMap;
    ///
    /// use imessage_database::util::dirs::default_db_path;
    /// use imessage_database::tables::table::{Cacheable, get_connection};
    /// use imessage_database::tables::chat_handle::ChatToHandle;
    ///
    /// let db_path = default_db_path();
    /// let conn = get_connection(&db_path).unwrap();
    /// let chatrooms = ChatToHandle::cache(&conn).unwrap();
    /// let deduped_chatrooms = ChatToHandle::dedupe(&chatrooms, &HashMap::new());
    /// ```
    pub fn dedupe(
        duplicated_data: &HashMap<i32, BTreeSet<i32>>,
        chat_lookup_map: &HashMap<i32, i32>,
    ) -> Result<HashMap<i32, i32>, TableError> {
        let mut uf = UnionFind::new();

        // Initialize a set for every chat ID
        for chat_id in duplicated_data.keys() {
            uf.make_set(*chat_id);
        }

        // Merge chats that the chat_lookup table says are the same conversation,
        // iterating in sorted order so union-by-rank picks deterministic representatives.
        // The canonical may not exist in duplicated_data (e.g., a chat with no handle rows),
        // but it still serves as a bridge so that all chats mapping to it are unified.
        let mut sorted_lookup: Vec<(&i32, &i32)> = chat_lookup_map.iter().collect();
        sorted_lookup.sort_by_key(|(chat_id, _)| *chat_id);
        for (chat_id, canonical) in sorted_lookup {
            if duplicated_data.contains_key(chat_id) {
                uf.union(*chat_id, *canonical);
            }
        }

        // Merge chats that share the same participant set, iterating in
        // sorted order so union-by-rank picks deterministic representatives
        let mut sorted_chats: Vec<(&i32, &BTreeSet<i32>)> = duplicated_data.iter().collect();
        sorted_chats.sort_by_key(|(id, _)| *id);

        let mut participants_to_chat: HashMap<&BTreeSet<i32>, i32> = HashMap::new();
        for (chat_id, participants) in &sorted_chats {
            if let Some(&first_chat) = participants_to_chat.get(participants) {
                uf.union(**chat_id, first_chat);
            } else {
                participants_to_chat.insert(participants, **chat_id);
            }
        }

        // Assign unique sequential IDs to each equivalence class,
        // iterating in sorted chat ID order for determinism
        let mut deduplicated_chats: HashMap<i32, i32> = HashMap::new();
        let mut representative_to_id: HashMap<i32, i32> = HashMap::new();
        let mut next_id = 0;

        for (chat_id, _) in &sorted_chats {
            let rep = uf.find(**chat_id);
            let dedup_id = *representative_to_id.entry(rep).or_insert_with(|| {
                let id = next_id;
                next_id += 1;
                id
            });
            deduplicated_chats.insert(**chat_id, dedup_id);
        }

        Ok(deduplicated_chats)
    }
}

// MARK: Tests
#[cfg(test)]
mod tests {
    use crate::tables::chat_handle::ChatToHandle;
    use std::collections::{BTreeSet, HashMap, HashSet};

    #[test]
    fn can_dedupe() {
        let mut input: HashMap<i32, BTreeSet<i32>> = HashMap::new();
        input.insert(1, BTreeSet::from([1])); // 0
        input.insert(2, BTreeSet::from([1])); // 0
        input.insert(3, BTreeSet::from([1])); // 0
        input.insert(4, BTreeSet::from([2])); // 1
        input.insert(5, BTreeSet::from([2])); // 1
        input.insert(6, BTreeSet::from([3])); // 2

        let output = ChatToHandle::dedupe(&input, &HashMap::new());
        let expected_deduped_ids: HashSet<i32> = output.unwrap().values().copied().collect();
        assert_eq!(expected_deduped_ids.len(), 3);
    }

    #[test]
    fn can_dedupe_multi() {
        let mut input: HashMap<i32, BTreeSet<i32>> = HashMap::new();
        input.insert(1, BTreeSet::from([1, 2])); // 0
        input.insert(2, BTreeSet::from([1])); // 1
        input.insert(3, BTreeSet::from([1])); // 1
        input.insert(4, BTreeSet::from([2, 1])); // 0
        input.insert(5, BTreeSet::from([2, 3])); // 2
        input.insert(6, BTreeSet::from([3])); // 3

        let output = ChatToHandle::dedupe(&input, &HashMap::new());
        let expected_deduped_ids: HashSet<i32> = output.unwrap().values().copied().collect();
        assert_eq!(expected_deduped_ids.len(), 4);
    }

    #[test]
    // Simulate 3 runs of the program and ensure that the order of the deduplicated contacts is stable
    fn test_same_values() {
        let mut input_1: HashMap<i32, BTreeSet<i32>> = HashMap::new();
        input_1.insert(1, BTreeSet::from([1]));
        input_1.insert(2, BTreeSet::from([1]));
        input_1.insert(3, BTreeSet::from([1]));
        input_1.insert(4, BTreeSet::from([2]));
        input_1.insert(5, BTreeSet::from([2]));
        input_1.insert(6, BTreeSet::from([3]));

        let mut input_2: HashMap<i32, BTreeSet<i32>> = HashMap::new();
        input_2.insert(1, BTreeSet::from([1]));
        input_2.insert(2, BTreeSet::from([1]));
        input_2.insert(3, BTreeSet::from([1]));
        input_2.insert(4, BTreeSet::from([2]));
        input_2.insert(5, BTreeSet::from([2]));
        input_2.insert(6, BTreeSet::from([3]));

        let mut input_3: HashMap<i32, BTreeSet<i32>> = HashMap::new();
        input_3.insert(1, BTreeSet::from([1]));
        input_3.insert(2, BTreeSet::from([1]));
        input_3.insert(3, BTreeSet::from([1]));
        input_3.insert(4, BTreeSet::from([2]));
        input_3.insert(5, BTreeSet::from([2]));
        input_3.insert(6, BTreeSet::from([3]));

        let mut output_1 = ChatToHandle::dedupe(&input_1, &HashMap::new())
            .unwrap()
            .into_iter()
            .collect::<Vec<(i32, i32)>>();
        let mut output_2 = ChatToHandle::dedupe(&input_2, &HashMap::new())
            .unwrap()
            .into_iter()
            .collect::<Vec<(i32, i32)>>();
        let mut output_3 = ChatToHandle::dedupe(&input_3, &HashMap::new())
            .unwrap()
            .into_iter()
            .collect::<Vec<(i32, i32)>>();

        output_1.sort_unstable();
        output_2.sort_unstable();
        output_3.sort_unstable();

        assert_eq!(output_1, output_2);
        assert_eq!(output_1, output_3);
        assert_eq!(output_2, output_3);
    }

    #[test]
    fn test_same_values_with_lookup() {
        // Simulate 3 runs with chat_lookup to ensure that dedup IDs are
        // deterministic even when both merge relations are active
        fn build_input() -> HashMap<i32, BTreeSet<i32>> {
            let mut input: HashMap<i32, BTreeSet<i32>> = HashMap::new();
            input.insert(0, BTreeSet::from([1]));
            input.insert(1, BTreeSet::from([1]));
            input.insert(2, BTreeSet::from([3]));
            input.insert(4, BTreeSet::from([2]));
            input.insert(5, BTreeSet::from([1]));
            input
        }

        fn build_lookup() -> HashMap<i32, i32> {
            let mut lookup: HashMap<i32, i32> = HashMap::new();
            lookup.insert(2, 5);
            lookup.insert(4, 0);
            lookup
        }

        let mut output_1 = ChatToHandle::dedupe(&build_input(), &build_lookup())
            .unwrap()
            .into_iter()
            .collect::<Vec<(i32, i32)>>();
        let mut output_2 = ChatToHandle::dedupe(&build_input(), &build_lookup())
            .unwrap()
            .into_iter()
            .collect::<Vec<(i32, i32)>>();
        let mut output_3 = ChatToHandle::dedupe(&build_input(), &build_lookup())
            .unwrap()
            .into_iter()
            .collect::<Vec<(i32, i32)>>();

        output_1.sort_unstable();
        output_2.sort_unstable();
        output_3.sort_unstable();

        assert_eq!(output_1, output_2);
        assert_eq!(output_1, output_3);
        assert_eq!(output_2, output_3);
    }

    #[test]
    fn can_dedupe_with_chat_lookup_map() {
        let mut input: HashMap<i32, BTreeSet<i32>> = HashMap::new();
        input.insert(0, BTreeSet::from([1])); // Canonical 0
        input.insert(1, BTreeSet::from([1])); // Maps to 0
        input.insert(2, BTreeSet::from([3])); // Maps to 5
        input.insert(4, BTreeSet::from([2])); // Maps to 0
        input.insert(5, BTreeSet::from([1])); // Canonical 5

        let mut chat_lookup_map: HashMap<i32, i32> = HashMap::new();
        chat_lookup_map.insert(2, 5);
        chat_lookup_map.insert(4, 0);

        let output = ChatToHandle::dedupe(&input, &chat_lookup_map).unwrap();

        // Chats 0,1,5 share participants {1}, and chat 2 maps to 5 via lookup,
        // and chat 4 maps to 0 via lookup. All are the same conversation
        assert_eq!(output.get(&0), output.get(&1));
        assert_eq!(output.get(&0), output.get(&4));
        assert_eq!(output.get(&0), output.get(&5));
        assert_eq!(output.get(&2), output.get(&5));
    }

    #[test]
    fn can_dedupe_with_lookup_map_overriding_participants() {
        let mut input: HashMap<i32, BTreeSet<i32>> = HashMap::new();
        input.insert(0, BTreeSet::from([1, 2])); // Canonical 0
        input.insert(1, BTreeSet::from([1, 2])); // Maps to 0
        input.insert(2, BTreeSet::from([3, 4])); // Maps to 0
        input.insert(3, BTreeSet::from([1, 2])); // No mapping

        let mut chat_lookup_map: HashMap<i32, i32> = HashMap::new();
        chat_lookup_map.insert(1, 0);
        chat_lookup_map.insert(2, 0);

        let output = ChatToHandle::dedupe(&input, &chat_lookup_map).unwrap();

        // Chats 0,1,2 all map to 0, so same deduplicated ID
        assert_eq!(output.get(&0), output.get(&1));
        assert_eq!(output.get(&0), output.get(&2));
        // Chat 3 no mapping, same participants as 0 and 1, so same
        assert_eq!(output.get(&3), output.get(&0));
    }

    #[test]
    fn can_dedupe_mixed_lookup_and_participants() {
        let mut input: HashMap<i32, BTreeSet<i32>> = HashMap::new();
        input.insert(0, BTreeSet::from([1])); // Canonical 0
        input.insert(1, BTreeSet::from([1])); // Maps to 0
        input.insert(2, BTreeSet::from([3])); // No mapping
        input.insert(3, BTreeSet::from([2])); // Maps to 0
        input.insert(4, BTreeSet::from([3])); // No mapping

        let mut chat_lookup_map: HashMap<i32, i32> = HashMap::new();
        chat_lookup_map.insert(1, 0);
        chat_lookup_map.insert(3, 0);

        let output = ChatToHandle::dedupe(&input, &chat_lookup_map).unwrap();

        // Chats 0,1,3 map to 0, same ID
        assert_eq!(output.get(&0), output.get(&1));
        assert_eq!(output.get(&0), output.get(&3));
        // Chat 2 no mapping, different from 1
        assert_ne!(output.get(&2), output.get(&1));
        // Chat 4 same participants as 2, same as 2
        assert_eq!(output.get(&4), output.get(&2));
        // 3 and 4 different
        assert_ne!(output.get(&3), output.get(&4));
    }

    #[test]
    fn lookup_merges_when_canonical_has_higher_id() {
        // Simulates the real SQL output: canonical = MAX(chat_id) in a connected component.
        // Chat 10 (iMessage) and chat 20 (SMS) are the same conversation with different handles.
        // The lookup maps both to canonical 20 (the max).
        let mut input: HashMap<i32, BTreeSet<i32>> = HashMap::new();
        input.insert(10, BTreeSet::from([1])); // iMessage handle
        input.insert(20, BTreeSet::from([2])); // SMS handle

        let mut chat_lookup_map: HashMap<i32, i32> = HashMap::new();
        chat_lookup_map.insert(10, 20);
        chat_lookup_map.insert(20, 20);

        let output = ChatToHandle::dedupe(&input, &chat_lookup_map).unwrap();

        // Both chats represent the same conversation, so they must share a deduplicated ID
        assert_eq!(
            output.get(&10),
            output.get(&20),
            "Chats linked by chat_lookup should merge regardless of ID ordering"
        );
    }

    #[test]
    fn lookup_merge_is_order_independent() {
        // Two identical conversation pairs, but with canonical ID flipped.
        // Both should produce the same merge result.
        let mut input: HashMap<i32, BTreeSet<i32>> = HashMap::new();
        input.insert(0, BTreeSet::from([1, 2]));
        input.insert(5, BTreeSet::from([3, 4]));

        // Case A: canonical is the lower ID (0)
        let mut lookup_a: HashMap<i32, i32> = HashMap::new();
        lookup_a.insert(0, 0);
        lookup_a.insert(5, 0);
        let output_a = ChatToHandle::dedupe(&input, &lookup_a).unwrap();

        // Case B: canonical is the higher ID (5), which matches real SQL MAX(root) behavior
        let mut lookup_b: HashMap<i32, i32> = HashMap::new();
        lookup_b.insert(0, 5);
        lookup_b.insert(5, 5);
        let output_b = ChatToHandle::dedupe(&input, &lookup_b).unwrap();

        // Both cases link the same two chats; the merge result must be the same
        assert_eq!(
            output_a.get(&0) == output_a.get(&5),
            output_b.get(&0) == output_b.get(&5),
            "Merge result must not depend on which chat ID is canonical"
        );
        // And specifically, both must actually merge
        assert_eq!(
            output_b.get(&0),
            output_b.get(&5),
            "Chats linked by lookup should merge even when canonical is the higher ID"
        );
    }

    #[test]
    fn transitive_merge_across_participants_and_lookup() {
        // Chat 0 and chat 5 share participants {1}, so they merge by participant matching.
        // Chat 2 maps to chat 5 via chat_lookup (different participants, same conversation).
        // Transitively, chat 2 should also be in the same group as chats 0 and 5.
        let mut input: HashMap<i32, BTreeSet<i32>> = HashMap::new();
        input.insert(0, BTreeSet::from([1])); // participant group A
        input.insert(2, BTreeSet::from([3])); // different participants, linked to 5 by lookup
        input.insert(5, BTreeSet::from([1])); // participant group A (same as chat 0)

        let mut chat_lookup_map: HashMap<i32, i32> = HashMap::new();
        chat_lookup_map.insert(2, 5);
        chat_lookup_map.insert(5, 5);

        let output = ChatToHandle::dedupe(&input, &chat_lookup_map).unwrap();

        // Chats 0 and 5 merge by participants
        assert_eq!(output.get(&0), output.get(&5));
        // Chat 2 maps to 5 via lookup, so it must also be in the same group
        assert_eq!(
            output.get(&2),
            output.get(&5),
            "Chat linked by lookup to a chat that merged by participants should join the same group"
        );
    }

    #[test]
    fn multiple_service_splits_all_merge() {
        // Realistic scenario: one conversation across three services (iMessage, SMS, RCS)
        // Each service has its own chat ID and handle ID.
        // The SQL query would produce canonical = MAX(100, 200, 300) = 300 for all.
        let mut input: HashMap<i32, BTreeSet<i32>> = HashMap::new();
        input.insert(100, BTreeSet::from([10])); // iMessage
        input.insert(200, BTreeSet::from([20])); // SMS
        input.insert(300, BTreeSet::from([30])); // RCS

        let mut chat_lookup_map: HashMap<i32, i32> = HashMap::new();
        chat_lookup_map.insert(100, 300);
        chat_lookup_map.insert(200, 300);
        chat_lookup_map.insert(300, 300);

        let output = ChatToHandle::dedupe(&input, &chat_lookup_map).unwrap();

        let unique_ids: HashSet<i32> = output.values().copied().collect();
        assert_eq!(
            unique_ids.len(),
            1,
            "All three service-split chats should merge into one conversation, got {:?}",
            output
        );
    }

    #[test]
    fn lookup_merges_through_missing_canonical() {
        // Chats 10 and 20 both map to canonical 99, but 99 has no handle rows
        // and is therefore absent from duplicated_data. They should still merge
        // because the canonical bridges them in the union-find.
        let mut input: HashMap<i32, BTreeSet<i32>> = HashMap::new();
        input.insert(10, BTreeSet::from([1]));
        input.insert(20, BTreeSet::from([2]));

        let mut chat_lookup_map: HashMap<i32, i32> = HashMap::new();
        chat_lookup_map.insert(10, 99);
        chat_lookup_map.insert(20, 99);

        let output = ChatToHandle::dedupe(&input, &chat_lookup_map).unwrap();

        // Both chats should merge through the missing canonical
        assert_eq!(
            output.get(&10),
            output.get(&20),
            "Chats sharing a canonical absent from duplicated_data should still merge"
        );
        // Only duplicated_data keys should appear in the output
        assert_eq!(output.len(), 2);
        assert!(!output.contains_key(&99));
    }
}
