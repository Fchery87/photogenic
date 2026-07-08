use super::GpuPipeline;
use crate::core::cpu_pipeline::{CpuPipeline, CpuRenderMode};
use crate::core::image_buffer::DecodedImageBuffer;
use crate::core::recipe::Recipe;

fn assert_samples_close(actual: &[f32], expected: &[f32]) {
    assert_eq!(actual.len(), expected.len());
    for (index, (actual, expected)) in actual.iter().zip(expected.iter()).enumerate() {
        assert!(
            (actual - expected).abs() <= 0.0001,
            "sample {index}: expected {expected}, got {actual}"
        );
    }
}

#[test]
fn gpu_exposure_matches_cpu_exposure_for_linear_samples() {
    let source = DecodedImageBuffer::linear_float(2, 2, vec![0.125, 0.25, 0.5, 1.0]).unwrap();
    let recipe = Recipe::from_json_str(
        r#"{"version":1,"operations":[{"type":"exposure","params":{"ev":1.5}}]}"#,
    )
    .unwrap();
    let expected = CpuPipeline::new()
        .render(&source, &recipe, CpuRenderMode::Preview)
        .unwrap();
    let actual = pollster::block_on(GpuPipeline::new().render_exposure(&source, &recipe)).unwrap();

    assert_eq!(actual.width(), source.width());
    assert_eq!(actual.height(), source.height());
    assert_samples_close(actual.samples(), expected.buffer().samples());
}

#[test]
fn gpu_white_balance_matches_cpu_white_balance_for_linear_rgb_samples() {
    let source =
        DecodedImageBuffer::linear_float(2, 1, vec![1.0, 1.0, 1.0, 0.5, 0.25, 0.125]).unwrap();
    let recipe = Recipe::from_json_str(
        r#"{"version":1,"operations":[{"type":"temperature","params":{"kelvinDelta":1000}},{"type":"tint","params":{"amount":20}}]}"#,
    )
    .unwrap();
    let expected = CpuPipeline::new()
        .render(&source, &recipe, CpuRenderMode::Preview)
        .unwrap();
    let actual = pollster::block_on(GpuPipeline::new().render_exposure(&source, &recipe)).unwrap();

    assert_samples_close(actual.samples(), expected.buffer().samples());
}

#[test]
fn gpu_contrast_matches_cpu_contrast_for_linear_samples() {
    let source = DecodedImageBuffer::linear_float(2, 2, vec![0.125, 0.25, 0.5, 0.875]).unwrap();
    let recipe = Recipe::from_json_str(
        r#"{"version":1,"operations":[{"type":"contrast","params":{"amount":20}}]}"#,
    )
    .unwrap();
    let expected = CpuPipeline::new()
        .render(&source, &recipe, CpuRenderMode::Preview)
        .unwrap();
    let actual = pollster::block_on(GpuPipeline::new().render_exposure(&source, &recipe)).unwrap();

    assert_samples_close(actual.samples(), expected.buffer().samples());
    assert_samples_close(actual.samples(), &[0.05, 0.19999999, 0.5, 0.95000005]);
}
