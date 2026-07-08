use crate::core::{CpuPipeline, CpuRenderMode, DecodedImageBuffer, Recipe};
use sha2::{Digest, Sha256};
use std::time::Instant;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct NativeFrameProvenance {
    pub source_file_id: String,
    pub recipe_fingerprint: String,
    pub frame_width: u32,
    pub frame_height: u32,
    pub transfer_method: String,
    pub frame_hash: String,
    pub render_duration_ms: u64,
}

pub fn measure_native_frame(
    source_file_id: impl Into<String>,
    width: u32,
    height: u32,
) -> Result<NativeFrameProvenance, String> {
    let source_file_id = source_file_id.into();
    if source_file_id.is_empty() {
        return Err("source file id is required".to_string());
    }
    if width == 0 || height == 0 {
        return Err("frame dimensions must be positive".to_string());
    }

    let recipe = Recipe::default();
    let samples = synthetic_frame_samples(width, height)?;
    let source = DecodedImageBuffer::linear_float(width, height, samples)?;
    let started = Instant::now();
    let rendered = CpuPipeline::new()
        .render(&source, &recipe, CpuRenderMode::Preview)
        .map_err(|error| error.to_string())?;
    let render_duration_ms = started.elapsed().as_millis() as u64;

    Ok(NativeFrameProvenance {
        source_file_id,
        recipe_fingerprint: recipe.fingerprint(),
        frame_width: rendered.buffer().width(),
        frame_height: rendered.buffer().height(),
        transfer_method: "cpu-linear-float32".to_string(),
        frame_hash: hash_f32_samples(rendered.buffer().samples()),
        render_duration_ms,
    })
}

fn synthetic_frame_samples(width: u32, height: u32) -> Result<Vec<f32>, String> {
    let sample_count = width
        .checked_mul(height)
        .ok_or_else(|| "frame dimensions are too large".to_string())? as usize;
    Ok((0..sample_count)
        .map(|index| (index as f32 + 1.0) / (sample_count as f32 + 1.0))
        .collect())
}

fn hash_f32_samples(samples: &[f32]) -> String {
    let mut hasher = Sha256::new();
    for sample in samples {
        hasher.update(sample.to_le_bytes());
    }
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::measure_native_frame;

    #[test]
    fn native_frame_provenance_includes_pipeline_identity_hash_and_duration() {
        let provenance = measure_native_frame("viewport-proof-native-frame", 2, 2).unwrap();

        assert_eq!(provenance.source_file_id, "viewport-proof-native-frame");
        assert_eq!(provenance.frame_width, 2);
        assert_eq!(provenance.frame_height, 2);
        assert_eq!(provenance.transfer_method, "cpu-linear-float32");
        assert_eq!(provenance.recipe_fingerprint.len(), 64);
        assert_eq!(provenance.frame_hash.len(), 64);
        assert!(provenance.render_duration_ms <= 60_000);
    }
}
