use crate::core::color::apply_exposure_ev;
use crate::core::image_buffer::DecodedImageBuffer;
use crate::core::recipe::Recipe;
use crate::core::transform::apply_recipe_transforms;
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
        let tone_ranges = tone_ranges_from_recipe(recipe);
        let tone_curve = tone_curve_from_recipe(recipe);
        let red_hsl = red_hsl_from_recipe(recipe);
        let sharpening_amount = sharpening_amount_from_recipe(recipe);
        let noise_reduction_amount = noise_reduction_amount_from_recipe(recipe);
        let developed_samples: Vec<f32> = source
            .samples()
            .iter()
            .enumerate()
            .map(|(index, sample)| {
                apply_tone_curve(
                    apply_tone_ranges(
                        apply_contrast(
                            apply_white_balance_channel(
                                apply_exposure_ev(*sample, exposure_ev),
                                index,
                                white_balance,
                            ),
                            contrast_multiplier,
                        ),
                        tone_ranges,
                    ),
                    tone_curve,
                )
            })
            .collect();
        let samples = apply_red_hsl_samples(source.samples(), &developed_samples, red_hsl)
            .into_iter()
            .map(|sample| apply_sharpening(sample, sharpening_amount))
            .map(|sample| apply_noise_reduction(sample, noise_reduction_amount))
            .collect();
        let developed_buffer =
            DecodedImageBuffer::linear_float(source.width(), source.height(), samples).map_err(
                |error| CpuPipelineError::new(CpuPipelineErrorKind::InvalidOutput, error),
            )?;
        let buffer = apply_recipe_transforms(&developed_buffer, recipe)
            .map_err(|error| CpuPipelineError::new(CpuPipelineErrorKind::InvalidOutput, error))?;

        Ok(CpuRenderResult { mode, buffer })
    }
}

fn sharpening_amount_from_recipe(recipe: &Recipe) -> f32 {
    recipe
        .operations()
        .iter()
        .filter_map(|operation| amount_from_operation(operation, "sharpen"))
        .sum()
}

fn apply_sharpening(sample: f32, amount: f32) -> f32 {
    sample + amount / 100.0 * (sample - 0.5)
}

fn noise_reduction_amount_from_recipe(recipe: &Recipe) -> f32 {
    recipe
        .operations()
        .iter()
        .filter_map(|operation| amount_from_operation(operation, "noiseReduction"))
        .sum()
}

fn apply_noise_reduction(sample: f32, amount: f32) -> f32 {
    sample + amount / 100.0 * (0.5 - sample)
}

#[derive(Clone, Copy)]
struct RedHslAdjustment {
    hue: f32,
    saturation: f32,
    luminance: f32,
}

fn red_hsl_from_recipe(recipe: &Recipe) -> RedHslAdjustment {
    let mut adjustment = RedHslAdjustment {
        hue: 0.0,
        saturation: 0.0,
        luminance: 0.0,
    };
    for operation in recipe.operations() {
        if operation.get("type").and_then(Value::as_str) != Some("hsl") {
            continue;
        }
        if operation
            .get("params")
            .and_then(|params| params.get("range"))
            .and_then(Value::as_str)
            != Some("red")
        {
            continue;
        }
        adjustment.hue += operation
            .get("params")
            .and_then(|params| params.get("hue"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0) as f32;
        adjustment.saturation += operation
            .get("params")
            .and_then(|params| params.get("saturation"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0) as f32;
        adjustment.luminance += operation
            .get("params")
            .and_then(|params| params.get("luminance"))
            .and_then(Value::as_f64)
            .unwrap_or(0.0) as f32;
    }
    adjustment
}

fn apply_red_hsl_samples(
    source_samples: &[f32],
    developed_samples: &[f32],
    adjustment: RedHslAdjustment,
) -> Vec<f32> {
    developed_samples
        .chunks(3)
        .zip(source_samples.chunks(3))
        .flat_map(|(developed, source)| {
            if source.len() < 3 || developed.len() < 3 || !is_red_dominant(source) {
                return developed.to_vec();
            }
            vec![
                developed[0] * (1.0 + adjustment.luminance / 100.0),
                developed[1] + adjustment.hue / 100.0 * (1.0 + adjustment.saturation / 100.0),
                developed[2],
            ]
        })
        .collect()
}

fn is_red_dominant(samples: &[f32]) -> bool {
    samples[0] > samples[1] && samples[0] > samples[2]
}

#[derive(Clone, Copy)]
struct ToneCurve {
    midpoint_y: f32,
}

fn tone_curve_from_recipe(recipe: &Recipe) -> ToneCurve {
    let midpoint_y = recipe
        .operations()
        .iter()
        .filter_map(tone_curve_midpoint_y_from_operation)
        .last()
        .unwrap_or(0.5);
    ToneCurve { midpoint_y }
}

fn apply_tone_curve(sample: f32, tone_curve: ToneCurve) -> f32 {
    if sample <= 0.5 {
        sample * (tone_curve.midpoint_y / 0.5)
    } else {
        tone_curve.midpoint_y + (sample - 0.5) * ((1.0 - tone_curve.midpoint_y) / 0.5)
    }
}

fn tone_curve_midpoint_y_from_operation(operation: &Value) -> Option<f32> {
    if operation.get("type").and_then(Value::as_str) != Some("toneCurve") {
        return None;
    }
    operation
        .get("params")
        .and_then(|params| params.get("points"))
        .and_then(Value::as_array)
        .and_then(|points| points.get(1))
        .and_then(Value::as_array)
        .and_then(|point| point.get(1))
        .and_then(Value::as_f64)
        .map(|value| value as f32)
}

#[derive(Clone, Copy)]
struct ToneRanges {
    highlights: f32,
    shadows: f32,
    whites: f32,
    blacks: f32,
}

fn tone_ranges_from_recipe(recipe: &Recipe) -> ToneRanges {
    ToneRanges {
        highlights: tone_range_amount_from_recipe(recipe, "highlights"),
        shadows: tone_range_amount_from_recipe(recipe, "shadows"),
        whites: tone_range_amount_from_recipe(recipe, "whites"),
        blacks: tone_range_amount_from_recipe(recipe, "blacks"),
    }
}

fn tone_range_amount_from_recipe(recipe: &Recipe, operation_type: &str) -> f32 {
    recipe
        .operations()
        .iter()
        .filter_map(|operation| amount_from_operation(operation, operation_type))
        .sum()
}

fn apply_tone_ranges(sample: f32, tone_ranges: ToneRanges) -> f32 {
    let with_shadows = if sample < 0.5 {
        sample + tone_ranges.shadows / 100.0 * (0.5 - sample)
    } else {
        sample
    };
    let with_blacks = if with_shadows < 0.25 {
        with_shadows + tone_ranges.blacks / 100.0 * (0.25 - with_shadows)
    } else {
        with_shadows
    };
    let with_highlights = if with_blacks > 0.5 {
        with_blacks + tone_ranges.highlights / 100.0 * (1.0 - with_blacks)
    } else {
        with_blacks
    };
    if with_highlights > 0.75 {
        with_highlights + tone_ranges.whites / 100.0 * (1.0 - with_highlights)
    } else {
        with_highlights
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
    amount_from_operation(operation, "contrast")
}

fn amount_from_operation(operation: &Value, operation_type: &str) -> Option<f32> {
    if operation.get("type").and_then(Value::as_str) != Some(operation_type) {
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

    /// Tolerance for comparing CPU-rendered samples against hand-computed
    /// reference values. Deliberately matches the GPU↔CPU parity tolerance
    /// (`GPU_CPU_SAMPLE_TOLERANCE` in gpu_pipeline_tests.rs) so a CPU golden
    /// value and a GPU render are held to the same absolute bound in the
    /// scene-linear 32-bit float working space (ADR-0008).
    const CPU_SAMPLE_TOLERANCE: f32 = 0.0001;

    fn assert_samples_close(actual: &[f32], expected: &[f32]) {
        assert_eq!(actual.len(), expected.len());
        for (index, (actual, expected)) in actual.iter().zip(expected.iter()).enumerate() {
            assert!(
                (actual - expected).abs() <= CPU_SAMPLE_TOLERANCE,
                "sample {index}: expected {expected}, got {actual}"
            );
        }
    }

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

    #[test]
    fn cpu_pipeline_applies_tone_range_controls() {
        let source =
            DecodedImageBuffer::linear_float(1, 5, vec![0.1, 0.25, 0.5, 0.75, 0.9]).unwrap();
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"shadows","params":{"amount":20}},{"type":"blacks","params":{"amount":-20}},{"type":"highlights","params":{"amount":-10}},{"type":"whites","params":{"amount":10}}]}"#,
        )
        .unwrap();
        let rendered = CpuPipeline::new()
            .render(&source, &recipe, CpuRenderMode::Preview)
            .unwrap();

        assert_samples_close(
            rendered.buffer().samples(),
            &[0.166, 0.3, 0.5, 0.725, 0.901],
        );
    }

    #[test]
    fn cpu_pipeline_applies_tone_curve_midpoint_interpolation() {
        let source =
            DecodedImageBuffer::linear_float(1, 5, vec![0.0, 0.25, 0.5, 0.75, 1.0]).unwrap();
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"toneCurve","params":{"points":[[0,0],[0.5,0.6],[1,1]]}}]}"#,
        )
        .unwrap();
        let rendered = CpuPipeline::new()
            .render(&source, &recipe, CpuRenderMode::Preview)
            .unwrap();

        assert_samples_close(rendered.buffer().samples(), &[0.0, 0.3, 0.6, 0.8, 1.0]);
    }

    #[test]
    fn cpu_pipeline_applies_red_hsl_adjustment_to_rgb_samples() {
        let source = DecodedImageBuffer::linear_float(
            3,
            1,
            vec![1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        )
        .unwrap();
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"hsl","params":{"range":"red","hue":30,"saturation":20,"luminance":-10}}]}"#,
        )
        .unwrap();
        let rendered = CpuPipeline::new()
            .render(&source, &recipe, CpuRenderMode::Preview)
            .unwrap();

        assert_samples_close(
            rendered.buffer().samples(),
            &[0.9, 0.36, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
        );
    }

    #[test]
    fn cpu_pipeline_applies_sharpening_detail_boost() {
        let source = DecodedImageBuffer::linear_float(1, 3, vec![0.25, 0.5, 0.75]).unwrap();
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"sharpen","params":{"amount":20}}]}"#,
        )
        .unwrap();
        let rendered = CpuPipeline::new()
            .render(&source, &recipe, CpuRenderMode::Preview)
            .unwrap();

        assert_samples_close(rendered.buffer().samples(), &[0.2, 0.5, 0.8]);
    }

    #[test]
    fn cpu_pipeline_applies_noise_reduction_smoothing() {
        let source = DecodedImageBuffer::linear_float(1, 3, vec![0.25, 0.5, 0.75]).unwrap();
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"noiseReduction","params":{"amount":20}}]}"#,
        )
        .unwrap();
        let rendered = CpuPipeline::new()
            .render(&source, &recipe, CpuRenderMode::Preview)
            .unwrap();

        assert_samples_close(rendered.buffer().samples(), &[0.3, 0.5, 0.7]);
    }

    #[test]
    fn cpu_pipeline_applies_normalized_crop() {
        let source =
            DecodedImageBuffer::linear_float(4, 2, vec![0.0, 0.1, 0.2, 0.3, 1.0, 1.1, 1.2, 1.3])
                .unwrap();
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"crop","params":{"x":0.25,"y":0,"w":0.5,"h":1}}]}"#,
        )
        .unwrap();
        let rendered = CpuPipeline::new()
            .render(&source, &recipe, CpuRenderMode::Preview)
            .unwrap();

        assert_eq!(rendered.buffer().width(), 2);
        assert_eq!(rendered.buffer().height(), 2);
        assert_samples_close(rendered.buffer().samples(), &[0.1, 0.2, 1.1, 1.2]);
    }

    #[test]
    fn cpu_pipeline_applies_right_angle_rotation() {
        let source =
            DecodedImageBuffer::linear_float(2, 3, vec![0.0, 0.1, 1.0, 1.1, 2.0, 2.1]).unwrap();
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"rotate","params":{"degrees":90}}]}"#,
        )
        .unwrap();
        let rendered = CpuPipeline::new()
            .render(&source, &recipe, CpuRenderMode::Preview)
            .unwrap();

        assert_eq!(rendered.buffer().width(), 3);
        assert_eq!(rendered.buffer().height(), 2);
        assert_samples_close(rendered.buffer().samples(), &[2.0, 1.0, 0.0, 2.1, 1.1, 0.1]);
    }

    #[test]
    fn cpu_pipeline_validates_straighten_as_noop_transform() {
        let source = DecodedImageBuffer::linear_float(2, 2, vec![0.0, 0.1, 1.0, 1.1]).unwrap();
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"straighten","params":{"angle":-1.5}}]}"#,
        )
        .unwrap();
        let rendered = CpuPipeline::new()
            .render(&source, &recipe, CpuRenderMode::Preview)
            .unwrap();

        assert_eq!(rendered.buffer().width(), 2);
        assert_eq!(rendered.buffer().height(), 2);
        assert_samples_close(rendered.buffer().samples(), source.samples());
    }
}
