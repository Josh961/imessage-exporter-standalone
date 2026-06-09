use std::collections::HashMap;

use rusqlite::Connection;

use imessage_database::{
    error::table::TableError,
    message_types::expressives::Expressive,
    tables::{attachment::Attachment, messages::Message},
};

/// Per-message data resolved up front so exporters can iterate over a
/// message's parts without re-issuing the same DB queries or repeating the
/// `Expressive::None` filter. `attachments` and `replies_map` are owned
/// because the per-part loop mutates them: attachments are passed `&mut` to
/// the part-body builder so attachment resolution can record disk side
/// effects, and `replies_map` entries are pulled out via `get_mut` for the
/// reply recursion.
pub(crate) struct MessageContext<'a> {
    pub attachments: Vec<Attachment>,
    pub replies_map: HashMap<usize, Vec<Message>>,
    pub expressive: Option<Expressive<'a>>,
}

impl<'a> MessageContext<'a> {
    pub fn resolve(message: &'a Message, db: &Connection) -> Result<Self, TableError> {
        Ok(Self {
            attachments: Attachment::from_message(db, message)?,
            replies_map: message.get_replies(db)?,
            expressive: match message.get_expressive() {
                Expressive::None | Expressive::Unknown("") => None,
                other => Some(other),
            },
        })
    }
}
