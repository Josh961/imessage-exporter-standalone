/*!
 Contains data structures used to describe file converters and associated types.
*/

use std::{
    fmt::{Display, Formatter, Result},
    process::{Command, Stdio},
};

pub trait Converter {
    /// Determine the converter type for the current shell environment
    fn determine() -> Option<Self>
    where
        Self: Sized;

    /// The name of the program the current variant represents
    fn name(&self) -> &'static str
    where
        Self: Sized;
}

#[derive(Debug, PartialEq, Eq)]
pub enum ImageType {
    Jpeg,
    Gif,
    Png,
}

impl ImageType {
    pub fn to_str(&self) -> &'static str {
        match self {
            Self::Jpeg => "jpeg",
            Self::Gif => "gif",
            Self::Png => "png",
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum VideoType {
    Mp4,
}

impl VideoType {
    pub fn to_str(&self) -> &'static str {
        match self {
            Self::Mp4 => "mp4",
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum AudioType {
    Mp4,
}

impl AudioType {
    pub fn to_str(&self) -> &'static str {
        match self {
            Self::Mp4 => "mp4",
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
/// Program used to convert/encode images
pub enum ImageConverter {
    /// macOS Builtin
    Sips,
    Imagemagick,
}

impl Converter for ImageConverter {
    fn determine() -> Option<ImageConverter> {
        if exists(ImageConverter::Sips.name()) {
            return Some(ImageConverter::Sips);
        }
        if exists(ImageConverter::Imagemagick.name()) {
            return Some(ImageConverter::Imagemagick);
        }
        eprintln!("No HEIC converter found, image attachments will not be converted!");
        None
    }

    fn name(&self) -> &'static str {
        match self {
            ImageConverter::Sips => "sips",
            ImageConverter::Imagemagick => "magick",
        }
    }
}

impl Display for ImageConverter {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        write!(f, "{}", self.name())
    }
}

#[derive(Debug, PartialEq, Eq)]
/// Program used to convert/encode audio
pub enum AudioConverter {
    /// macOS Builtin
    AfConvert,
    Ffmpeg,
}

impl Converter for AudioConverter {
    fn determine() -> Option<AudioConverter> {
        if exists(AudioConverter::AfConvert.name()) {
            return Some(AudioConverter::AfConvert);
        }
        if exists(AudioConverter::Ffmpeg.name()) {
            return Some(AudioConverter::Ffmpeg);
        }
        eprintln!("No CAF converter found, audio attachments will not be converted!");
        None
    }

    fn name(&self) -> &'static str {
        match self {
            AudioConverter::AfConvert => "afconvert",
            AudioConverter::Ffmpeg => "ffmpeg",
        }
    }
}

impl Display for AudioConverter {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        write!(f, "{}", self.name())
    }
}

#[derive(Debug, PartialEq, Eq)]
/// Program used to convert/encode videos
pub enum VideoConverter {
    Ffmpeg,
}

impl Converter for VideoConverter {
    fn determine() -> Option<VideoConverter> {
        if exists(VideoConverter::Ffmpeg.name()) {
            return Some(VideoConverter::Ffmpeg);
        }
        eprintln!("No MOV converter found, video attachments will not be converted!");
        None
    }

    fn name(&self) -> &'static str {
        match self {
            VideoConverter::Ffmpeg => "ffmpeg",
        }
    }
}

impl Display for VideoConverter {
    fn fmt(&self, f: &mut Formatter<'_>) -> Result {
        write!(f, "{}", self.name())
    }
}

/// Determine if a shell program exists on the system
#[cfg(not(target_family = "windows"))]
fn exists(name: &str) -> bool {
    if let Ok(process) = Command::new("type")
        .args(vec![name])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .stdin(Stdio::null())
        .spawn()
    {
        if let Ok(output) = process.wait_with_output() {
            return output.status.success();
        }
    };
    false
}

/// Determine if a shell program exists on the system
#[cfg(target_family = "windows")]
fn exists(name: &str) -> bool {
    Command::new("where")
        .arg(name)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[cfg(test)]
mod test {
    use super::exists;

    #[test]
    fn can_find_program() {
        assert!(exists("ls"));
    }

    #[test]
    fn can_miss_program() {
        assert!(!exists("fake_name"));
    }
}
