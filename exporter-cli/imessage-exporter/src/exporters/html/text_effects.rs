use std::borrow::Cow;

use imessage_database::message_types::text_effects::{Animation, Style, TextEffect, Unit};

use crate::{
    app::sanitizers::sanitize_html,
    exporters::{formatter::TextEffectFormatter, html::HTML},
};

// MARK: Text Effects
impl<'a> TextEffectFormatter<'a> for HTML<'a> {
    fn format_effect(&'a self, text: &'a str, effect: &'a TextEffect) -> Cow<'a, str> {
        match effect {
            TextEffect::Default => Cow::Borrowed(text),
            TextEffect::Mention(mentioned) => Cow::Owned(self.format_mention(text, mentioned)),
            TextEffect::Link(url) => Cow::Owned(self.format_link(text, url)),
            TextEffect::OTP => Cow::Owned(self.format_otp(text)),
            TextEffect::Styles(styles) => Cow::Owned(self.format_styles(text, styles)),
            TextEffect::Animated(animation) => Cow::Owned(self.format_animated(text, animation)),
            TextEffect::Conversion(unit) => Cow::Owned(self.format_conversion(text, unit)),
        }
    }

    fn format_mention(&self, text: &str, mentioned: &str) -> String {
        format!(
            "<span title=\"{}\"><b>{text}</b></span>",
            sanitize_html(mentioned)
        )
    }

    fn format_link(&self, text: &str, url: &str) -> String {
        format!("<a href=\"{}\">{text}</a>", sanitize_html(url))
    }

    fn format_otp(&self, text: &str) -> String {
        format!("<u>{text}</u>")
    }

    fn format_conversion(&self, text: &str, _: &Unit) -> String {
        format!("<u>{text}</u>")
    }

    fn format_styles(&self, text: &str, styles: &[Style]) -> String {
        // Estimate: 7 bytes covers the longest open+close tag pair (`<b></b>`).
        let mut out = String::with_capacity(text.len() + styles.len() * 7);
        // styles[0] is the outermost wrap, so opens go in reverse order and
        // closes go in forward order.
        for style in styles.iter().rev() {
            out.push_str(open_tag(style));
        }
        out.push_str(text);
        for style in styles {
            out.push_str(close_tag(style));
        }
        out
    }

    fn format_animated(&self, text: &str, animation: &Animation) -> String {
        // animation:? is a Rust enum variant name (safe), text is pre-sanitized
        format!("<span class=\"animation{animation:?}\">{text}</span>")
    }
}

fn open_tag(style: &Style) -> &'static str {
    match style {
        Style::Bold => "<b>",
        Style::Italic => "<i>",
        Style::Strikethrough => "<s>",
        Style::Underline => "<u>",
    }
}

fn close_tag(style: &Style) -> &'static str {
    match style {
        Style::Bold => "</b>",
        Style::Italic => "</i>",
        Style::Strikethrough => "</s>",
        Style::Underline => "</u>",
    }
}
