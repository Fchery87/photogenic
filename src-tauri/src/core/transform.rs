use crate::core::image_buffer::DecodedImageBuffer;
use crate::core::recipe::Recipe;
use serde_json::Value;

pub fn apply_recipe_transforms(
    source: &DecodedImageBuffer,
    recipe: &Recipe,
) -> Result<DecodedImageBuffer, String> {
    let mut transformed = source.clone();
    for operation in recipe.operations() {
        match operation.get("type").and_then(Value::as_str) {
            Some("crop") => {
                transformed = apply_crop(&transformed, crop_from_operation(operation)?)?;
            }
            Some("rotate") => {
                transformed =
                    apply_rotate(&transformed, rotate_degrees_from_operation(operation)?)?;
            }
            Some("straighten") => {}
            _ => {}
        }
    }
    Ok(transformed)
}

#[derive(Clone, Copy)]
struct CropRect {
    x: f32,
    y: f32,
    w: f32,
    h: f32,
}

fn crop_from_operation(operation: &Value) -> Result<CropRect, String> {
    let params = operation
        .get("params")
        .ok_or_else(|| "crop params are required".to_string())?;
    Ok(CropRect {
        x: number_param(params, "x")?,
        y: number_param(params, "y")?,
        w: number_param_alias(params, "w", "width")?,
        h: number_param_alias(params, "h", "height")?,
    })
}

fn rotate_degrees_from_operation(operation: &Value) -> Result<i32, String> {
    let params = operation
        .get("params")
        .ok_or_else(|| "rotate params are required".to_string())?;
    Ok(number_param(params, "degrees")? as i32)
}

fn number_param(params: &Value, name: &str) -> Result<f32, String> {
    params
        .get(name)
        .and_then(Value::as_f64)
        .map(|value| value as f32)
        .ok_or_else(|| format!("transform param {name} must be numeric"))
}

fn number_param_alias(params: &Value, primary: &str, alias: &str) -> Result<f32, String> {
    if params.get(primary).is_some() {
        return number_param(params, primary);
    }
    number_param(params, alias)
}

fn apply_crop(source: &DecodedImageBuffer, crop: CropRect) -> Result<DecodedImageBuffer, String> {
    let channels = channel_count(source)?;
    let source_width = source.width() as usize;
    let source_height = source.height() as usize;
    let start_x = (crop.x * source.width() as f32).floor().max(0.0) as usize;
    let start_y = (crop.y * source.height() as f32).floor().max(0.0) as usize;
    let crop_width = (crop.w * source.width() as f32).round().max(1.0) as usize;
    let crop_height = (crop.h * source.height() as f32).round().max(1.0) as usize;
    let end_x = start_x.saturating_add(crop_width).min(source_width);
    let end_y = start_y.saturating_add(crop_height).min(source_height);
    if start_x >= end_x || start_y >= end_y {
        return Err("crop produces an empty image".to_string());
    }

    let output_width = end_x - start_x;
    let output_height = end_y - start_y;
    let mut samples = Vec::with_capacity(output_width * output_height * channels);
    for y in start_y..end_y {
        let row_start = (y * source_width + start_x) * channels;
        let row_end = row_start + output_width * channels;
        let row = source
            .samples()
            .get(row_start..row_end)
            .ok_or_else(|| "crop exceeds source sample bounds".to_string())?;
        samples.extend_from_slice(row);
    }

    DecodedImageBuffer::linear_float(output_width as u32, output_height as u32, samples)
}

fn apply_rotate(source: &DecodedImageBuffer, degrees: i32) -> Result<DecodedImageBuffer, String> {
    match degrees.rem_euclid(360) {
        0 => Ok(source.clone()),
        90 => rotate_clockwise(source),
        180 => rotate_180(source),
        270 => rotate_counter_clockwise(source),
        _ => Err("rotate degrees must be 0, 90, 180, or 270".to_string()),
    }
}

fn rotate_clockwise(source: &DecodedImageBuffer) -> Result<DecodedImageBuffer, String> {
    let channels = channel_count(source)?;
    let output_width = source.height() as usize;
    let output_height = source.width() as usize;
    let mut samples = Vec::with_capacity(source.samples().len());
    for y in 0..output_height {
        for x in 0..output_width {
            let source_x = y;
            let source_y = source.height() as usize - 1 - x;
            push_pixel(source, source_x, source_y, channels, &mut samples)?;
        }
    }
    DecodedImageBuffer::linear_float(output_width as u32, output_height as u32, samples)
}

fn rotate_180(source: &DecodedImageBuffer) -> Result<DecodedImageBuffer, String> {
    let channels = channel_count(source)?;
    let mut samples = Vec::with_capacity(source.samples().len());
    for y in (0..source.height() as usize).rev() {
        for x in (0..source.width() as usize).rev() {
            push_pixel(source, x, y, channels, &mut samples)?;
        }
    }
    DecodedImageBuffer::linear_float(source.width(), source.height(), samples)
}

fn rotate_counter_clockwise(source: &DecodedImageBuffer) -> Result<DecodedImageBuffer, String> {
    let channels = channel_count(source)?;
    let output_width = source.height() as usize;
    let output_height = source.width() as usize;
    let mut samples = Vec::with_capacity(source.samples().len());
    for y in 0..output_height {
        for x in 0..output_width {
            let source_x = source.width() as usize - 1 - y;
            let source_y = x;
            push_pixel(source, source_x, source_y, channels, &mut samples)?;
        }
    }
    DecodedImageBuffer::linear_float(output_width as u32, output_height as u32, samples)
}

fn push_pixel(
    source: &DecodedImageBuffer,
    x: usize,
    y: usize,
    channels: usize,
    samples: &mut Vec<f32>,
) -> Result<(), String> {
    let index = (y * source.width() as usize + x) * channels;
    let pixel = source
        .samples()
        .get(index..index + channels)
        .ok_or_else(|| "rotate exceeds source sample bounds".to_string())?;
    samples.extend_from_slice(pixel);
    Ok(())
}

fn channel_count(source: &DecodedImageBuffer) -> Result<usize, String> {
    let pixels = source.width() as usize * source.height() as usize;
    if pixels == 0 || source.samples().is_empty() || source.samples().len() % pixels != 0 {
        return Err("transform requires complete pixel samples".to_string());
    }
    Ok(source.samples().len() / pixels)
}
