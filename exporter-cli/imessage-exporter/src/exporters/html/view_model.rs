use askama::Template;

use imessage_database::{
    message_types::{expressives::Expressive, sticker::StickerDecoration, variants::Announcement},
    tables::messages::models::{GroupAction, Service},
};

use crate::exporters::{
    html::safe::Html,
    shared::{
        announcement::AnnouncementBody, edited::Edit, reply::ReplyEntry, tapback::TapbackKind,
        text::OptionalText,
    },
};

#[derive(Template)]
#[template(path = "balloons/digital_touch.html")]
pub(super) struct DigitalTouchVM {
    pub debug: String,
}

#[derive(Template)]
#[template(path = "balloons/find_my.html")]
pub(super) struct FindMyVM<'a> {
    pub app_name: OptionalText<'a>,
    pub ldtext: OptionalText<'a>,
}

#[derive(Template)]
#[template(path = "balloons/apple_pay.html")]
pub(super) struct ApplePayVM<'a> {
    pub app_name: OptionalText<'a>,
    pub ldtext: OptionalText<'a>,
}

#[derive(Template)]
#[template(path = "balloons/app_card.html")]
pub(super) struct AppCardVM<'a> {
    pub url: OptionalText<'a>,
    pub image: OptionalText<'a>,
    /// Pre-rendered HTML for an attachment, used when `image` is `None` and an
    /// attachment is present.
    pub attachment_html: Option<Html>,
    pub name: &'a str,
    pub title: OptionalText<'a>,
    pub subtitle: OptionalText<'a>,
    pub ldtext: OptionalText<'a>,
    pub caption: OptionalText<'a>,
    pub subcaption: OptionalText<'a>,
    pub trailing_caption: OptionalText<'a>,
    pub trailing_subcaption: OptionalText<'a>,
}

impl AppCardVM<'_> {
    /// Whether any of the footer-section fields are present
    fn has_footer(&self) -> bool {
        self.caption.get().is_some()
            || self.subcaption.get().is_some()
            || self.trailing_caption.get().is_some()
            || self.trailing_subcaption.get().is_some()
    }
}

#[derive(Template)]
#[template(path = "balloons/url.html")]
pub(super) struct UrlVM<'a> {
    /// Resolved outer-link target: `balloon.get_url()` falling back to `msg.text`.
    pub wrapper_url: OptionalText<'a>,
    /// Resolved label: `site_name` falling back to URL then `msg.text`.
    pub name: OptionalText<'a>,
    pub images: &'a [&'a str],
    pub lazy: bool,
    pub title: OptionalText<'a>,
    pub summary: OptionalText<'a>,
}

impl UrlVM<'_> {
    fn has_footer(&self) -> bool {
        self.title.get().is_some() || self.summary.get().is_some()
    }
}

#[derive(Template)]
#[template(path = "balloons/music.html")]
pub(super) struct MusicVM<'a> {
    pub track_name: OptionalText<'a>,
    pub preview: OptionalText<'a>,
    pub lyrics: Option<&'a [&'a str]>,
    pub url: OptionalText<'a>,
    pub artist: OptionalText<'a>,
    pub album: OptionalText<'a>,
}

#[derive(Template)]
#[template(path = "balloons/collaboration.html")]
pub(super) struct CollaborationVM<'a> {
    pub name: OptionalText<'a>,
    /// `<a>` wrapper opens only when `balloon.url` is set (not the `original_url` fallback).
    pub wrapper_url: OptionalText<'a>,
    pub title: OptionalText<'a>,
    /// Subcaption uses the resolved URL (`url` or `original_url`).
    pub footer_url: OptionalText<'a>,
}

impl CollaborationVM<'_> {
    fn has_footer(&self) -> bool {
        self.title.get().is_some() || self.footer_url.get().is_some()
    }
}

#[derive(Template)]
#[template(path = "balloons/app_store.html")]
pub(super) struct AppStoreVM<'a> {
    pub app_name: OptionalText<'a>,
    pub url: OptionalText<'a>,
    pub description: OptionalText<'a>,
    pub platform: OptionalText<'a>,
    pub genre: OptionalText<'a>,
}

impl AppStoreVM<'_> {
    fn has_footer(&self) -> bool {
        self.description.get().is_some()
            || self.platform.get().is_some()
            || self.genre.get().is_some()
    }
}

#[derive(Template)]
#[template(path = "balloons/placemark.html")]
pub(super) struct PlacemarkVM<'a> {
    pub place_name: OptionalText<'a>,
    pub url: OptionalText<'a>,
    pub name: OptionalText<'a>,
    pub address: OptionalText<'a>,
    pub state: OptionalText<'a>,
    pub city: OptionalText<'a>,
    pub iso_country_code: OptionalText<'a>,
    pub postal_code: OptionalText<'a>,
    pub country: OptionalText<'a>,
    pub street: OptionalText<'a>,
    pub sub_administrative_area: OptionalText<'a>,
    pub sub_locality: OptionalText<'a>,
}

impl PlacemarkVM<'_> {
    fn has_footer(&self) -> bool {
        self.address.get().is_some()
            || self.state.get().is_some()
            || self.city.get().is_some()
            || self.iso_country_code.get().is_some()
            || self.postal_code.get().is_some()
            || self.country.get().is_some()
            || self.street.get().is_some()
            || self.sub_administrative_area.get().is_some()
            || self.sub_locality.get().is_some()
    }
}

#[derive(Template)]
#[template(path = "balloons/check_in.html")]
pub(super) struct CheckInVM<'a> {
    pub name: &'a str,
    pub ldtext: OptionalText<'a>,
    /// Pre-formatted footer text (e.g. "Checked in at Oct 14, 2023…"). `None`
    /// when the balloon's metadata yields no recognized timestamp.
    pub footer: Option<String>,
}

#[derive(Template)]
#[template(path = "balloons/poll.html")]
pub(super) struct PollVM<'a> {
    pub options: Vec<PollOptionVM<'a>>,
}

pub(super) struct PollOptionVM<'a> {
    pub text: &'a str,
    pub vote_count: usize,
    /// Pre-rendered `<div class="vote-bar" style="…">` element. The full
    /// element is rendered in Rust because `{{ }}` inside a `style=`
    /// attribute is rejected by the CSS linter.
    pub bar_html: Html,
    pub voters: Vec<&'a str>,
}

#[derive(Template)]
#[template(path = "attachments/attachment.html")]
pub(super) struct AttachmentVM<'a> {
    pub lazy: bool,
    /// Path the template emits in `src=` / `href=` attributes. Shared by every
    /// variant: the only piece each variant needs in addition is the bits
    /// specific to its presentation (media type, filename, etc.).
    pub embed_path: String,
    pub variant: AttachmentVariant<'a>,
}

pub(super) enum AttachmentVariant<'a> {
    Image,
    Video {
        media_type: &'a str,
    },
    Audio {
        media_type: &'a str,
    },
    AudioTranscription {
        media_type: &'a str,
        transcription: &'a str,
    },
    /// `text/*` and `application/*` types share this layout.
    Download {
        filename: &'a str,
        file_size: String,
    },
    UnknownFolder {
        filename: &'a str,
        file_size: String,
    },
    UnknownOther {
        file_size: String,
    },
    Other {
        media_type: &'a str,
    },
}

#[derive(Template)]
#[template(path = "attachments/sticker_suffix.html")]
pub(super) struct StickerSuffixVM {
    pub kind: StickerDecoration,
}

#[derive(Template)]
#[template(path = "tapback.html")]
pub(super) struct TapbackVM<'a> {
    pub kind: TapbackKind<'a, Html>,
}

#[derive(Template)]
#[template(path = "edited.html")]
pub(super) struct EditedVM<'a> {
    pub kind: Edit<'a, EditedRow>,
}

pub(super) struct EditedRow {
    /// `true` for the final row in the history; the template emits `<tfoot>`
    /// instead of `<tbody>` so it can carry distinct CSS.
    pub is_last: bool,
    pub timestamp: String,
    /// Pre-rendered HTML for the edited text (text-effect output or escaped plain text).
    pub text_html: Html,
}

#[derive(Template)]
#[template(path = "announcement_inner.html")]
pub(super) struct AnnouncementInnerVM<'a> {
    pub kind: AnnouncementBody<'a>,
}

#[derive(Template)]
#[template(path = "message.html")]
pub(super) struct MessageVM<'a> {
    pub guid: &'a str,
    /// Render `id="r-{guid}"` on the outer wrapper when this is a top-level reply.
    pub anchor_id: bool,
    /// True for `<div class="sent {service}">`, false for `<div class="received">`.
    pub is_from_me: bool,
    pub service: Service<'a>,
    pub date: String,
    pub read_after: String,
    pub reply_anchor: Option<ReplyAnchorKind>,
    pub sender: &'a str,
    pub is_deleted: bool,
    pub subject: Option<&'a str>,
    /// SharePlay marker
    pub shareplay: Option<Html<&'static str>>,
    /// Shared-location marker
    pub shared_location: Option<Html<&'static str>>,
    /// Rendered directly into the outer buffer via [`MessagePartVM`]'s
    /// `Display` impl.
    pub parts: Vec<MessagePartVM<'a>>,
    pub trailing_reply_context: bool,
}

pub(super) enum ReplyAnchorKind {
    /// Reply rendered inline within a thread; link points to the top-level message.
    InThread,
    /// Top-level message that has descendants; link jumps to its in-thread copy.
    TopLevel,
}

#[derive(Template)]
#[template(path = "message_part.html")]
pub(super) struct MessagePartVM<'a> {
    pub body: PartBody,
    pub expressive: Option<Expressive<'a>>,
    pub tapbacks: Option<TapbacksVM>,
    pub replies: Option<RepliesVM>,
}

#[derive(Template)]
#[template(path = "tapbacks.html")]
pub(super) struct TapbacksVM {
    /// Each entry is the inner content of one tapback (e.g. the render of
    /// `TapbackVM`). The `<div class="tapback">` wrapper is added by the
    /// template, not by the builder.
    pub tapbacks: Vec<Html>,
}

#[derive(Template)]
#[template(path = "replies.html")]
pub(super) struct RepliesVM {
    /// Each entry carries the recursive `format_message_into` render for
    /// one reply, paired with its `guid` so the template can emit the
    /// `<div class="reply" id="…">…</div>` wrapper.
    pub replies: Vec<ReplyEntry<Html>>,
}

/// Each [`Html`] field holds pre-rendered HTML emitted with `|safe`. The
/// per-variant wrapping happens in `message_part.html`.
pub(crate) enum PartBody {
    /// Empty body (no text, edited content missing, etc.)
    Empty,
    TextBubble {
        html: Html,
    },
    TextTranslated {
        translated: Html,
        original: Html,
    },
    TextEdited {
        html: Html,
    },
    Attachment {
        html: Html,
    },
    AttachmentError {
        error: Html,
    },
    AttachmentMissing,
    Sticker {
        html: Html,
    },
    App {
        html: Html,
    },
    AppError {
        html: Html,
    },
    Retracted {
        html: Html,
    },
}
