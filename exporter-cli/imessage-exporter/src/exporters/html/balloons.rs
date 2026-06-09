use imessage_database::{
    message_types::{
        app::AppMessage, app_store::AppStoreMessage, collaboration::CollaborationMessage,
        digital_touch::DigitalTouch, handwriting::HandwrittenMessage, music::MusicMessage,
        placemark::PlacemarkMessage, polls::Poll, url::URLMessage,
    },
    tables::{
        attachment::Attachment,
        messages::{Message, models::AttachmentMeta},
    },
};

use crate::exporters::{
    formatter::{AttachmentRender, BalloonFormatter, MessageFormatter},
    html::{
        HTML,
        safe::Html,
        view_model::{
            AppCardVM, AppStoreVM, ApplePayVM, CheckInVM, CollaborationVM, DigitalTouchVM,
            FindMyVM, MusicVM, PlacemarkVM, PollOptionVM, PollVM, UrlVM,
        },
    },
    shared::{balloon::resolve_check_in_footer, render::render_template},
};

// MARK: Balloons
impl BalloonFormatter for HTML<'_> {
    fn format_url(&self, msg: &Message, balloon: &URLMessage) -> String {
        let balloon_url = balloon.get_url();
        let msg_text = msg.text.as_deref();
        render_template(&UrlVM {
            wrapper_url: balloon_url.or(msg_text).into(),
            name: balloon.site_name.or(balloon_url).or(msg_text).into(),
            images: &balloon.images,
            lazy: !self.config.options.no_lazy,
            title: balloon.title.into(),
            summary: balloon.summary.into(),
        })
    }

    fn format_music(&self, balloon: &MusicMessage) -> String {
        render_template(&MusicVM {
            track_name: balloon.track_name.into(),
            preview: balloon.preview.into(),
            lyrics: balloon.lyrics.as_deref(),
            url: balloon.url.into(),
            artist: balloon.artist.into(),
            album: balloon.album.into(),
        })
    }

    fn format_collaboration(&self, balloon: &CollaborationMessage) -> String {
        render_template(&CollaborationVM {
            name: balloon.app_name.or(balloon.bundle_id).into(),
            wrapper_url: balloon.url.into(),
            title: balloon.title.into(),
            footer_url: balloon.get_url().into(),
        })
    }

    fn format_app_store(&self, balloon: &AppStoreMessage) -> String {
        render_template(&AppStoreVM {
            app_name: balloon.app_name.into(),
            url: balloon.url.into(),
            description: balloon.description.into(),
            platform: balloon.platform.into(),
            genre: balloon.genre.into(),
        })
    }

    fn format_placemark(&self, balloon: &PlacemarkMessage) -> String {
        render_template(&PlacemarkVM {
            place_name: balloon.place_name.into(),
            url: balloon.get_url().into(),
            name: balloon.placemark.name.into(),
            address: balloon.placemark.address.into(),
            state: balloon.placemark.state.into(),
            city: balloon.placemark.city.into(),
            iso_country_code: balloon.placemark.iso_country_code.into(),
            postal_code: balloon.placemark.postal_code.into(),
            country: balloon.placemark.country.into(),
            street: balloon.placemark.street.into(),
            sub_administrative_area: balloon.placemark.sub_administrative_area.into(),
            sub_locality: balloon.placemark.sub_locality.into(),
        })
    }

    fn format_handwriting(&self, _: &Message, balloon: &HandwrittenMessage) -> String {
        balloon.render_svg()
    }

    fn format_digital_touch(&self, _: &Message, balloon: &DigitalTouch) -> String {
        render_template(&DigitalTouchVM {
            debug: format!("{balloon:?}"),
        })
    }

    fn format_apple_pay(&self, balloon: &AppMessage) -> String {
        render_template(&ApplePayVM {
            app_name: balloon.app_name.into(),
            ldtext: balloon.ldtext.into(),
        })
    }

    fn format_fitness(&self, balloon: &AppMessage) -> String {
        self.balloon_to_html(balloon, "Fitness", None)
    }

    fn format_slideshow(&self, balloon: &AppMessage) -> String {
        self.balloon_to_html(balloon, "Slideshow", None)
    }

    fn format_find_my(&self, balloon: &AppMessage) -> String {
        render_template(&FindMyVM {
            app_name: balloon.app_name.into(),
            ldtext: balloon.ldtext.into(),
        })
    }

    fn format_check_in(&self, balloon: &AppMessage) -> String {
        render_template(&CheckInVM {
            name: balloon.app_name.unwrap_or("Check In"),
            ldtext: balloon.ldtext.into(),
            footer: resolve_check_in_footer(balloon),
        })
    }

    fn format_poll(&self, poll: &Poll) -> String {
        let max_votes = poll
            .order
            .iter()
            .filter_map(|option_id| poll.options.get(option_id))
            .map(|option| option.votes.len())
            .max()
            .unwrap_or(0);

        let options = poll
            .order
            .iter()
            .filter_map(|id| poll.options.get(id))
            .map(|opt| {
                let vote_count = opt.votes.len();
                let bar_width = (vote_count * 100).checked_div(max_votes).unwrap_or(0);
                PollOptionVM {
                    text: &opt.text,
                    vote_count,
                    bar_html: Html::trust(format!(
                        "<div class=\"vote-bar\" style=\"width: {bar_width}%;\"></div>"
                    )),
                    voters: opt.votes.iter().map(|v| v.voter.as_str()).collect(),
                }
            })
            .collect();

        render_template(&PollVM { options })
    }

    fn format_generic_app(
        &self,
        balloon: &AppMessage,
        bundle_id: &str,
        attachments: &mut Vec<Attachment>,
        msg: &Message,
    ) -> String {
        let attachment_html = if balloon.image.is_none() {
            attachments.get_mut(0).map(|attachment| {
                let rendered =
                    match self.format_attachment(attachment, msg, &AttachmentMeta::default()) {
                        AttachmentRender::Embedded(html) => html,
                        AttachmentRender::MissingFilename | AttachmentRender::NamedFile(_) => {
                            String::new()
                        }
                    };
                Html::trust(rendered)
            })
        } else {
            None
        };
        self.balloon_to_html(balloon, bundle_id, attachment_html)
    }
}

impl HTML<'_> {
    fn balloon_to_html(
        &self,
        balloon: &AppMessage,
        bundle_id: &str,
        attachment_html: Option<Html>,
    ) -> String {
        render_template(&AppCardVM {
            url: balloon.url.into(),
            image: balloon.image.into(),
            attachment_html,
            name: balloon.app_name.unwrap_or(bundle_id),
            title: balloon.title.into(),
            subtitle: balloon.subtitle.into(),
            ldtext: balloon.ldtext.into(),
            caption: balloon.caption.into(),
            subcaption: balloon.subcaption.into(),
            trailing_caption: balloon.trailing_caption.into(),
            trailing_subcaption: balloon.trailing_subcaption.into(),
        })
    }
}
