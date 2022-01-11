use std::collections::HashMap;

use crate::tables::table::{Cacheable, Table, CHAT};
use rusqlite::{Connection, Result, Row, Statement};

#[derive(Debug)]
pub struct Chat {
    rowid: i32,
    guid: String,
    style: i32,
    state: i32,
    account_id: Option<String>,
    properties: Option<Vec<u8>>,
    chat_identifier: String,
    service_name: String,
    room_name: Option<String>,
    account_login: String,
    is_archived: bool,
    last_addressed_handle: String,
    display_name: Option<String>,
    group_id: String,
    is_filtered: bool,
    successful_query: i32,
    engram_id: Option<String>,
    server_change_token: String,
    ck_sync_state: i32,
    last_read_message_timestamp: i64,
    ck_record_system_property_blob: Option<Vec<u8>>,
    original_group_id: String,
    sr_server_change_token: Option<String>,
    sr_ck_sync_state: i32,
    cloudkit_record_id: String,
    sr_cloudkit_record_id: Option<String>,
    last_addressed_sim_id: Option<String>,
    is_blackholed: bool,
    syndication_date: i64,
    syndication_type: i32,
}

impl Table for Chat {
    fn from_row(row: &Row) -> Result<Chat> {
        Ok(Chat {
            rowid: row.get(0)?,
            guid: row.get(1)?,
            style: row.get(2)?,
            state: row.get(3)?,
            account_id: row.get(4)?,
            properties: row.get(5)?,
            chat_identifier: row.get(6)?,
            service_name: row.get(7)?,
            room_name: row.get(8)?,
            account_login: row.get(9)?,
            is_archived: row.get(10)?,
            last_addressed_handle: row.get(11)?,
            display_name: row.get(12)?,
            group_id: row.get(13)?,
            is_filtered: row.get(14)?,
            successful_query: row.get(15)?,
            engram_id: row.get(16)?,
            server_change_token: row.get(17)?,
            ck_sync_state: row.get(18)?,
            last_read_message_timestamp: row.get(19)?,
            ck_record_system_property_blob: row.get(20)?,
            original_group_id: row.get(21)?,
            sr_server_change_token: row.get(22)?,
            sr_ck_sync_state: row.get(23)?,
            cloudkit_record_id: row.get(24)?,
            sr_cloudkit_record_id: row.get(25)?,
            last_addressed_sim_id: row.get(26)?,
            is_blackholed: row.get(27)?,
            syndication_date: row.get(28)?,
            syndication_type: row.get(29)?,
        })
    }

    fn get(db: &Connection) -> Statement {
        db.prepare(&format!("SELECT * from {}", CHAT)).unwrap()
    }
}

impl Cacheable for Chat {
    type T = Chat;
    fn cache(db: &Connection) -> HashMap<i32, Self> {
        let mut map: HashMap<i32, Chat> = HashMap::new();

        let mut statement = Chat::get(db);

        let chats = statement
            .query_map([], |row| Ok(Chat::from_row(row)))
            .unwrap();

        for chat in chats {
            let result = chat.unwrap().unwrap();
            map.insert(result.rowid, result);
        }
        map
    }
}