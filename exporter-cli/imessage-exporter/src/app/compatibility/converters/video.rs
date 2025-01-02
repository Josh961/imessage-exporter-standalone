/*!
 Defines routines for converting video files.
*/

use std::path::{Path, PathBuf};

use imessage_database::tables::attachment::MediaType;

use crate::app::compatibility::{
    converters::common::{copy_raw, ensure_paths, run_command},
    models::{Converter, VideoConverter, VideoType},
};

/// Copy a video file, converting if possible
///
/// - Attachment `MOV` files convert to `MP4`
/// - Fallback to the original format
pub(crate) fn video_copy_convert(
    from: &Path,
    to: &mut PathBuf,
    converter: &VideoConverter,
    mime_type: MediaType,
) -> Option<MediaType<'static>> {
    if matches!(
        mime_type,
        MediaType::Video("mov") | MediaType::Video("MOV") | MediaType::Video("quicktime")
    ) {
        let output_type = VideoType::Mp4;
        // Update extension for conversion
        to.set_extension(output_type.to_str());
        if convert_mov(from, to, converter).is_none() {
            eprintln!("Unable to convert {from:?}");
        } else {
            return Some(MediaType::Video(output_type.to_str()));
        }
    }

    // Fallback
    copy_raw(from, to);
    None
}

fn convert_mov(from: &Path, to: &Path, converter: &VideoConverter) -> Option<()> {
    let (from_path, to_path) = ensure_paths(from, to)?;

    let args = match converter {
        VideoConverter::Ffmpeg => vec!["-i", from_path, to_path],
    };
    run_command(converter.name(), args)
}
