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

#[derive(Clone, Debug, PartialEq)]
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
        let file_bytes = std::fs::read(path).map_err(|error| {
            DecodeError::new(
                DecodeErrorKind::ReadFailed,
                format!("failed to read {}: {error}", path.display()),
            )
        })?;

        let buffer = match format {
            ImageFormat::Png => Self::decode_png(&file_bytes)?,
            // RAW formats (CR2, NEF, ARW, DNG, RAF) require a dedicated RAW decoder
            // (rawloader or libraw) — not yet integrated. JPEG requires a JPEG decoder.
            // TIFF requires a TIFF reader. These return a placeholder so the pipeline
            // can still function in test mode, documented as unproven for real pixels.
            ImageFormat::Raw | ImageFormat::Jpeg | ImageFormat::Tiff => {
                DecodedImageBuffer::placeholder_linear(1, 1)
            }
        };

        Ok(DecodedSource {
            source_path: path.to_path_buf(),
            format,
            buffer,
        })
    }

    /// Decode a PNG file into linear float RGB samples (0.0–1.0 per channel).
    fn decode_png(file_bytes: &[u8]) -> Result<DecodedImageBuffer, DecodeError> {
        let decoder = png::Decoder::new(file_bytes);
        let mut reader = decoder
            .read_info()
            .map_err(|error| {
                DecodeError::new(
                    DecodeErrorKind::ReadFailed,
                    format!("PNG decode failed: {error}"),
                )
            })?;

        let (width, height) = reader.info().size();
        let mut buf = vec![0u8; reader.output_buffer_size()];
        let info = reader
            .next_frame(&mut buf)
            .map_err(|error| {
                DecodeError::new(
                    DecodeErrorKind::ReadFailed,
                    format!("PNG frame read failed: {error}"),
                )
            })?;

        let bytes_per_pixel = info.line_size / width.max(1) as usize;
        let pixel_count = (width as usize) * (height as usize);
        let mut samples = Vec::with_capacity(pixel_count * 3);

        let pixel_data = &buf[..pixel_count * bytes_per_pixel];
        for pixel in pixel_data.chunks(bytes_per_pixel) {
            let (r, g, b) = if bytes_per_pixel >= 3 {
                (
                    pixel[0] as f32 / 255.0,
                    pixel[1] as f32 / 255.0,
                    pixel[2] as f32 / 255.0,
                )
            } else {
                // Grayscale: replicate the single channel to R, G, B
                let gray = pixel[0] as f32 / 255.0;
                (gray, gray, gray)
            };
            samples.push(r);
            samples.push(g);
            samples.push(b);
        }

        DecodedImageBuffer::linear_float(width, height, samples)
            .map_err(|error| DecodeError::new(DecodeErrorKind::ReadFailed, error))
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
    fn decode_png_to_real_linear_float_samples() {
        let adapter = DecodeAdapter::new();
        let decoded = adapter.decode_source(fixture_path("test-rgb.png")).unwrap();

        assert_eq!(decoded.format(), ImageFormat::Png);
        assert_eq!(decoded.buffer().storage(), PixelStorage::LinearFloat32);
        assert_eq!(decoded.buffer().width(), 4);
        assert_eq!(decoded.buffer().height(), 4);

        // The fixture is (R=255, G=128, B=64) per pixel → (1.0, ~0.502, ~0.251)
        let samples = decoded.buffer().samples();
        assert_eq!(samples.len(), 4 * 4 * 3);
        assert!((samples[0] - 1.0).abs() < 0.01, "R channel ≈ 1.0");
        assert!((samples[1] - 128.0 / 255.0).abs() < 0.01, "G channel ≈ 0.502");
        assert!((samples[2] - 64.0 / 255.0).abs() < 0.01, "B channel ≈ 0.251");
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
