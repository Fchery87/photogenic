//! Pure-Rust baseline JPEG decoder (sequential, 8-bit, Huffman-coded).
//!
//! Supports the most common baseline JPEG profile used by cameras and image tools:
//! - SOF0 (baseline sequential)
//! - YCbCr colorspace with 4:4:4, 4:2:2, or 4:2:0 chroma subsampling
//! - Huffman entropy coding (DC + AC tables, up to 4 tables)
//! - Restart markers (RST0–RST7)
//! - Standard JFIF APP0 marker (parsed and skipped)
//!
//! Produces 8-bit RGB pixel data.

use std::io::{self, Read};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Decoded JPEG image as interleaved 8-bit RGB.
pub struct DecodedJpeg {
    pub width: u32,
    pub height: u32,
    /// Interleaved RGB bytes: [R,G,B, R,G,B, ...]
    pub rgb: Vec<u8>,
}

/// Decode baseline JPEG bytes into RGB pixel data.
pub fn decode_jpeg(data: &[u8]) -> Result<DecodedJpeg, String> {
    let mut decoder = JpegDecoder::new(data);
    decoder.decode()
}

// ---------------------------------------------------------------------------
// Internal decoder
// ---------------------------------------------------------------------------

struct JpegDecoder<'a> {
    data: &'a [u8],
    pos: usize,
    // Frame info
    width: u32,
    height: u32,
    components: Vec<Component>,
    max_h: u8,
    max_v: u8,
    // Huffman tables: index = (class << 1) | table_id; 0=DC0, 1=DC1, 2=AC0, 3=AC1
    huffman_tables: [Option<HuffmanTable>; 4],
    // Quantization tables: index 0–3
    quant_tables: [[u16; 64]; 4],
    quant_valid: [bool; 4],
    // Restart interval (0 = disabled)
    restart_interval: u32,
    // Decoded scan data (set during decode_scan)
    comp_samples: Vec<Vec<i16>>,
}

#[derive(Clone)]
struct Component {
    id: u8,
    h_sample: u8,
    v_sample: u8,
    quant_id: u8,
    dc_table: u8,
    ac_table: u8,
}

#[derive(Clone)]
struct HuffmanTable {
    // Lookup: given a code length and code value, map to a symbol
    // We use the canonical Huffman approach: sorted by (length, value)
    symbols: Vec<u8>,
    code_lengths: Vec<u8>,
    // Min code value for each length (1-16)
    min_code: [i32; 17],
    // Max code value for each length
    max_code: [i32; 17],
    // Symbol index offset for each length
    val_offset: [usize; 17],
}

// Bit reader for entropy-coded data
struct BitReader<'a> {
    data: &'a [u8],
    byte_pos: usize,
    bit_pos: u8, // 0-7, bits remaining in current byte
    current_byte: u8,
    // Restart marker support
    data_start: usize,
}

impl<'a> BitReader<'a> {
    fn new(data: &'a [u8], start: usize) -> Self {
        Self {
            data,
            byte_pos: start,
            bit_pos: 0,
            current_byte: 0,
            data_start: start,
        }
    }

    fn read_bit(&mut self) -> Result<u32, String> {
        if self.bit_pos == 0 {
            if self.byte_pos >= self.data.len() {
                return Err("unexpected end of entropy data".to_string());
            }
            self.current_byte = self.data[self.byte_pos];
            self.byte_pos += 1;
            // Handle byte stuffing: FF 00 → FF
            if self.current_byte == 0xFF {
                if self.byte_pos < self.data.len() {
                    let next = self.data[self.byte_pos];
                    if next == 0x00 {
                        // Stuffed FF, consume the 00
                        self.byte_pos += 1;
                    } else if (0xD0..=0xD7).contains(&next) {
                        // Restart marker (RST0–RST7): stop reading entropy data.
                        // The caller (decode_scan) handles skipping past the marker.
                        self.byte_pos -= 1; // back up to before the FF
                        return Err("restart-marker".to_string());
                    } else {
                        // EOI or other marker — end of entropy data
                        self.byte_pos -= 1; // back up to before the FF
                        return Err("marker encountered in entropy data".to_string());
                    }
                }
            }
            self.bit_pos = 8;
        }
        self.bit_pos -= 1;
        Ok(((self.current_byte >> self.bit_pos) & 1) as u32)
    }

    /// Read n bits (MSB first), returning the unsigned value.
    fn read_bits(&mut self, n: u32) -> Result<u32, String> {
        let mut val = 0u32;
        for _ in 0..n {
            val = (val << 1) | self.read_bit()?;
        }
        Ok(val)
    }

    /// Receive a value with `n` bits and extend sign for the magnitude category.
    fn receive_and_extend(&mut self, n: u32) -> Result<i32, String> {
        if n == 0 {
            return Ok(0);
        }
        let v = self.read_bits(n)? as i32;
        // Sign extension: if the MSB is 0, the value is negative
        let vt = 1 << (n - 1);
        if v < vt {
            Ok(v - (1 << n) + 1)
        } else {
            Ok(v)
        }
    }

    /// Check if we hit a restart marker (RST0-RST7 = FF D0 - FF D7)
    fn at_restart_marker(&self) -> bool {
        if self.byte_pos + 1 <= self.data.len() && self.byte_pos > 0 {
            // Check if the previous read stopped at a marker
        }
        if self.byte_pos < self.data.len() {
            if self.data[self.byte_pos.saturating_sub(1)] == 0xFF {
                if self.byte_pos < self.data.len() {
                    let m = self.data[self.byte_pos];
                    return (0xD0..=0xD7).contains(&m);
                }
            }
        }
        false
    }

    /// Reset bit position for restart marker
    fn restart(&mut self) {
        self.bit_pos = 0;
    }
}

impl<'a> JpegDecoder<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self {
            data,
            pos: 0,
            width: 0,
            height: 0,
            components: Vec::new(),
            max_h: 1,
            max_v: 1,
            huffman_tables: Default::default(),
            quant_tables: [[0; 64]; 4],
            quant_valid: [false; 4],
            restart_interval: 0,
            comp_samples: Vec::new(),
        }
    }

    fn decode(&mut self) -> Result<DecodedJpeg, String> {
        // Verify SOI
        let soi = self.read_u16()?;
        if soi != 0xFFD8 {
            return Err(format!("invalid SOI marker: 0x{:04X}", soi));
        }

        // Parse markers until we find SOS
        loop {
            let marker = self.read_u16()?;
            match marker {
                0xFFC0 => self.parse_sof0()?,
                0xFFC4 => self.parse_dht()?,
                0xFFDB => self.parse_dqt()?,
                0xFFDD => self.parse_dri()?,
                0xFFE0..=0xFFEF => self.skip_segment()?, // APPn
                0xFFFE => self.skip_segment()?,          // COM
                0xFFDA => {
                    // SOS - start of scan
                    self.parse_sos()?;
                    break;
                }
                _ => {
                    // Unknown marker — skip its payload if it has one
                    if marker >= 0xFFD0 && marker <= 0xFFD9 {
                        // Standalone markers (RST, SOI, EOI) have no payload
                        continue;
                    }
                    self.skip_segment()?;
                }
            }
        }

        // Sanity-check dimensions to prevent OOM from crafted JPEGs
        let max_pixels = 100_000_000u32; // 100 megapixels
        if self.width.saturating_mul(self.height) > max_pixels {
            return Err(format!(
                "JPEG dimensions {}x{} exceed maximum of {} pixels",
                self.width, self.height, max_pixels
            ));
        }

        // Decode entropy-coded data
        self.decode_scan()?;

        // Assemble final RGB image
        let rgb = self.assemble_rgb();

        Ok(DecodedJpeg {
            width: self.width,
            height: self.height,
            rgb,
        })
    }

    fn read_u8(&mut self) -> Result<u8, String> {
        if self.pos >= self.data.len() {
            return Err("unexpected end of JPEG data".to_string());
        }
        let v = self.data[self.pos];
        self.pos += 1;
        Ok(v)
    }

    fn read_u16(&mut self) -> Result<u16, String> {
        let hi = self.read_u8()?;
        let lo = self.read_u8()?;
        Ok(((hi as u16) << 8) | (lo as u16))
    }

    fn skip_segment(&mut self) -> Result<(), String> {
        let len = self.read_u16()? as usize;
        if len < 2 {
            return Err("invalid segment length".to_string());
        }
        self.pos += len - 2;
        if self.pos > self.data.len() {
            return Err("segment extends past end of data".to_string());
        }
        Ok(())
    }

    fn parse_sof0(&mut self) -> Result<(), String> {
        let _len = self.read_u16()?;
        let precision = self.read_u8()?;
        if precision != 8 {
            return Err(format!("unsupported sample precision: {}", precision));
        }
        self.height = self.read_u16()? as u32;
        self.width = self.read_u16()? as u32;
        let num_components = self.read_u8()?;

        if self.width == 0 || self.height == 0 {
            return Err("zero image dimensions in SOF0".to_string());
        }

        self.components.clear();
        self.max_h = 1;
        self.max_v = 1;

        for _ in 0..num_components {
            let id = self.read_u8()?;
            let sampling = self.read_u8()?;
            let h = (sampling >> 4) & 0x0F;
            let v = sampling & 0x0F;
            let quant_id = self.read_u8()?;
            if quant_id > 3 {
                return Err(format!("invalid quantization table ID in SOF0: {}", quant_id));
            }

            if h > self.max_h {
                self.max_h = h;
            }
            if v > self.max_v {
                self.max_v = v;
            }

            self.components.push(Component {
                id,
                h_sample: h,
                v_sample: v,
                quant_id,
                dc_table: 0,
                ac_table: 0,
            });
        }

        Ok(())
    }

    fn parse_dqt(&mut self) -> Result<(), String> {
        let len = self.read_u16()? as usize;
        if len < 2 {
            return Err("invalid DQT segment length".to_string());
        }
        let end = self.pos + len - 2;

        while self.pos < end {
            let pq_tq = self.read_u8()?;
            let precision = (pq_tq >> 4) & 0x0F;
            let table_id = (pq_tq & 0x0F) as usize;

            if table_id > 3 {
                return Err(format!("invalid quantization table ID: {}", table_id));
            }

            match precision {
                0 => {
                    // 8-bit values
                    for i in 0..64 {
                        self.quant_tables[table_id][i] = self.read_u8()? as u16;
                    }
                }
                1 => {
                    // 16-bit values
                    for i in 0..64 {
                        self.quant_tables[table_id][i] = self.read_u16()?;
                    }
                }
                _ => return Err(format!("invalid quantization precision: {}", precision)),
            }
            self.quant_valid[table_id] = true;
        }

        Ok(())
    }

    fn parse_dht(&mut self) -> Result<(), String> {
        let len = self.read_u16()? as usize;
        if len < 2 {
            return Err("invalid DHT segment length".to_string());
        }
        let end = self.pos + len - 2;

        while self.pos < end {
            let tc_th = self.read_u8()?;
            let table_class = (tc_th >> 4) & 0x0F; // 0 = DC, 1 = AC
            let table_id = tc_th & 0x0F; // 0 or 1

            if table_class > 1 || table_id > 1 {
                return Err(format!(
                    "invalid Huffman table class {} id {}",
                    table_class, table_id
                ));
            }

            // Read 16 bytes: number of codes of each length (1-16)
            let mut counts = [0u8; 16];
            for i in 0..16 {
                counts[i] = self.read_u8()?;
            }

            let total_symbols: usize = counts.iter().map(|&c| c as usize).sum();

            // Read symbols
            let mut symbols = Vec::with_capacity(total_symbols);
            for _ in 0..total_symbols {
                symbols.push(self.read_u8()?);
            }

            let table = Self::build_huffman_table(&counts, &symbols);

            let index = (table_class as usize) * 2 + (table_id as usize);
            self.huffman_tables[index] = Some(table);
        }

        Ok(())
    }

    fn build_huffman_table(counts: &[u8; 16], symbols: &[u8]) -> HuffmanTable {
        // Generate canonical Huffman codes
        // Following JPEG spec Annex C
        let mut code_lengths = Vec::new();
        let mut code_values = Vec::new();

        let mut k = 0usize; // symbol index
        let mut code = 0u32;

        for length in 1..=16 {
            let count = counts[length - 1] as usize;
            for _ in 0..count {
                if k < symbols.len() {
                    code_lengths.push(length as u8);
                    code_values.push(symbols[k]);
                    k += 1;
                }
                code += 1;
            }
            code <<= 1;
        }

        // Build lookup tables for each code length
        let mut min_code = [0i32; 17];
        let mut max_code = [-1i32; 17];
        let mut val_offset = [0usize; 17];

        let mut symbol_index = 0usize;
        for length in 1..=16usize {
            let count = counts[length - 1] as usize;
            if count > 0 {
                val_offset[length] = symbol_index;
                // First code at this length
                // We need to compute the actual code value for the first symbol
                min_code[length] = 0; // Will be set below
            }
            symbol_index += count;
        }

        // Recompute properly: iterate through canonical codes
        let mut k2 = 0usize;
        let mut code2 = 0i32;
        for length in 1..=16usize {
            let count = counts[length - 1] as usize;
            if count > 0 {
                min_code[length] = code2;
                val_offset[length] = k2;
                max_code[length] = code2 + count as i32 - 1;
                code2 += count as i32;
            }
            code2 <<= 1;
        }

        HuffmanTable {
            symbols: code_values,
            code_lengths,
            min_code,
            max_code,
            val_offset,
        }
    }

    fn parse_dri(&mut self) -> Result<(), String> {
        let _len = self.read_u16()?;
        self.restart_interval = self.read_u16()? as u32;
        Ok(())
    }

    fn parse_sos(&mut self) -> Result<(), String> {
        let _len = self.read_u16()?;
        let num_components = self.read_u8()?;

        for _ in 0..num_components {
            let comp_id = self.read_u8()?;
            let tables = self.read_u8()?;
            let dc_table = (tables >> 4) & 0x0F;
            let ac_table = tables & 0x0F;
            if dc_table > 1 {
                return Err(format!("invalid DC table ID in SOS: {}", dc_table));
            }
            if ac_table > 1 {
                return Err(format!("invalid AC table ID in SOS: {}", ac_table));
            }

            // Assign table IDs to the matching component
            for comp in &mut self.components {
                if comp.id == comp_id {
                    comp.dc_table = dc_table;
                    comp.ac_table = ac_table;
                }
            }
        }

        // Skip 3 bytes: start of spectral selection, end of spectral selection, successive approximation
        let _ = self.read_u8()?;
        let _ = self.read_u8()?;
        let _ = self.read_u8()?;

        Ok(())
    }

    fn decode_scan(&mut self) -> Result<(), String> {
        let num_comp = self.components.len();

        // MCU dimensions in pixels
        let mcu_pixel_w = (self.max_h as usize) * 8;
        let mcu_pixel_h = (self.max_v as usize) * 8;

        // Number of MCUs
        let mcus_x = ((self.width as usize) + mcu_pixel_w - 1) / mcu_pixel_w;
        let mcus_y = ((self.height as usize) + mcu_pixel_h - 1) / mcu_pixel_h;

        // Allocate component sample buffers
        // Each component's full-resolution block grid
        let mut comp_samples: Vec<Vec<i16>> = Vec::with_capacity(num_comp);
        for comp in &self.components {
            let w_blocks = mcus_x * (comp.h_sample as usize);
            let h_blocks = mcus_y * (comp.v_sample as usize);
            comp_samples.push(vec![0i16; w_blocks * h_blocks * 64]);
        }

        let mut reader = BitReader::new(self.data, self.pos);
        let mut prev_dc = vec![0i32; num_comp];
        let mut mcu_count = 0u32;

        for my in 0..mcus_y {
            for mx in 0..mcus_x {
                // Check restart interval
                if self.restart_interval > 0 && mcu_count > 0 && mcu_count % self.restart_interval == 0 {
                    // Align to byte boundary and skip the 2-byte restart marker (FF Dx)
                    reader.restart();
                    prev_dc.iter_mut().for_each(|v| *v = 0);
                    // Skip past the restart marker: FF Dx
                    // The BitReader may have already consumed some bits from the
                    // byte containing FF. Re-sync by scanning for the next FF Dx marker.
                    // Simplest approach: advance byte_pos past the 2-byte marker.
                    while reader.byte_pos + 1 < reader.data.len() {
                        if reader.data[reader.byte_pos] == 0xFF
                            && (0xD0..=0xD7).contains(&reader.data[reader.byte_pos + 1])
                        {
                            reader.byte_pos += 2;
                            break;
                        }
                        reader.byte_pos += 1;
                    }
                }
                mcu_count += 1;

                for ci in 0..num_comp {
                    let comp = &self.components[ci];
                    for by in 0..(comp.v_sample as usize) {
                        for bx in 0..(comp.h_sample as usize) {
                            // Block index within this component's buffer
                            let block_x = mx * (comp.h_sample as usize) + bx;
                            let block_y = my * (comp.v_sample as usize) + by;
                            let w_blocks = mcus_x * (comp.h_sample as usize);
                            let block_idx = (block_y * w_blocks + block_x) * 64;

                            let dc_table_idx = (comp.dc_table as usize);
                            let ac_table_idx = 2 + (comp.ac_table as usize);
                            let quant_id = comp.quant_id as usize;

                            // Decode one 8x8 block
                            let block = self.decode_block(
                                &mut reader,
                                dc_table_idx,
                                ac_table_idx,
                                quant_id,
                                &mut prev_dc[ci],
                            )?;

                            // Store in component buffer
                            for i in 0..64 {
                                comp_samples[ci][block_idx + i] = block[i];
                            }
                        }
                    }
                }
            }
        }

        // Store component samples for assembly
        self.comp_samples = comp_samples;

        Ok(())
    }

    fn decode_block(
        &self,
        reader: &mut BitReader,
        dc_table_idx: usize,
        ac_table_idx: usize,
        quant_id: usize,
        prev_dc: &mut i32,
    ) -> Result<[i16; 64], String> {
        let mut block = [0i16; 64];

        let dc_table = self.huffman_tables[dc_table_idx]
            .as_ref()
            .ok_or_else(|| format!("missing DC Huffman table {}", dc_table_idx))?;
        let ac_table = self.huffman_tables[ac_table_idx]
            .as_ref()
            .ok_or_else(|| format!("missing AC Huffman table {}", ac_table_idx))?;

        if !self.quant_valid[quant_id] {
            return Err(format!("missing quantization table {}", quant_id));
        }
        let quant = &self.quant_tables[quant_id];

        // --- DC coefficient ---
        let dc_category = self.decode_huffman(reader, dc_table)? as u32;
        let dc_diff = reader.receive_and_extend(dc_category)?;
        *prev_dc += dc_diff;

        // Dequantize DC
        let zigzag0 = ZIGZAG[0];
        block[zigzag0] = (*prev_dc * quant[0] as i32) as i16;

        // --- AC coefficients ---
        let mut k = 1usize;
        while k < 64 {
            let rs = self.decode_huffman(reader, ac_table)?;
            let run = (rs >> 4) & 0x0F;
            let size = (rs & 0x0F) as u32;

            if size == 0 {
                if run == 0 {
                    // EOB — rest of block is zero
                    break;
                } else if run == 15 {
                    // ZRL — skip 16 zeros
                    k += 16;
                    continue;
                } else {
                    return Err(format!("invalid AC Huffman symbol: 0x{:02X}", rs));
                }
            }

            k += run as usize;
            if k >= 64 {
                // Consume the bits to keep the bit reader aligned
                let _ = reader.receive_and_extend(size)?;
                break;
            }

            let ac_val = reader.receive_and_extend(size)?;
            let zigzag_idx = ZIGZAG[k];
            block[zigzag_idx] = (ac_val * quant[k] as i32) as i16;
            k += 1;
        }

        // Apply IDCT
        let mut spatial = [0.0f32; 64];
        idct_8x8(&block, &mut spatial);

        // Level shift (+128) and clamp
        for i in 0..64 {
            let val = spatial[i] + 128.0;
            block[i] = val.round().clamp(0.0, 255.0) as i16;
        }

        Ok(block)
    }

    fn decode_huffman(&self, reader: &mut BitReader, table: &HuffmanTable) -> Result<u8, String> {
        let mut code = 0i32;
        for length in 1..=16usize {
            code = (code << 1) | reader.read_bit()? as i32;
            if code <= table.max_code[length] {
                let offset = table.val_offset[length] + (code - table.min_code[length]) as usize;
                if offset < table.symbols.len() {
                    return Ok(table.symbols[offset]);
                }
            }
        }
        Err("Huffman decode failed: no matching code".to_string())
    }

    fn assemble_rgb(&self) -> Vec<u8> {
        let w = self.width as usize;
        let h = self.height as usize;
        let mut rgb = vec![0u8; w * h * 3];

        let num_comp = self.components.len();
        // Compute MCU grid from component sample buffers
        let mcus_x = if self.max_h > 0 {
            (w + (self.max_h as usize) * 8 - 1) / ((self.max_h as usize) * 8)
        } else {
            1
        };
        let mcus_y = if self.max_v > 0 {
            (h + (self.max_v as usize) * 8 - 1) / ((self.max_v as usize) * 8)
        } else {
            1
        };

        for ci in 0..self.components.len() {
            let comp = &self.components[ci];
            let comp_w_blocks = mcus_x * (comp.h_sample as usize);
            let comp_h_blocks = mcus_y * (comp.v_sample as usize);
            // Each sample block is 8x8
            let comp_w = comp_w_blocks * 8;
            let comp_h = comp_h_blocks * 8;
            let samples = &self.comp_samples[ci];

            // For each pixel in the full image
            for y in 0..h {
                for x in 0..w {
                    // Map to component coordinates (with subsampling)
                    let cx = (x * comp.h_sample as usize) / self.max_h as usize;
                    let cy = (y * comp.v_sample as usize) / self.max_v as usize;

                    if cx >= comp_w || cy >= comp_h {
                        continue;
                    }

                    let block_x = cx / 8;
                    let block_y = cy / 8;
                    let px = cx % 8;
                    let py = cy % 8;
                    let block_idx = (block_y * comp_w_blocks + block_x) * 64;
                    let sample = samples[block_idx + py * 8 + px] as f32;

                    // Store per-component
                    let rgb_idx = (y * w + x) * 3;
                    match ci {
                        0 => rgb[rgb_idx] = sample as u8,     // Y
                        1 => rgb[rgb_idx + 2] = sample as u8, // Cb → B slot temporarily
                        2 => rgb[rgb_idx + 1] = sample as u8, // Cr → G slot temporarily
                        _ => {}
                    }
                }
            }
        }

        // Grayscale JPEG (1 component): replicate Y to R,G,B directly
        if self.components.len() == 1 {
            for i in 0..(w * h) {
                let y = rgb[i * 3] as u8;
                rgb[i * 3 + 1] = y;
                rgb[i * 3 + 2] = y;
            }
            return rgb;
        }

        // Convert YCbCr → RGB in place
        for i in 0..(w * h) {
            let y = rgb[i * 3] as f32;
            let cb = rgb[i * 3 + 2] as f32;
            let cr = rgb[i * 3 + 1] as f32;

            let r = y + 1.402 * (cr - 128.0);
            let g = y - 0.344136 * (cb - 128.0) - 0.714136 * (cr - 128.0);
            let b = y + 1.772 * (cb - 128.0);

            rgb[i * 3] = r.round().clamp(0.0, 255.0) as u8;
            rgb[i * 3 + 1] = g.round().clamp(0.0, 255.0) as u8;
            rgb[i * 3 + 2] = b.round().clamp(0.0, 255.0) as u8;
        }

        rgb
    }
}


// ---------------------------------------------------------------------------
// IDCT (Inverse Discrete Cosine Transform) — 8x8
// ---------------------------------------------------------------------------

fn idct_8x8(input: &[i16; 64], output: &mut [f32; 64]) {
    // Standard IDCT using floating-point arithmetic
    // Formula: f(x,y) = (1/4) * sum_{u=0}^{7} sum_{v=0}^{7} C(u)*C(v)*F(u,v)*cos(...)
    // We use the AAN (Arai, Agui, Nakajima) algorithm for efficiency.

    // Row transform
    let mut rows = [[0.0f32; 8]; 8];
    for i in 0..8 {
        let row = [
            input[i * 8] as f32,
            input[i * 8 + 1] as f32,
            input[i * 8 + 2] as f32,
            input[i * 8 + 3] as f32,
            input[i * 8 + 4] as f32,
            input[i * 8 + 5] as f32,
            input[i * 8 + 6] as f32,
            input[i * 8 + 7] as f32,
        ];
        idct_1d(&row, &mut rows[i]);
    }

    // Column transform
    for j in 0..8 {
        let mut col = [0.0f32; 8];
        for i in 0..8 {
            col[i] = rows[i][j];
        }
        let mut result = [0.0f32; 8];
        idct_1d(&col, &mut result);
        for i in 0..8 {
            output[i * 8 + j] = result[i];
        }
    }
}

fn idct_1d(input: &[f32; 8], output: &mut [f32; 8]) {
    // Using the straightforward O(N^2) IDCT for 8 points
    // x(n) = sum_{k=0}^{N-1} X(k) * C(k) * cos(pi*(2n+1)*k / (2N))
    // where C(0) = sqrt(1/N), C(k) = sqrt(2/N) for k > 0
    let pi_over_2n = std::f32::consts::PI / 16.0; // 2*N where N=8

    for n in 0..8 {
        let mut sum = 0.0f32;
        for k in 0..8 {
            let c = if k == 0 {
                (1.0f32 / 8.0).sqrt()
            } else {
                (2.0f32 / 8.0).sqrt()
            };
            sum += c * input[k] * ((2 * n + 1) as f32 * k as f32 * pi_over_2n).cos();
        }
        output[n] = sum;
    }
}

// JPEG zigzag scan order
const ZIGZAG: [usize; 64] = [
    0, 1, 8, 16, 9, 2, 3, 10,
    17, 24, 32, 25, 18, 11, 4, 5,
    12, 19, 26, 33, 40, 48, 41, 34,
    27, 20, 13, 6, 7, 14, 21, 28,
    35, 42, 49, 56, 57, 50, 43, 36,
    29, 22, 15, 23, 30, 37, 44, 51,
    58, 59, 52, 45, 38, 31, 39, 46,
    53, 60, 61, 54, 47, 55, 62, 63,
];

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idct_dc_only_block_produces_uniform_spatial_values() {
        // DC coefficient = 80, all AC = 0
        // Expected spatial value = 80 / 8 = 10.0 per pixel (before level shift)
        let mut input = [0i16; 64];
        input[0] = 80;
        let mut output = [0.0f32; 64];
        idct_8x8(&input, &mut output);
        for i in 0..64 {
            assert!((output[i] - 10.0).abs() < 0.01, "pixel {} = {}, expected 10.0", i, output[i]);
        }
    }

    #[test]
    fn idct_zero_block_produces_zero() {
        let input = [0i16; 64];
        let mut output = [0.0f32; 64];
        idct_8x8(&input, &mut output);
        for i in 0..64 {
            assert!(output[i].abs() < 0.001, "pixel {} = {}, expected 0", i, output[i]);
        }
    }

    #[test]
    fn decode_minimal_solid_gray_jpeg() {
        // The test-gray.jpeg fixture is 8x8 solid gray (value 128)
        let data = std::fs::read(
            std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("..")
                .join("test")
                .join("fixtures")
                .join("images")
                .join("test-gray.jpeg"),
        )
        .unwrap();

        let decoded = decode_jpeg(&data).unwrap();
        assert_eq!(decoded.width, 8);
        assert_eq!(decoded.height, 8);
        assert_eq!(decoded.rgb.len(), 8 * 8 * 3);

        // All pixels should be ≈ 128 (neutral gray)
        for i in 0..64 {
            let r = decoded.rgb[i * 3] as f32;
            let g = decoded.rgb[i * 3 + 1] as f32;
            let b = decoded.rgb[i * 3 + 2] as f32;
            assert!((r - 128.0).abs() < 5.0, "R[{}] = {}, expected ≈128", i, r);
            assert!((g - 128.0).abs() < 5.0, "G[{}] = {}, expected ≈128", i, g);
            assert!((b - 128.0).abs() < 5.0, "B[{}] = {}, expected ≈128", i, b);
        }
    }

    #[test]
    fn decode_rejects_invalid_jpeg_data() {
        let result = decode_jpeg(&[0x00, 0x01, 0x02]);
        assert!(result.is_err());
    }
}
