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
        let samples = source
            .samples()
            .iter()
            .map(|sample| apply_exposure_ev(*sample, exposure_ev))
            .collect();
        let buffer = DecodedImageBuffer::linear_float(source.width(), source.height(), samples)
            .map_err(|error| CpuPipelineError::new(CpuPipelineErrorKind::InvalidOutput, error))?;

        Ok(CpuRenderResult { mode, buffer })
    }
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
}
