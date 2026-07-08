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

#[test]
fn gpu_tone_range_controls_match_cpu_for_linear_samples() {
    let source = DecodedImageBuffer::linear_float(1, 5, vec![0.1, 0.25, 0.5, 0.75, 0.9]).unwrap();
    let recipe = Recipe::from_json_str(
        r#"{"version":1,"operations":[{"type":"shadows","params":{"amount":20}},{"type":"blacks","params":{"amount":-20}},{"type":"highlights","params":{"amount":-10}},{"type":"whites","params":{"amount":10}}]}"#,
    )
    .unwrap();
    let expected = CpuPipeline::new()
        .render(&source, &recipe, CpuRenderMode::Preview)
        .unwrap();
    let actual = pollster::block_on(GpuPipeline::new().render_exposure(&source, &recipe)).unwrap();

    assert_samples_close(actual.samples(), expected.buffer().samples());
    assert_samples_close(actual.samples(), &[0.166, 0.3, 0.5, 0.725, 0.901]);
}

#[test]
fn gpu_tone_curve_matches_cpu_for_linear_samples() {
    let source = DecodedImageBuffer::linear_float(1, 5, vec![0.0, 0.25, 0.5, 0.75, 1.0]).unwrap();
    let recipe = Recipe::from_json_str(
        r#"{"version":1,"operations":[{"type":"toneCurve","params":{"points":[[0,0],[0.5,0.6],[1,1]]}}]}"#,
    )
    .unwrap();
    let expected = CpuPipeline::new()
        .render(&source, &recipe, CpuRenderMode::Preview)
        .unwrap();
    let actual = pollster::block_on(GpuPipeline::new().render_exposure(&source, &recipe)).unwrap();

    assert_samples_close(actual.samples(), expected.buffer().samples());
    assert_samples_close(actual.samples(), &[0.0, 0.3, 0.6, 0.8, 1.0]);
}

#[test]
fn gpu_hsl_matches_cpu_for_red_rgb_samples() {
    let source =
        DecodedImageBuffer::linear_float(3, 1, vec![1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0])
            .unwrap();
    let recipe = Recipe::from_json_str(
        r#"{"version":1,"operations":[{"type":"hsl","params":{"range":"red","hue":30,"saturation":20,"luminance":-10}}]}"#,
    )
    .unwrap();
    let expected = CpuPipeline::new()
        .render(&source, &recipe, CpuRenderMode::Preview)
        .unwrap();
    let actual = pollster::block_on(GpuPipeline::new().render_exposure(&source, &recipe)).unwrap();

    assert_samples_close(actual.samples(), expected.buffer().samples());
    assert_samples_close(
        actual.samples(),
        &[0.9, 0.36, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0],
    );
}

#[test]
fn gpu_sharpening_matches_cpu_for_linear_samples() {
    let source = DecodedImageBuffer::linear_float(1, 3, vec![0.25, 0.5, 0.75]).unwrap();
    let recipe = Recipe::from_json_str(
        r#"{"version":1,"operations":[{"type":"sharpen","params":{"amount":20}}]}"#,
    )
    .unwrap();
    let expected = CpuPipeline::new()
        .render(&source, &recipe, CpuRenderMode::Preview)
        .unwrap();
    let actual = pollster::block_on(GpuPipeline::new().render_exposure(&source, &recipe)).unwrap();

    assert_samples_close(actual.samples(), expected.buffer().samples());
    assert_samples_close(actual.samples(), &[0.2, 0.5, 0.8]);
}
