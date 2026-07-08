use crate::core::color::apply_exposure_ev;
use crate::core::image_buffer::DecodedImageBuffer;
use crate::core::recipe::Recipe;
use serde_json::Value;
use std::error::Error;
use std::fmt;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CpuRenderMode {
    Preview,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CpuRenderResult {
    mode: CpuRenderMode,
    buffer: DecodedImageBuffer,
}

impl CpuRenderResult {
    pub fn mode(&self) -> CpuRenderMode {
        self.mode
    }

    pub fn buffer(&self) -> &DecodedImageBuffer {
        &self.buffer
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CpuPipelineErrorKind {
    UnsupportedStorage,
    InvalidOutput,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CpuPipelineError {
    kind: CpuPipelineErrorKind,
    message: String,
}

impl CpuPipelineError {
    fn new(kind: CpuPipelineErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn kind(&self) -> CpuPipelineErrorKind {
        self.kind
    }
}

impl fmt::Display for CpuPipelineError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl Error for CpuPipelineError {}

#[derive(Clone, Copy, Debug, Default)]
pub struct CpuPipeline;

impl CpuPipeline {
    pub fn new() -> Self {
        Self
    }

    pub fn render(
        &self,
        source: &DecodedImageBuffer,
        recipe: &Recipe,
        mode: CpuRenderMode,
    ) -> Result<CpuRenderResult, CpuPipelineError> {
        if source.samples().is_empty() {
            return Err(CpuPipelineError::new(
                CpuPipelineErrorKind::UnsupportedStorage,
                "CPU fallback requires linear float samples",
            ));
        }

        let exposure_ev = recipe
            .operations()
            .iter()
            .filter_map(exposure_ev_from_operation)
            .sum::<f32>();
        let white_balance = white_balance_from_recipe(recipe);
        let contrast_multiplier = contrast_multiplier_from_recipe(recipe);
        let samples = source
            .samples()
            .iter()
            .enumerate()
            .map(|(index, sample)| {
                apply_contrast(
                    apply_white_balance_channel(
                        apply_exposure_ev(*sample, exposure_ev),
                        index,
                        white_balance,
                    ),
                    contrast_multiplier,
                )
            })
            .collect();
        let buffer = DecodedImageBuffer::linear_float(source.width(), source.height(), samples)
            .map_err(|error| CpuPipelineError::new(CpuPipelineErrorKind::InvalidOutput, error))?;

        Ok(CpuRenderResult { mode, buffer })
    }
}

#[derive(Clone, Copy)]
struct WhiteBalance {
    red: f32,
    green: f32,
    blue: f32,
}

fn white_balance_from_recipe(recipe: &Recipe) -> WhiteBalance {
    let temperature_delta = recipe
        .operations()
        .iter()
        .filter_map(temperature_delta_from_operation)
        .sum::<f32>();
    let tint_amount = recipe
        .operations()
        .iter()
        .filter_map(tint_amount_from_operation)
        .sum::<f32>();

    WhiteBalance {
        red: 1.0 + temperature_delta / 10_000.0,
        green: 1.0 - tint_amount / 2_000.0,
        blue: 1.0 - temperature_delta / 10_000.0,
    }
}

fn apply_white_balance_channel(
    sample: f32,
    sample_index: usize,
    white_balance: WhiteBalance,
) -> f32 {
    match sample_index % 3 {
        0 => sample * white_balance.red,
        1 => sample * white_balance.green,
        _ => sample * white_balance.blue,
    }
}

fn contrast_multiplier_from_recipe(recipe: &Recipe) -> f32 {
    1.0 + recipe
        .operations()
        .iter()
        .filter_map(contrast_amount_from_operation)
        .sum::<f32>()
        / 100.0
}

fn apply_contrast(sample: f32, multiplier: f32) -> f32 {
    (sample - 0.5) * multiplier + 0.5
}

fn contrast_amount_from_operation(operation: &Value) -> Option<f32> {
    if operation.get("type").and_then(Value::as_str) != Some("contrast") {
        return None;
    }
    operation
        .get("params")
        .and_then(|params| params.get("amount"))
        .and_then(Value::as_f64)
        .map(|value| value as f32)
}

fn temperature_delta_from_operation(operation: &Value) -> Option<f32> {
    if operation.get("type").and_then(Value::as_str) != Some("temperature") {
        return None;
    }
    operation
        .get("params")
        .and_then(|params| params.get("kelvinDelta"))
        .and_then(Value::as_f64)
        .map(|value| value as f32)
}

fn tint_amount_from_operation(operation: &Value) -> Option<f32> {
    if operation.get("type").and_then(Value::as_str) != Some("tint") {
        return None;
    }
    operation
        .get("params")
        .and_then(|params| params.get("amount"))
        .and_then(Value::as_f64)
        .map(|value| value as f32)
}

fn exposure_ev_from_operation(operation: &Value) -> Option<f32> {
    if operation.get("type").and_then(Value::as_str) != Some("exposure") {
        return None;
    }
    operation
        .get("params")
        .and_then(|params| params.get("ev"))
        .and_then(Value::as_f64)
        .map(|value| value as f32)
}

#[cfg(test)]
mod tests {
    use super::{CpuPipeline, CpuRenderMode};
    use crate::core::image_buffer::{DecodedImageBuffer, PixelStorage};
    use crate::core::recipe::Recipe;

    #[test]
    fn scene_linear_buffer_stores_float_channels() {
        let buffer = DecodedImageBuffer::linear_float(2, 1, vec![0.25, 0.5, 0.75, 1.0]).unwrap();

        assert_eq!(buffer.storage(), PixelStorage::LinearFloat32);
        assert_eq!(buffer.width(), 2);
        assert_eq!(buffer.height(), 1);
        assert_eq!(buffer.samples(), &[0.25, 0.5, 0.75, 1.0]);
    }

    #[test]
    fn cpu_pipeline_applies_exposure_in_scene_linear_space() {
        let source = DecodedImageBuffer::linear_float(1, 1, vec![0.5]).unwrap();
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"exposure","params":{"ev":1}}]}"#,
        )
        .unwrap();
        let rendered = CpuPipeline::new()
            .render(&source, &recipe, CpuRenderMode::Preview)
            .unwrap();

        assert_eq!(rendered.mode(), CpuRenderMode::Preview);
        assert_eq!(rendered.buffer().samples(), &[1.0]);
    }

    #[test]
    fn cpu_pipeline_renders_preview_artifact_without_gpu() {
        let source = DecodedImageBuffer::linear_float(1, 1, vec![0.5]).unwrap();
        let recipe = Recipe::default();
        let rendered = CpuPipeline::new()
            .render(&source, &recipe, CpuRenderMode::Preview)
            .unwrap();

        assert_eq!(rendered.mode(), CpuRenderMode::Preview);
        assert_eq!(rendered.buffer().storage(), PixelStorage::LinearFloat32);
        assert_eq!(rendered.buffer().samples(), &[0.5]);
    }

    #[test]
    fn cpu_pipeline_applies_white_balance_temperature_and_tint() {
        let source = DecodedImageBuffer::linear_float(1, 1, vec![1.0, 1.0, 1.0]).unwrap();
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"temperature","params":{"kelvinDelta":1000}},{"type":"tint","params":{"amount":20}}]}"#,
        )
        .unwrap();
        let rendered = CpuPipeline::new()
            .render(&source, &recipe, CpuRenderMode::Preview)
            .unwrap();

        assert_eq!(rendered.buffer().samples(), &[1.1, 0.99, 0.9]);
    }

    #[test]
    fn cpu_pipeline_applies_contrast_around_midgray() {
        let source = DecodedImageBuffer::linear_float(1, 3, vec![0.25, 0.5, 0.75]).unwrap();
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"contrast","params":{"amount":20}}]}"#,
        )
        .unwrap();
        let rendered = CpuPipeline::new()
            .render(&source, &recipe, CpuRenderMode::Preview)
            .unwrap();

        assert_eq!(rendered.buffer().samples(), &[0.19999999, 0.5, 0.8]);
    }
}
