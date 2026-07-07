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
