use crate::core::image_buffer::DecodedImageBuffer;
use std::error::Error;
use std::fmt;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ImageFormat {
    Raw,
    Dng,
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
            "cr2" | "cr3" | "nef" | "arw" | "raf" => Ok(ImageFormat::Raw),
            "dng" => Ok(ImageFormat::Dng),
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
            ImageFormat::Tiff => Self::decode_tiff(&file_bytes)?,
            ImageFormat::Jpeg => Self::decode_jpeg(&file_bytes)?,
            ImageFormat::Dng => Self::decode_dng(&file_bytes)?,
            // RAW formats (CR2, NEF, ARW, RAF) require a dedicated RAW decoder
            // (rawloader or libraw) — not yet integrated. DNG is decoded above.
            ImageFormat::Raw => {
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

    /// Decode a baseline uncompressed TIFF (RGB, 8-bit or 16-bit) into linear float samples.
    /// Supports both little-endian (II) and big-endian (MM) byte orders.
    fn decode_tiff(file_bytes: &[u8]) -> Result<DecodedImageBuffer, DecodeError> {
        if file_bytes.len() < 8 {
            return Err(DecodeError::new(
                DecodeErrorKind::ReadFailed,
                "TIFF file too short for header",
            ));
        }

        let le = match &file_bytes[0..2] {
            b"II" => true,
            b"MM" => false,
            _ => {
                return Err(DecodeError::new(
                    DecodeErrorKind::ReadFailed,
                    "invalid TIFF byte-order marker",
                ))
            }
        };

        let magic = tiff_u16(file_bytes, 2, le)?;
        if magic != 42 {
            return Err(DecodeError::new(
                DecodeErrorKind::ReadFailed,
                "invalid TIFF magic number",
            ));
        }

        let ifd_offset = tiff_u32(file_bytes, 4, le)? as usize;
        let entry_count = tiff_u16(file_bytes, ifd_offset, le)? as usize;

        let mut width = 0u32;
        let mut height = 0u32;
        let mut bits_per_sample = 8u16;
        let mut compression = 1u16;
        let mut photometric = 0u16;
        let mut strip_offset = 0u32;
        let mut strip_byte_count = 0u32;
        let mut samples_per_pixel = 1u16;

        for i in 0..entry_count {
            let eo = ifd_offset + 2 + i * 12;
            let tag = tiff_u16(file_bytes, eo, le)?;
            let type_id = tiff_u16(file_bytes, eo + 2, le)?;
            let count = tiff_u32(file_bytes, eo + 4, le)?;
            // For SHORT (type 3) with count ≤ 2, or LONG (type 4) with count 1,
            // the value is inline in the 4-byte field at eo+8.
            let inline_u16 = || tiff_u16(file_bytes, eo + 8, le).unwrap_or(0);
            let inline_value = || -> u32 {
                if type_id == 3 {
                    tiff_u16(file_bytes, eo + 8, le).unwrap_or(0) as u32
                } else {
                    tiff_u32(file_bytes, eo + 8, le).unwrap_or(0)
                }
            };

            match tag {
                256 => width = inline_value(),                       // ImageWidth
                257 => height = inline_value(),                      // ImageLength
                258 => {
                    // BitsPerSample: if count > 2, value is an offset to SHORT array
                    bits_per_sample = if count > 2 {
                        let off = tiff_u32(file_bytes, eo + 8, le).unwrap_or(0) as usize;
                        tiff_u16(file_bytes, off, le).unwrap_or(8)
                    } else {
                        inline_u16()
                    };
                }
                259 => compression = inline_u16(),                    // Compression
                262 => photometric = inline_u16(),                   // PhotometricInterpretation
                273 => strip_offset = inline_value(),                // StripOffsets
                277 => samples_per_pixel = inline_u16(),             // SamplesPerPixel
                279 => strip_byte_count = inline_value(),            // StripByteCounts
                _ => {}
            }
        }

        if compression != 1 {
            return Err(DecodeError::new(
                DecodeErrorKind::ReadFailed,
                format!("TIFF compression {} not supported (only uncompressed)", compression),
            ));
        }
        if photometric != 2 {
            return Err(DecodeError::new(
                DecodeErrorKind::ReadFailed,
                format!("TIFF photometric {} not supported (only RGB)", photometric),
            ));
        }
        if width == 0 || height == 0 {
            return Err(DecodeError::new(
                DecodeErrorKind::ReadFailed,
                "TIFF has zero dimensions",
            ));
        }

        let start = strip_offset as usize;
        let end = start + strip_byte_count as usize;
        if end > file_bytes.len() {
            return Err(DecodeError::new(
                DecodeErrorKind::ReadFailed,
                "TIFF strip data extends past end of file",
            ));
        }
        let pixel_data = &file_bytes[start..end];

        let bps = (bits_per_sample / 8) as usize;
        let bpp = bps * samples_per_pixel as usize;
        let pixel_count = (width as usize) * (height as usize);
        let mut samples = Vec::with_capacity(pixel_count * 3);

        for px in pixel_data[..(pixel_count * bpp).min(pixel_data.len())].chunks(bpp) {
            let (r, g, b) = match (bits_per_sample, samples_per_pixel) {
                (8, 3) => (
                    px[0] as f32 / 255.0,
                    px[1] as f32 / 255.0,
                    px[2] as f32 / 255.0,
                ),
                (16, 3) => (
                    tiff_u16(px, 0, le).unwrap_or(0) as f32 / 65535.0,
                    tiff_u16(px, 2, le).unwrap_or(0) as f32 / 65535.0,
                    tiff_u16(px, 4, le).unwrap_or(0) as f32 / 65535.0,
                ),
                (8, 1) => {
                    let gray = px[0] as f32 / 255.0;
                    (gray, gray, gray)
                }
                _ => {
                    return Err(DecodeError::new(
                        DecodeErrorKind::ReadFailed,
                        format!(
                            "TIFF {}-bit {}-channel not supported",
                            bits_per_sample, samples_per_pixel
                        ),
                    ));
                }
            };
            samples.push(r);
            samples.push(g);
            samples.push(b);
        }

        DecodedImageBuffer::linear_float(width, height, samples)
            .map_err(|error| DecodeError::new(DecodeErrorKind::ReadFailed, error))
    }

    /// Decode a baseline JPEG into linear float RGB samples (0.0–1.0 per channel).
    /// Uses the pure-Rust `jpeg_decoder` module (no external crate dependency).
    fn decode_jpeg(file_bytes: &[u8]) -> Result<DecodedImageBuffer, DecodeError> {
        let decoded = crate::core::jpeg_decoder::decode_jpeg(file_bytes)
            .map_err(|error| {
                DecodeError::new(
                    DecodeErrorKind::ReadFailed,
                    format!("JPEG decode failed: {error}"),
                )
            })?;

        let pixel_count = (decoded.width as usize) * (decoded.height as usize);
        let mut samples = Vec::with_capacity(pixel_count * 3);
        for chunk in decoded.rgb.chunks(3) {
            samples.push(chunk[0] as f32 / 255.0);
            samples.push(chunk[1] as f32 / 255.0);
            samples.push(chunk[2] as f32 / 255.0);
        }

        DecodedImageBuffer::linear_float(decoded.width, decoded.height, samples)
            .map_err(|error| DecodeError::new(DecodeErrorKind::ReadFailed, error))
    }

    /// Decode a DNG (Digital Negative) RAW file into linear float RGB samples.
    /// Uses the pure-Rust `dng_decoder` module — no external crate dependency.
    /// Supports uncompressed DNG with standard Bayer CFA patterns.
    fn decode_dng(file_bytes: &[u8]) -> Result<DecodedImageBuffer, DecodeError> {
        crate::core::dng_decoder::decode_dng(file_bytes).map_err(|error| {
            DecodeError::new(
                DecodeErrorKind::ReadFailed,
                format!("DNG decode failed: {error}"),
            )
        })
    }
}

/// Read a big-endian or little-endian u16 from a byte slice.
fn tiff_u16(bytes: &[u8], offset: usize, le: bool) -> Result<u16, DecodeError> {
    if offset + 2 > bytes.len() {
        return Err(DecodeError::new(
            DecodeErrorKind::ReadFailed,
            "TIFF read out of bounds",
        ));
    }
    Ok(if le {
        u16::from_le_bytes([bytes[offset], bytes[offset + 1]])
    } else {
        u16::from_be_bytes([bytes[offset], bytes[offset + 1]])
    })
}

/// Read a big-endian or little-endian u32 from a byte slice.
fn tiff_u32(bytes: &[u8], offset: usize, le: bool) -> Result<u32, DecodeError> {
    if offset + 4 > bytes.len() {
        return Err(DecodeError::new(
            DecodeErrorKind::ReadFailed,
            "TIFF read out of bounds",
        ));
    }
    Ok(if le {
        u32::from_le_bytes([
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        ])
    } else {
        u32::from_be_bytes([
            bytes[offset],
            bytes[offset + 1],
            bytes[offset + 2],
            bytes[offset + 3],
        ])
    })
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
    fn decode_jpeg_to_real_linear_float_samples() {
        let adapter = DecodeAdapter::new();
        let decoded = adapter.decode_source(fixture_path("test-gray.jpeg")).unwrap();

        assert_eq!(decoded.format(), ImageFormat::Jpeg);
        assert_eq!(decoded.buffer().storage(), PixelStorage::LinearFloat32);
        assert_eq!(decoded.buffer().width(), 8);
        assert_eq!(decoded.buffer().height(), 8);

        // Solid gray (Y=128, Cb=128, Cr=128) → RGB ≈ 128/255 ≈ 0.502
        let samples = decoded.buffer().samples();
        assert_eq!(samples.len(), 8 * 8 * 3);
        for i in 0..samples.len() {
            assert!((samples[i] - 128.0 / 255.0).abs() < 0.05, "pixel {} ≈ gray", i);
        }
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
    fn decode_tiff_to_real_linear_float_samples() {
        let adapter = DecodeAdapter::new();
        let decoded = adapter.decode_source(fixture_path("test-rgb.tiff")).unwrap();

        assert_eq!(decoded.format(), ImageFormat::Tiff);
        assert_eq!(decoded.buffer().storage(), PixelStorage::LinearFloat32);
        assert_eq!(decoded.buffer().width(), 4);
        assert_eq!(decoded.buffer().height(), 4);

        // The fixture is a checkerboard: pixel 0 = red (255,0,0), pixel 1 = green (0,255,0)
        let samples = decoded.buffer().samples();
        assert_eq!(samples.len(), 4 * 4 * 3);
        assert!((samples[0] - 1.0).abs() < 0.01, "pixel 0 R ≈ 1.0");
        assert!((samples[1] - 0.0).abs() < 0.01, "pixel 0 G ≈ 0.0");
        assert!((samples[2] - 0.0).abs() < 0.01, "pixel 0 B ≈ 0.0");
        assert!((samples[3] - 0.0).abs() < 0.01, "pixel 1 R ≈ 0.0");
        assert!((samples[4] - 1.0).abs() < 0.01, "pixel 1 G ≈ 1.0");
        assert!((samples[5] - 0.0).abs() < 0.01, "pixel 1 B ≈ 0.0");
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

    #[test]
    fn decode_dng_to_real_linear_float_samples() {
        let adapter = DecodeAdapter::new();
        let decoded = adapter.decode_source(fixture_path("test-raw.dng")).unwrap();

        assert_eq!(decoded.format(), ImageFormat::Dng);
        assert_eq!(decoded.buffer().storage(), PixelStorage::LinearFloat32);
        assert_eq!(decoded.buffer().width(), 4);
        assert_eq!(decoded.buffer().height(), 4);

        // The fixture has R=52428/65535≈0.8, G=26214/65535≈0.4, B=13107/65535≈0.2
        // After demosaicing, the RGB values should be close to these at known sites.
        let samples = decoded.buffer().samples();
        assert_eq!(samples.len(), 4 * 4 * 3);

        // Pixel (0,0) is an R site: R should be ≈0.8
        let r00 = samples[0];
        assert!((r00 - 0.8).abs() < 0.01, "R at (0,0) ≈ 0.8, got {}", r00);

        // Pixel (1,1) is a B site: B should be ≈0.2
        let b11 = samples[(1 * 4 + 1) * 3 + 2];
        assert!((b11 - 0.2).abs() < 0.01, "B at (1,1) ≈ 0.2, got {}", b11);
    }

    #[test]
    fn classifies_dng_separately_from_raw() {
        let adapter = DecodeAdapter::new();
        assert_eq!(
            adapter.classify_source("photo.dng").unwrap(),
            ImageFormat::Dng
        );
        assert_eq!(
            adapter.classify_source("photo.nef").unwrap(),
            ImageFormat::Raw
        );
    }
}
