/*!
 This module represents common (but not all) columns in the `handle` table.
*/

use rusqlite::{CachedStatement, Connection, Result, Row};
use std::collections::{BTreeSet, HashMap, HashSet};

use crate::{
    error::table::TableError,
    tables::{
        diagnostic::HandleDiagnostic,
        table::{Cacheable, HANDLE, ME, Table},
    },
};

// MARK: Handle
/// Represents a single row in the `handle` table.
#[derive(Debug)]
pub struct Handle {
    /// The unique identifier for the handle in the database
    pub rowid: i32,
    /// Identifier for a contact, i.e. a phone number or email address
    pub id: String,
    /// Field used to disambiguate divergent handles that represent the same contact
    pub person_centric_id: Option<String>,
}

// MARK: Table
impl Table for Handle {
    fn from_row(row: &Row) -> Result<Handle> {
        Ok(Handle {
            rowid: row.get("rowid")?,
            id: row.get("id")?,
            person_centric_id: row.get("person_centric_id").unwrap_or(None),
        })
    }

    fn get(db: &'_ Connection) -> Result<CachedStatement<'_>, TableError> {
        Ok(db.prepare_cached(&format!("SELECT * from {HANDLE}"))?)
    }
}

// MARK: Cache
impl Cacheable for Handle {
    type K = i32;
    type V = String;
    /// Generate a `HashMap` for looking up contacts by their IDs, collapsing
    /// duplicate contacts to the same ID String regardless of service
    ///
    /// # Example:
    ///
    /// ```no_run
    /// use imessage_database::util::dirs::default_db_path;
    /// use imessage_database::tables::table::{Cacheable, get_connection};
    /// use imessage_database::tables::handle::Handle;
    ///
    /// let db_path = default_db_path();
    /// let conn = get_connection(&db_path).unwrap();
    /// let chatrooms = Handle::cache(&conn);
    /// ```
    fn cache(db: &Connection) -> Result<HashMap<Self::K, Self::V>, TableError> {
        // Create cache for user IDs
        let mut map = HashMap::new();
        // Handle ID 0 is self in group chats
        map.insert(0, ME.to_string());

        // Create query
        let mut statement = Handle::get(db)?;

        // Iterate over the handles and update the map
        for handle in Handle::rows(&mut statement, [])? {
            let contact = handle?;
            map.insert(contact.rowid, contact.id);
        }

        // Condense contacts that share person_centric_id so their IDs map to the same strings
        let dupe_contacts = Handle::get_person_id_map(db)?;
        for contact in dupe_contacts {
            let (id, new) = contact;
            map.insert(id, new);
        }

        // Done!
        Ok(map)
    }
}

// MARK: Dedupe
impl Handle {
    /// Given the initial set of duplicated handles, deduplicate them
    ///
    /// This returns a new hashmap that maps the real handle ID to a new deduplicated unique handle ID
    /// that represents a single handle for all of the deduplicate handles.
    ///
    /// Assuming no new handles have been written to the database, deduplicated data is deterministic across runs.
    ///
    /// # Example:
    ///
    /// ```no_run
    /// use imessage_database::util::dirs::default_db_path;
    /// use imessage_database::tables::table::{Cacheable, get_connection};
    /// use imessage_database::tables::handle::Handle;
    ///
    /// let db_path = default_db_path();
    /// let conn = get_connection(&db_path).unwrap();
    /// let handles = Handle::cache(&conn).unwrap();
    /// let deduped_handles = Handle::dedupe(&handles);
    /// ```
    pub fn dedupe(duplicated_data: &HashMap<i32, String>) -> HashMap<i32, i32> {
        let mut deduplicated_participants: HashMap<i32, i32> = HashMap::new();
        let mut participant_to_unique_participant_id: HashMap<String, i32> = HashMap::new();

        // Build cache of each unique set of participants to a new identifier:
        let mut unique_participant_identifier = 0;

        // Iterate over the values in a deterministic order
        let mut sorted_dupes: Vec<(&i32, &String)> = duplicated_data.iter().collect();
        sorted_dupes.sort_by_key(|(a, _)| *a);

        for (participant_id, participant) in sorted_dupes {
            if let Some(id) = participant_to_unique_participant_id.get(participant) {
                deduplicated_participants.insert(*participant_id, *id);
            } else {
                participant_to_unique_participant_id
                    .insert(participant.to_owned(), unique_participant_identifier);
                deduplicated_participants.insert(*participant_id, unique_participant_identifier);
                unique_participant_identifier += 1;
            }
        }
        deduplicated_participants
    }
}

// MARK: Diagnostic
impl Handle {
    /// Compute diagnostic data for the Handles table
    ///
    /// Counts the number of handles that are duplicated. The `person_centric_id`
    /// is used to map handles that represent the same contact across ids (numbers,
    /// emails, etc) and across services (iMessage, Jabber, iChat, SMS, etc).
    ///
    /// In some databases, `person_centric_id` may not be available.
    ///
    /// # Example:
    ///
    /// ```no_run
    /// use imessage_database::util::dirs::default_db_path;
    /// use imessage_database::tables::table::get_connection;
    /// use imessage_database::tables::handle::Handle;
    ///
    /// let db_path = default_db_path();
    /// let conn = get_connection(&db_path).unwrap();
    /// Handle::run_diagnostic(&conn);
    /// ```
    pub fn run_diagnostic(db: &Connection) -> Result<HandleDiagnostic, TableError> {
        let query = concat!(
            "SELECT COUNT(DISTINCT person_centric_id) ",
            "FROM handle ",
            "WHERE person_centric_id NOT NULL"
        );

        let handles_with_multiple_ids = if let Ok(mut rows) = db.prepare(query) {
            rows.query_row([], |r| r.get::<_, i64>(0))
                .ok()
                .and_then(|count| usize::try_from(count).ok())
                .unwrap_or(0)
        } else {
            0
        };

        // Cache all handles
        let all_handles = Self::cache(db)?;

        // Deduplicate handles
        let unique_handles = Self::dedupe(&all_handles);

        // Calculate total duplicated handles
        let total_duplicated =
            all_handles.len() - HashSet::<&i32>::from_iter(unique_handles.values()).len();

        Ok(HandleDiagnostic {
            total_handles: all_handles.len(),
            handles_with_multiple_ids,
            total_duplicated,
        })
    }
}

// MARK: Impl
impl Handle {
    /// The handles table does not have a lot of information and can have many duplicate values.
    ///
    /// This method generates a hashmap of each separate item in this table to a combined string
    /// that represents all of the copies, so any handle ID will always map to the same string
    /// for a given chat participant
    fn get_person_id_map(db: &Connection) -> Result<HashMap<i32, String>, TableError> {
        let mut person_to_id: HashMap<String, BTreeSet<String>> = HashMap::new();
        let mut row_to_id: HashMap<i32, String> = HashMap::new();
        let mut row_data: Vec<(String, i32, String)> = vec![];

        // Build query
        let query = concat!(
            "SELECT DISTINCT A.person_centric_id, A.rowid, A.id ",
            "FROM handle A ",
            "INNER JOIN handle B ON B.id = A.id ",
            "WHERE A.person_centric_id NOT NULL ",
            "ORDER BY A.person_centric_id",
        );
        let statement = db.prepare(query);

        if let Ok(mut statement) = statement {
            // Cache the results of the query in memory
            let contacts = statement.query_map([], |row| {
                let person_centric_id: String = row.get(0)?;
                let rowid: i32 = row.get(1)?;
                let id: String = row.get(2)?;
                Ok((person_centric_id, rowid, id))
            })?;

            for contact in contacts {
                row_data.push(contact?);
            }

            // First pass: generate a map of each person_centric_id to its matching ids
            for contact in &row_data {
                let (person_centric_id, _, id) = contact;
                if let Some(set) = person_to_id.get_mut(person_centric_id) {
                    set.insert(id.to_owned());
                } else {
                    let mut set = BTreeSet::new();
                    set.insert(id.to_owned());
                    person_to_id.insert(person_centric_id.to_owned(), set);
                }
            }

            // Second pass: point each ROWID to the matching ids
            for contact in &row_data {
                let (person_centric_id, rowid, _) = contact;
                let data_to_insert = match person_to_id.get_mut(person_centric_id) {
                    Some(person) => person.iter().cloned().collect::<Vec<String>>().join(" "),
                    None => continue,
                };
                row_to_id.insert(rowid.to_owned(), data_to_insert);
            }
        }

        Ok(row_to_id)
    }
}

// MARK: Tests
#[cfg(test)]
mod tests {
    use crate::tables::handle::Handle;
    use std::collections::{HashMap, HashSet};

    #[test]
    fn test_can_dedupe() {
        let mut input: HashMap<i32, String> = HashMap::new();
        input.insert(1, String::from("A")); // 0
        input.insert(2, String::from("A")); // 0
        input.insert(3, String::from("A")); // 0
        input.insert(4, String::from("B")); // 1
        input.insert(5, String::from("B")); // 1
        input.insert(6, String::from("C")); // 2

        let output = Handle::dedupe(&input);
        let expected_deduped_ids: HashSet<i32> = output.values().copied().collect();
        assert_eq!(expected_deduped_ids.len(), 3);
    }

    #[test]
    // Simulate 3 runs of the program and ensure that the order of the deduplicated contacts is stable
    fn test_same_values() {
        let mut input_1: HashMap<i32, String> = HashMap::new();
        input_1.insert(1, String::from("A"));
        input_1.insert(2, String::from("A"));
        input_1.insert(3, String::from("A"));
        input_1.insert(4, String::from("B"));
        input_1.insert(5, String::from("B"));
        input_1.insert(6, String::from("C"));

        let mut input_2: HashMap<i32, String> = HashMap::new();
        input_2.insert(1, String::from("A"));
        input_2.insert(2, String::from("A"));
        input_2.insert(3, String::from("A"));
        input_2.insert(4, String::from("B"));
        input_2.insert(5, String::from("B"));
        input_2.insert(6, String::from("C"));

        let mut input_3: HashMap<i32, String> = HashMap::new();
        input_3.insert(1, String::from("A"));
        input_3.insert(2, String::from("A"));
        input_3.insert(3, String::from("A"));
        input_3.insert(4, String::from("B"));
        input_3.insert(5, String::from("B"));
        input_3.insert(6, String::from("C"));

        let mut output_1 = Handle::dedupe(&input_1)
            .into_iter()
            .collect::<Vec<(i32, i32)>>();
        let mut output_2 = Handle::dedupe(&input_2)
            .into_iter()
            .collect::<Vec<(i32, i32)>>();
        let mut output_3 = Handle::dedupe(&input_3)
            .into_iter()
            .collect::<Vec<(i32, i32)>>();

        output_1.sort_unstable();
        output_2.sort_unstable();
        output_3.sort_unstable();

        assert_eq!(output_1, output_2);
        assert_eq!(output_1, output_3);
        assert_eq!(output_2, output_3);
    }
}
