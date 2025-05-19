/*!
 Defines routines for sanitizing text data.
*/

use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

use std::borrow::Cow;

/// Characters disallowed in a filename
static FILENAME_DISALLOWED_CHARS: LazyLock<HashSet<&char>> = LazyLock::new(|| {
    let mut set = HashSet::new();
    set.insert(&'*');
    set.insert(&'"');
    set.insert(&'/');
    set.insert(&'\\');
    set.insert(&'<');
    set.insert(&'>');
    set.insert(&':');
    set.insert(&'|');
    set.insert(&'?');
    set
});

/// Characters disallowed in HTML
static HTML_DISALLOWED_CHARS: LazyLock<HashMap<&char, &str>> = LazyLock::new(|| {
    let mut map = HashMap::new();
    map.insert(&'>', "&gt;");
    map.insert(&'<', "&lt;");
    map.insert(&'"', "&quot;");
    map.insert(&'\'', "&apos;");
    map.insert(&'`', "&grave;");
    map.insert(&'&', "&amp;");
    map.insert(&' ', "&nbsp;");
    map
});
/// The character to replace disallowed chars with
const FILENAME_REPLACEMENT_CHAR: char = '_';

/// Remove unsafe chars in [this list](FILENAME_DISALLOWED_CHARS).
pub fn sanitize_filename(filename: &str) -> String {
    filename
        .chars()
        .map(|letter| {
            if FILENAME_DISALLOWED_CHARS.contains(&letter) {
                FILENAME_REPLACEMENT_CHAR
            } else {
                letter
            }
        })
        .collect()
}

/// Escapes HTML special characters in the input string.
pub fn sanitize_html(input: &str) -> Cow<str> {
    for (idx, c) in input.char_indices() {
        if HTML_DISALLOWED_CHARS.contains_key(&c) {
            let mut res = String::from(&input[..idx]);
            input[idx..]
                .chars()
                .for_each(|c| match HTML_DISALLOWED_CHARS.get(&c) {
                    Some(replacement) => res.push_str(replacement),
                    None => res.push(c),
                });
            return Cow::Owned(res);
        }
    }
    Cow::Borrowed(input)
}

#[cfg(test)]
mod test_filename {
    use crate::app::sanitizers::sanitize_filename;

    #[test]
    fn can_sanitize_macos() {
        assert_eq!(sanitize_filename("a/b\\c:d"), "a_b_c_d");
    }

    #[test]
    fn doesnt_sanitize_none() {
        assert_eq!(sanitize_filename("a_b_c_d"), "a_b_c_d");
    }

    #[test]
    fn can_sanitize_one() {
        assert_eq!(sanitize_filename("ab/cd"), "ab_cd");
    }

    #[test]
    fn can_sanitize_only_bad() {
        assert_eq!(
            sanitize_filename("* \" / \\ < > : | ?"),
            "_ _ _ _ _ _ _ _ _"
        );
    }

    #[test]
    fn handles_emoji() {
        assert_eq!(sanitize_filename("hello🌍world"), "hello🌍world");
    }

    #[test]
    fn handles_cyrillic() {
        assert_eq!(sanitize_filename("привет/мир"), "привет_мир");
    }

    #[test]
    fn handles_leading_space() {
        assert_eq!(sanitize_filename(" leading space"), " leading space");
    }

    #[test]
    fn handles_trailing_space() {
        assert_eq!(sanitize_filename("trailing space "), "trailing space ");
    }

    #[test]
    fn handles_tab_char() {
        assert_eq!(sanitize_filename("tab\there"), "tab\there");
    }

    #[test]
    fn handles_newline() {
        assert_eq!(sanitize_filename("new\nline"), "new\nline");
    }

    #[test]
    fn handles_carriage_return() {
        assert_eq!(sanitize_filename("return\r"), "return\r");
    }
}

#[cfg(test)]
mod tests {
    use crate::app::sanitizers::sanitize_html;

    #[test]
    fn test_escape_html_chars_basic() {
        assert_eq!(
            &sanitize_html("<p>Hello, world > HTML</p>"),
            "&lt;p&gt;Hello, world &gt; HTML&lt;/p&gt;"
        );
    }

    #[test]
    fn doesnt_sanitize_empty_string() {
        assert_eq!(&sanitize_html(""), "");
    }

    #[test]
    fn doesnt_sanitize_no_special_chars() {
        assert_eq!(&sanitize_html("Hello world"), "Hello world");
    }

    #[test]
    fn can_sanitize_code_block() {
        assert_eq!(
            &sanitize_html("`imessage-exporter -f txt`"),
            "&grave;imessage-exporter -f txt&grave;"
        );
    }

    #[test]
    fn can_sanitize_all_special_chars() {
        assert_eq!(
            &sanitize_html("<>&\"`'"),
            "&lt;&gt;&amp;&quot;&grave;&apos;"
        );
    }

    #[test]
    fn can_sanitize_mixed_content() {
        assert_eq!(
            &sanitize_html("<div>Hello &amp; world</div>"),
            "&lt;div&gt;Hello &amp;amp; world&lt;/div&gt;"
        );
    }

    #[test]
    fn can_sanitize_mixed_content_nbsp() {
        assert_eq!(
            &sanitize_html("<div>Hello &amp; world</div>"),
            "&lt;div&gt;Hello&nbsp;&amp;amp;&nbsp;world&lt;/div&gt;"
        );
    }

    #[test]
    fn handles_nested_quotes() {
        assert_eq!(
            &sanitize_html("\"'nested quotes'\""),
            "&quot;&apos;nested quotes&apos;&quot;"
        );
    }

    #[test]
    fn handles_unicode_content() {
        assert_eq!(&sanitize_html("Hello 🌍 <world>"), "Hello 🌍 &lt;world&gt;");
    }

    #[test]
    fn handles_html_entities() {
        assert_eq!(
            &sanitize_html("&lt; already escaped &gt;"),
            "&amp;lt; already escaped &amp;gt;"
        );
    }

    #[test]
    fn handles_script_tags() {
        assert_eq!(
            &sanitize_html("<script>alert('xss')</script>"),
            "&lt;script&gt;alert(&apos;xss&apos;)&lt;/script&gt;"
        );
    }

    #[test]
    fn handles_attribute_quotes() {
        assert_eq!(&sanitize_html("attr=\"value\""), "attr=&quot;value&quot;");
    }

    #[test]
    fn handles_backticks_in_code() {
        assert_eq!(
            &sanitize_html("``nested backticks``"),
            "&grave;&grave;nested backticks&grave;&grave;"
        );
    }

    #[test]
    fn handles_double_quotes() {
        assert_eq!(&sanitize_html("\"quote\""), "&quot;quote&quot;");
    }

    #[test]
    fn handles_single_quotes() {
        assert_eq!(&sanitize_html("'quote'"), "&apos;quote&apos;");
    }

    #[test]
    fn handles_emoji() {
        assert_eq!(&sanitize_html("Hello 🌍"), "Hello 🌍");
    }

    #[test]
    fn handles_cyrillic() {
        assert_eq!(&sanitize_html("привет"), "привет");
    }

    #[test]
    fn handles_amp_entity() {
        assert_eq!(&sanitize_html("&amp;"), "&amp;amp;");
    }

    #[test]
    fn handles_lt_entity() {
        assert_eq!(&sanitize_html("&lt;"), "&amp;lt;");
    }

    #[test]
    fn handles_script_tag() {
        assert_eq!(
            &sanitize_html("<script>alert()</script>"),
            "&lt;script&gt;alert()&lt;/script&gt;"
        );
    }

    #[test]
    fn handles_double_backticks() {
        assert_eq!(
            &sanitize_html("``code``"),
            "&grave;&grave;code&grave;&grave;"
        );
    }

    #[test]
    fn handles_attribute() {
        assert_eq!(&sanitize_html("class=\"test\""), "class=&quot;test&quot;");
    }
}
