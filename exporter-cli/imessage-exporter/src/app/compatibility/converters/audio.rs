/*!
 Defines routines for converting audio files.
*/

use std::path::{Path, PathBuf};

use imessage_database::tables::attachment::MediaType;

use crate::app::compatibility::{
    converters::common::{copy_raw, ensure_paths, run_command},
    models::{AudioConverter, AudioType, Converter},
};

/// Copy an audio file, converting if possible
///
/// - Attachment `CAF` files convert to `MP4`
/// - Fallback to the original format
pub(crate) fn audio_copy_convert(
    from: &Path,
    to: &mut PathBuf,
    converter: &AudioConverter,
    mime_type: MediaType,
) -> Option<MediaType<'static>> {
    if matches!(
        mime_type,
        MediaType::Audio("caf") | MediaType::Audio("CAF") | MediaType::Audio("x-caf; codecs=opus")
    ) {
        let output_type = AudioType::Mp4;
        // Update extension for conversion
        to.set_extension(output_type.to_str());
        if convert_caf(from, to, converter).is_none() {
            eprintln!("Unable to convert {from:?}");
        } else {
            return Some(MediaType::Audio(output_type.to_str()));
        }
    }
    copy_raw(from, to);
    None
}

fn convert_caf(from: &Path, to: &Path, converter: &AudioConverter) -> Option<()> {
    let (from_path, to_path) = ensure_paths(from, to)?;

    let args = match converter {
        AudioConverter::AfConvert => vec!["-f", "mp4f", "-d", "aac", "-v", from_path, to_path],
        AudioConverter::Ffmpeg => vec!["-i", from_path, to_path],
    };

    run_command(converter.name(), args)
}
