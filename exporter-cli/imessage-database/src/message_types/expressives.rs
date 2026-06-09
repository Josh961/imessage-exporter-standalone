/*!
 [Expressives](https://support.apple.com/en-us/HT206894) are effects that you can select by tapping and holding the send button.
*/

use std::fmt;

/// Bubble effects are effects that alter the display of the chat bubble.
///
/// Read more [here](https://www.imore.com/how-to-use-bubble-and-screen-effects-imessage-iphone-ipad).
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum BubbleEffect {
    /// Creates a slam effect that makes the bubble appear to slam down onto the screen.
    Slam,
    /// Creates a loud effect that makes the bubble appear to enlarge temporarily.
    Loud,
    /// Creates a gentle effect that makes the bubble appear to shrink temporarily.
    Gentle,
    /// Creates an invisible ink effect that hides the message until the recipient swipes over it.
    InvisibleInk,
}

/// Screen effects are effects that alter the entire background of the message view.
///
/// Read more [here](https://www.imore.com/how-to-use-bubble-and-screen-effects-imessage-iphone-ipad).
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum ScreenEffect {
    /// Creates a confetti effect that sprinkles confetti across the screen.
    Confetti,
    /// Creates an echo effect that sends multiple copies of the message across the screen.
    Echo,
    /// Creates a fireworks effect that displays colorful explosions on the screen.
    Fireworks,
    /// Creates a balloons effect that sends balloons floating up from the bottom of the screen.
    Balloons,
    /// Creates a heart effect that displays a large heart on the screen.
    Heart,
    /// Creates a laser light show effect across the screen.
    Lasers,
    /// Creates a shooting star effect that moves across the screen.
    ShootingStar,
    /// Creates a sparkle effect that twinkles across the screen.
    Sparkles,
    /// Creates a spotlight effect that highlights the message.
    Spotlight,
}

/// Expressive effect container.
///
/// Read more about expressive messages [here](https://www.imore.com/how-to-use-bubble-and-screen-effects-imessage-iphone-ipad).
///
/// Bubble:
/// - `com.apple.MobileSMS.expressivesend.gentle`
/// - `com.apple.MobileSMS.expressivesend.impact`
/// - `com.apple.MobileSMS.expressivesend.invisibleink`
/// - `com.apple.MobileSMS.expressivesend.loud`
///
/// Screen:
/// - `com.apple.messages.effect.CKConfettiEffect`
/// - `com.apple.messages.effect.CKEchoEffect`
/// - `com.apple.messages.effect.CKFireworksEffect`
/// - `com.apple.messages.effect.CKHappyBirthdayEffect`
/// - `com.apple.messages.effect.CKHeartEffect`
/// - `com.apple.messages.effect.CKLasersEffect`
/// - `com.apple.messages.effect.CKShootingStarEffect`
/// - `com.apple.messages.effect.CKSparklesEffect`
/// - `com.apple.messages.effect.CKSpotlightEffect`
#[derive(Debug, PartialEq, Eq, Clone, Copy)]
pub enum Expressive<'a> {
    /// Effects that use the entire screen
    Screen(ScreenEffect),
    /// Effects that display on a single bubble
    Bubble(BubbleEffect),
    /// Container for new or unknown effects. The string is the raw `expressive_send_style_id` value.
    Unknown(&'a str),
    /// Message is not an expressive
    None,
}

impl fmt::Display for Expressive<'_> {
    /// Render the canonical user-facing label for this expressive (e.g. `Sent
    /// with Confetti`). `None` renders to the empty string; `Unknown` renders
    /// to the raw style id so unrecognized values still surface.
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Screen(ScreenEffect::Confetti) => f.write_str("Sent with Confetti"),
            Self::Screen(ScreenEffect::Echo) => f.write_str("Sent with Echo"),
            Self::Screen(ScreenEffect::Fireworks) => f.write_str("Sent with Fireworks"),
            Self::Screen(ScreenEffect::Balloons) => f.write_str("Sent with Balloons"),
            Self::Screen(ScreenEffect::Heart) => f.write_str("Sent with Heart"),
            Self::Screen(ScreenEffect::Lasers) => f.write_str("Sent with Lasers"),
            Self::Screen(ScreenEffect::ShootingStar) => f.write_str("Sent with Shooting Star"),
            Self::Screen(ScreenEffect::Sparkles) => f.write_str("Sent with Sparkles"),
            Self::Screen(ScreenEffect::Spotlight) => f.write_str("Sent with Spotlight"),
            Self::Bubble(BubbleEffect::Slam) => f.write_str("Sent with Slam"),
            Self::Bubble(BubbleEffect::Loud) => f.write_str("Sent with Loud"),
            Self::Bubble(BubbleEffect::Gentle) => f.write_str("Sent with Gentle"),
            Self::Bubble(BubbleEffect::InvisibleInk) => f.write_str("Sent with Invisible Ink"),
            Self::Unknown(raw) => f.write_str(raw),
            Self::None => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_none_is_empty() {
        assert_eq!(Expressive::None.to_string(), "");
    }

    #[test]
    fn display_unknown_returns_raw_id() {
        assert_eq!(Expressive::Unknown("custom.id").to_string(), "custom.id");
    }

    #[test]
    fn display_screen_effects() {
        let cases = [
            (ScreenEffect::Confetti, "Sent with Confetti"),
            (ScreenEffect::Echo, "Sent with Echo"),
            (ScreenEffect::Fireworks, "Sent with Fireworks"),
            (ScreenEffect::Balloons, "Sent with Balloons"),
            (ScreenEffect::Heart, "Sent with Heart"),
            (ScreenEffect::Lasers, "Sent with Lasers"),
            (ScreenEffect::ShootingStar, "Sent with Shooting Star"),
            (ScreenEffect::Sparkles, "Sent with Sparkles"),
            (ScreenEffect::Spotlight, "Sent with Spotlight"),
        ];
        for (effect, expected) in cases {
            assert_eq!(Expressive::Screen(effect).to_string(), expected);
        }
    }

    #[test]
    fn display_bubble_effects() {
        let cases = [
            (BubbleEffect::Slam, "Sent with Slam"),
            (BubbleEffect::Loud, "Sent with Loud"),
            (BubbleEffect::Gentle, "Sent with Gentle"),
            (BubbleEffect::InvisibleInk, "Sent with Invisible Ink"),
        ];
        for (effect, expected) in cases {
            assert_eq!(Expressive::Bubble(effect).to_string(), expected);
        }
    }
}
