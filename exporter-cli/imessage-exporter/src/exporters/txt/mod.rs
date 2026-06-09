use std::{fs::File, io::BufWriter};

use crate::{
    app::{error::RuntimeError, runtime::Config},
    exporters::{
        formatter::{AttachmentRender, MessageFormatter, PartBodyBuilder, RenderContext},
        shared::{
            announcement::{AnnouncementBody, resolve_announcement},
            attachment::prepare_attachment,
            balloon::dispatch_app_balloon,
            driver::{ExportState, MessageWriter},
            edited::{EditDiff, normalize_edited},
            message::MessageContext,
            part::dispatch_part_body,
            render::{render_template, render_template_into},
            reply::{build_replies, build_tapbacks},
            tapback::resolve_tapback,
            time::{format_timestamp, message_time},
        },
    },
};

use imessage_database::{
    message_types::{edited::EditedMessage, sticker::StickerDecoration},
    tables::{
        attachment::Attachment,
        messages::{
            Message,
            models::{AttachmentMeta, SharedLocation, TextAttributes},
        },
        table::YOU,
    },
};

mod balloons;
mod view_model;

use view_model::{
    AnnouncementVM, AttachmentVM, EditedRow, EditedVM, MessagePartVM, MessageVM, PartBody,
    RepliesVM, StickerVM, TapbackVM, TapbacksVM,
};

/// Indentation prepended to every line of a reply rendered inside its
/// parent message's body. Top-level messages render at zero indent.
const REPLY_INDENT: &str = "    ";

pub struct TXT<'a> {
    /// Data that is setup from the application's runtime
    pub config: &'a Config,
    /// Shared per-export state (file cache, orphaned writer, progress bar).
    pub state: ExportState,
}

impl<'a> TXT<'a> {
    pub fn new(config: &'a Config) -> Result<Self, RuntimeError> {
        Ok(TXT {
            config,
            state: ExportState::new(config, "txt")?,
        })
    }
}

// MARK: Driver hooks
impl<'a> MessageWriter<'a> for TXT<'a> {
    const LABEL: &'static str = "txt";
    const BUFFER_CAPACITY: usize = 1024;

    fn config(&self) -> &'a Config {
        self.config
    }

    fn state(&self) -> &ExportState {
        &self.state
    }

    fn state_mut(&mut self) -> &mut ExportState {
        &mut self.state
    }

    fn write_file_header(_file: &mut BufWriter<File>) -> Result<(), RuntimeError> {
        Ok(())
    }

    fn write_file_footer(_file: &mut BufWriter<File>) -> Result<(), RuntimeError> {
        Ok(())
    }

    fn footer_notice() -> Option<&'static str> {
        None
    }
}

// MARK: Writer
impl<'a> MessageFormatter<'a> for TXT<'a> {
    fn format_attachment(
        &self,
        attachment: &'a mut Attachment,
        message: &Message,
        metadata: &AttachmentMeta,
    ) -> AttachmentRender {
        if let Err(render) = prepare_attachment(self.config, &self.state, attachment, message) {
            return render;
        }

        AttachmentRender::Embedded(render_template(&AttachmentVM {
            embed_path: self.config.message_attachment_path(attachment),
            transcription: metadata.transcription.as_deref(),
        }))
    }

    fn format_sticker(&self, sticker: &'a mut Attachment, message: &Message) -> String {
        let who = self.config.who(
            message.handle_id,
            message.is_from_me(),
            &message.destination_caller_id,
        );
        let (path, has_source) =
            match self.format_attachment(sticker, message, &AttachmentMeta::default()) {
                AttachmentRender::Embedded(p) => (p, true),
                AttachmentRender::MissingFilename => (String::new(), false),
                AttachmentRender::NamedFile(name) => (name, false),
            };

        let decoration = if has_source {
            sticker.get_sticker_decoration(
                self.config.data_source.db(),
                &self.config.options.platform,
                &self.config.options.db_path,
                self.config.options.attachment_root.as_deref(),
            )
        } else {
            None
        };

        let (effect_prefix, suffix) = match decoration {
            Some(StickerDecoration::GenmojiPrompt(prompt)) => {
                (None, Some(format!(" (Genmoji prompt: {prompt})")))
            }
            Some(StickerDecoration::Memoji) => (None, Some(" (App: Memoji)".to_string())),
            Some(StickerDecoration::Effect(effect)) => (Some(format!("{effect} ")), None),
            Some(StickerDecoration::AppName(name)) => (None, Some(format!(" (App: {name})"))),
            None => (None, None),
        };

        render_template(&StickerVM {
            effect_prefix,
            who,
            path,
            suffix,
        })
    }

    fn format_app(
        &self,
        message: &'a Message,
        attachments: &mut Vec<Attachment>,
    ) -> Result<String, RuntimeError> {
        Ok(dispatch_app_balloon(
            self,
            message,
            attachments,
            self.config,
        )?)
    }

    fn format_tapback(&self, msg: &Message) -> Result<String, RuntimeError> {
        let Some(kind) = resolve_tapback(msg, self.config, |sticker| {
            self.format_sticker(sticker, msg)
        })?
        else {
            return Ok(String::new());
        };
        Ok(render_template(&TapbackVM { kind }))
    }

    fn format_announcement(&self, msg: &Message, out: &mut String) {
        let kind = resolve_announcement(msg, self.config, YOU)
            .map_or(AnnouncementBody::Unknown, AnnouncementBody::from);
        render_template_into(&AnnouncementVM { kind }, out);
    }

    fn format_shareplay(&self) -> &'static str {
        "SharePlay Message\nEnded"
    }

    fn format_shared_location(&self, kind: SharedLocation) -> &'static str {
        match kind {
            SharedLocation::Started => "Started sharing location!",
            SharedLocation::Stopped => "Stopped sharing location!",
        }
    }

    fn format_edited(
        &self,
        msg: &'a Message,
        edited_message: &'a EditedMessage,
        message_part_idx: usize,
    ) -> Option<String> {
        let kind = normalize_edited(msg, edited_message, message_part_idx, self.config, YOU)?
            .map_rows(|event| {
                let timestamp_prefix = match event.diff_since_previous {
                    EditDiff::First => {
                        let mut s = format_timestamp(event.date, self.config.offset);
                        s.push(' ');
                        s
                    }
                    // Diff calculation failed; suppress the prefix.
                    EditDiff::Failed => String::new(),
                    EditDiff::Computed(diff) => format!("Edited {diff} later: "),
                };
                EditedRow {
                    timestamp_prefix,
                    text: event.text,
                }
            });

        Some(render_template(&EditedVM { kind }))
    }

    fn format_attributes(&self, text: &str, attributes: &[TextAttributes]) -> String {
        let mut formatted_text = String::with_capacity(text.len());
        let mut prev_start = 0;
        let mut prev_end = 0;

        for effect in attributes {
            if prev_start == effect.start && prev_end == effect.end {
                continue;
            }
            if let Some(message_content) = text.get(effect.start..effect.end) {
                prev_start = effect.start;
                prev_end = effect.end;
                // There isn't really a way to represent formatted text in a plain text export
                formatted_text.push_str(message_content);
            }
        }
        formatted_text
    }

    fn format_message_into(
        &self,
        message: &Message,
        context: RenderContext,
        out: &mut String,
    ) -> Result<(), RuntimeError> {
        let mut ctx = MessageContext::resolve(message, self.config.data_source.db())?;
        let mut attachment_index: usize = 0;

        let mut parts = Vec::with_capacity(message.components.len());
        for (idx, message_part) in message.components.iter().enumerate() {
            let body = dispatch_part_body(
                self,
                message,
                idx,
                message_part,
                &mut ctx.attachments,
                &mut attachment_index,
            );
            parts.push(MessagePartVM {
                body,
                expressive: ctx.expressive,
                tapbacks: build_tapbacks(self, message, idx, std::convert::identity)?
                    .map(|tapbacks| TapbacksVM { tapbacks }),
                replies: build_replies(
                    self,
                    ctx.replies_map.get_mut(&idx),
                    Self::BUFFER_CAPACITY,
                    std::convert::identity,
                )?
                .map(|replies| RepliesVM { replies }),
            });
        }

        let vm = MessageVM {
            timestamp: self.get_time(message),
            sender: self.config.who(
                message.handle_id,
                message.is_from_me(),
                &message.destination_caller_id,
            ),
            is_deleted: message.is_deleted(),
            subject: message.subject.as_deref(),
            shareplay: message.is_shareplay().then(|| self.format_shareplay()),
            shared_location: message
                .shared_location_kind()
                .map(|kind| self.format_shared_location(kind)),
            parts,
            is_reply: message.is_reply(),
            context,
        };

        match context {
            RenderContext::TopLevel => {
                render_template_into(&vm, out);
            }
            RenderContext::Reply => {
                // Render to a scratch buffer, then prefix every non-blank
                // line with REPLY_INDENT on the way out
                let mut buf = String::with_capacity(Self::BUFFER_CAPACITY);
                render_template_into(&vm, &mut buf);
                Self::push_indented(out, &buf, REPLY_INDENT);
            }
        }
        Ok(())
    }
}

// MARK: Part Body
impl PartBodyBuilder for TXT<'_> {
    type Body = PartBody;

    fn body_empty(&self) -> Self::Body {
        PartBody::Empty
    }

    fn body_text_bubble(&self, content: String) -> Self::Body {
        PartBody::Line { text: content }
    }

    fn body_text_translated(&self, translated: String, original: String) -> Self::Body {
        PartBody::Translated {
            translated,
            original,
        }
    }

    fn body_text_edited(&self, content: String) -> Self::Body {
        PartBody::Line { text: content }
    }

    fn body_attachment(&self, content: String) -> Self::Body {
        PartBody::Line { text: content }
    }

    fn body_attachment_error(&self, error: &str) -> Self::Body {
        PartBody::Line {
            text: error.to_string(),
        }
    }

    fn body_attachment_missing(&self) -> Self::Body {
        PartBody::Line {
            text: "Attachment missing!".to_string(),
        }
    }

    fn body_sticker(&self, content: String) -> Self::Body {
        PartBody::Line { text: content }
    }

    fn body_app(&self, content: String) -> Self::Body {
        PartBody::Line { text: content }
    }

    fn body_app_error(&self, _message: &Message, why: String) -> Self::Body {
        PartBody::Line {
            text: format!("Unable to format app message: {why}"),
        }
    }

    fn body_retracted(&self, content: String) -> Self::Body {
        PartBody::Line { text: content }
    }

    fn body_escape(&self, text: &str) -> String {
        text.to_string()
    }

    fn config(&self) -> &Config {
        self.config
    }
}

// MARK: Impl
impl TXT<'_> {
    fn get_time(&self, message: &Message) -> String {
        let (mut date, read_receipt) = message_time(self.config, message);
        if read_receipt.is_empty() {
            date
        } else {
            date.push(' ');
            date.push_str(&read_receipt);
            date
        }
    }

    /// Append `source` to `out`, prefixing every non-blank line with `prefix`.
    /// Blank lines (`"\n"` only) pass through unprefixed so the output has
    /// no trailing-whitespace artifacts.
    fn push_indented(out: &mut String, source: &str, prefix: &str) {
        out.reserve(source.len() + prefix.len() * 4);
        for line in source.split_inclusive('\n') {
            if !line.trim_end_matches('\n').is_empty() {
                out.push_str(prefix);
            }
            out.push_str(line);
        }
    }
}

// MARK: Tests

#[cfg(test)]
mod tests {
    use std::env::current_dir;

    use crate::{
        Config, Options, TXT,
        app::{
            compatibility::attachment_manager::AttachmentManagerMode, contacts::Name,
            export_type::ExportType,
        },
        exporters::formatter::{AttachmentRender, MessageFormatter, RenderContext},
    };
    use imessage_database::{
        message_types::text_effects::TextEffect,
        tables::{
            messages::models::{AttachmentMeta, BubbleComponent, TextAttributes},
            table::ME,
        },
        util::{dirs::home, platform::Platform},
    };

    #[test]
    fn can_create() {
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();
        assert_eq!(exporter.state.files.len(), 0);
    }

    #[test]
    fn can_get_time_valid() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        // Create fake message
        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        // May 17, 2022  8:29:42 PM
        message.date_delivered = 674526582885055488;
        // May 17, 2022  9:30:31 PM
        message.date_read = 674530231992568192;

        assert_eq!(
            exporter.get_time(&message),
            "May 17, 2022  5:29:42 PM (Read by you after 1 hour, 49 seconds)"
        );
    }

    #[test]
    fn can_get_time_invalid() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        // Create fake message
        let mut message = Config::fake_message();
        // May 17, 2022  9:30:31 PM
        message.date = 674530231992568192;
        // May 17, 2022  9:30:31 PM
        message.date_delivered = 674530231992568192;
        // Wed May 18 2022 02:36:24 GMT+0000
        message.date_read = 674526582885055488;
        assert_eq!(exporter.get_time(&message), "May 17, 2022  6:30:31 PM");
    }

    #[test]
    fn can_format_txt_from_me_normal() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.text = Some("Hello world".to_string());
        message.is_from_me = true;
        message.chat_id = Some(0);
        message
            .generate_text_legacy(config.data_source.db())
            .unwrap();

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM\nMe\nHello world\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn expressive_renders_via_display_impl() {
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        message.date = 674526582885055488;
        message.text = Some("Hello world".to_string());
        message.is_from_me = true;
        message.chat_id = Some(0);
        message.expressive_send_style_id =
            Some("com.apple.messages.effect.CKConfettiEffect".to_string());
        message
            .generate_text_legacy(config.data_source.db())
            .unwrap();

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM\nMe\nHello world\nSent with Confetti\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn expressive_empty_unknown_renders_like_none() {
        // expressive_send_style_id = Some("") rows must render identically to
        // expressive_send_style_id = None: no stray blank line from the empty
        // Unknown variant passing through the template's `Some` guard.
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let build = |expressive: Option<String>| {
            let mut m = Config::fake_message();
            m.date = 674526582885055488;
            m.text = Some("Hello world".to_string());
            m.is_from_me = true;
            m.chat_id = Some(0);
            m.expressive_send_style_id = expressive;
            m.generate_text_legacy(config.data_source.db()).unwrap();
            m
        };

        let mut baseline = String::new();
        exporter
            .format_message_into(&build(None), RenderContext::TopLevel, &mut baseline)
            .unwrap();

        let mut actual = String::new();
        exporter
            .format_message_into(
                &build(Some(String::new())),
                RenderContext::TopLevel,
                &mut actual,
            )
            .unwrap();

        assert_eq!(actual, baseline);
    }

    #[test]
    fn can_format_txt_from_me_normal_deleted() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.text = Some("Hello world".to_string());
        message.date = 674526582885055488;
        message.is_from_me = true;
        message.deleted_from = Some(0);
        message
            .generate_text_legacy(config.data_source.db())
            .unwrap();

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM\nMe\nThis message was deleted from the conversation!\nHello world\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_from_me_normal_read() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        message.text = Some("Hello world".to_string());
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        // May 17, 2022  9:30:31 PM
        message.date_delivered = 674530231992568192;
        message.is_from_me = true;
        message
            .generate_text_legacy(config.data_source.db())
            .unwrap();

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected =
            "May 17, 2022  5:29:42 PM (Read by them after 1 hour, 49 seconds)\nMe\nHello world\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_from_them_normal() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config
            .participants
            .insert(999999, Name::fake_name("Sample Contact"));
        config.real_participants.insert(999999, 999999);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.text = Some("Hello world".to_string());
        message.handle_id = Some(999999);
        message
            .generate_text_legacy(config.data_source.db())
            .unwrap();

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM\nSample Contact\nHello world\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_from_them_normal_read() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config
            .participants
            .insert(999999, Name::fake_name("Sample Contact"));
        config.real_participants.insert(999999, 999999);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        message.handle_id = Some(999999);
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.text = Some("Hello world".to_string());
        // May 17, 2022  8:29:42 PM
        message.date_delivered = 674526582885055488;
        // May 17, 2022  9:30:31 PM
        message.date_read = 674530231992568192;
        message
            .generate_text_legacy(config.data_source.db())
            .unwrap();

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM (Read by you after 1 hour, 49 seconds)\nSample Contact\nHello world\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_from_them_custom_name_read() {
        // Create exporter
        let mut options = Options::fake_options(ExportType::Txt);
        options.custom_name = Some("Name".to_string());
        let mut config = Config::fake_app(options);
        config
            .participants
            .insert(999999, Name::fake_name("Sample Contact"));
        config.real_participants.insert(999999, 999999);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        message.handle_id = Some(999999);
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.text = Some("Hello world".to_string());
        // May 17, 2022  8:29:42 PM
        message.date_delivered = 674526582885055488;
        // May 17, 2022  9:30:31 PM
        message.date_read = 674530231992568192;
        message
            .generate_text_legacy(config.data_source.db())
            .unwrap();

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM (Read by Name after 1 hour, 49 seconds)\nSample Contact\nHello world\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_shareplay() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.real_participants.insert(0, 0);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.item_type = 6;

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM\nMe\nSharePlay Message\nEnded\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_announcement() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.group_title = Some("Hello world".to_string());
        message.is_from_me = true;
        message.item_type = 2;

        let mut actual = String::new();
        exporter.format_announcement(&message, &mut actual);
        let expected = "May 17, 2022  5:29:42 PM You named the conversation Hello world\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_announcement_custom_name() {
        // Create exporter
        let mut options = Options::fake_options(ExportType::Txt);
        options.custom_name = Some("Name".to_string());
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.real_participants.insert(0, 0);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.group_title = Some("Hello world".to_string());
        message.item_type = 2;

        let mut actual = String::new();
        exporter.format_announcement(&message, &mut actual);
        let expected = "May 17, 2022  5:29:42 PM Name named the conversation Hello world\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn format_message_into_appends_to_existing_buffer() {
        // Mirrors the production hot path in `run_export`, which reuses a
        // single `String` across messages via `clear()` + `format_message_into`.
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        message.date = 674526582885055488;
        message.text = Some("hello".to_string());
        message.is_from_me = true;
        message.chat_id = Some(0);
        message
            .generate_text_legacy(config.data_source.db())
            .unwrap();

        let mut standalone = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut standalone)
            .unwrap();

        let prefix = "PREV MSG\n\n";
        let mut buf = String::with_capacity(1024);
        buf.push_str(prefix);
        let cap_before = buf.capacity();

        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut buf)
            .unwrap();

        assert!(
            buf.starts_with(prefix),
            "format_message_into must not overwrite existing buffer content"
        );
        assert_eq!(&buf[prefix.len()..], standalone);
        assert!(buf.capacity() >= cap_before);
    }

    #[test]
    fn can_format_txt_announcement_unknown() {
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        message.date = 674526582885055488;

        let mut actual = String::new();
        exporter.format_announcement(&message, &mut actual);
        let expected = "Unable to format announcement!\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_group_removed() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.participants.insert(1, Name::fake_name("Other"));
        config.real_participants.insert(0, 0);
        config.real_participants.insert(1, 1);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.group_title = Some("Hello world".to_string());
        message.is_from_me = true;
        message.item_type = 1;
        message.group_action_type = 1;
        message.other_handle = Some(1);

        let mut actual = String::new();
        exporter.format_announcement(&message, &mut actual);
        let expected = "May 17, 2022  5:29:42 PM You removed Other from the conversation.\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_group_removed_other() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.participants.insert(1, Name::fake_name("Other"));
        config.participants.insert(2, Name::fake_name("Second"));
        config.real_participants.insert(0, 0);
        config.real_participants.insert(1, 1);
        config.real_participants.insert(2, 2);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.group_title = Some("Hello world".to_string());
        message.is_from_me = false;
        message.handle_id = Some(1);
        message.item_type = 1;
        message.group_action_type = 1;
        message.other_handle = Some(2);

        let mut actual = String::new();
        exporter.format_announcement(&message, &mut actual);
        let expected = "May 17, 2022  5:29:42 PM Other removed Second from the conversation.\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_group_changed_number() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.participants.insert(1, Name::fake_name("Other"));
        config.real_participants.insert(0, 0);
        config.real_participants.insert(1, 1);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.group_title = Some("Hello world".to_string());
        message.is_from_me = false;
        message.handle_id = Some(1);
        message.item_type = 1;
        message.group_action_type = 0;
        message.other_handle = Some(1);

        let mut actual = String::new();
        exporter.format_announcement(&message, &mut actual);
        let expected = "May 17, 2022  5:29:42 PM Other changed their phone number.\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_group_added() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.participants.insert(1, Name::fake_name("Other"));
        config.real_participants.insert(0, 0);
        config.real_participants.insert(1, 1);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.group_title = Some("Hello world".to_string());
        message.is_from_me = true;
        message.item_type = 1;
        message.group_action_type = 0;
        message.other_handle = Some(1);

        let mut actual = String::new();
        exporter.format_announcement(&message, &mut actual);
        let expected = "May 17, 2022  5:29:42 PM You added Other to the conversation.\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_group_left() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.real_participants.insert(0, 0);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.group_title = Some("Hello world".to_string());
        message.is_from_me = true;
        message.item_type = 3;

        let mut actual = String::new();
        exporter.format_announcement(&message, &mut actual);
        let expected = "May 17, 2022  5:29:42 PM You left the conversation.\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_group_icon_removed() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.real_participants.insert(0, 0);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.group_title = Some("Hello world".to_string());
        message.is_from_me = true;
        message.item_type = 3;
        message.group_action_type = 2;

        let mut actual = String::new();
        exporter.format_announcement(&message, &mut actual);
        let expected = "May 17, 2022  5:29:42 PM You removed the group photo.\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_group_icon_added() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.real_participants.insert(0, 0);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.group_title = Some("Hello world".to_string());
        message.is_from_me = true;
        message.item_type = 3;
        message.group_action_type = 1;

        let mut actual = String::new();
        exporter.format_announcement(&message, &mut actual);
        let expected = "May 17, 2022  5:29:42 PM You changed the group photo.\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_chat_background_removed() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.real_participants.insert(0, 0);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.group_title = Some("Hello world".to_string());
        message.is_from_me = true;
        message.item_type = 3;
        message.group_action_type = 6;

        let mut actual = String::new();
        exporter.format_announcement(&message, &mut actual);
        let expected = "May 17, 2022  5:29:42 PM You removed the chat background.\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_chat_background_added() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.real_participants.insert(0, 0);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.group_title = Some("Hello world".to_string());
        message.is_from_me = true;
        message.item_type = 3;
        message.group_action_type = 4;

        let mut actual = String::new();
        exporter.format_announcement(&message, &mut actual);
        let expected = "May 17, 2022  5:29:42 PM You changed the chat background.\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_audio_message_kept() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.real_participants.insert(0, 0);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.is_from_me = true;
        message.item_type = 5;

        let mut actual = String::new();
        exporter.format_announcement(&message, &mut actual);
        let expected = "May 17, 2022  5:29:42 PM You kept an audio message.\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_tapback_me() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.real_participants.insert(0, 0);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.associated_message_type = Some(2000);
        message.associated_message_guid = Some("fake_guid".to_string());

        let actual = exporter.format_tapback(&message).unwrap();
        let expected = "Loved by Me";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_tapback_them() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config
            .participants
            .insert(999999, Name::fake_name("Sample Contact"));
        config.real_participants.insert(999999, 999999);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.associated_message_type = Some(2000);
        message.associated_message_guid = Some("fake_guid".to_string());
        message.handle_id = Some(999999);

        let actual = exporter.format_tapback(&message).unwrap();
        let expected = "Loved by Sample Contact";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_tapback_custom_emoji() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config
            .participants
            .insert(999999, Name::fake_name("Sample Contact"));
        config.real_participants.insert(999999, 999999);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.associated_message_type = Some(2006);
        message.associated_message_guid = Some("fake_guid".to_string());
        message.handle_id = Some(999999);
        message.associated_message_emoji = Some("☕️".to_string());

        let actual = exporter.format_tapback(&message).unwrap();
        let expected = "☕️ by Sample Contact";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_tapback_custom_sticker() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config
            .participants
            .insert(999999, Name::fake_name("Sample Contact"));
        config.real_participants.insert(999999, 999999);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.associated_message_type = Some(2007);
        message.associated_message_guid = Some("fake_guid".to_string());
        message.handle_id = Some(999999);
        message.num_attachments = 1;

        let actual = exporter.format_tapback(&message).unwrap();
        let expected = "Sticker from Sample Contact not found!";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_tapback_custom_sticker_exists() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config
            .participants
            .insert(999999, Name::fake_name("Sample Contact"));
        config.real_participants.insert(999999, 999999);

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.associated_message_type = Some(2007);
        message.associated_message_guid = Some("fake_guid".to_string());
        message.handle_id = Some(999999);
        message.num_attachments = 1;
        message.rowid = 452567;

        let actual = exporter.format_tapback(&message).unwrap();
        let expected = format!(
            "Sticker from Sample Contact: {}/Library/Messages/StickerCache/8e682c381ab52ec2-289D9E83-33EE-4153-AF13-43DB31792C6F/289D9E83-33EE-4153-AF13-43DB31792C6F.heic (App: Free People) from Sample Contact",
            home()
        );

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_tapback_custom_sticker_removed() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config
            .participants
            .insert(999999, Name::fake_name("Sample Contact"));
        config.real_participants.insert(999999, 999999);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.associated_message_type = Some(3007);
        message.associated_message_guid = Some("fake_guid".to_string());
        message.handle_id = Some(999999);
        message.num_attachments = 1;
        message.rowid = 452567;

        let actual = exporter.format_tapback(&message).unwrap();
        let expected = "";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_started_sharing_location_me() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        message.is_from_me = false;
        message.other_handle = Some(2);
        message.share_status = false;
        message.share_direction = Some(false);
        message.item_type = 4;

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "Dec 31, 2000  4:00:00 PM\nMe\nStarted sharing location!\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_stopped_sharing_location_me() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        message.is_from_me = false;
        message.other_handle = Some(2);
        message.share_status = true;
        message.share_direction = Some(false);
        message.item_type = 4;

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "Dec 31, 2000  4:00:00 PM\nMe\nStopped sharing location!\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_started_sharing_location_them() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        message.handle_id = None;
        message.is_from_me = false;
        message.other_handle = Some(0);
        message.share_status = false;
        message.share_direction = Some(false);
        message.item_type = 4;

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "Dec 31, 2000  4:00:00 PM\nUnknown\nStarted sharing location!\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_stopped_sharing_location_them() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        message.handle_id = None;
        message.is_from_me = false;
        message.other_handle = Some(0);
        message.share_status = true;
        message.share_direction = Some(false);
        message.item_type = 4;

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "Dec 31, 2000  4:00:00 PM\nUnknown\nStopped sharing location!\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_attachment_macos() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let message = Config::fake_message();

        let mut attachment = Config::fake_attachment();

        let actual =
            exporter.format_attachment(&mut attachment, &message, &AttachmentMeta::default());

        assert_eq!(
            actual,
            AttachmentRender::Embedded("a/b/c/d.jpg".to_string())
        );
    }

    #[test]
    fn can_format_txt_attachment_macos_invalid_disabled() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let message = Config::fake_message();

        let mut attachment = Config::fake_attachment();
        attachment.filename = None;
        attachment.transfer_name = None;

        let actual =
            exporter.format_attachment(&mut attachment, &message, &AttachmentMeta::default());

        assert_eq!(actual, AttachmentRender::MissingFilename);
    }

    #[test]
    fn can_format_txt_attachment_macos_invalid_clone() {
        // Create exporter
        let mut options = Options::fake_options(ExportType::Txt);
        options.attachment_manager.mode = AttachmentManagerMode::Clone;

        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let message = Config::fake_message();

        let mut attachment = Config::fake_attachment();
        attachment.filename = None;
        attachment.transfer_name = None;

        let actual =
            exporter.format_attachment(&mut attachment, &message, &AttachmentMeta::default());

        assert_eq!(actual, AttachmentRender::MissingFilename);
    }

    #[test]
    fn can_format_txt_attachment_ios() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.options.platform = Platform::iOS;
        let exporter = TXT::new(&config).unwrap();

        let message = Config::fake_message();

        let mut attachment = Config::fake_attachment();

        let AttachmentRender::Embedded(actual) =
            exporter.format_attachment(&mut attachment, &message, &AttachmentMeta::default())
        else {
            panic!("expected AttachmentRender::Embedded");
        };

        assert!(actual.ends_with("33/33c81da8ae3194fc5a0ea993ef6ffe0b048baedb"));
    }

    #[test]
    fn can_format_txt_attachment_ios_invalid_disabled() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.options.platform = Platform::iOS;

        let exporter = TXT::new(&config).unwrap();

        let message = Config::fake_message();

        let mut attachment = Config::fake_attachment();
        attachment.filename = None;
        attachment.transfer_name = None;

        let actual =
            exporter.format_attachment(&mut attachment, &message, &AttachmentMeta::default());

        assert_eq!(actual, AttachmentRender::MissingFilename);
    }

    #[test]
    fn can_format_txt_attachment_ios_invalid_clone() {
        // Create exporter
        let mut options = Options::fake_options(ExportType::Txt);
        options.attachment_manager.mode = AttachmentManagerMode::Clone;

        let mut config = Config::fake_app(options);
        config.options.platform = Platform::iOS;

        let exporter = TXT::new(&config).unwrap();

        let message = Config::fake_message();

        let mut attachment = Config::fake_attachment();
        attachment.filename = None;
        attachment.transfer_name = None;

        let actual =
            exporter.format_attachment(&mut attachment, &message, &AttachmentMeta::default());

        assert_eq!(actual, AttachmentRender::MissingFilename);
    }

    #[test]
    fn can_format_txt_attachment_sticker() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);

        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.real_participants.insert(0, 0);

        let exporter = TXT::new(&config).unwrap();

        let message = Config::fake_message();

        let mut attachment = Config::fake_attachment();
        attachment.rowid = 3;
        attachment.is_sticker = true;
        let sticker_path = current_dir()
            .unwrap()
            .parent()
            .unwrap()
            .join("imessage-database/test_data/stickers/outline.heic");
        attachment.filename = Some(sticker_path.to_string_lossy().to_string());
        attachment.copied_path = Some(
            config
                .options
                .export_path
                .join("imessage-database/test_data/stickers/outline.heic"),
        );

        let actual = exporter.format_sticker(&mut attachment, &message);

        assert_eq!(
            actual,
            "Outline Sticker from Me: imessage-database/test_data/stickers/outline.heic"
        );
    }

    #[test]
    fn can_format_txt_attachment_sticker_genmoji() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);

        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.real_participants.insert(0, 0);

        let exporter = TXT::new(&config).unwrap();

        let message = Config::fake_message();

        let mut attachment = Config::fake_attachment();
        attachment.rowid = 2;
        attachment.is_sticker = true;
        attachment.emoji_description = Some("Example description".to_string());
        let sticker_path = current_dir()
            .unwrap()
            .parent()
            .unwrap()
            .join("imessage-database/test_data/stickers/outline.heic");
        attachment.filename = Some(sticker_path.to_string_lossy().to_string());
        attachment.copied_path = Some(
            config
                .options
                .export_path
                .join("imessage-database/test_data/stickers/outline.heic"),
        );

        let actual = exporter.format_sticker(&mut attachment, &message);

        assert_eq!(
            actual,
            "Sticker from Me: imessage-database/test_data/stickers/outline.heic (Genmoji prompt: Example description)"
        );
    }

    #[test]
    fn can_format_txt_attachment_sticker_app() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);

        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.real_participants.insert(0, 0);

        let exporter = TXT::new(&config).unwrap();

        let message = Config::fake_message();

        let mut attachment = Config::fake_attachment();
        attachment.rowid = 1;
        attachment.is_sticker = true;
        let sticker_path = current_dir()
            .unwrap()
            .parent()
            .unwrap()
            .join("imessage-database/test_data/stickers/outline.heic");
        attachment.filename = Some(sticker_path.to_string_lossy().to_string());
        attachment.copied_path = Some(
            config
                .options
                .export_path
                .join("imessage-database/test_data/stickers/outline.heic"),
        );

        let actual = exporter.format_sticker(&mut attachment, &message);

        assert_eq!(
            actual,
            "Sticker from Me: imessage-database/test_data/stickers/outline.heic (App: Free People)"
        );
    }

    #[test]
    fn dispatch_part_body_advances_index_between_stickers() {
        // Regression: a message with two stickers must render each sticker
        // at its own slot. Prior to the fix, the sticker arm of
        // `dispatch_part_body` returned without advancing `attachment_index`,
        // so both parts re-resolved `attachments[0]` and the first sticker
        // rendered at every slot.
        use crate::exporters::{shared::part::dispatch_part_body, txt::view_model::PartBody};

        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.real_participants.insert(0, 0);
        let exporter = TXT::new(&config).unwrap();
        let message = Config::fake_message();

        let sticker_path = current_dir()
            .unwrap()
            .parent()
            .unwrap()
            .join("imessage-database/test_data/stickers/outline.heic");

        // rowid 3 → "Outline Sticker from Me: …"
        let mut sticker_a = Config::fake_attachment();
        sticker_a.rowid = 3;
        sticker_a.is_sticker = true;
        sticker_a.filename = Some(sticker_path.to_string_lossy().to_string());
        sticker_a.copied_path = Some(
            config
                .options
                .export_path
                .join("imessage-database/test_data/stickers/outline.heic"),
        );

        // rowid 1 → "Sticker from Me: … (App: Free People)"
        let mut sticker_b = Config::fake_attachment();
        sticker_b.rowid = 1;
        sticker_b.is_sticker = true;
        sticker_b.filename = Some(sticker_path.to_string_lossy().to_string());
        sticker_b.copied_path = Some(
            config
                .options
                .export_path
                .join("imessage-database/test_data/stickers/outline.heic"),
        );

        let mut attachments = vec![sticker_a, sticker_b];
        let part = BubbleComponent::Attachment(AttachmentMeta::default());
        let mut attachment_index: usize = 0;

        let first = dispatch_part_body(
            &exporter,
            &message,
            0,
            &part,
            &mut attachments,
            &mut attachment_index,
        );
        assert_eq!(attachment_index, 1);
        let PartBody::Line { text: first_text } = first else {
            panic!("expected PartBody::Line for sticker arm");
        };
        let expected_first =
            "Outline Sticker from Me: imessage-database/test_data/stickers/outline.heic";
        assert_eq!(first_text, expected_first);

        let second = dispatch_part_body(
            &exporter,
            &message,
            1,
            &part,
            &mut attachments,
            &mut attachment_index,
        );
        assert_eq!(attachment_index, 2);
        let PartBody::Line { text: second_text } = second else {
            panic!("expected PartBody::Line for sticker arm");
        };
        let expected_second =
            "Sticker from Me: imessage-database/test_data/stickers/outline.heic (App: Free People)";
        assert_eq!(second_text, expected_second);
    }

    #[test]
    fn dispatch_part_body_advances_index_after_sticker() {
        // Regression: when a sticker precedes a non-sticker attachment, the
        // sticker arm must advance `attachment_index` so the next part
        // resolves to the non-sticker attachment. Prior to the fix the
        // second part would re-resolve the sticker.
        use crate::exporters::{shared::part::dispatch_part_body, txt::view_model::PartBody};

        let options = Options::fake_options(ExportType::Txt);
        let mut config = Config::fake_app(options);
        config.participants.insert(0, Name::fake_name(ME));
        config.real_participants.insert(0, 0);
        let exporter = TXT::new(&config).unwrap();
        let message = Config::fake_message();

        let sticker_path = current_dir()
            .unwrap()
            .parent()
            .unwrap()
            .join("imessage-database/test_data/stickers/outline.heic");

        let mut sticker = Config::fake_attachment();
        sticker.rowid = 3;
        sticker.is_sticker = true;
        sticker.filename = Some(sticker_path.to_string_lossy().to_string());
        sticker.copied_path = Some(
            config
                .options
                .export_path
                .join("imessage-database/test_data/stickers/outline.heic"),
        );

        // Default `fake_attachment` renders as `AttachmentRender::Embedded("a/b/c/d.jpg")`.
        let image = Config::fake_attachment();

        let mut attachments = vec![sticker, image];
        let part = BubbleComponent::Attachment(AttachmentMeta::default());
        let mut attachment_index: usize = 0;

        let first = dispatch_part_body(
            &exporter,
            &message,
            0,
            &part,
            &mut attachments,
            &mut attachment_index,
        );
        assert_eq!(attachment_index, 1);
        let PartBody::Line { text: first_text } = first else {
            panic!("expected PartBody::Line for sticker arm");
        };
        let expected_first =
            "Outline Sticker from Me: imessage-database/test_data/stickers/outline.heic";
        assert_eq!(first_text, expected_first);

        let second = dispatch_part_body(
            &exporter,
            &message,
            1,
            &part,
            &mut attachments,
            &mut attachment_index,
        );
        assert_eq!(attachment_index, 2);
        let PartBody::Line { text: second_text } = second else {
            panic!("expected PartBody::Line for attachment arm");
        };
        let expected_second = "a/b/c/d.jpg";
        assert_eq!(second_text, expected_second);
    }

    #[test]
    fn can_format_txt_attachment_audio_transcript() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let message = Config::fake_message();

        let mut attachment = Config::fake_attachment();
        attachment.uti = Some("com.apple.coreaudio-format".to_string());
        attachment.transfer_name = Some("Audio Message.caf".to_string());
        attachment.filename = Some("Audio Message.caf".to_string());
        attachment.mime_type = None;

        let meta = AttachmentMeta {
            transcription: Some("Test".to_string()),
            ..Default::default()
        };

        let actual = exporter.format_attachment(&mut attachment, &message, &meta);

        assert_eq!(
            actual,
            AttachmentRender::Embedded("Audio Message.caf\nTranscription: Test".to_string())
        );
    }

    #[test]
    fn can_format_txt_single_url_no_bundle_id() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();

        // Use test message payload from test database
        // May 17, 2022  8:29:42 PM
        message.guid = "FAKEGUID-D0C8-4212-AA87-DD8AE4FD1203".to_string();
        message.rowid = 123445;

        message.date = 674526582885055488;
        // Set the message components to a single url
        message.text = Some("https://example.com".to_string());
        message.components = vec![BubbleComponent::Text(vec![
                TextAttributes::new(
                    0,
                    84,
                    vec![
                        TextEffect::Link("https://www.ghacks.net/2020/01/23/lastpass-no-longer-listed-on-the-chrome-web-store/".to_string()),
                    ]
                ),
            ]),];

        let body = message.parse_body(config.data_source.db()).unwrap();
        message.apply_body(body);

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();

        assert_eq!(
            actual,
            "May 17, 2022  5:29:42 PM\nUnknown\nhttps://www.ghacks.net/2020/01/23/lastpass-no-longer-listed-on-the-chrome-web-store/\nLastPass no longer listed on the Chrome Web Store - gHacks Tech News\nLastPass customers and new users searching for password managers on Google's Chrome Web Store may have noticed that the LastPass extension for Google Chrome is currently no longer listed on the store.\n\n"
        );
    }

    #[test]
    fn can_format_txt_translated_message() {
        // Create exporter
        let mut options = Options::fake_options(ExportType::Txt);
        options.attachment_manager.mode = AttachmentManagerMode::Clone;

        let mut config = Config::fake_app(options);
        config
            .translated_messages
            .insert("56FE94B9-2345-4A3C-A57F-949BDDDDF9FF".to_string());

        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        message.guid = "56FE94B9-2345-4A3C-A57F-949BDDDDF9FF".to_string();
        message.rowid = 548216;
        message
            .generate_text_legacy(config.data_source.db())
            .unwrap();

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "Dec 31, 2000  4:00:00 PM\nUnknown\nOh, il a traduit ce que j'ai envoyé !\nTranslated from:\nOh it translated what I sent!\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn balloon_indent_matches_header_in_reply_context() {
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut msg = Config::fake_message();
        msg.date = 674526582885055488;
        msg.is_from_me = true;
        msg.chat_id = Some(0);
        msg.balloon_bundle_id = Some("com.apple.messages.URLBalloonProvider".to_string());
        msg.text = Some("https://example.com".to_string());
        msg.rowid = i32::MAX;
        msg.components = vec![BubbleComponent::App];

        let mut out = String::new();
        exporter
            .format_message_into(&msg, RenderContext::Reply, &mut out)
            .unwrap();

        // Every non-blank line should start with exactly four spaces.
        for line in out.lines().filter(|l| !l.is_empty()) {
            let leading = line.chars().take_while(|c| *c == ' ').count();
            assert_eq!(
                leading, 4,
                "expected 4-space indent on every non-blank line, got {leading} on: {line:?}\nfull output:\n{out}"
            );
        }
    }

    #[test]
    fn message_part_emits_one_output_line_per_source_line() {
        // Locks in the `text.lines()` iteration in message_part.txt: a
        // PartBody::Line carrying multi-line text must emit one output line
        // per source line. Indentation is applied later by `push_indented`.
        use crate::exporters::txt::view_model::{MessagePartVM, PartBody};
        use askama::Template;

        let vm = MessagePartVM {
            body: PartBody::Line {
                text: "line1\nline2\nline3".to_string(),
            },
            expressive: None,
            tapbacks: None,
            replies: None,
        };

        let rendered = vm.render().unwrap();
        assert_eq!(rendered, "line1\nline2\nline3\n");
    }

    #[test]
    fn tapbacks_render_with_inner_inset_only() {
        // The 4-space inset on each tapback line is a visual cue for what's
        // being reacted to. The outer reply indent is applied by
        // `push_indented`, not by the template.
        use crate::exporters::txt::view_model::TapbacksVM;
        use askama::Template;

        let vm = TapbacksVM {
            tapbacks: vec!["Loved by Me".to_string(), "Liked by Sample".to_string()],
        };

        let rendered = vm.render().unwrap();
        assert_eq!(
            rendered,
            "Tapbacks:\n    Loved by Me\n    Liked by Sample\n",
        );
    }

    #[test]
    fn push_indented_stacks_on_tapback_inner_inset() {
        // When the reply indent is stacked on top of `tapbacks.txt`'s inner
        // 4-space inset, the resulting tapback lines sit at 8 spaces.
        use crate::exporters::txt::view_model::TapbacksVM;
        use askama::Template;

        let vm = TapbacksVM {
            tapbacks: vec!["Loved by Me".to_string(), "Liked by Sample".to_string()],
        };
        let rendered = vm.render().unwrap();
        let mut indented = String::new();
        super::TXT::push_indented(&mut indented, &rendered, "    ");
        assert_eq!(
            indented,
            "    Tapbacks:\n        Loved by Me\n        Liked by Sample\n",
        );
    }

    #[test]
    fn replies_vm_separates_siblings_with_blank_line() {
        use crate::exporters::{shared::reply::ReplyEntry, txt::view_model::RepliesVM};
        use askama::Template;

        let vm = RepliesVM {
            replies: vec![
                ReplyEntry {
                    guid: "one".to_string(),
                    body: "reply one\n".to_string(),
                },
                ReplyEntry {
                    guid: "two".to_string(),
                    body: "reply two\n".to_string(),
                },
            ],
        };
        let rendered = vm.render().unwrap();
        assert_eq!(rendered, "reply one\n\nreply two\n\n");
    }

    #[test]
    fn push_indented_skips_blank_lines() {
        let mut out = String::new();
        super::TXT::push_indented(&mut out, "a\n\nb\n", "    ");
        assert_eq!(out, "    a\n\n    b\n");
    }

    #[test]
    fn edited_history_renders_unindented() {
        // format_edited returns rows separated by `\n` with no indent baked
        // in. `push_indented` applies the reply prefix uniformly across all
        // lines downstream.
        use crate::exporters::{
            shared::edited::Edit,
            txt::view_model::{EditedRow, EditedVM},
        };
        use askama::Template;

        let vm = EditedVM {
            kind: Edit::Edited {
                rows: vec![
                    EditedRow {
                        timestamp_prefix: "5:29:42 PM ".to_string(),
                        text: "first",
                    },
                    EditedRow {
                        timestamp_prefix: "Edited 30 seconds later: ".to_string(),
                        text: "second",
                    },
                ],
            },
        };

        let rendered = vm.render().unwrap();
        assert_eq!(
            rendered,
            "5:29:42 PM first\nEdited 30 seconds later: second\n",
        );

        // Wrapping in PartBody::Line, rendering, and applying push_indented
        // produces a uniformly prefixed block.
        use crate::exporters::txt::view_model::{MessagePartVM, PartBody};
        let part = MessagePartVM {
            body: PartBody::Line {
                text: rendered.trim_end_matches('\n').to_string(),
            },
            expressive: None,
            tapbacks: None,
            replies: None,
        };
        let unindented = part.render().unwrap();
        let mut full = String::new();
        super::TXT::push_indented(&mut full, &unindented, "    ");
        assert_eq!(
            full,
            "    5:29:42 PM first\n    Edited 30 seconds later: second\n",
        );
    }

    #[test]
    fn can_format_txt_url_message_without_payload_uses_text_fallback() {
        // Defensive path in dispatch_app_balloon: when a URL-balloon message
        // has no payload row but does carry `text`, the normal `format_url`
        // pipeline still produces the raw URL via its msg.text fallback.
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        message.date = 674526582885055488;
        message.rowid = i32::MAX;
        message.is_from_me = true;
        message.chat_id = Some(0);
        message.balloon_bundle_id = Some("com.apple.messages.URLBalloonProvider".to_string());
        message.text = Some("https://example.com".to_string());
        message.components = vec![BubbleComponent::App];

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM\nMe\nhttps://example.com\n\n";

        assert_eq!(actual, expected);
    }
}

#[cfg(test)]
mod balloon_format_tests {
    use std::{collections::HashMap, env::current_dir, fs::File, io::Read};

    use crate::{
        Config, Options, TXT, app::export_type::ExportType::Txt,
        exporters::formatter::BalloonFormatter,
    };
    use imessage_database::message_types::{
        app::AppMessage,
        app_store::AppStoreMessage,
        collaboration::CollaborationMessage,
        digital_touch::DigitalTouch,
        handwriting::HandwrittenMessage,
        music::MusicMessage,
        placemark::{Placemark, PlacemarkMessage},
        polls::{Poll, PollOption, PollOptionID, PollVote},
        url::URLMessage,
    };

    #[test]
    fn can_format_txt_url() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = URLMessage {
            title: Some("title"),
            summary: Some("summary"),
            url: Some("url"),
            original_url: Some("original_url"),
            item_type: Some("item_type"),
            images: vec!["images"],
            icons: vec!["icons"],
            site_name: Some("site_name"),
            placeholder: false,
        };

        let actual = exporter.format_url(&Config::fake_message(), &balloon);
        let expected = "url\ntitle\nsummary";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_music() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = MusicMessage {
            url: Some("url"),
            preview: Some("preview"),
            artist: Some("artist"),
            album: Some("album"),
            track_name: Some("track_name"),
            lyrics: None,
        };

        let actual = exporter.format_music(&balloon);
        let expected = "track_name\nalbum\nartist\nurl";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_music_lyrics() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = MusicMessage {
            url: Some("url"),
            preview: None,
            artist: Some("artist"),
            album: Some("album"),
            track_name: Some("track_name"),
            lyrics: Some(vec!["a", "b"]),
        };

        let actual = exporter.format_music(&balloon);
        let expected = "Lyrics:\na\nb\n\n\ntrack_name\nalbum\nartist\nurl";

        assert_eq!(actual, expected);
    }

    #[test]
    fn music_balloon_skips_empty_string_fields() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = MusicMessage {
            url: Some("url"),
            preview: None,
            artist: Some("artist"),
            album: Some(""),
            track_name: Some("track_name"),
            lyrics: None,
        };

        let actual = exporter.format_music(&balloon);
        let expected = "track_name\nartist\nurl";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_collaboration() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = CollaborationMessage {
            original_url: Some("original_url"),
            url: Some("url"),
            title: Some("title"),
            creation_date: Some(0.),
            bundle_id: Some("bundle_id"),
            app_name: Some("app_name"),
        };

        let actual = exporter.format_collaboration(&balloon);
        let expected = "app_name message:\ntitle\nurl";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_apple_pay() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: Some("image"),
            url: Some("url"),
            title: Some("title"),
            subtitle: Some("subtitle"),
            caption: Some("caption"),
            subcaption: Some("subcaption"),
            trailing_caption: Some("trailing_caption"),
            trailing_subcaption: Some("trailing_subcaption"),
            app_name: Some("app_name"),
            ldtext: Some("ldtext"),
        };

        let actual = exporter.format_apple_pay(&balloon);
        let expected = "caption transaction: ldtext";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_fitness() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: Some("image"),
            url: Some("url"),
            title: Some("title"),
            subtitle: Some("subtitle"),
            caption: Some("caption"),
            subcaption: Some("subcaption"),
            trailing_caption: Some("trailing_caption"),
            trailing_subcaption: Some("trailing_subcaption"),
            app_name: Some("app_name"),
            ldtext: Some("ldtext"),
        };

        let actual = exporter.format_fitness(&balloon);
        let expected = "app_name message: ldtext";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_slideshow() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: Some("image"),
            url: Some("url"),
            title: Some("title"),
            subtitle: Some("subtitle"),
            caption: Some("caption"),
            subcaption: Some("subcaption"),
            trailing_caption: Some("trailing_caption"),
            trailing_subcaption: Some("trailing_subcaption"),
            app_name: Some("app_name"),
            ldtext: Some("ldtext"),
        };

        let actual = exporter.format_slideshow(&balloon);
        let expected = "Photo album: ldtext url";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_slideshow_url_only_no_leading_space() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: None,
            url: Some("url"),
            title: None,
            subtitle: None,
            caption: None,
            subcaption: None,
            trailing_caption: None,
            trailing_subcaption: None,
            app_name: None,
            ldtext: None,
        };

        assert_eq!(exporter.format_slideshow(&balloon), "url");
    }

    #[test]
    fn can_format_txt_slideshow_ldtext_only() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: None,
            url: None,
            title: None,
            subtitle: None,
            caption: None,
            subcaption: None,
            trailing_caption: None,
            trailing_subcaption: None,
            app_name: None,
            ldtext: Some("ldtext"),
        };

        assert_eq!(exporter.format_slideshow(&balloon), "Photo album: ldtext");
    }

    #[test]
    fn can_format_txt_slideshow_empty_when_both_missing() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: None,
            url: None,
            title: None,
            subtitle: None,
            caption: None,
            subcaption: None,
            trailing_caption: None,
            trailing_subcaption: None,
            app_name: None,
            ldtext: None,
        };

        assert_eq!(exporter.format_slideshow(&balloon), "");
    }

    #[test]
    fn can_format_txt_find_my() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: Some("image"),
            url: Some("url"),
            title: Some("title"),
            subtitle: Some("subtitle"),
            caption: Some("caption"),
            subcaption: Some("subcaption"),
            trailing_caption: Some("trailing_caption"),
            trailing_subcaption: Some("trailing_subcaption"),
            app_name: Some("app_name"),
            ldtext: Some("ldtext"),
        };

        let actual = exporter.format_find_my(&balloon);
        let expected = "app_name: ldtext";

        assert_eq!(actual, expected);
    }

    #[test]
    fn find_my_balloon_drops_trailing_colon_when_ldtext_missing() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: None,
            url: None,
            title: None,
            subtitle: None,
            caption: None,
            subcaption: None,
            trailing_caption: None,
            trailing_subcaption: None,
            app_name: Some("Find My"),
            ldtext: None,
        };

        let actual = exporter.format_find_my(&balloon);
        assert_eq!(actual, "Find My");
    }

    #[test]
    fn can_format_txt_check_in_timer() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: None,
            url: Some("?messageType=1&interfaceVersion=1&sendDate=1697316869.688709"),
            title: None,
            subtitle: None,
            caption: Some("Check In: Timer Started"),
            subcaption: None,
            trailing_caption: None,
            trailing_subcaption: None,
            app_name: Some("Check In"),
            ldtext: Some("Check In: Timer Started"),
        };

        let actual = exporter.format_check_in(&balloon);
        let expected = "Check\u{a0}In: Timer Started\nChecked in at Oct 14, 2023  1:54:29 PM";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_check_in_timer_late() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: None,
            url: Some("?messageType=1&interfaceVersion=1&sendDate=1697316869.688709"),
            title: None,
            subtitle: None,
            caption: Some("Check In: Has not checked in when expected, location shared"),
            subcaption: None,
            trailing_caption: None,
            trailing_subcaption: None,
            app_name: Some("Check In"),
            ldtext: Some("Check In: Has not checked in when expected, location shared"),
        };

        let actual = exporter.format_check_in(&balloon);
        let expected = "Check\u{a0}In: Has not checked in when expected, location shared\nChecked in at Oct 14, 2023  1:54:29 PM";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_accepted_check_in() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: None,
            url: Some("?messageType=1&interfaceVersion=1&sendDate=1697316869.688709"),
            title: None,
            subtitle: None,
            caption: Some("Check In: Fake Location"),
            subcaption: None,
            trailing_caption: None,
            trailing_subcaption: None,
            app_name: Some("Check In"),
            ldtext: Some("Check In: Fake Location"),
        };

        let actual = exporter.format_check_in(&balloon);
        let expected = "Check\u{a0}In: Fake Location\nChecked in at Oct 14, 2023  1:54:29 PM";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_app_store() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppStoreMessage {
            url: Some("url"),
            app_name: Some("app_name"),
            original_url: Some("original_url"),
            description: Some("description"),
            platform: Some("platform"),
            genre: Some("genre"),
        };

        let actual = exporter.format_app_store(&balloon);
        let expected = "app_name\ndescription\nplatform\ngenre\nurl";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_placemark() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = PlacemarkMessage {
            url: Some("url"),
            original_url: Some("original_url"),
            place_name: Some("Name"),
            placemark: Placemark {
                name: Some("name"),
                address: Some("address"),
                state: Some("state"),
                city: Some("city"),
                iso_country_code: Some("iso_country_code"),
                postal_code: Some("postal_code"),
                country: Some("country"),
                street: Some("street"),
                sub_administrative_area: Some("sub_administrative_area"),
                sub_locality: Some("sub_locality"),
            },
        };

        let actual = exporter.format_placemark(&balloon);
        let expected = "Name\nurl\nname\naddress\nstate\ncity\niso_country_code\npostal_code\ncountry\nstreet\nsub_administrative_area\nsub_locality";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_poll() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut poll_options: HashMap<PollOptionID, PollOption> = HashMap::new();

        let id1: PollOptionID = "1".to_string();
        let id2: PollOptionID = "2".to_string();
        let id3: PollOptionID = "3".to_string();

        poll_options.insert(
            id1.clone(),
            PollOption {
                text: "Rust".to_string(),
                creator: "alice".to_string(),
                votes: vec![PollVote {
                    voter: "carol".to_string(),
                    option_id: id1.clone(),
                }],
            },
        );

        poll_options.insert(
            id2.clone(),
            PollOption {
                text: "Go".to_string(),
                creator: "bob".to_string(),
                votes: vec![
                    PollVote {
                        voter: "alice".to_string(),
                        option_id: id2.clone(),
                    },
                    PollVote {
                        voter: "bob".to_string(),
                        option_id: id2.clone(),
                    },
                ],
            },
        );

        poll_options.insert(
            id3.clone(),
            PollOption {
                text: "Python".to_string(),
                creator: "carol".to_string(),
                votes: vec![PollVote {
                    voter: "dave".to_string(),
                    option_id: id3.clone(),
                }],
            },
        );

        let poll = Poll {
            options: poll_options,
            order: vec![id1, id2, id3],
        };

        let actual = exporter.format_poll(&poll);
        let expected =
            "- Rust (1)\n  - carol\n- Go (2)\n  - alice\n  - bob\n- Python (1)\n  - dave";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_generic_app() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: Some("image"),
            url: Some("url"),
            title: Some("title"),
            subtitle: Some("subtitle"),
            caption: Some("caption"),
            subcaption: Some("subcaption"),
            trailing_caption: Some("trailing_caption"),
            trailing_subcaption: Some("trailing_subcaption"),
            app_name: Some("app_name"),
            ldtext: Some("ldtext"),
        };

        let actual = exporter.format_generic_app(
            &balloon,
            "bundle_id",
            &mut vec![],
            &Config::fake_message(),
        );
        let expected = "app_name message:\ntitle\nsubtitle\ncaption\nsubcaption\ntrailing_caption\ntrailing_subcaption";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_digital_touch_kiss() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let msg = Config::fake_message();
        let actual = exporter.format_digital_touch(&msg, &DigitalTouch::Kiss);
        let expected = "Digital Touch Message: Kiss";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_handwriting_disabled_mode() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let payload_path = current_dir()
            .unwrap()
            .parent()
            .unwrap()
            .join("imessage-database/test_data/handwritten_message/handwriting.bin");
        let mut payload = vec![];
        File::open(payload_path)
            .unwrap()
            .read_to_end(&mut payload)
            .unwrap();
        let balloon = HandwrittenMessage::from_payload(&payload).unwrap();

        let mut expected = String::new();
        let expected_path = current_dir()
            .unwrap()
            .parent()
            .unwrap()
            .join("imessage-database/test_data/handwritten_message/handwriting.ascii");
        File::open(expected_path)
            .unwrap()
            .read_to_string(&mut expected)
            .unwrap();

        let msg = Config::fake_message();
        let actual = exporter.format_handwriting(&msg, &balloon);

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_check_in_estimated_end_time() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: None,
            url: Some("?messageType=1&interfaceVersion=1&estimatedEndTime=1697316869.688709"),
            title: None,
            subtitle: None,
            caption: Some("Check In: Timer Started"),
            subcaption: None,
            trailing_caption: None,
            trailing_subcaption: None,
            app_name: Some("Check In"),
            ldtext: Some("Check In: Timer Started"),
        };

        let actual = exporter.format_check_in(&balloon);
        let expected = "Check In: Timer Started\nExpected at Oct 14, 2023  1:54:29 PM";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_check_in_trigger_time() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: None,
            url: Some("?messageType=1&interfaceVersion=1&triggerTime=1697316869.688709"),
            title: None,
            subtitle: None,
            caption: Some("Check In: Timer Started"),
            subcaption: None,
            trailing_caption: None,
            trailing_subcaption: None,
            app_name: Some("Check In"),
            ldtext: Some("Check In: Timer Started"),
        };

        let actual = exporter.format_check_in(&balloon);
        let expected = "Check In: Timer Started\nWas expected at Oct 14, 2023  1:54:29 PM";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_check_in_no_recognized_metadata() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = AppMessage {
            image: None,
            url: Some("?messageType=1"),
            title: None,
            subtitle: None,
            caption: Some("Check In"),
            subcaption: None,
            trailing_caption: None,
            trailing_subcaption: None,
            app_name: Some("Check In"),
            ldtext: Some("Check In"),
        };

        // No timestamp metadata → footer is None → only the caption renders.
        let actual = exporter.format_check_in(&balloon);
        let expected = "Check In";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_poll_empty_options() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let poll = Poll {
            options: HashMap::new(),
            order: vec![],
        };

        // Empty poll: the for-loop body doesn't execute, so the template
        // emits nothing at all.
        let actual = exporter.format_poll(&poll);
        let expected = "";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_poll_option_with_zero_votes() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut poll_options: HashMap<PollOptionID, PollOption> = HashMap::new();
        let id: PollOptionID = "1".to_string();
        poll_options.insert(
            id.clone(),
            PollOption {
                text: "Rust".to_string(),
                creator: "alice".to_string(),
                votes: vec![],
            },
        );

        let poll = Poll {
            options: poll_options,
            order: vec![id],
        };

        let actual = exporter.format_poll(&poll);
        let expected = "- Rust (0)";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_url_no_url_falls_back_to_msg_text() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = URLMessage {
            title: None,
            summary: None,
            url: None,
            original_url: None,
            item_type: None,
            images: vec![],
            icons: vec![],
            site_name: None,
            placeholder: false,
        };

        let mut msg = Config::fake_message();
        msg.text = Some("https://example.com/from-text".to_string());

        let actual = exporter.format_url(&msg, &balloon);
        let expected = "https://example.com/from-text";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_collaboration_no_url_with_original_url() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        // url=None + original_url=Some: TXT's `url` field is balloon.get_url()
        // which falls back to original_url, so the URL line still renders.
        let balloon = CollaborationMessage {
            original_url: Some("https://example.com/original"),
            url: None,
            title: Some("Doc title"),
            creation_date: None,
            bundle_id: Some("bundle"),
            app_name: Some("App"),
        };

        let actual = exporter.format_collaboration(&balloon);
        let expected = "App message:\nDoc title\nhttps://example.com/original";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_collaboration_drops_label_when_no_app_name_or_bundle_id() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = CollaborationMessage {
            original_url: None,
            url: Some("https://example.com/doc"),
            title: Some("Doc title"),
            creation_date: None,
            bundle_id: None,
            app_name: None,
        };

        let actual = exporter.format_collaboration(&balloon);
        let expected = "Doc title\nhttps://example.com/doc";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_collaboration_drops_label_when_app_name_is_empty_string() {
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let balloon = CollaborationMessage {
            original_url: None,
            url: Some("https://example.com/doc"),
            title: Some("Doc title"),
            creation_date: None,
            bundle_id: None,
            app_name: Some(""),
        };

        let actual = exporter.format_collaboration(&balloon);
        let expected = "Doc title\nhttps://example.com/doc";

        assert_eq!(actual, expected);
    }
}

#[cfg(test)]
mod text_effect_tests {
    use imessage_database::{
        message_types::text_effects::{Animation, Style, TextEffect, Unit},
        tables::messages::models::{BubbleComponent, TextAttributes},
    };

    use crate::{
        Config, Options, TXT,
        app::export_type::ExportType,
        exporters::formatter::{MessageFormatter, RenderContext},
    };

    #[test]
    fn can_format_txt_text_styles_mixed_end_to_end() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.text = Some("Underline normal jitter normal".to_string());
        message.is_from_me = true;
        message.chat_id = Some(0);

        message.components = vec![BubbleComponent::Text(vec![
            TextAttributes::new(0, 9, vec![TextEffect::Styles(vec![Style::Underline])]),
            TextAttributes::new(9, 17, vec![TextEffect::Default]),
            TextAttributes::new(17, 23, vec![TextEffect::Animated(Animation::Jitter)]),
            TextAttributes::new(23, 30, vec![TextEffect::Default]),
        ])];

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM\nMe\nUnderline normal jitter normal\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_text_styled_plain_link() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.text =
            Some("https://github.com/ReagentX/imessage-exporter/discussions/553".to_string());
        message.is_from_me = true;
        message.chat_id = Some(0);

        message.components = vec![BubbleComponent::Text(vec![TextAttributes::new(
            0,
            61,
            vec![
                TextEffect::Animated(Animation::Big),
                TextEffect::Link(
                    "https://github.com/ReagentX/imessage-exporter/discussions/553".to_string(),
                ),
            ],
        )])];

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM\nMe\nhttps://github.com/ReagentX/imessage-exporter/discussions/553\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_text_styled_emoji_bold_underline() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.text = Some("🅱️Bold_Underline".to_string());
        message.is_from_me = true;
        message.chat_id = Some(0);

        message.components = vec![BubbleComponent::Text(vec![
            TextAttributes::new(0, 7, vec![TextEffect::Default]),
            TextAttributes::new(7, 11, vec![TextEffect::Styles(vec![Style::Bold])]),
            TextAttributes::new(11, 12, vec![TextEffect::Default]),
            TextAttributes::new(12, 21, vec![TextEffect::Styles(vec![Style::Underline])]),
        ])];

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM\nMe\n🅱️Bold_Underline\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_text_styled_overlapping_ranges() {
        // Create exporter
        let options = Options::fake_options(ExportType::Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.text = Some("8:00 pm".to_string());
        message.is_from_me = true;
        message.chat_id = Some(0);

        message.components = vec![BubbleComponent::Text(vec![
            TextAttributes::new(
                0,
                1,
                vec![
                    TextEffect::Conversion(Unit::Timezone),
                    TextEffect::Styles(vec![Style::Bold]),
                ],
            ),
            TextAttributes::new(1, 2, vec![TextEffect::Conversion(Unit::Timezone)]),
            TextAttributes::new(
                2,
                4,
                vec![
                    TextEffect::Conversion(Unit::Timezone),
                    TextEffect::Styles(vec![Style::Underline]),
                ],
            ),
            TextAttributes::new(4, 5, vec![TextEffect::Conversion(Unit::Timezone)]),
            TextAttributes::new(
                5,
                7,
                vec![
                    TextEffect::Conversion(Unit::Timezone),
                    TextEffect::Styles(vec![Style::Italic]),
                ],
            ),
        ])];

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM\nMe\n8:00 pm\n\n";

        assert_eq!(actual, expected);
    }
}

#[cfg(test)]
mod edited_tests {
    use imessage_database::{
        message_types::{
            edited::{EditStatus, EditedMessage, EditedMessagePart},
            text_effects::TextEffect,
        },
        tables::messages::models::{AttachmentMeta, BubbleComponent, TextAttributes},
    };

    use crate::{
        Config, Options, TXT,
        app::{contacts::Name, export_type::ExportType::Txt},
        exporters::formatter::{MessageFormatter, RenderContext},
    };

    #[test]
    fn can_format_txt_conversion_final_unsent() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.date_edited = 674530231992568192;
        message.text = Some(
            "From arbitrary byte stream:\r\u{FFFC}To native Rust data structures:\r".to_string(),
        );
        message.is_from_me = true;
        message.chat_id = Some(0);
        message.edited_parts = Some(EditedMessage {
            parts: vec![
                EditedMessagePart {
                    status: EditStatus::Original,
                    edit_history: vec![],
                },
                EditedMessagePart {
                    status: EditStatus::Original,
                    edit_history: vec![],
                },
                EditedMessagePart {
                    status: EditStatus::Original,
                    edit_history: vec![],
                },
                EditedMessagePart {
                    status: EditStatus::Unsent,
                    edit_history: vec![],
                },
            ],
        });

        message.components = vec![
            BubbleComponent::Text(vec![TextAttributes::new(0, 28, vec![TextEffect::Default])]),
            BubbleComponent::Attachment(AttachmentMeta {
                guid: Some("D0551D89-4E11-43D0-9A0E-06F19704E97B".to_string()),
                transcription: None,
                height: None,
                width: None,
                name: None,
            }),
            BubbleComponent::Text(vec![TextAttributes::new(31, 63, vec![TextEffect::Default])]),
            BubbleComponent::Retracted,
        ];

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM\nMe\nFrom arbitrary byte stream:\r\nAttachment missing!\nTo native Rust data structures:\r\nYou unsent this message part 1 hour, 49 seconds after sending!\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_unsent_from_them_resolves_contact_name() {
        // When someone else unsends a message part, the resolved contact
        // name must be rendered, matching the behavior of TXT's tapback,
        // announcement, and message-header rendering.
        let options = Options::fake_options(Txt);
        let mut config = Config::fake_app(options);
        config
            .participants
            .insert(999999, Name::fake_name("Sample Contact"));
        config.real_participants.insert(999999, 999999);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.date_edited = 674530231992568192;
        message.handle_id = Some(999999);
        message.text = Some("hello".to_string());
        message.edited_parts = Some(EditedMessage {
            parts: vec![EditedMessagePart {
                status: EditStatus::Unsent,
                edit_history: vec![],
            }],
        });
        message.components = vec![BubbleComponent::Retracted];

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM\nSample Contact\nSample Contact unsent this message part 1 hour, 49 seconds after sending!\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_conversion_no_edits() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.text = Some(
            "From arbitrary byte stream:\r\u{FFFC}To native Rust data structures:\r".to_string(),
        );
        message.is_from_me = true;
        message.chat_id = Some(0);

        message.components = vec![
            BubbleComponent::Text(vec![TextAttributes::new(0, 28, vec![TextEffect::Default])]),
            BubbleComponent::Attachment(AttachmentMeta {
                guid: Some("D0551D89-4E11-43D0-9A0E-06F19704E97B".to_string()),
                transcription: None,
                height: None,
                width: None,
                name: None,
            }),
            BubbleComponent::Text(vec![TextAttributes::new(31, 63, vec![TextEffect::Default])]),
            BubbleComponent::Retracted,
        ];

        let mut actual = String::new();
        exporter
            .format_message_into(&message, RenderContext::TopLevel, &mut actual)
            .unwrap();
        let expected = "May 17, 2022  5:29:42 PM\nMe\nFrom arbitrary byte stream:\r\nAttachment missing!\nTo native Rust data structures:\r\n\n";

        assert_eq!(actual, expected);
    }

    #[test]
    fn can_format_txt_conversion_fully_unsent() {
        // Create exporter
        let options = Options::fake_options(Txt);
        let config = Config::fake_app(options);
        let exporter = TXT::new(&config).unwrap();

        let mut message = Config::fake_message();
        // May 17, 2022  8:29:42 PM
        message.date = 674526582885055488;
        message.date_edited = 674530231992568192;
        message.text = None;
        message.is_from_me = true;
        message.chat_id = Some(0);
        message.edited_parts = Some(EditedMessage {
            parts: vec![EditedMessagePart {
                status: EditStatus::Unsent,
                edit_history: vec![],
            }],
        });

        message.components = vec![BubbleComponent::Retracted];

        let mut actual = String::new();
        exporter.format_announcement(&message, &mut actual);
        let expected = "May 17, 2022  5:29:42 PM You unsent a message!\n\n";

        assert_eq!(actual, expected);
    }
}
