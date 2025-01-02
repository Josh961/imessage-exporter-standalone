/// Parse an App's Bundle ID out of a Balloon's Bundle ID
///
/// For example, a Bundle ID like `com.apple.messages.MSMessageExtensionBalloonPlugin:0000000000:com.apple.SafetyMonitorApp.SafetyMonitorMessages`
/// should get parsed into `com.apple.SafetyMonitorApp.SafetyMonitorMessages`.
pub fn parse_balloon_bundle_id(bundle_id: Option<&str>) -> Option<&str> {
    if let Some(bundle_id) = bundle_id {
        let mut parts = bundle_id.split(':');
        let bundle_id = parts.next();
        // If there is only one part, use that, otherwise get the third part
        if parts.next().is_none() {
            bundle_id
        } else {
            // Will be None if there is no third part
            parts.next()
        }
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use crate::util::bundle_id::parse_balloon_bundle_id;

    #[test]
    fn can_get_no_balloon_bundle_id() {
        assert_eq!(parse_balloon_bundle_id(None), None);
    }

    #[test]
    fn can_get_balloon_bundle_id_os() {
        assert_eq!(
            parse_balloon_bundle_id(Some("com.apple.Handwriting.HandwritingProvider")),
            Some("com.apple.Handwriting.HandwritingProvider")
        );
    }

    #[test]
    fn can_get_balloon_bundle_id_url() {
        assert_eq!(
            parse_balloon_bundle_id(Some("com.apple.messages.URLBalloonProvider")),
            Some("com.apple.messages.URLBalloonProvider")
        );
    }

    #[test]
    fn can_get_balloon_bundle_id_apple() {
        assert_eq!(
            parse_balloon_bundle_id(Some("com.apple.messages.MSMessageExtensionBalloonPlugin:0000000000:com.apple.PassbookUIService.PeerPaymentMessagesExtension")),
            Some("com.apple.PassbookUIService.PeerPaymentMessagesExtension")
        );
    }

    #[test]
    fn can_get_balloon_bundle_id_third_party() {
        assert_eq!(
            parse_balloon_bundle_id(Some("com.apple.messages.MSMessageExtensionBalloonPlugin:QPU8QS3E62:com.contextoptional.OpenTable.Messages")),
            Some("com.contextoptional.OpenTable.Messages")
        );
    }
}
