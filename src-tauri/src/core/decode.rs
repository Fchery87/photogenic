use crate::core::image_buffer::DecodedImageBuffer;
use std::error::Error;
use std::fmt;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ImageFormat {
    Raw,
    Jpeg,
    Png,
    Tiff,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DecodeErrorKind {
    MissingPath,
    UnsupportedFormat,
    ReadFailed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DecodeError {
    kind: DecodeErrorKind,
    message: String,
}

impl DecodeError {
    fn new(kind: DecodeErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn kind(&self) -> DecodeErrorKind {
        self.kind
    }
}

impl fmt::Display for DecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl Error for DecodeError {}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DecodedSource {
    source_path: PathBuf,
    format: ImageFormat,
    buffer: DecodedImageBuffer,
}

impl DecodedSource {
    pub fn source_path(&self) -> &Path {
        &self.source_path
    }

    pub fn format(&self) -> ImageFormat {
        self.format
    }

    pub fn buffer(&self) -> &DecodedImageBuffer {
        &self.buffer
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct DecodeAdapter;

impl DecodeAdapter {
    pub fn new() -> Self {
        Self
    }

    pub fn classify_source(
        &self,
        source_path: impl AsRef<Path>,
    ) -> Result<ImageFormat, DecodeError> {
        let path = source_path.as_ref();
        if path.as_os_str().is_empty() {
            return Err(DecodeError::new(
                DecodeErrorKind::MissingPath,
                "source path is required",
            ));
        }

        let extension = path
            .extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .unwrap_or_default();

        match extension.as_str() {
            "cr2" | "cr3" | "nef" | "arw" | "dng" | "raf" => Ok(ImageFormat::Raw),
            "jpg" | "jpeg" => Ok(ImageFormat::Jpeg),
            "png" => Ok(ImageFormat::Png),
            "tif" | "tiff" => Ok(ImageFormat::Tiff),
            _ => Err(DecodeError::new(
                DecodeErrorKind::UnsupportedFormat,
                format!("unsupported source format: {}", path.display()),
            )),
        }
    }

    pub fn decode_source(
        &self,
        source_path: impl AsRef<Path>,
    ) -> Result<DecodedSource, DecodeError> {
        let path = source_path.as_ref();
        let format = self.classify_source(path)?;
        std::fs::read(path).map_err(|error| {
            DecodeError::new(
                DecodeErrorKind::ReadFailed,
                format!("failed to read {}: {error}", path.display()),
            )
        })?;

        Ok(DecodedSource {
            source_path: path.to_path_buf(),
            format,
            buffer: DecodedImageBuffer::placeholder_linear(1, 1),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::{DecodeAdapter, DecodeErrorKind, ImageFormat};
    use crate::core::image_buffer::PixelStorage;
    use std::path::PathBuf;

    fn fixture_path(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("test")
            .join("fixtures")
            .join("images")
            .join(name)
    }

    #[test]
    fn decode_rejects_unsupported_source_paths() {
        let adapter = DecodeAdapter::new();
        let error = adapter.decode_source("notes.txt").unwrap_err();

        assert_eq!(error.kind(), DecodeErrorKind::UnsupportedFormat);
    }

    #[test]
    fn decode_placeholder_raw_fixture_to_linear_descriptor() {
        let adapter = DecodeAdapter::new();
        let decoded = adapter.decode_source(fixture_path("minimal.nef")).unwrap();

        assert_eq!(decoded.format(), ImageFormat::Raw);
        assert_eq!(decoded.buffer().storage(), PixelStorage::PlaceholderLinear);
        assert!(decoded.buffer().width() > 0);
        assert!(decoded.buffer().height() > 0);
    }

    #[test]
    fn accepts_jpeg_png_and_tiff_source_paths() {
        let adapter = DecodeAdapter::new();

        assert_eq!(
            adapter.classify_source("hero.jpg").unwrap(),
            ImageFormat::Jpeg
        );
        assert_eq!(
            adapter.classify_source("hero.jpeg").unwrap(),
            ImageFormat::Jpeg
        );
        assert_eq!(
            adapter.classify_source("hero.png").unwrap(),
            ImageFormat::Png
        );
        assert_eq!(
            adapter.classify_source("hero.tif").unwrap(),
            ImageFormat::Tiff
        );
        assert_eq!(
            adapter.classify_source("hero.tiff").unwrap(),
            ImageFormat::Tiff
        );
    }
}
