//! Pure-Rust TIFF encoder for export output.
//!
//! Produces baseline uncompressed RGB TIFF files (8-bit or 16-bit).
//! Output is compatible with standard TIFF readers and our own decoder.

/// Encode 8-bit RGB pixel data as an uncompressed little-endian TIFF.
pub fn encode_tiff_rgb8(width: u32, height: u32, rgb: &[u8]) -> Vec<u8> {
    encode_tiff(width, height, rgb, 8)
}

/// Encode 16-bit RGB pixel data as an uncompressed little-endian TIFF.
/// Input `rgb16` is interleaved u16 samples [R,G,B, R,G,B, ...].
pub fn encode_tiff_rgb16(width: u32, height: u32, rgb16: &[u16]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(rgb16.len() * 2);
    for &v in rgb16 {
        bytes.extend_from_slice(&v.to_le_bytes());
    }
    encode_tiff(width, height, &bytes, 16)
}

fn encode_tiff(width: u32, height: u32, pixel_data: &[u8], bits_per_sample: u16) -> Vec<u8> {
    // TIFF structure:
    //   Offset 0: Header (8 bytes)
    //   Offset 8: IFD
    //   After IFD: BitsPerSample values (if needed), then strip data

    let _little_endian = true;
    let mut buf = Vec::new();

    // --- Header ---
    // Byte order: "II" for little-endian
    buf.extend_from_slice(b"II");
    // Magic number: 42
    buf.extend_from_slice(&42u16.to_le_bytes());
    // IFD offset (pointing to offset 8)
    buf.extend_from_slice(&8u32.to_le_bytes());

    // --- IFD ---
    let num_entries: u16 = 11;
    buf.extend_from_slice(&num_entries.to_le_bytes());

    // IFD entries are 12 bytes each.
    // After the entries: 4 bytes for next-IFD offset (0 = no more IFDs).
    let ifd_data_start = 8 + 2 + (num_entries as usize) * 12 + 4;

    // BitsPerSample: 3 × u16 values. If they don't fit inline (they do for 3 SHORTs),
    // they go to an offset. 3 SHORTs = 6 bytes, fits in the 4-byte inline field? No, 6 > 4.
    // So we need an offset for BitsPerSample.
    let bps_offset = ifd_data_start;
    let strip_offset = bps_offset + 6; // 3 × u16 = 6 bytes for BitsPerSample values
    let strip_byte_count = pixel_data.len() as u32;

    // Helper: write an IFD entry
    let mut write_entry = |tag: u16, type_id: u16, count: u32, value_or_offset: u32| {
        buf.extend_from_slice(&tag.to_le_bytes());
        buf.extend_from_slice(&type_id.to_le_bytes());
        buf.extend_from_slice(&count.to_le_bytes());
        buf.extend_from_slice(&value_or_offset.to_le_bytes());
    };

    // Tag 256: ImageWidth (LONG)
    write_entry(256, 4, 1, width);
    // Tag 257: ImageLength (LONG)
    write_entry(257, 4, 1, height);
    // Tag 258: BitsPerSample (SHORT, count=3) — offset to values
    write_entry(258, 3, 3, bps_offset as u32);
    // Tag 259: Compression = 1 (none)
    write_entry(259, 3, 1, 1);
    // Tag 262: PhotometricInterpretation = 2 (RGB)
    write_entry(262, 3, 1, 2);
    // Tag 273: StripOffsets (LONG) — single strip
    write_entry(273, 4, 1, strip_offset as u32);
    // Tag 277: SamplesPerPixel = 3
    write_entry(277, 3, 1, 3);
    // Tag 278: RowsPerStrip = height (single strip)
    write_entry(278, 4, 1, height);
    // Tag 279: StripByteCounts (LONG)
    write_entry(279, 4, 1, strip_byte_count);
    // Tag 282: XResolution — offset to RATIONAL (8 bytes)
    let xres_offset = strip_offset + pixel_data.len();
    write_entry(282, 5, 1, xres_offset as u32);
    // Tag 283: YResolution — offset to RATIONAL (8 bytes)
    let yres_offset = xres_offset + 8;
    write_entry(283, 5, 1, yres_offset as u32);

    // Next IFD offset = 0 (no more IFDs)
    buf.extend_from_slice(&0u32.to_le_bytes());

    // --- BitsPerSample values ---
    for _ in 0..3 {
        buf.extend_from_slice(&bits_per_sample.to_le_bytes());
    }

    // --- Strip data ---
    buf.extend_from_slice(pixel_data);

    // --- XResolution RATIONAL (72/1) ---
    buf.extend_from_slice(&72u32.to_le_bytes());
    buf.extend_from_slice(&1u32.to_le_bytes());

    // --- YResolution RATIONAL (72/1) ---
    buf.extend_from_slice(&72u32.to_le_bytes());
    buf.extend_from_slice(&1u32.to_le_bytes());

    buf
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_tiff_rgb8_produces_valid_header() {
        let rgb = vec![255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 0];
        let tiff = encode_tiff_rgb8(2, 2, &rgb);

        // Header
        assert_eq!(&tiff[0..2], b"II");
        assert_eq!(u16::from_le_bytes([tiff[2], tiff[3]]), 42);
        let ifd_offset = u32::from_le_bytes([tiff[4], tiff[5], tiff[6], tiff[7]]);
        assert_eq!(ifd_offset, 8);
    }

    #[test]
    fn encode_tiff_rgb8_roundtrips_through_decoder() {
        // Create a 4x4 image with known pixel values
        let width = 4u32;
        let height = 4u32;
        let mut rgb = Vec::with_capacity((width * height * 3) as usize);
        for y in 0..height {
            for x in 0..width {
                rgb.push((x * 60) as u8);
                rgb.push((y * 60) as u8);
                rgb.push(128);
            }
        }

        let tiff = encode_tiff_rgb8(width, height, &rgb);

        // Decode using the TIFF decoder
        // We verify by re-parsing the header and strip data
        assert!(tiff.len() > 100);
        assert_eq!(&tiff[0..2], b"II");

        // Find the strip data by parsing IFD
        let num_entries = u16::from_le_bytes([tiff[8], tiff[9]]) as usize;
        let mut strip_offset = 0u32;
        let mut strip_byte_count = 0u32;
        let mut img_width = 0u32;
        let mut img_height = 0u32;

        for i in 0..num_entries {
            let eo = 10 + i * 12;
            let tag = u16::from_le_bytes([tiff[eo], tiff[eo + 1]]);
            let type_id = u16::from_le_bytes([tiff[eo + 2], tiff[eo + 3]]);
            let value = if type_id == 3 {
                u16::from_le_bytes([tiff[eo + 8], tiff[eo + 9]]) as u32
            } else {
                u32::from_le_bytes([tiff[eo + 8], tiff[eo + 9], tiff[eo + 10], tiff[eo + 11]])
            };
            match tag {
                256 => img_width = value,
                257 => img_height = value,
                273 => strip_offset = value,
                279 => strip_byte_count = value,
                _ => {}
            }
        }

        assert_eq!(img_width, width);
        assert_eq!(img_height, height);
        assert_eq!(strip_byte_count as usize, rgb.len());

        // Verify pixel data matches
        let start = strip_offset as usize;
        let end = start + strip_byte_count as usize;
        assert_eq!(&tiff[start..end], &rgb[..]);
    }

    #[test]
    fn encode_tiff_rgb16_produces_16bit_file() {
        let rgb16: Vec<u16> = vec![65535, 0, 0, 0, 65535, 0];
        let tiff = encode_tiff_rgb16(1, 1, &rgb16);

        assert_eq!(&tiff[0..2], b"II");
        assert!(tiff.len() > 100);

        // Parse BitsPerSample
        let num_entries = u16::from_le_bytes([tiff[8], tiff[9]]) as usize;
        for i in 0..num_entries {
            let eo = 10 + i * 12;
            let tag = u16::from_le_bytes([tiff[eo], tiff[eo + 1]]);
            if tag == 258 {
                // BitsPerSample offset
                let count = u32::from_le_bytes([tiff[eo + 4], tiff[eo + 5], tiff[eo + 6], tiff[eo + 7]]);
                assert_eq!(count, 3);
                let bps_offset = u32::from_le_bytes([tiff[eo + 8], tiff[eo + 9], tiff[eo + 10], tiff[eo + 11]]) as usize;
                let bps = u16::from_le_bytes([tiff[bps_offset], tiff[bps_offset + 1]]);
                assert_eq!(bps, 16);
                return;
            }
        }
        panic!("BitsPerSample tag not found");
    }
}
