use crate::core::image_buffer::DecodedImageBuffer;
use std::io::Cursor;

pub fn decode_raw(file_bytes: &[u8]) -> Result<DecodedImageBuffer, String> {
    let mut reader = Cursor::new(file_bytes);
    let image = rawloader::decode(&mut reader)
        .map_err(|e| format!("RAW decode failed: {e}"))?;

    if image.width == 0 || image.height == 0 {
        return Err("RAW image has zero dimensions".to_string());
    }

    let max_pixels = 100_000_000u64;
    if image.width as u64 * image.height as u64 > max_pixels {
        return Err(format!(
            "RAW dimensions {}x{} exceed maximum of {} pixels",
            image.width, image.height, max_pixels
        ));
    }

    let raw_data = match image.data {
        rawloader::RawImageData::Integer(data) => data,
        rawloader::RawImageData::Float(data) => {
            let mut int_data = Vec::with_capacity(data.len());
            for f in data {
                int_data.push((f.clamp(0.0, 1.0) * 65535.0) as u16);
            }
            int_data
        }
    };

    let pixel_count = image.width as usize * image.height as usize;
    if raw_data.len() < pixel_count {
        return Err(format!(
            "RAW data too short: {} values for {} pixels",
            raw_data.len(),
            pixel_count
        ));
    }

    let black_levels = image.blacklevels;
    let white_levels = image.whitelevels;
    let cpp = image.cpp.max(1) as usize;

    let normalized = normalize_raw(&raw_data, pixel_count, cpp, &black_levels, &white_levels);

    let rgb = demosaic_with_cfa(
        &normalized,
        image.width as u32,
        image.height as u32,
        &image.cfa,
    );

    DecodedImageBuffer::linear_float(image.width as u32, image.height as u32, rgb)
        .map_err(|e| format!("RAW buffer creation failed: {e}"))
}

fn normalize_raw(
    raw_data: &[u16],
    pixel_count: usize,
    cpp: usize,
    black_levels: &[u16; 4],
    white_levels: &[u16; 4],
) -> Vec<f32> {
    let black = black_levels.iter().map(|&v| v as f32).sum::<f32>() / black_levels.len() as f32;

    let white = {
        let w: f32 =
            white_levels.iter().map(|&v| v as f32).sum::<f32>() / white_levels.len() as f32;
        if w <= black + 1.0 {
            black + 1.0
        } else {
            w
        }
    };

    let scale = 1.0 / (white - black);

    let mut normalized = Vec::with_capacity(pixel_count);

    if cpp >= 3 {
        let mut i = 0;
        while i + 2 < raw_data.len() && normalized.len() < pixel_count {
            let r = raw_data[i] as f32;
            let g = raw_data[i + 1] as f32;
            let b = raw_data[i + 2] as f32;
            normalized.push(((r - black) * scale).clamp(0.0, 1.0));
            normalized.push(((g - black) * scale).clamp(0.0, 1.0));
            normalized.push(((b - black) * scale).clamp(0.0, 1.0));
            i += cpp;
        }
    } else {
        for &v in raw_data.iter().take(pixel_count) {
            let f = v as f32;
            normalized.push(((f - black) * scale).clamp(0.0, 1.0));
        }
    }

    while normalized.len() < pixel_count {
        normalized.push(0.0);
    }

    normalized
}

fn demosaic_with_cfa(
    samples: &[f32],
    width: u32,
    height: u32,
    cfa: &rawloader::CFA,
) -> Vec<f32> {
    let w = width as usize;
    let h = height as usize;
    let mut rgb = vec![0.0f32; w * h * 3];

    let color_at = |x: usize, y: usize| -> u8 { cfa.color_at(x, y) as u8 };

    for y in 0..h {
        for x in 0..w {
            let idx = y * w + x;
            let color = color_at(x, y);
            let rgb_idx = idx * 3;

            match color {
                0 => {
                    rgb[rgb_idx] = samples[idx];
                    rgb[rgb_idx + 1] = interpolate_channel(samples, x, y, w, h, 1, &color_at);
                    rgb[rgb_idx + 2] = interpolate_diagonal(samples, x, y, w, h, 2, &color_at);
                }
                2 => {
                    rgb[rgb_idx + 2] = samples[idx];
                    rgb[rgb_idx + 1] = interpolate_channel(samples, x, y, w, h, 1, &color_at);
                    rgb[rgb_idx] = interpolate_diagonal(samples, x, y, w, h, 0, &color_at);
                }
                1 => {
                    rgb[rgb_idx + 1] = samples[idx];
                    let left_color = if x > 0 {
                        color_at(x - 1, y)
                    } else {
                        color_at(x + 1, y)
                    };
                    if left_color == 0 {
                        rgb[rgb_idx] =
                            interpolate_horizontal(samples, x, y, w, 0, &color_at);
                        rgb[rgb_idx + 2] =
                            interpolate_vertical(samples, x, y, w, h, 2, &color_at);
                    } else {
                        rgb[rgb_idx + 2] =
                            interpolate_horizontal(samples, x, y, w, 2, &color_at);
                        rgb[rgb_idx] =
                            interpolate_vertical(samples, x, y, w, h, 0, &color_at);
                    }
                }
                _ => {
                    rgb[rgb_idx] = samples[idx];
                    rgb[rgb_idx + 1] = samples[idx];
                    rgb[rgb_idx + 2] = samples[idx];
                }
            }
        }
    }

    rgb
}

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

    let neighbors = [
        (x.wrapping_sub(1), y),
        (x + 1, y),
        (x, y.wrapping_sub(1)),
        (x, y + 1),
    ];

    for (nx, ny) in neighbors {
        if nx < w && ny < h && color_at(nx, ny) == target_color {
            sum += samples[ny * w + nx];
            count += 1;
        }
    }

    if count > 0 { sum / count as f32 } else { 0.0 }
}

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

    if count > 0 { sum / count as f32 } else { 0.0 }
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_raw_basic() {
        let raw = vec![0u16, 1000, 32768, 65535];
        let pixel_count = 4;
        let bl = [1000u16; 4];
        let wl = [65535u16; 4];

        let normalized = normalize_raw(&raw, pixel_count, 1, &bl, &wl);

        assert!(normalized[0] <= 0.02);
        assert!((normalized[1] - 0.0).abs() < 0.01);
        assert!(normalized[3] >= 0.99);
    }

    #[test]
    fn demosaic_rggb_solid() {
        let w = 4;
        let h = 4;
        let samples: Vec<f32> = vec![0.5; w * h];
        let cfa = rawloader::CFA::new("RGGB");

        let rgb = demosaic_with_cfa(&samples, w as u32, h as u32, &cfa);

        assert_eq!(rgb.len(), w * h * 3);
        for i in 0..(w * h) {
            assert!((rgb[i * 3] - 0.5).abs() < 0.01, "R[{}] = {}", i, rgb[i * 3]);
            assert!(
                (rgb[i * 3 + 1] - 0.5).abs() < 0.01,
                "G[{}] = {}",
                i,
                rgb[i * 3 + 1]
            );
            assert!(
                (rgb[i * 3 + 2] - 0.5).abs() < 0.01,
                "B[{}] = {}",
                i,
                rgb[i * 3 + 2]
            );
        }
    }

    #[test]
    fn cfa_rggb_color_maps() {
        let cfa = rawloader::CFA::new("RGGB");
        assert_eq!(cfa.color_at(0, 0) as u8, 0);
        assert_eq!(cfa.color_at(1, 0) as u8, 1);
        assert_eq!(cfa.color_at(0, 1) as u8, 1);
        assert_eq!(cfa.color_at(1, 1) as u8, 2);
    }

    #[test]
    fn cfa_bggr_color_maps() {
        let cfa = rawloader::CFA::new("BGGR");
        assert_eq!(cfa.color_at(0, 0) as u8, 2);
        assert_eq!(cfa.color_at(1, 0) as u8, 1);
        assert_eq!(cfa.color_at(0, 1) as u8, 1);
        assert_eq!(cfa.color_at(1, 1) as u8, 0);
    }
}
