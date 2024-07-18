/*!
 Contains logic to parse detailed data from `typedstream` data, focussing specifically on [NSAttributedString](https://developer.apple.com/documentation/foundation/nsattributedstring) data.

 Logic referenced from `typedstream` source located at:
   - [`typedstream.h`](https://opensource.apple.com/source/gcc/gcc-1493/libobjc/objc/typedstream.h.auto.html)
   - [`archive.c`](https://opensource.apple.com/source/gcc/gcc-5484/libobjc/archive.c.auto.html)
   - [`objc/typedstream.m`](https://archive.org/details/darwin_0.1)
*/

use crate::error::typedstream::TypedStreamError;

/// Indicates an [`i16`] in the byte stream
const I_16: u8 = 0x81;
/// Indicates an [`i32`] in the byte stream
const I_32: u8 = 0x82;
/// Indicates an [`f32`] or [`f64`] in the byte stream; the [`Type`] determines the size
const DECIMAL: u8 = 0x83;
/// Indicates the start of a new object
const START: u8 = 0x84;
/// Indicates that there is no more data to parse, for example the end of a class inheritance chain
const EMPTY: u8 = 0x85;
/// Indicates the last byte of an object
const END: u8 = 0x86;
/// Bytes equal or greater in value than the reference tag indicate an index in the table of already-seen types
const REFERENCE_TAG: u64 = 0x92;

/// Represents a class stored in the `typedstream`
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Class {
    /// The name of the class
    name: String,
    /// The encoded version of the class
    version: u64,
}

impl Class {
    fn new(name: String, version: u64) -> Self {
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
    /// An instance of a class that may contain some embedded data
    Object(Class, Vec<OutputData>),
    /// Some data that is likely a field on the object described by the `typedstream` but not part of a class
    Data(Vec<OutputData>),
    /// A class referenced in the `typedstream`, usually part of an inheritance heirarchy that does not contain any data itself
    Class(Class),
    /// A placeholder, only used when reserving a spot in the objects table for a reference to be filled with read class information.
    /// In a `typedstream`, the classes are stored in order of inheritance, so the top-level class described by the `typedstream`
    /// comes before the ones it inherits from. To preserve the order, we reserve the first slot to store the actual object's data
    /// and then later add it back to the right place.
    Placeholder,
    Type(Vec<Type>),
}

/// Represents types of data that can be stored in a `typedstream`
///
/// Types are cached in [`TypedStreamReader::types_table`]; the first time one is seen they are present
/// in the stream literally, but afterwards are only referenced by index in order of appearance.
// TODO: Remove clone
#[derive(Debug, Clone, PartialEq)]
pub enum Type {
    /// Encoded string data, usually embedded in an object
    Utf8String,
    /// Encoded bytes that can be parsed again as data
    EmbeddedData,
    /// An instance of a class, usually with data
    Object,
    /// An [`i8`], [`i16`], or [`i32`]
    SignedInt,
    /// A [`u8`], [`u16`], or [`u32`]
    UnsignedInt,
    /// An [`f32`]
    Float,
    /// An [`f64`]
    Double,
    /// Some text we can reuse later, i.e. a class name
    String(String),
    /// An array containing some data of a given length
    Array(usize),
    /// Data for which we do not know the type, likely for something this parser does not implement
    Unknown(u8),
}

/// Represents data that results from attempting to parse a class from the `typedstream`
#[derive(Debug)]
enum ClassResult {
    /// A reference to an already-seen class in the [`TypedStreamReader::object_table`]
    Index(usize),
    /// A new class heirarchy to be inserted into the [`TypedStreamReader::object_table`]
    ClassHierarchy(Vec<Archivable>),
}

impl Type {
    fn from_byte(byte: &u8) -> Self {
        match byte {
            0x40 => Self::Object,
            0x2B => Self::Utf8String,
            0x2A => Self::EmbeddedData,
            0x66 => Self::Float,
            0x64 => Self::Double,
            0x69 | 0x6c | 0x71 | 0x73 => Self::SignedInt,
            0x49 | 0x4c | 0x51 | 0x53 => Self::UnsignedInt,
            other => Self::Unknown(*other),
        }
    }

    fn new_string(string: String) -> Self {
        Self::String(string)
    }

    fn get_array_length(types: &[u8]) -> Option<Vec<Type>> {
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

/// Contains logic and data used to parse data from a `typedstream`
#[derive(Debug)]
pub struct TypedStreamReader<'a> {
    /// The `typedstream` we want to parse
    stream: &'a [u8],
    /// The current index we are at in the stream
    idx: usize,
    /// As we parse the `typedstream`, build a table of seen [`Type`]s to reference in the future
    types_table: Vec<Vec<Type>>,
    /// As we parse the `typedstream`, build a table of seen archivable data to reference in the future
    object_table: Vec<Archivable>,
    /// Stores the position of the current [`Archivable::Placeholder`]
    placeholder: Option<usize>,
}

impl<'a> TypedStreamReader<'a> {
    pub fn new(stream: &'a [u8]) -> Self {
        Self {
            stream,
            idx: 0,
            types_table: vec![],
            object_table: vec![],
            placeholder: None,
        }
    }

    // TODO: Remove
    fn emit_objects_table(&self) {
        println!("Start types table");
        self.types_table
            .iter()
            .enumerate()
            .for_each(|(idx, types)| println!("\t{idx}: {types:?}"));
        println!("End types table");
        println!("Start objects table");
        self.object_table
            .iter()
            .enumerate()
            .for_each(|(idx, obj)| println!("\t{idx}: {obj:?}"));
        println!("End objects table");
    }

    // TODO: Remove
    fn print_loc(&self, name: &str) {
        println!(
            "{name}: {:x}: {:x}",
            self.idx,
            self.get_current_byte().unwrap()
        );
    }

    /// Read a signed integer from the stream. Because we don't know the size of the integer ahead of time,
    /// we store it in the largest possible value.
    fn read_signed_int(&mut self) -> Result<i64, TypedStreamError> {
        match self.get_current_byte()? {
            I_16 => {
                let size = 2;
                self.idx += 1;
                let value = i16::from_le_bytes(
                    self.read_exact_bytes(size)?
                        .try_into()
                        .map_err(TypedStreamError::SliceError)?,
                );
                Ok(value as i64)
            }
            I_32 => {
                let size = 4;
                self.idx += 1;
                let value = i32::from_le_bytes(
                    self.read_exact_bytes(size)?
                        .try_into()
                        .map_err(TypedStreamError::SliceError)?,
                );
                Ok(value as i64)
            }
            _ => {
                if self.get_current_byte()? > REFERENCE_TAG as u8 {
                    self.idx += 1;
                }
                let value = i8::from_le_bytes([self.get_current_byte()?]);
                self.idx += 1;
                Ok(value as i64)
            }
        }
    }

    /// Read an unsigned integer from the stream. Because we don't know the size of the integer ahead of time,
    /// we store it in the largest possible value.
    fn read_unsigned_int(&mut self) -> Result<u64, TypedStreamError> {
        match self.get_current_byte()? {
            I_16 => {
                let size = 2;
                self.idx += 1;
                let value = u16::from_le_bytes(
                    self.read_exact_bytes(size)?
                        .try_into()
                        .map_err(TypedStreamError::SliceError)?,
                );
                Ok(value as u64)
            }
            I_32 => {
                let size = 4;
                self.idx += 1;
                let value = u32::from_le_bytes(
                    self.read_exact_bytes(size)?
                        .try_into()
                        .map_err(TypedStreamError::SliceError)?,
                );
                Ok(value as u64)
            }
            _ => {
                let value = u8::from_le_bytes([self.get_current_byte()?]);
                self.idx += 1;
                Ok(value as u64)
            }
        }
    }

    /// Read a single-precision float from the byte stream
    fn read_float(&mut self) -> Result<f32, TypedStreamError> {
        match self.get_current_byte()? {
            DECIMAL => {
                let size = 4;
                self.idx += 1;
                let value = f32::from_le_bytes(
                    self.read_exact_bytes(size)?
                        .try_into()
                        .map_err(TypedStreamError::SliceError)?,
                );
                Ok(value)
            }
            I_16 | I_32 => Ok(self.read_signed_int()? as f32),
            _ => {
                self.idx += 1;
                Ok(self.read_signed_int()? as f32)
            }
        }
    }

    /// Read a double-precision float from the byte stream
    fn read_double(&mut self) -> Result<f64, TypedStreamError> {
        // self.print_loc("dub");
        match self.get_current_byte()? {
            DECIMAL => {
                let size = 8;
                self.idx += 1;
                let value = f64::from_le_bytes(
                    self.read_exact_bytes(size)?
                        .try_into()
                        .map_err(TypedStreamError::SliceError)?,
                );
                Ok(value)
            }
            I_16 | I_32 => Ok(self.read_signed_int()? as f64),
            _ => {
                self.idx += 1;
                Ok(self.read_signed_int()? as f64)
            }
        }
    }

    /// Read exactly `n` bytes from the stream
    fn read_exact_bytes(&mut self, n: usize) -> Result<&[u8], TypedStreamError> {
        let range =
            self.stream
                .get(self.idx..self.idx + n)
                .ok_or(TypedStreamError::OutOfBounds(
                    self.idx + n,
                    self.stream.len(),
                ))?;
        self.idx += n;
        Ok(range)
    }

    /// Read `n` bytes as a String
    fn read_exact_as_string(
        &mut self,
        n: usize,
        string: &mut String,
    ) -> Result<(), TypedStreamError> {
        let str = std::str::from_utf8(self.read_exact_bytes(n)?)
            .map_err(TypedStreamError::StringParseError)?;
        string.push_str(str);
        Ok(())
    }

    /// Get the byte at a given index, if the index is within the bounds of the `typedstream`
    fn get_byte(&self, byte_idx: usize) -> Result<u8, TypedStreamError> {
        if byte_idx < self.stream.len() {
            return Ok(self.stream[byte_idx]);
        }
        Err(TypedStreamError::OutOfBounds(byte_idx, self.stream.len()))
    }

    /// Read the current byte
    fn get_current_byte(&self) -> Result<u8, TypedStreamError> {
        self.get_byte(self.idx)
    }

    /// Read the next byte
    fn get_next_byte(&self) -> Result<u8, TypedStreamError> {
        self.get_byte(self.idx + 1)
    }

    /// Read some bytes as an array
    fn read_array(&mut self, size: usize) -> Result<Vec<u8>, TypedStreamError> {
        Ok(self.read_exact_bytes(size)?.to_vec())
    }

    /// Determine the current types
    fn read_type(&mut self) -> Result<Vec<Type>, TypedStreamError> {
        let length = self.read_unsigned_int()?;
        // println!("type length: {length:?}");

        let types = self.read_exact_bytes(length as usize)?;

        // Handle array size
        // TODO: this needs to be a free function
        if types.first() == Some(&0x5b) {
            return Type::get_array_length(types).ok_or(TypedStreamError::InvalidArray);
        }

        Ok(types.iter().map(Type::from_byte).collect())
    }

    /// Read a reference pointer for a Type
    fn read_pointer(&mut self) -> Result<u32, TypedStreamError> {
        // self.print_loc("pointer");
        let result = self.get_current_byte()? as u32 - REFERENCE_TAG as u32;
        self.idx += 1;
        Ok(result)
    }

    /// Read a class
    fn read_class(&mut self) -> Result<ClassResult, TypedStreamError> {
        let mut out_v: Vec<Archivable> = vec![];
        match self.get_current_byte()? {
            START => {
                // Skip some header bytes
                // self.print_loc("class 1");
                while self.get_current_byte()? == START {
                    self.idx += 1;
                }
                // self.print_loc("class 2");
                let length = self.read_unsigned_int()?;

                if length >= REFERENCE_TAG {
                    let index = length - REFERENCE_TAG;
                    // println!("Getting referenced class at {index}");
                    return Ok(ClassResult::Index(index as usize));
                }

                let mut class_name = String::with_capacity(length as usize);
                // println!("Class name created with capacity {}", class_name.capacity());
                self.read_exact_as_string(length as usize, &mut class_name)?;

                let version = self.read_unsigned_int()?;
                // println!("{class_name} v{version}");
                // println!("{}: {:?}", self.idx, self.get_current_byte());

                self.types_table
                    .push(vec![Type::new_string(class_name.clone())]);

                out_v.push(Archivable::Class(Class::new(class_name, version)));

                if let ClassResult::ClassHierarchy(parent) = self.read_class()? {
                    out_v.extend(parent);
                }
            }
            EMPTY => {
                self.idx += 1;
                // println!("End of class chain!");
            }
            _ => {
                let index = self.read_pointer()?;
                // println!("Getting referenced object at {index}");
                return Ok(ClassResult::Index(index as usize));
            }
        }
        Ok(ClassResult::ClassHierarchy(out_v))
    }

    /// Read an object into the cache and emit, or emit an already-cached object
    fn read_object(&mut self) -> Result<Option<&Archivable>, TypedStreamError> {
        match self.get_current_byte()? {
            START => {
                match self.read_class()? {
                    ClassResult::Index(idx) => {
                        return Ok(self.object_table.get(idx));
                    }
                    ClassResult::ClassHierarchy(classes) => {
                        for class in classes.iter() {
                            self.object_table.push(class.clone())
                        }
                    }
                }
                Ok(None)
            }
            EMPTY => {
                self.idx += 1;
                // println!("Got empty object!");
                Ok(None)
            }
            _ => {
                let index = self.read_pointer()?;
                Ok(self.object_table.get(index as usize))
            }
        }
    }

    /// Read String data
    fn read_string(&mut self) -> Result<String, TypedStreamError> {
        let length = self.read_unsigned_int()?;
        let mut string = String::with_capacity(length as usize);
        // println!("String created with capacity {}", string.capacity());
        self.read_exact_as_string(length as usize, &mut string)?;

        Ok(string)
    }

    /// [`Archivable`] data can be embedded on a class or in a C String marked as [`Type::EmbeddedData`]
    fn read_embedded_data(&mut self) -> Result<Option<Archivable>, TypedStreamError> {
        // Skip the 0x84
        self.idx += 1;
        match self.get_type(true)? {
            Some(types) => self.read_types(types),
            None => Ok(None),
        }
    }

    /// Gets the current type from the stream, either by reading it from the stream or reading it from
    /// the specified index of [`TypedStreamReader::types_table`]. Because methods that use this type can also mutate self,
    /// returning a reference here means other methods could make that reference to the table invalid,
    /// which is disallowed in Rust. Thus, we return a clone of the cached data.
    fn get_type(&mut self, embedded: bool) -> Result<Option<Vec<Type>>, TypedStreamError> {
        match self.get_current_byte()? {
            START => {
                // Ignore repeated types, for example in a dict
                self.idx += 1;

                let object_types = self.read_type()?;

                // Embedded data is stored as a C String in the objects table
                if embedded {
                    self.object_table
                        .push(Archivable::Type(object_types.clone()));
                }
                self.types_table.push(object_types);
                Ok(self.types_table.last().cloned())
            }
            END => {
                // This indicates the end of the current object
                Ok(None)
            }
            _ => {
                // Ignore repeated types, for example in a dict
                while self.get_current_byte()? == self.get_next_byte()? {
                    self.idx += 1;
                }

                let ref_tag = self.read_pointer()?;
                Ok(self.types_table.get(ref_tag as usize).cloned())
            }
        }
    }

    /// Given some [`Type`]s, look at the stream and parse the data according to the specified [`Type`]
    fn read_types(
        &mut self,
        found_types: Vec<Type>,
    ) -> Result<Option<Archivable>, TypedStreamError> {
        let mut out_v = vec![];
        let mut is_obj: bool = false;

        for found_type in found_types {
            match found_type {
                Type::Utf8String => out_v.push(OutputData::String(self.read_string()?)),
                Type::EmbeddedData => {
                    return self.read_embedded_data();
                }
                Type::Object => {
                    is_obj = true;
                    let length = self.object_table.len();
                    self.placeholder = Some(length);
                    // println!("Adding placeholder at {:?}", self.placeholder);
                    self.object_table.push(Archivable::Placeholder);
                    // println!("Reading object...");
                    // self.print_loc("reading object at");
                    if let Some(object) = self.read_object()? {
                        match object.clone() {
                            Archivable::Object(cls, data) => {
                                // If this is a new class, i.e. one without any data, we handle it later
                                // If the class already has data in it, we just want to use that class
                                // And put the data we found inside of it
                                if !data.is_empty() {
                                    self.object_table[length] =
                                        Archivable::Object(cls.clone(), vec![]);
                                }
                                out_v.extend(data)
                            }
                            Archivable::Class(cls) => out_v.push(OutputData::Class(cls)),
                            Archivable::Data(data) => out_v.extend(data),
                            Archivable::Placeholder => {
                                unreachable!() // This case should not hit
                            }
                            Archivable::Type(_) => {} // This case should do nothing
                        }
                    } else {
                        // println!("NO OBJECT?");
                    }
                }
                Type::SignedInt => out_v.push(OutputData::SignedInteger(self.read_signed_int()?)),
                Type::UnsignedInt => {
                    out_v.push(OutputData::UnsignedInteger(self.read_unsigned_int()?))
                }
                Type::Float => out_v.push(OutputData::Float(self.read_float()?)),
                Type::Double => out_v.push(OutputData::Double(self.read_double()?)),
                Type::Unknown(byte) => out_v.push(OutputData::Byte(byte)),
                Type::String(s) => out_v.push(OutputData::String(s)),
                Type::Array(size) => out_v.push(OutputData::Array(self.read_array(size)?)),
            };
        }

        // If we had reserved a place for an object, fill that spot
        if let Some(spot) = self.placeholder {
            if !out_v.is_empty() {
                // println!("Inserting {out_v:?} to object table at {spot}");
                // We got a class, but do not have its respective data yet
                if let Some(OutputData::Class(class)) = out_v.last() {
                    // println!("Got output class {class:?}");
                    self.object_table[spot] = Archivable::Object(class.clone(), vec![]);
                // The spot after the current placeholder contains the class at the top of the class heirarchy, i.e.
                // if we get a placeholder and then find a new class heirarchy, the object table holds the class chain
                // in descending order of inheritance
                } else if let Some(Archivable::Class(class)) = self.object_table.get(spot + 1) {
                    // println!("Got archived class {class:?}");
                    self.object_table[spot] = Archivable::Object(class.clone(), out_v.clone());
                    self.placeholder = None;
                    return Ok(self.object_table.get(spot).cloned());
                // We got some data for a class that was already seen
                } else if let Some(Archivable::Object(_, data)) = self.object_table.get_mut(spot) {
                    // println!("Got archived object");
                    data.extend(out_v.clone());
                    self.placeholder = None;
                    return Ok(self.object_table.get(spot).cloned());
                // We got some data that is not part of a class, i.e. a field in the parent object for which we don't know the name
                } else {
                    // println!("{:?}", self.object_table.last_mut());
                    // println!("Got archived data");
                    self.object_table[spot] = Archivable::Data(out_v.clone());
                    self.placeholder = None;
                    return Ok(self.object_table.get(spot).cloned());
                }
            }
        }

        // TODO: This, but only for non-objects? Clean this logic up
        if !out_v.is_empty() && !is_obj {
            return Ok(Some(Archivable::Data(out_v.clone())));
        }
        Ok(None)
    }

    /// In the original source there are several variants of the header, but we
    /// only need to validate that this is the header used by macOS/iOS, as iMessage
    /// is probably not available on any NeXT platform
    fn validate_header(&mut self) -> Result<(), TypedStreamError> {
        // Encoding type
        let typedstream_version = self.read_unsigned_int()?;
        // Encoding signature
        let signature = self.read_string()?;
        self.idx += 1;
        // System version
        let system_version = self.read_unsigned_int()?;

        if typedstream_version != 4 || signature != "streamtyped" || system_version != 232 {
            return Err(TypedStreamError::InvalidHeader);
        }

        self.idx += 1;

        Ok(())
    }

    /// Attempt to get the data from the `typedstream`
    ///
    /// Output looks like:
    /// TODO: Make this better
    /// ```txt
    /// Object(Class { name: "NSMutableString", version: 1 }, [String("Example")]) // The message text
    /// Data([Integer(1), Integer(7)])  // The next object describes properties for the range of chars 1 through 7
    /// Object(Class { name: "NSDictionary", version: 0 }, [Integer(1)])  // The first property is a `NSDictionary` with 1 item
    /// Object(Class { name: "NSString", version: 1 }, [String("__kIMMessagePartAttributeName")])  // The first key in the `NSDictionary`
    /// Object(Class { name: "NSNumber", version: 0 }, [Integer(0)])  // The first value in the `NSDictionary`
    /// ```
    pub fn parse(&mut self) -> Result<Vec<Archivable>, TypedStreamError> {
        let mut out_v = vec![];

        self.validate_header()?;

        while self.idx < self.stream.len() {
            if self.get_current_byte()? == END {
                // println!("End of object!");
                self.idx += 1;
                continue;
            }

            // println!("Parsed data: {:?}\n", out_v);

            // First, get the current type
            if let Some(found_types) = self.get_type(false)? {
                // println!("Received types: {:?}", found_types);

                let result = self.read_types(found_types);
                // println!("Resultant type: {result:?}");
                // self.emit_objects_table();
                // println!("Types table: {:?}", self.types_table);
                if let Ok(Some(res)) = result {
                    out_v.push(res);
                }
            }
        }

        // self.emit_objects_table();
        // println!("Types table: {:?}", self.types_table);
        // println!("Parsed data: {:?}\n", out_v);
        Ok(out_v)
    }
}

#[cfg(test)]
mod type_tests {
    use crate::util::typedstream::Type;

    #[test]
    fn can_get_array_good() {
        let items: Vec<u8> = vec![0x5b, 0x39, 0x30, 0x34, 0x63, 0x5d];

        let expected = vec![Type::Array(904)];
        let result = Type::get_array_length(&items).unwrap();

        assert_eq!(result, expected)
    }

    #[test]
    fn cant_get_array_bad() {
        let items: Vec<u8> = vec![0x39, 0x30, 0x34, 0x63, 0x5d];

        let result = Type::get_array_length(&items);

        assert!(result.is_none())
    }
}

#[cfg(test)]
mod parser_tests {
    use std::env::current_dir;
    use std::fs::File;
    use std::io::Read;
    use std::vec;

    use crate::util::typedstream::{Archivable, Class, OutputData, TypedStreamReader};

    #[test]
    fn test_parse_header() {
        let plist_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/AttributedBodyTextOnly");
        let mut file = File::open(plist_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::new(&bytes);
        println!("{parser:?}");
        let result = parser.validate_header();

        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_text_mention() {
        let plist_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/Mention");
        let mut file = File::open(plist_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::new(&bytes);
        println!("{parser:?}");
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result.iter().for_each(|item| println!("{item:?}"));

        let expected = vec![
            Archivable::Object(
                Class {
                    name: "NSMutableString".to_string(),
                    version: 1,
                },
                vec![OutputData::String("Test Dad ".to_string())],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(1),
                OutputData::UnsignedInteger(5),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(1)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(0)],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(2),
                OutputData::UnsignedInteger(3),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(2)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMentionConfirmedMention".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String("+15558675309".to_string())],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(0)],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(1),
                OutputData::UnsignedInteger(1),
            ]),
        ];

        assert_eq!(result, expected);
    }

    #[test]
    fn test_parse_text_basic() {
        let plist_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/AttributedBodyTextOnly");
        let mut file = File::open(plist_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::new(&bytes);
        println!("{parser:?}");
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result.iter().for_each(|item| println!("{item:?}"));

        let expected = vec![
            Archivable::Object(
                Class {
                    name: "NSMutableString".to_string(),
                    version: 1,
                },
                vec![OutputData::String("Noter test".to_string())],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(1),
                OutputData::UnsignedInteger(10),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(1)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(0)],
            ),
        ];

        assert_eq!(result, expected);
    }

    #[test]
    fn test_parse_text_basic_2() {
        let plist_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/AttributedBodyTextOnly2");
        let mut file = File::open(plist_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::new(&bytes);
        println!("{parser:?}");
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result.iter().for_each(|item| println!("\t{item:?}"));

        let expected = vec![
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String("Test 3".to_string())],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(1),
                OutputData::UnsignedInteger(6),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(2)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMBaseWritingDirectionAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(-1)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(0)],
            ),
        ];

        assert_eq!(result, expected);
    }

    #[test]
    fn test_parse_text_long() {
        let plist_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/LongMessage");
        let mut file = File::open(plist_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::new(&bytes);
        println!("{parser:?}");
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result.iter().for_each(|item| println!("{item:?}"));

        let expected = vec![
            Archivable::Data(vec![
                OutputData::SignedInteger(1),
                OutputData::UnsignedInteger(2359),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(1)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(0)],
            ),
        ];

        assert_eq!(result[1..], expected);
    }

    #[test]
    fn test_parse_text_multi_part() {
        let plist_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/Multipart");
        let mut file = File::open(plist_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::new(&bytes);
        println!("{parser:?}");
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result.iter().for_each(|item| println!("\t{item:?}"));
        println!("\n\n");

        let expected = vec![
            Archivable::Object(
                Class {
                    name: "NSMutableString".to_string(),
                    version: 1,
                },
                vec![OutputData::String("￼test 1￼test 2 ￼test 3".to_string())],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(1),
                OutputData::UnsignedInteger(1),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(2)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMFileTransferGUIDAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "at_0_F0668F79-20C2-49C9-A87F-1B007ABB0CED".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(0)],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(2),
                OutputData::UnsignedInteger(6),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(1)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(1)],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(3),
                OutputData::UnsignedInteger(1),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(2)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMFileTransferGUIDAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "at_2_F0668F79-20C2-49C9-A87F-1B007ABB0CED".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(2)],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(4),
                OutputData::UnsignedInteger(7),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(1)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(3)],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(5),
                OutputData::UnsignedInteger(1),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(2)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMFileTransferGUIDAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "at_4_F0668F79-20C2-49C9-A87F-1B007ABB0CED".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(4)],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(6),
                OutputData::UnsignedInteger(6),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(1)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(5)],
            ),
        ];

        assert_eq!(result, expected);
    }

    #[test]
    fn test_parse_text_multi_part_deleted() {
        let plist_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/MultiPartWithDeleted");
        let mut file = File::open(plist_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::new(&bytes);
        println!("{parser:?}");
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result.iter().for_each(|item| println!("\t{item:?}"));

        let expected = vec![
            Archivable::Object(
                Class {
                    name: "NSMutableString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "From arbitrary byte stream:\r￼To native Rust data structures:\r".to_string(),
                )],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(1),
                OutputData::UnsignedInteger(28),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(1)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(0)],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(2),
                OutputData::UnsignedInteger(1),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(2)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMFileTransferGUIDAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "D0551D89-4E11-43D0-9A0E-06F19704E97B".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(1)],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(3),
                OutputData::UnsignedInteger(32),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(1)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(2)],
            ),
        ];

        println!("\n\nExpected data!");
        expected.iter().for_each(|item| println!("\t{item:?}"));
        println!("\n\n");

        assert_eq!(result, expected);
    }

    #[test]
    fn test_parse_text_attachment() {
        let plist_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/Attachment");
        let mut file = File::open(plist_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::new(&bytes);
        println!("{parser:?}");
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result.iter().for_each(|item| println!("\t{item:?}"));

        let expected = vec![
            Archivable::Object(
                Class {
                    name: "NSMutableString".to_string(),
                    version: 1,
                },
                vec![OutputData::String("\u{FFFC}This is how the notes look to me fyi, in case it helps make sense of anything".to_string())],
            ),
            Archivable::Data(vec![OutputData::SignedInteger(1), OutputData::UnsignedInteger(1)]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(6)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMFileTransferGUIDAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "at_0_2E5F12C3-E649-48AA-954D-3EA67C016BCC".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMInlineMediaHeightAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::Double(1139.0)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMBaseWritingDirectionAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(-1)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(0)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMFilenameAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "Messages Image(785748029).png".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMInlineMediaWidthAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::Double(952.0)],
            ),
            Archivable::Data(vec![OutputData::SignedInteger(2), OutputData::UnsignedInteger(77)]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(2)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMBaseWritingDirectionAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(-1)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(1)],
            ),
        ];

        assert_eq!(result, expected);
    }

    #[test]
    fn test_parse_text_array() {
        let plist_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/Array");
        let mut file = File::open(plist_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::new(&bytes);
        println!("{parser:?}");
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result.iter().for_each(|item| println!("\t{item:?}"));

        // Ignore the large array in the test
        let expected_1 = vec![
            Archivable::Object(
                Class {
                    name: "NSMutableString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "A single ChatGPT instance takes 5MW of power to run".to_string(),
                )],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(1),
                OutputData::UnsignedInteger(32),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(1)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(0)],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(2),
                OutputData::UnsignedInteger(3),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(2)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMDataDetectedAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSData".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(904)],
            ),
        ];

        let expected_2 = vec![
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMMessagePartAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(0)],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(1),
                OutputData::UnsignedInteger(16),
            ]),
        ];

        assert_eq!(result[..9], expected_1);
        assert_eq!(result[10..], expected_2);
    }
}
