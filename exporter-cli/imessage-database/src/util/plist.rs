/*!
 Contains logic and data structures used to parse and deserialize [`NSKeyedArchiver`](https://developer.apple.com/documentation/foundation/nskeyedarchiver) property list files into native Rust data structures.

 The main entry point is [`parse_ns_keyed_archiver()`]. For normal property lists, use [`plist_as_dictionary()`].

 ## Overview

 The `NSKeyedArchiver` format is a property list-based serialization protocol used by Apple's Foundation framework.
 It stores object graphs in a keyed format, allowing for more flexible deserialization and better handling of
 object references compared to the older typedstream format.

 ## Origin

 Introduced in Mac OS X 10.2 as part of the Foundation framework, `NSKeyedArchiver` replaced `NSArchiver`
 ([`typedstream`](crate::util::typedstream)) system as Apple's primary object serialization mechanism.

 ## Features

 - Pure Rust implementation for efficient and safe deserialization
 - Support for both XML and binary property list formats
 - No dependencies on Apple frameworks
 - Robust error handling for malformed or invalid archives
*/

use plist::{Dictionary, Value};

use crate::error::plist::PlistParseError;

/// Deserialize a message's `payload_data` BLOB in the [`NSKeyedArchiver`](https://developer.apple.com/documentation/foundation/nskeyedarchiver) format to a [`Value`]
/// that follows the references in the XML document's UID pointers. First, we find the root of the
/// document, then walk the structure, promoting values to the places where their pointers are stored.
///
/// For example, a document with a root pointing to some `XML` like
///
/// ```xml
/// <array>
///     <dict>
///         <key>link</key>
///         <dict>
///              <key>CF$UID</key>
///              <integer>2</integer>
///         </dict>
///     </dict>
///     <string>https://chrissardegna.com</string>
/// </array>
/// ```
///
/// Will be parsed into a dictionary that looks like:
///
/// ```json
/// {
///     link: https://chrissardegna.com
/// }
/// ```
///
/// Some detail on this format is described [here](https://en.wikipedia.org/wiki/Property_list#Serializing_to_plist):
///
/// > Internally, `NSKeyedArchiver` somewhat recapitulates the binary plist format by
/// > storing an object table array called `$objects` in the dictionary. Everything else,
/// > including class information, is referenced by a UID pointer. A `$top` entry under
/// > the dict points to the top-level object the programmer was meaning to encode.
///
/// # Data Source
///
/// The source plist data generally comes from [`Message::payload_data()`](crate::tables::messages::message::Message::payload_data).
pub fn parse_ns_keyed_archiver(plist: &Value) -> Result<Value, PlistParseError> {
    let body = plist_as_dictionary(plist)?;
    let objects = extract_array_key(body, "$objects")?;

    // Index of root object
    let root = extract_uid_key(extract_dictionary(body, "$top")?, "root")?;

    follow_uid(objects, root, None, None)
}

/// Recursively follows pointers in an `NSKeyedArchiver` format, promoting the values
/// to the positions where the pointers live
///
/// # Parameters
///
/// * `objects` - The array of objects from the `$objects` key in the `NSKeyedArchiver` format
/// * `root` - The index into the `objects` array to resolve the current object
/// * `parent` - Optional reference to the parent object in the recursion chain. Used when
///   processing dictionary values to provide context for key generation and relative references.
///   For example, when processing a dictionary entry like `{key: uid_pointer}`, the parent
///   would be the [`Value`] representing the key itself.
/// * `item` - Optional reference to a specific item to process instead of looking up `root`
///   in the `objects` array. This is used when recursing into sub-objects that are already
///   resolved, such as when processing array elements or dictionary values that don't
///   contain `UID` pointers.
fn follow_uid<'a>(
    objects: &'a [Value],
    root: usize,
    parent: Option<&'a Value>,
    item: Option<&'a Value>,
) -> Result<Value, PlistParseError> {
    let item = match item {
        Some(item) => item,
        None => objects
            .get(root)
            .ok_or(PlistParseError::NoValueAtIndex(root))?,
    };

    match item {
        Value::Array(arr) => {
            let mut array = vec![];
            for item in arr {
                if let Some(idx) = item.as_uid() {
                    array.push(follow_uid(objects, idx.get() as usize, parent, None)?);
                }
            }
            Ok(plist::Value::Array(array))
        }
        Value::Dictionary(dict) => {
            let mut dictionary = Dictionary::new();
            // Handle where type is a Dictionary that points to another single value
            if let Some(relative) = dict.get("NS.relative") {
                if let Some(idx) = relative.as_uid()
                    && let Some(p) = &parent
                {
                    dictionary.insert(
                        value_to_key_string(p),
                        follow_uid(objects, idx.get() as usize, Some(p), None)?,
                    );
                }
            }
            // Handle the NSDictionary and NSMutableDictionary types
            else if dict.contains_key("NS.keys") && dict.contains_key("NS.objects") {
                let keys = extract_array_key(dict, "NS.keys")?;
                // These are the values in the objects list
                let values = extract_array_key(dict, "NS.objects")?;
                // Die here if the data is invalid
                if keys.len() != values.len() {
                    return Err(PlistParseError::InvalidDictionarySize(
                        keys.len(),
                        values.len(),
                    ));
                }

                for idx in 0..keys.len() {
                    let key_index = extract_uid_idx(keys, idx)?;
                    let value_index = extract_uid_idx(values, idx)?;
                    let key = follow_uid(objects, key_index, None, None)?;
                    let value = follow_uid(objects, value_index, Some(&key), None)?;

                    dictionary.insert(value_to_key_string(&key), value);
                }
            }
            // Handle a normal `{key: value}` style dictionary
            else {
                for (key, val) in dict {
                    // Skip class names; we don't need them
                    if key == "$class" {
                        continue;
                    }
                    // If the value is a pointer, follow it
                    if let Some(idx) = val.as_uid() {
                        let key_value = Value::String(key.clone());
                        dictionary.insert(
                            key.clone(),
                            follow_uid(objects, idx.get() as usize, Some(&key_value), None)?,
                        );
                    }
                    // If the value is not a pointer, try and follow the data itself
                    else if let Some(p) = parent {
                        dictionary.insert(
                            value_to_key_string(p),
                            follow_uid(objects, root, Some(p), Some(val))?,
                        );
                    }
                }
            }
            Ok(plist::Value::Dictionary(dictionary))
        }
        Value::Uid(uid) => follow_uid(objects, uid.get() as usize, None, None),
        _ => Ok(item.to_owned()),
    }
}

/// Helper function to convert a [`Value`] to a string representation for use as dictionary key
fn value_to_key_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Integer(i) => i.to_string(),
        Value::Real(f) => f.to_string(),
        Value::Boolean(b) => b.to_string(),
        Value::Date(d) => format!("{d:?}"),
        Value::Data(_) => "data".to_string(),
        Value::Array(_) => "array".to_string(),
        Value::Dictionary(_) => "dict".to_string(),
        Value::Uid(u) => u.get().to_string(),
        _ => "unknown".to_string(),
    }
}

/// Extract a dictionary from table `plist` data.
pub fn plist_as_dictionary(plist: &Value) -> Result<&Dictionary, PlistParseError> {
    plist
        .as_dictionary()
        .ok_or_else(|| PlistParseError::InvalidType("body".to_string(), "dictionary".to_string()))
}

/// Extract a dictionary from a specific key in a collection
pub fn extract_dictionary<'a>(
    body: &'a Dictionary,
    key: &str,
) -> Result<&'a Dictionary, PlistParseError> {
    body.get(key)
        .ok_or_else(|| PlistParseError::MissingKey(key.to_string()))?
        .as_dictionary()
        .ok_or_else(|| PlistParseError::InvalidType(key.to_string(), "dictionary".to_string()))
}

/// Extract an array from a specific key in a collection
pub fn extract_array_key<'a>(
    body: &'a Dictionary,
    key: &str,
) -> Result<&'a Vec<Value>, PlistParseError> {
    body.get(key)
        .ok_or_else(|| PlistParseError::MissingKey(key.to_string()))?
        .as_array()
        .ok_or_else(|| PlistParseError::InvalidType(key.to_string(), "array".to_string()))
}

/// Extract a Uid from a specific key in a collection
fn extract_uid_key(body: &Dictionary, key: &str) -> Result<usize, PlistParseError> {
    Ok(body
        .get(key)
        .ok_or_else(|| PlistParseError::MissingKey(key.to_string()))?
        .as_uid()
        .ok_or_else(|| PlistParseError::InvalidType(key.to_string(), "uid".to_string()))?
        .get() as usize)
}

/// Extract bytes from a specific key in a collection
pub fn extract_bytes_key<'a>(body: &'a Dictionary, key: &str) -> Result<&'a [u8], PlistParseError> {
    body.get(key)
        .ok_or_else(|| PlistParseError::MissingKey(key.to_string()))?
        .as_data()
        .ok_or_else(|| PlistParseError::InvalidType(key.to_string(), "data".to_string()))
}

/// Extract a real value as an `i64` from a specific key in a collection
pub fn extract_int_key(body: &Dictionary, key: &str) -> Result<i64, PlistParseError> {
    Ok(body
        .get(key)
        .ok_or_else(|| PlistParseError::MissingKey(key.to_string()))?
        .as_real()
        .ok_or_else(|| PlistParseError::InvalidType(key.to_string(), "real".to_string()))?
        as i64)
}

/// Extract an &str from a specific key in a collection
pub fn extract_string_key<'a>(body: &'a Dictionary, key: &str) -> Result<&'a str, PlistParseError> {
    body.get(key)
        .ok_or_else(|| PlistParseError::MissingKey(key.to_string()))?
        .as_string()
        .ok_or_else(|| PlistParseError::InvalidType(key.to_string(), "string".to_string()))
}

/// Extract a Uid from a specific index in a collection
fn extract_uid_idx(body: &[Value], idx: usize) -> Result<usize, PlistParseError> {
    Ok(body
        .get(idx)
        .ok_or(PlistParseError::NoValueAtIndex(idx))?
        .as_uid()
        .ok_or_else(|| PlistParseError::InvalidTypeIndex(idx, "uid".to_string()))?
        .get() as usize)
}

/// Extract a dictionary from a specific index in a collection
pub fn extract_dict_idx(body: &[Value], idx: usize) -> Result<&Dictionary, PlistParseError> {
    body.get(idx)
        .ok_or(PlistParseError::NoValueAtIndex(idx))?
        .as_dictionary()
        .ok_or_else(|| PlistParseError::InvalidTypeIndex(idx, "dictionary".to_string()))
}

/// Extract a string from a key-value pair that looks like `{key: String("value")}`
#[must_use]
pub fn get_string_from_dict<'a>(payload: &'a Value, key: &'a str) -> Option<&'a str> {
    payload
        .as_dictionary()?
        .get(key)?
        .as_string()
        .filter(|s| !s.is_empty())
}

/// Extract an owned string from a key-value pair that looks like `{key: String("value")}`
#[must_use]
pub fn get_owned_string_from_dict<'a>(payload: &'a Value, key: &'a str) -> Option<String> {
    get_string_from_dict(payload, key).map(String::from)
}

/// Extract a value from a key-value pair that looks like `{key: val}`
#[must_use]
pub fn get_value_from_dict<'a>(payload: &'a Value, key: &'a str) -> Option<&'a Value> {
    payload.as_dictionary()?.get(key)
}

/// Extract a bool from a key-value pair that looks like `{key: true}`
#[must_use]
pub fn get_bool_from_dict<'a>(payload: &'a Value, key: &'a str) -> Option<bool> {
    payload.as_dictionary()?.get(key)?.as_boolean()
}

/// Extract a string from a key-value pair that looks like `{key: {key: String("value")}}`
#[must_use]
pub fn get_string_from_nested_dict<'a>(payload: &'a Value, key: &'a str) -> Option<&'a str> {
    payload
        .as_dictionary()?
        .get(key)?
        .as_dictionary()?
        .get(key)?
        .as_string()
        .filter(|s| !s.is_empty())
}

/// Extract a float from a key-value pair that looks like `{key: {key: 1.2}}`
#[must_use]
pub fn get_float_from_nested_dict<'a>(payload: &'a Value, key: &'a str) -> Option<f64> {
    payload
        .as_dictionary()?
        .get(key)?
        .as_dictionary()?
        .get(key)?
        .as_real()
}
