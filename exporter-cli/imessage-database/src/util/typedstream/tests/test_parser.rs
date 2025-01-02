#[cfg(test)]
mod parser_tests {
    use std::env::current_dir;
    use std::fs::File;
    use std::io::Read;
    use std::vec;

    use crate::util::typedstream::{
        models::{Archivable, Class, OutputData},
        parser::TypedStreamReader,
    };

    #[test]
    fn test_parse_header() {
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/AttributedBodyTextOnly");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
        let result = parser.validate_header();

        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_text_mention() {
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/Mention");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
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
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/AttributedBodyTextOnly");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
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
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/AttributedBodyTextOnly2");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
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
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/LongMessage");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
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
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/Multipart");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
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
                vec![OutputData::String(
                    "\u{FFFC}test 1\u{FFFC}test 2 \u{FFFC}test 3".to_string(),
                )],
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
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/MultiPartWithDeleted");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
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
    fn test_parse_text_attachment_float() {
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/Attachment");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
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
    fn test_parse_text_attachment_i16() {
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/AttachmentI16");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result.iter().for_each(|item| println!("{item:?}"));
        let expected = vec![
            Archivable::Object(
                Class {
                    name: "NSMutableString".to_string(),
                    version: 1,
                },
                vec![OutputData::String("\u{FFFC}".to_string())],
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
                    "at_0_BE588799-C4BC-47DF-A56D-7EE90C74911D".to_string(),
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
                vec![OutputData::SignedInteger(600)],
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
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String("__kIMFilenameAttributeName".to_string())],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "brilliant-kids-test-answers-32-93042.jpeg".to_string(),
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
                vec![OutputData::SignedInteger(660)],
            ),
        ];

        assert_eq!(result, expected);
    }

    #[test]
    fn test_parse_text_url_message() {
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/URLMessage");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result
            .iter()
            .enumerate()
            .for_each(|(idx, item)| println!("\t{idx}: {item:?}"));

        let expected_1 = vec![
            Archivable::Object(
                Class {
                    name: "NSMutableString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "https://twitter.com/xxxxxxxxx/status/0000223300009216128".to_string(),
                )],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(1),
                OutputData::UnsignedInteger(56),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(4)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String("__kIMLinkAttributeName".to_string())],
            ),
            Archivable::Object(
                Class {
                    name: "NSURL".to_string(),
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
                    "https://twitter.com/xxxxxxxxx/status/0000223300009216128".to_string(),
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
                    name: "NSMutableData".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(604)],
            ),
        ];

        let expected_2 = vec![
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
        ];

        assert_eq!(result[..10], expected_1);
        assert_eq!(result[11..], expected_2);
    }

    #[test]
    fn test_parse_text_array() {
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/Array");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
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

    #[test]
    fn test_parse_text_app() {
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/AppMessage");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result.iter().for_each(|item| println!("{item:?}"));

        let expected = vec![
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String("\u{FFFC}".to_string())],
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
                vec![OutputData::SignedInteger(3)],
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
                    "F0B18A15-E9A5-4B18-A38F-685B7B3FF037".to_string(),
                )],
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
    fn test_parse_custom_tapback() {
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/CustomReaction");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result.iter().for_each(|item| println!("{item:#?}"));

        let expected = vec![
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "Reacted with a sticker to “Like I wonder if the stickers can be reactions ”￼"
                        .to_string(),
                )],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(1),
                OutputData::UnsignedInteger(75),
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
            Archivable::Data(vec![
                OutputData::SignedInteger(2),
                OutputData::UnsignedInteger(1),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(3)],
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
                    "41C4376E-397E-4C42-84E2-B16F7801F638".to_string(),
                )],
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
    fn test_parse_all_styles() {
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/TextStyles");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result
            .iter()
            .enumerate()
            .for_each(|(idx, item)| println!("{idx}: {item:?}"));

        let expected = vec![
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "Bold underline italic strikethrough all four".to_string(),
                )],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(1),
                OutputData::UnsignedInteger(4),
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
                vec![OutputData::String("__kIMTextBoldAttributeName".to_string())],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
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
                OutputData::SignedInteger(3),
                OutputData::UnsignedInteger(9),
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
                    "__kIMTextUnderlineAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
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
            Archivable::Data(vec![
                OutputData::SignedInteger(4),
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
                    "__kIMTextItalicAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
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
            Archivable::Data(vec![
                OutputData::SignedInteger(5),
                OutputData::UnsignedInteger(13),
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
                    "__kIMTextStrikethroughAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
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
                OutputData::UnsignedInteger(5),
            ]),
            Archivable::Data(vec![
                OutputData::SignedInteger(6),
                OutputData::UnsignedInteger(4),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(5)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String("__kIMTextBoldAttributeName".to_string())],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
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
                    "__kIMTextStrikethroughAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
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
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMTextUnderlineAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
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
                    "__kIMTextItalicAttributeName".to_string(),
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
    fn test_parse_all_styles_single() {
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/TextStylesSingleRange");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result
            .iter()
            .enumerate()
            .for_each(|(idx, item)| println!("{idx}: {item:?}"));

        let expected = vec![
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String("Everything".to_string())],
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
                vec![OutputData::SignedInteger(5)],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String("__kIMTextBoldAttributeName".to_string())],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
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
                    "__kIMTextStrikethroughAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
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
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "__kIMTextUnderlineAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
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
                    "__kIMTextItalicAttributeName".to_string(),
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
    fn test_parse_all_effects() {
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/TextEffects");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result
            .iter()
            .enumerate()
            .for_each(|(idx, item)| println!("{idx}: {item:?}"));

        let expected = vec![
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "Big small shake nod explode ripple bloom jitter".to_string(),
                )],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(1),
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
                    "__kIMTextEffectAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(5)],
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
                OutputData::SignedInteger(3),
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
                    "__kIMTextEffectAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(11)],
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
                OutputData::SignedInteger(4),
                OutputData::UnsignedInteger(5),
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
                    "__kIMTextEffectAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(9)],
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
                OutputData::SignedInteger(3),
                OutputData::UnsignedInteger(1),
            ]),
            Archivable::Data(vec![
                OutputData::SignedInteger(5),
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
                    "__kIMTextEffectAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(8)],
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
                OutputData::SignedInteger(3),
                OutputData::UnsignedInteger(1),
            ]),
            Archivable::Data(vec![
                OutputData::SignedInteger(6),
                OutputData::UnsignedInteger(8),
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
                    "__kIMTextEffectAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(12)],
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
                OutputData::SignedInteger(7),
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
                    "__kIMTextEffectAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(4)],
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
                OutputData::SignedInteger(6),
                OutputData::UnsignedInteger(1),
            ]),
            Archivable::Data(vec![
                OutputData::SignedInteger(8),
                OutputData::UnsignedInteger(5),
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
                    "__kIMTextEffectAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
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
                OutputData::SignedInteger(6),
                OutputData::UnsignedInteger(1),
            ]),
            Archivable::Data(vec![
                OutputData::SignedInteger(9),
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
                    "__kIMTextEffectAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(10)],
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
    fn test_parse_effects_styles_mixed() {
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/TextStylesMixed");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result
            .iter()
            .enumerate()
            .for_each(|(idx, item)| println!("{idx}: {item:?}"));

        let expected = vec![
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "Underline normal jitter normal".to_string(),
                )],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(1),
                OutputData::UnsignedInteger(9),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(3)],
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
                    "__kIMTextUnderlineAttributeName".to_string(),
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
                OutputData::SignedInteger(2),
                OutputData::UnsignedInteger(8),
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
            Archivable::Data(vec![
                OutputData::SignedInteger(3),
                OutputData::UnsignedInteger(6),
            ]),
            Archivable::Object(
                Class {
                    name: "NSDictionary".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(3)],
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
                    "__kIMTextEffectAttributeName".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSNumber".to_string(),
                    version: 0,
                },
                vec![OutputData::SignedInteger(10)],
            ),
            Archivable::Data(vec![
                OutputData::SignedInteger(2),
                OutputData::UnsignedInteger(7),
            ]),
        ];

        assert_eq!(result, expected);
    }

    #[test]
    fn test_parse_text_audio_transcription() {
        let typedstream_path = current_dir()
            .unwrap()
            .as_path()
            .join("test_data/typedstream/Transcription");
        let mut file = File::open(typedstream_path).unwrap();
        let mut bytes = vec![];
        file.read_to_end(&mut bytes).unwrap();

        let mut parser = TypedStreamReader::from(&bytes);
        let result = parser.parse().unwrap();

        println!("\n\nGot data!");
        result.iter().for_each(|item| println!("{item:?}"));

        let expected = vec![
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String("\u{FFFC}".to_string())],
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
                vec![OutputData::SignedInteger(4)],
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
                    "4C339597-EBBB-4978-9B87-521C0471A848".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "IMAudioTranscription".to_string(),
                )],
            ),
            Archivable::Object(
                Class {
                    name: "NSString".to_string(),
                    version: 1,
                },
                vec![OutputData::String(
                    "This is a test".to_string(),
                )],
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
}
