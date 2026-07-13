//! Pure-Rust DNG (Digital Negative) decoder.
//!
//! DNG is an open RAW format based on TIFF. This decoder supports
//! uncompressed DNG files with standard Bayer CFA patterns (RGGB, GBRG, BGGR, GRBG).
//!
//! Pipeline: TIFF container parse → CFA raw data extraction →
//! black/white level normalization → bilinear demosaicing → linear RGB.

use crate::core::image_buffer::DecodedImageBuffer;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Decoded DNG image parameters extracted from TIFF IFD tags.
#[derive(Debug)]
struct DngParameters {
    width: u32,
    height: u32,
    bits_per_sample: u16,
    strip_offset: usize,
    strip_byte_count: usize,
    little_endian: bool,
    // CFA pattern: 2x2 array of color indices (0=R, 1=G, 2=B)
    cfa_pattern: [[u8; 2]; 2],
    // Black and white levels for normalization
    black_level: f32,
    white_level: f32,
}

/// Decode an uncompressed DNG file into linear float RGB samples.
pub fn decode_dng(file_bytes: &[u8]) -> Result<DecodedImageBuffer, String> {
    let params = parse_dng_ifd(file_bytes)?;

    if params.width == 0 || params.height == 0 {
        return Err("DNG has zero dimensions".to_string());
    }

    // Sanity-check dimensions to prevent OOM from crafted DNGs
    let max_pixels = 100_000_000u32; // 100 megapixels
    if params.width.saturating_mul(params.height) > max_pixels {
        return Err(format!(
            "DNG dimensions {}x{} exceed maximum of {} pixels",
            params.width, params.height, max_pixels
        ));
    }

    // Read raw CFA sensor data
    let raw_samples = read_cfa_data(file_bytes, &params)?;

    // Normalize: subtract black level, scale to 0.0–1.0
    let normalized = normalize_samples(&raw_samples, &params);

    // Demosaic: interpolate missing color channels via bilinear interpolation
    let rgb = demosaic_bilinear(&normalized, params.width, params.height, &params.cfa_pattern);

    DecodedImageBuffer::linear_float(params.width, params.height, rgb)
        .map_err(|e| format!("DNG buffer creation failed: {e}"))
}

// ---------------------------------------------------------------------------
// TIFF IFD parsing for DNG tags
// ---------------------------------------------------------------------------

fn parse_dng_ifd(file_bytes: &[u8]) -> Result<DngParameters, String> {
    if file_bytes.len() < 8 {
        return Err("DNG file too short for header".to_string());
    }

    let le = match &file_bytes[0..2] {
        b"II" => true,
        b"MM" => false,
        _ => return Err("invalid DNG byte-order marker".to_string()),
    };

    let magic = tiff_u16(file_bytes, 2, le)?;
    // DNG uses the standard TIFF magic (42) or BigTIFF magic (43)
    if magic != 42 {
        return Err(format!("invalid DNG magic number: {}", magic));
    }

    let ifd_offset = tiff_u32(file_bytes, 4, le)? as usize;
    if ifd_offset + 2 > file_bytes.len() {
        return Err("DNG IFD offset out of bounds".to_string());
    }

    let entry_count = tiff_u16(file_bytes, ifd_offset, le)? as usize;

    let mut params = DngParameters {
        width: 0,
        height: 0,
        bits_per_sample: 16,
        strip_offset: 0,
        strip_byte_count: 0,
        little_endian: le,
        // Default RGGB Bayer pattern
        cfa_pattern: [[0, 1], [1, 2]],
        black_level: 0.0,
        white_level: 65535.0,
    };

    let mut cfa_dim: Option<(u16, u16)> = None;
    let mut cfa_pattern_bytes: Vec<u8> = Vec::new();

    for i in 0..entry_count {
        let eo = ifd_offset + 2 + i * 12;
        if eo + 12 > file_bytes.len() {
            break;
        }

        let tag = tiff_u16(file_bytes, eo, le)?;
        let type_id = tiff_u16(file_bytes, eo + 2, le)?;
        let count = tiff_u32(file_bytes, eo + 4, le)? as usize;

        let inline_u16 = || tiff_u16(file_bytes, eo + 8, le).unwrap_or(0);
        let inline_value = || -> u32 {
            if type_id == 3 {
                tiff_u16(file_bytes, eo + 8, le).unwrap_or(0) as u32
            } else {
                tiff_u32(file_bytes, eo + 8, le).unwrap_or(0)
            }
        };

        match tag {
            256 => params.width = inline_value(),                    // ImageWidth
            257 => params.height = inline_value(),                   // ImageLength
            258 => {
                // BitsPerSample
                params.bits_per_sample = if count > 2 {
                    let off = tiff_u32(file_bytes, eo + 8, le).unwrap_or(0) as usize;
                    tiff_u16(file_bytes, off, le).unwrap_or(16)
                } else {
                    inline_u16()
                };
            }
            259 => {
                let compression = inline_u16();
                if compression != 1 {
                    return Err(format!(
                        "DNG compression {} not supported (only uncompressed)",
                        compression
                    ));
                }
            }
            262 => {
                let photometric = inline_u16();
                // 32803 = CFA (Color Filter Array), 34892 = LinearRaw
                if photometric != 32803 && photometric != 34892 && photometric != 2 {
                    return Err(format!(
                        "DNG photometric interpretation {} not supported",
                        photometric
                    ));
                }
            }
            273 => params.strip_offset = inline_value() as usize,   // StripOffsets
            279 => params.strip_byte_count = inline_value() as usize, // StripByteCounts
            // CFARepeatPatternDim (TIFF-EP / DNG tag 33421)
            33421 => {
                let rows = tiff_u16(file_bytes, eo + 8, le).unwrap_or(2);
                let cols = tiff_u16(file_bytes, eo + 10, le).unwrap_or(2);
                cfa_dim = Some((rows, cols));
            }
            // CFAPattern (TIFF-EP / DNG tag 33422)
            33422 => {
                if count <= 4 && type_id == 1 {
                    // Inline BYTE values
                    cfa_pattern_bytes = (0..count)
                        .map(|j| file_bytes[eo + 8 + j])
                        .collect();
                } else if type_id == 1 {
                    // Offset to BYTE array
                    let off = inline_value() as usize;
                    cfa_pattern_bytes = (0..count)
                        .take_while(|&j| off + j < file_bytes.len())
                        .map(|j| file_bytes[off + j])
                        .collect();
                }
            }
            // BlackLevel (DNG tag 50714 = 0xC61A)
            50714 => {
                // Can be RATIONAL (type 5) or LONG/SHORT
                if type_id == 3 {
                    params.black_level = inline_u16() as f32;
                } else if type_id == 4 {
                    params.black_level = inline_value() as f32;
                } else if type_id == 5 {
                    // RATIONAL is always 8 bytes, stored at an external offset
                    let off = tiff_u32(file_bytes, eo + 8, le).unwrap_or(0) as usize;
                    let num = tiff_u32(file_bytes, off, le).unwrap_or(0) as f32;
                    let den = tiff_u32(file_bytes, off + 4, le).unwrap_or(1) as f32;
                    params.black_level = if den != 0.0 { num / den } else { 0.0 };
                }
            }
            // WhiteLevel (DNG tag 50717 = 0xC61D)
            50717 => {
                if type_id == 3 {
                    params.white_level = inline_u16() as f32;
                } else if type_id == 4 {
                    params.white_level = inline_value() as f32;
                }
            }
            // DNGVersion (tag 50706) — parse but don't require
            50706 => {
                let v = (0..4.min(count))
                    .map(|j| file_bytes[eo + 8 + j])
                    .collect::<Vec<_>>();
                // Store version for diagnostics — not critical for decode
                let _ = v;
            }
            _ => {}
        }
    }

    // Assemble CFA pattern from parsed bytes
    if cfa_pattern_bytes.len() >= 4 {
        params.cfa_pattern = [
            [cfa_pattern_bytes[0], cfa_pattern_bytes[1]],
            [cfa_pattern_bytes[2], cfa_pattern_bytes[3]],
        ];
    } else if let Some((rows, cols)) = cfa_dim {
        // Pattern dimensions present but no explicit pattern bytes
        // Default to RGGB for 2x2
        if rows == 2 && cols == 2 {
            params.cfa_pattern = [[0, 1], [1, 2]]; // RGGB
        }
    }

    if params.strip_byte_count == 0 {
        // Estimate from dimensions and bit depth
        let bytes_per_pixel = (params.bits_per_sample as usize + 7) / 8;
        params.strip_byte_count = (params.width as usize) * (params.height as usize) * bytes_per_pixel;
    }

    // Validate white level
    if params.white_level <= params.black_level {
        params.white_level = params.black_level + 1.0;
    }

    Ok(params)
}

// ---------------------------------------------------------------------------
// Raw CFA data extraction
// ---------------------------------------------------------------------------

fn read_cfa_data(file_bytes: &[u8], params: &DngParameters) -> Result<Vec<u16>, String> {
    let start = params.strip_offset;
    let end = start + params.strip_byte_count;

    if end > file_bytes.len() {
        return Err(format!(
            "DNG strip data extends past end of file ({}+{} > {})",
            start, params.strip_byte_count, file_bytes.len()
        ));
    }

    let pixel_count = (params.width as usize) * (params.height as usize);
    let mut samples = Vec::with_capacity(pixel_count);

    match params.bits_per_sample {
        8 => {
            let data = &file_bytes[start..start + pixel_count.min(params.strip_byte_count)];
            for &b in data {
                samples.push(b as u16 * 257); // Scale 8-bit to 16-bit range
            }
        }
        12 => {
            // 12-bit packed: 2 pixels in 3 bytes
            let data = &file_bytes[start..end];
            let mut i = 0;
            while i + 2 < data.len() && samples.len() < pixel_count {
                // Big-endian 12-bit packing (most common)
                samples.push(((data[i] as u16) << 4) | ((data[i + 1] as u16) >> 4));
                samples.push(((data[i + 1] as u16 & 0x0F) << 8) | data[i + 2] as u16);
                i += 3;
            }
        }
        14 => {
            // 14-bit stored in 16-bit containers (lower 14 bits used)
            let data = &file_bytes[start..end];
            let mut i = 0;
            while i + 1 < data.len() && samples.len() < pixel_count {
                let val = if params.little_endian {
                    u16::from_le_bytes([data[i], data[i + 1]])
                } else {
                    u16::from_be_bytes([data[i], data[i + 1]])
                };
                samples.push(val & 0x3FFF); // Mask to 14 bits
                i += 2;
            }
        }
        16 => {
            let data = &file_bytes[start..end];
            let mut i = 0;
            while i + 1 < data.len() && samples.len() < pixel_count {
                let val = if params.little_endian {
                    u16::from_le_bytes([data[i], data[i + 1]])
                } else {
                    u16::from_be_bytes([data[i], data[i + 1]])
                };
                samples.push(val);
                i += 2;
            }
        }
        bps => return Err(format!("unsupported DNG bits per sample: {}", bps)),
    }

    // Pad if needed
    while samples.len() < pixel_count {
        samples.push(0);
    }

    Ok(samples)
}

// ---------------------------------------------------------------------------
// Normalization
// ---------------------------------------------------------------------------

fn normalize_samples(raw: &[u16], params: &DngParameters) -> Vec<f32> {
    let black = params.black_level;
    let scale = 1.0 / (params.white_level - black);

    raw.iter()
        .map(|&v| {
            let f = v as f32;
            ((f - black) * scale).clamp(0.0, 1.0)
        })
        .collect()
}

// ---------------------------------------------------------------------------
// Bilinear demosaicing
// ---------------------------------------------------------------------------

/// Demosaic a single-channel CFA image into 3-channel RGB using bilinear interpolation.
///
/// CFA pattern indices: 0=Red, 1=Green, 2=Blue
fn demosaic_bilinear(
    samples: &[f32],
    width: u32,
    height: u32,
    cfa_pattern: &[[u8; 2]; 2],
) -> Vec<f32> {
    let w = width as usize;
    let h = height as usize;
    let mut rgb = vec![0.0f32; w * h * 3];

    // Determine color at each pixel position from the 2x2 CFA pattern
    let color_at = |x: usize, y: usize| -> u8 {
        cfa_pattern[y % 2][x % 2]
    };

    for y in 0..h {
        for x in 0..w {
            let idx = y * w + x;
            let color = color_at(x, y);
            let rgb_idx = idx * 3;

            match color {
                0 => {
                    // Red site: R is known
                    rgb[rgb_idx] = samples[idx];
                    // Interpolate G from 4-neighborhood
                    rgb[rgb_idx + 1] = interpolate_channel(samples, x, y, w, h, 1, &color_at);
                    // Interpolate B from 4 diagonal neighbors
                    rgb[rgb_idx + 2] = interpolate_diagonal(samples, x, y, w, h, 2, &color_at);
                }
                2 => {
                    // Blue site: B is known
                    rgb[rgb_idx + 2] = samples[idx];
                    // Interpolate G from 4-neighborhood
                    rgb[rgb_idx + 1] = interpolate_channel(samples, x, y, w, h, 1, &color_at);
                    // Interpolate R from 4 diagonal neighbors
                    rgb[rgb_idx] = interpolate_diagonal(samples, x, y, w, h, 0, &color_at);
                }
                1 => {
                    // Green site: G is known
                    rgb[rgb_idx + 1] = samples[idx];
                    // Determine if this is a "green in red row" or "green in blue row"
                    // Check horizontal neighbors
                    let left_color = if x > 0 { color_at(x - 1, y) } else { color_at(x + 1, y) };
                    if left_color == 0 {
                        // Green in red row: interpolate R horizontally, B vertically
                        rgb[rgb_idx] = interpolate_horizontal(samples, x, y, w, 0, &color_at);
                        rgb[rgb_idx + 2] = interpolate_vertical(samples, x, y, w, h, 2, &color_at);
                    } else {
                        // Green in blue row: interpolate B horizontally, R vertically
                        rgb[rgb_idx + 2] = interpolate_horizontal(samples, x, y, w, 2, &color_at);
                        rgb[rgb_idx] = interpolate_vertical(samples, x, y, w, h, 0, &color_at);
                    }
                }
                _ => {
                    // Unknown color, just copy
                    rgb[rgb_idx] = samples[idx];
                    rgb[rgb_idx + 1] = samples[idx];
                    rgb[rgb_idx + 2] = samples[idx];
                }
            }
        }
    }

    rgb
}

/// Interpolate a channel value at position (x,y) using 4-neighborhood averaging.
/// Only samples at positions matching `target_color` are used.
fn interpolate_channel(
    samples: &[f32],
    x: usize,
    y: usize,
    w: usize,
    h: usize,
    target_color: u8,
    color_at: &impl Fn(usize, usize) -> u8,
) -> f32 {
    let mut sum = 0.0;
    let mut count = 0;

    // 4-connected neighbors
    let neighbors = [(x.wrapping_sub(1), y), (x + 1, y), (x, y.wrapping_sub(1)), (x, y + 1)];

    for (nx, ny) in neighbors {
        if nx < w && ny < h && color_at(nx, ny) == target_color {
            sum += samples[ny * w + nx];
            count += 1;
        }
    }

    if count > 0 {
        sum / count as f32
    } else {
        0.0
    }
}

/// Interpolate a channel value using 4 diagonal neighbors.
fn interpolate_diagonal(
    samples: &[f32],
    x: usize,
    y: usize,
    w: usize,
    h: usize,
    target_color: u8,
    color_at: &impl Fn(usize, usize) -> u8,
) -> f32 {
    let mut sum = 0.0;
    let mut count = 0;

    let diagonals = [
        (x.wrapping_sub(1), y.wrapping_sub(1)),
        (x + 1, y.wrapping_sub(1)),
        (x.wrapping_sub(1), y + 1),
        (x + 1, y + 1),
    ];

    for (nx, ny) in diagonals {
        if nx < w && ny < h && color_at(nx, ny) == target_color {
            sum += samples[ny * w + nx];
            count += 1;
        }
    }

    if count > 0 {
        sum / count as f32
    } else {
        0.0
    }
}

/// Interpolate horizontally (left/right neighbors of the target color).
fn interpolate_horizontal(
    samples: &[f32],
    x: usize,
    y: usize,
    w: usize,
    target_color: u8,
    color_at: &impl Fn(usize, usize) -> u8,
) -> f32 {
    let mut sum = 0.0;
    let mut count = 0;

    if x > 0 && color_at(x - 1, y) == target_color {
        sum += samples[y * w + (x - 1)];
        count += 1;
    }
    if x + 1 < w && color_at(x + 1, y) == target_color {
        sum += samples[y * w + (x + 1)];
        count += 1;
    }

    if count > 0 { sum / count as f32 } else { 0.0 }
}

/// Interpolate vertically (top/bottom neighbors of the target color).
fn interpolate_vertical(
    samples: &[f32],
    x: usize,
    y: usize,
    w: usize,
    h: usize,
    target_color: u8,
    color_at: &impl Fn(usize, usize) -> u8,
) -> f32 {
    let mut sum = 0.0;
    let mut count = 0;

    if y > 0 && color_at(x, y - 1) == target_color {
        sum += samples[(y - 1) * w + x];
        count += 1;
    }
    if y + 1 < h && color_at(x, y + 1) == target_color {
        sum += samples[(y + 1) * w + x];
        count += 1;
    }

    if count > 0 { sum / count as f32 } else { 0.0 }
}

// ---------------------------------------------------------------------------
// TIFF helper functions (duplicated from decode.rs for module independence)
// ---------------------------------------------------------------------------

fn tiff_u16(bytes: &[u8], offset: usize, le: bool) -> Result<u16, String> {
    if offset + 2 > bytes.len() {
        return Err("TIFF read out of bounds".to_string());
    }
    Ok(if le {
        u16::from_le_bytes([bytes[offset], bytes[offset + 1]])
    } else {
        u16::from_be_bytes([bytes[offset], bytes[offset + 1]])
    })
}

fn tiff_u32(bytes: &[u8], offset: usize, le: bool) -> Result<u32, String> {
    if offset + 4 > bytes.len() {
        return Err("TIFF read out of bounds".to_string());
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn demosaic_solid_color_rggb() {
        // 4x4 CFA with uniform value (e.g., all samples = 0.5)
        // After demosaicing, all RGB should be ≈ 0.5
        let w = 4;
        let h = 4;
        let samples = vec![0.5f32; w * h];
        let cfa = [[0u8, 1u8], [1u8, 2u8]]; // RGGB
        let rgb = demosaic_bilinear(&samples, w as u32, h as u32, &cfa);

        assert_eq!(rgb.len(), w * h * 3);
        for i in 0..(w * h) {
            // All channels should be ≈ 0.5 (uniform input → uniform output)
            assert!((rgb[i * 3] - 0.5).abs() < 0.01, "R[{}] = {}", i, rgb[i * 3]);
            assert!((rgb[i * 3 + 1] - 0.5).abs() < 0.01, "G[{}] = {}", i, rgb[i * 3 + 1]);
            assert!((rgb[i * 3 + 2] - 0.5).abs() < 0.01, "B[{}] = {}", i, rgb[i * 3 + 2]);
        }
    }

    #[test]
    fn demosaic_preserves_known_channels() {
        // 4x4 RGGB pattern with distinct values per color
        let w = 4;
        let h = 4;
        let mut samples = vec![0.0f32; w * h];
        // RGGB:
        // R G R G
        // G B G B
        // R G R G
        // G B G B
        for y in 0..h {
            for x in 0..w {
                let color = [[0, 1], [1, 2]][y % 2][x % 2];
                samples[y * w + x] = match color {
                    0 => 0.8, // Red
                    1 => 0.4, // Green
                    2 => 0.2, // Blue
                    _ => 0.0,
                };
            }
        }
        let cfa = [[0u8, 1u8], [1u8, 2u8]];
        let rgb = demosaic_bilinear(&samples, w as u32, h as u32, &cfa);

        // Red sites (0,0), (2,0), (0,2), (2,2): R should be 0.8
        let r00 = rgb[(0 * w + 0) * 3];
        assert!((r00 - 0.8).abs() < 0.001, "R at (0,0) should be 0.8, got {}", r00);

        // Blue sites (1,1), (3,1), (1,3), (3,3): B should be 0.2
        let b11 = rgb[(1 * w + 1) * 3 + 2];
        assert!((b11 - 0.2).abs() < 0.001, "B at (1,1) should be 0.2, got {}", b11);

        // Green sites: G should be 0.4
        let g01 = rgb[(0 * w + 1) * 3 + 1];
        assert!((g01 - 0.4).abs() < 0.001, "G at (0,1) should be 0.4, got {}", g01);
    }

    #[test]
    fn normalize_handles_black_and_white_levels() {
        let raw = vec![0u16, 1000, 32768, 65535];
        let params = DngParameters {
            width: 2,
            height: 2,
            bits_per_sample: 16,
            strip_offset: 0,
            strip_byte_count: 8,
            little_endian: true,
            cfa_pattern: [[0, 1], [1, 2]],
            black_level: 1000.0,
            white_level: 65535.0,
        };
        let normalized = normalize_samples(&raw, &params);

        // raw[0] = 0, below black level → clamped to 0.0
        assert!((normalized[0] - 0.0).abs() < 0.001);
        // raw[1] = 1000 = black level → 0.0
        assert!((normalized[1] - 0.0).abs() < 0.001);
        // raw[3] = 65535 = white level → 1.0
        assert!((normalized[3] - 1.0).abs() < 0.001);
    }
}
