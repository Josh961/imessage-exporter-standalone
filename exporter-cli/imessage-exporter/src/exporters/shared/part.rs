use imessage_database::tables::{
    attachment::Attachment,
    messages::{Message, models::BubbleComponent},
};

use crate::exporters::{
    formatter::{AttachmentRender, MessageFormatter, PartBodyBuilder},
    shared::balloon::rewrite_fitness_receiver,
};

/// Walks `message_part` and produces the format's part-body. Owns:
///
///  - text-vs-attachment-vs-app-vs-retracted branching
///  - the part-edited / Retracted edit-history dance
///  - attachment index advancement
///  - translation lookup
///
/// Each leaf wrapping is delegated to the format's [`PartBodyBuilder`] impl.
pub(crate) fn dispatch_part_body<'a, F>(
    formatter: &'a F,
    message: &'a Message,
    idx: usize,
    message_part: &'a BubbleComponent,
    attachments: &'a mut Vec<Attachment>,
    attachment_index: &mut usize,
) -> F::Body
where
    F: MessageFormatter<'a> + PartBodyBuilder,
{
    match message_part {
        BubbleComponent::Text(text_attrs) => {
            let Some(text) = &message.text else {
                return formatter.body_empty();
            };
            if message.is_part_edited(idx) {
                return match &message.edited_parts {
                    Some(edited_parts) => match formatter.format_edited(message, edited_parts, idx)
                    {
                        Some(rendered) => formatter.body_text_edited(rendered),
                        None => formatter.body_empty(),
                    },
                    None => formatter.body_empty(),
                };
            }

            let formatted_text = {
                let attr_text = formatter.format_attributes(text, text_attrs);
                if attr_text.is_empty() {
                    formatter.body_escape(text)
                } else {
                    attr_text
                }
            };

            let config = formatter.config();
            if config.translated_messages.contains(&message.guid)
                && let Ok(Some(translation)) = message.get_translation(config.data_source.db())
            {
                let safe_translated = formatter.body_escape(&translation.translated_text);
                formatter.body_text_translated(safe_translated, formatted_text)
            } else {
                formatter.body_text_bubble(rewrite_fitness_receiver(formatted_text))
            }
        }
        BubbleComponent::Attachment(metadata) => {
            let Some(attachment) = attachments.get_mut(*attachment_index) else {
                return formatter.body_attachment_missing();
            };
            let body = if attachment.is_sticker {
                let content = formatter.format_sticker(attachment, message);
                formatter.body_sticker(content)
            } else {
                match formatter.format_attachment(attachment, message, metadata) {
                    AttachmentRender::Embedded(content) => formatter.body_attachment(content),
                    AttachmentRender::MissingFilename => formatter.body_attachment_missing(),
                    AttachmentRender::NamedFile(name) => formatter.body_attachment_error(&name),
                }
            };
            *attachment_index += 1;
            body
        }
        BubbleComponent::App => match formatter.format_app(message, attachments) {
            Ok(content) => formatter.body_app(content),
            Err(why) => formatter.body_app_error(message, why.to_string()),
        },
        BubbleComponent::Retracted => match &message.edited_parts {
            Some(edited_parts) => match formatter.format_edited(message, edited_parts, idx) {
                Some(content) => formatter.body_retracted(content),
                None => formatter.body_empty(),
            },
            None => formatter.body_empty(),
        },
    }
}
