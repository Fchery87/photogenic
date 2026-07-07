struct ExposureParams {
  multiplier: f32,
  sample_count: u32,
  _padding0: u32,
  _padding1: u32,
}

@group(0) @binding(0)
var<storage, read> input_samples: array<f32>;

@group(0) @binding(1)
var<storage, read_write> output_samples: array<f32>;

@group(0) @binding(2)
var<uniform> params: ExposureParams;

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= params.sample_count) {
    return;
  }
  output_samples[index] = input_samples[index] * params.multiplier;
}
