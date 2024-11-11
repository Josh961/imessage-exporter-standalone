/*!
 This module contains Data structures and models that represent message data.
*/

use crate::message_types::text_effects::TextEffect;

/// Defines the parts of a message bubble, i.e. the content that can exist in a single message.
///
/// # Component Types
///
/// A single iMessage contains data that may be represented across multiple bubbles.
///
/// iMessage bubbles can only contain data of one variant of this enum at a time.
#[derive(Debug, PartialEq, Eq)]
pub enum BubbleComponent<'a> {
    /// A text message with associated formatting, generally representing ranges present in a `NSAttributedString`
    Text(Vec<TextAttributes<'a>>),
    /// An attachment
    Attachment(&'a str),
    /// An [app integration](crate::message_types::app)
    App,
    /// A component that was retracted, found by parsing the [`EditedMessage`](crate::message_types::edited::EditedMessage)
    Retracted,
}

/// Defines different types of services we can receive messages from.
#[derive(Debug)]
pub enum Service<'a> {
    /// An iMessage
    #[allow(non_camel_case_types)]
    iMessage,
    /// A message sent as SMS
    SMS,
    /// Any other type of message
    Other(&'a str),
    /// Used when service field is not set
    Unknown,
}

/// Defines ranges of text and associated attributes parsed from [`typedstream`](crate::util::typedstream) `attributedBody` data.
///
/// Ranges specify locations attributes applied to specific portions of a [`Message`](crate::tables::messages::Message)'s [`text`](crate::tables::messages::Message::text). For example, given message text with a [`Mention`](TextEffect::Mention) like:
///
/// ```
/// let message_text = "What's up, Christopher?";
/// ```
///
/// There will be 3 ranges:
///
/// ```
/// use imessage_database::message_types::text_effects::TextEffect;
/// use imessage_database::tables::messages::models::{TextAttributes, BubbleComponent};
///  
/// let result = vec![BubbleComponent::Text(vec![
///     TextAttributes::new(0, 11, TextEffect::Default),  // `What's up, `
///     TextAttributes::new(11, 22, TextEffect::Mention("+5558675309")), // `Christopher`
///     TextAttributes::new(22, 23, TextEffect::Default)  // `?`
/// ])];
/// ```
#[derive(Debug, PartialEq, Eq)]
pub struct TextAttributes<'a> {
    /// The start index of the affected range of message text
    pub start: usize,
    /// The end index of the affected range of message text
    pub end: usize,
    /// The effects applied to the specified range
    pub effect: TextEffect<'a>,
}

impl<'a> TextAttributes<'a> {
    pub fn new(start: usize, end: usize, effect: TextEffect<'a>) -> Self {
        Self { start, end, effect }
    }
}
