/*!
 Data structures and models used by the `typedstream` parser.
*/

/// Represents a class stored in the `typedstream`
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Class {
    /// The name of the class
    pub name: String,
    /// The encoded version of the class
    pub version: u64,
}

impl Class {
    pub(crate) fn new(name: String, version: u64) -> Self {
        Self { name, version }
    }
}

/// Rust structures containing data stored in the `typedstream`
#[derive(Debug, Clone, PartialEq)]
pub enum OutputData {
    /// Text data
    String(String),
    /// Signed integer types are coerced into this container
    SignedInteger(i64),
    /// Unsigned integer types are coerced into this container
    UnsignedInteger(u64),
    /// Floating point numbers
    Float(f32),
    /// Double precision floats
    Double(f64),
    /// Bytes whose type is not known
    Byte(u8),
    /// Arbitrary collection of bytes in an array
    Array(Vec<u8>),
    /// A found class, in order of inheritance
    Class(Class),
}

/// Types of data that can be archived into the `typedstream`
#[derive(Debug, Clone, PartialEq)]
pub enum Archivable {
    /// An instance of a class that may contain some embedded data. `typedstream` data doesn't include property
    /// names, so data is stored in order of appearance.
    Object(Class, Vec<OutputData>),
    /// Some data that is likely a property on the object described by the `typedstream` but not part of a class.
    Data(Vec<OutputData>),
    /// A class referenced in the `typedstream`, usually part of an inheritance heirarchy that does not contain any data itself.
    Class(Class),
    /// A placeholder, only used when reserving a spot in the objects table for a reference to be filled with read class information.
    /// In a `typedstream`, the classes are stored in order of inheritance, so the top-level class described by the `typedstream`
    /// comes before the ones it inherits from. To preserve the order, we reserve the first slot to store the actual object's data
    /// and then later add it back to the right place.
    Placeholder,
    /// A type that made it through the parsing process without getting replaced by an object.
    Type(Vec<Type>),
}

impl Archivable {
    /// If `self` is an [`Object`](Archivable::Object) that contains a [`Class`] named `NSString` or `NSMutableString`,
    /// extract a Rust string slice from the associated [`Data`](Archivable::Data).
    ///
    /// # Example
    ///
    /// ```
    /// use imessage_database::util::typedstream::models::{Archivable, Class, OutputData};
    ///
    /// let nsstring = Archivable::Object(
    ///     Class {
    ///         name: "NSString".to_string(),
    ///         version: 1
    ///     },
    ///     vec![OutputData::String("Hello world".to_string())]
    /// );
    /// println!("{:?}", nsstring.deserialize_as_nsstring()); // Some("Hello world")
    /// 
    /// let not_nsstring = Archivable::Object(
    ///     Class {
    ///         name: "NSNumber".to_string(),
    ///         version: 1
    ///     },
    ///     vec![OutputData::SignedInteger(100)]
    /// );
    /// println!("{:?}", not_nsstring.deserialize_as_nsstring()); // None
    /// ```
    pub fn deserialize_as_nsstring(&self) -> Option<&str> {
        if let Archivable::Object(Class { name, .. }, value) = self {
            if name == "NSString" || name == "NSMutableString" {
                if let Some(OutputData::String(text)) = value.first() {
                    return Some(text);
                }
            }
        }
        None
    }
}

/// Represents primitive types of data that can be stored in a `typedstream`
// TODO: Remove clone
#[derive(Debug, Clone, PartialEq)]
pub enum Type {
    /// Encoded string data, usually embedded in an object. Denoted by:
    /// - Hex: `0x2B`, UTF-8: [`+`](https://www.compart.com/en/unicode/U+002B)
    Utf8String,
    /// Encoded bytes that can be parsed again as data. Denoted by:
    /// - Hex: `0x2A`, UTF-8: [`*`](https://www.compart.com/en/unicode/U+002A)
    EmbeddedData,
    /// An instance of a class, usually with data. Denoted by:
    /// - Hex: `0x40`, UTF-8: [`@`](https://www.compart.com/en/unicode/U+0040)
    Object,
    /// An [`i8`], [`i16`], or [`i32`]. Denoted by:
    /// - Hex: `0x63`, UTF-8: [`c`](https://www.compart.com/en/unicode/U+0063)
    /// - Hex: `0x69`, UTF-8: [`i`](https://www.compart.com/en/unicode/U+0069)
    /// - Hex: `0x6c`, UTF-8: [`l`](https://www.compart.com/en/unicode/U+006c)
    /// - Hex: `0x71`, UTF-8: [`q`](https://www.compart.com/en/unicode/U+0071)
    /// - Hex: `0x73`, UTF-8: [`s`](https://www.compart.com/en/unicode/U+0073)
    ///
    /// The width is determined by the prefix: [`i8`] has none, [`i16`] has `0x81`, and [`i32`] has `0x82`.
    SignedInt,
    /// A [`u8`], [`u16`], or [`u32`]. Denoted by:
    /// - Hex: `0x43`, UTF-8: [`C`](https://www.compart.com/en/unicode/U+0043)
    /// - Hex: `0x49`, UTF-8: [`I`](https://www.compart.com/en/unicode/U+0049)
    /// - Hex: `0x4c`, UTF-8: [`L`](https://www.compart.com/en/unicode/U+004c)
    /// - Hex: `0x51`, UTF-8: [`Q`](https://www.compart.com/en/unicode/U+0051)
    /// - Hex: `0x53`, UTF-8: [`S`](https://www.compart.com/en/unicode/U+0053)
    ///
    /// The width is determined by the prefix: [`u8`] has none, [`u16`] has `0x81`, and [`u32`] has `0x82`.
    UnsignedInt,
    /// An [`f32`]. Denoted by:
    /// - Hex: `0x66`, UTF-8: [`f`](https://www.compart.com/en/unicode/U+0066)
    Float,
    /// An [`f64`]. Denoted by:
    /// - Hex: `0x64`, UTF-8: [`d`](https://www.compart.com/en/unicode/U+0064)
    Double,
    /// Some text we can reuse later, i.e. a class name.
    String(String),
    /// An array containing some data of a given length. Denoted by braced digits: `[123]`.
    Array(usize),
    /// Data for which we do not know the type, likely for something this parser does not implement.
    Unknown(u8),
}

impl Type {
    pub(crate) fn from_byte(byte: &u8) -> Self {
        match byte {
            0x40 => Self::Object,
            0x2B => Self::Utf8String,
            0x2A => Self::EmbeddedData,
            0x66 => Self::Float,
            0x64 => Self::Double,
            0x63 | 0x69 | 0x6c | 0x71 | 0x73 => Self::SignedInt,
            0x43 | 0x49 | 0x4c | 0x51 | 0x53 => Self::UnsignedInt,
            other => Self::Unknown(*other),
        }
    }

    pub(crate) fn new_string(string: String) -> Self {
        Self::String(string)
    }

    pub(crate) fn get_array_length(types: &[u8]) -> Option<Vec<Type>> {
        if types.first() == Some(&0x5b) {
            let len =
                types[1..]
                    .iter()
                    .take_while(|a| a.is_ascii_digit())
                    .fold(None, |acc, ch| {
                        char::from_u32(*ch as u32)?
                            .to_digit(10)
                            .map(|b| acc.unwrap_or(0) * 10 + b)
                    })?;
            return Some(vec![Type::Array(len as usize)]);
        }
        None
    }
}

/// Represents data that results from attempting to parse a class from the `typedstream`
#[derive(Debug)]
pub(crate) enum ClassResult {
    /// A reference to an already-seen class in the [`TypedStreamReader::object_table`](crate::util::typedstream::parser::TypedStreamReader::object_table)
    Index(usize),
    /// A new class heirarchy to be inserted into the [`TypedStreamReader::object_table`](crate::util::typedstream::parser::TypedStreamReader::object_table)
    ClassHierarchy(Vec<Archivable>),
}
