use std::fmt;

/// A string or string slice that holds HTML known to be safe for unescaped
/// emission. Used as the type of every view-model field that templates emit
/// with `|safe`, so the type system can attest that the contents have already
/// passed through escaping (`sanitize_html`, an Askama render with
/// [`ChatEscaper`](crate::app::escaping::ChatEscaper), or hand-built markup
/// whose only interpolations are non-string).
pub(crate) struct Html<S = String>(S);

impl<S> Html<S> {
    /// Wrap a value the caller asserts is HTML-safe. Use this only when the
    /// input is pre-escaped (e.g. wraps [`sanitize_html`](crate::app::sanitizers::sanitize_html)
    /// output, an Askama render, pure markup with non-string interpolations,
    /// or a `'static` literal).
    pub(crate) const fn trust(s: S) -> Self {
        Self(s)
    }
}

impl<S: AsRef<str>> fmt::Display for Html<S> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0.as_ref())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_emits_inner_verbatim() {
        let h: Html<&'static str> = Html::trust("<b>hi</b>");
        assert_eq!(h.to_string(), "<b>hi</b>");
    }

    #[test]
    fn trust_owned_string() {
        let h: Html = Html::trust(String::from("<i>x</i>"));
        assert_eq!(h.to_string(), "<i>x</i>");
    }
}
