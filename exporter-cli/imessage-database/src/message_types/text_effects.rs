/*!
 Effects that can alter the appearance of message text.
*/

/// Text effect container
///
/// Message text may contain any number of traditional styles or one animation.
///
/// Read more about text styles [here](https://www.apple.com/newsroom/2024/06/ios-18-makes-iphone-more-personal-capable-and-intelligent-than-ever/).
#[derive(Debug, PartialEq, Eq)]
pub enum TextEffect<'a> {
    /// Default, unstyled text
    Default,
    /// A [mentioned](https://support.apple.com/guide/messages/mention-a-person-icht306ee34b/mac) contact in the conversation
    /// 
    /// The embedded data contains information about the mentioned contact.
    Mention(&'a str),
    /// A clickable link, i.e. `https://`, `tel:`, `mailto:`, and others
    /// 
    /// The embedded data contains the url.
    Link(&'a str),
    /// A one-time code, i.e. from a 2FA message
    OTP,
    /// Traditional formatting styles
    /// 
    /// The embedded data contains the formatting styles applied to the range.
    Styles(Vec<Style>),
    /// Animation applied to the text
    /// 
    /// The embedded data contains the animation applied to the range.
    Animated(Animation),
    /// Conversions that can be applied to text
    /// 
    /// The embedded data contains the unit that the range represents.
    Conversion(Unit),
}

/// Unit conversion text effect container
///
/// Read more about unit conversions [here](https://www.macrumors.com/how-to/convert-currencies-temperatures-more-ios-16/).
#[derive(Debug, PartialEq, Eq)]
pub enum Unit {
    Currency,
    Distance,
    Temperature,
    Timezone,
    Volume,
    Weight,
}

/// Traditional text effect container
///
/// Read more about text styles [here](https://www.apple.com/newsroom/2024/06/ios-18-makes-iphone-more-personal-capable-and-intelligent-than-ever/).
#[derive(Debug, PartialEq, Eq)]
pub enum Style {
    /// **Bold** styled text
    Bold,
    /// *Italic* styled text
    Italic,
    /// ~~Strikethrough~~ styled text
    Strikethrough,
    /// <u>Underline</u> styled text
    Underline,
}

/// Animated text effect container
///
/// Read more about text styles [here](https://www.apple.com/newsroom/2024/06/ios-18-makes-iphone-more-personal-capable-and-intelligent-than-ever/).
#[derive(Debug, PartialEq, Eq)]
pub enum Animation {
    Big,
    Small,
    Shake,
    Nod,
    Explode,
    Ripple,
    Bloom,
    Jitter,
}
