struct DevelopParams {
  exposure_multiplier: f32,
  sample_count: u32,
  red_multiplier: f32,
  green_multiplier: f32,
  blue_multiplier: f32,
  contrast_multiplier: f32,
  highlights_amount: f32,
  shadows_amount: f32,
  whites_amount: f32,
  blacks_amount: f32,
  _padding: u32,
}

@group(0) @binding(0)
var<storage, read> input_samples: array<f32>;

@group(0) @binding(1)
var<storage, read_write> output_samples: array<f32>;

@group(0) @binding(2)
var<uniform> params: DevelopParams;

fn white_balance_multiplier(index: u32) -> f32 {
  let channel = index % 3u;
  if (channel == 0u) {
    return params.red_multiplier;
  }
  if (channel == 1u) {
    return params.green_multiplier;
  }
  return params.blue_multiplier;
}

fn apply_contrast(sample: f32) -> f32 {
  return (sample - 0.5) * params.contrast_multiplier + 0.5;
}

fn apply_tone_ranges(sample: f32) -> f32 {
  var with_shadows = sample;
  if (with_shadows < 0.5) {
    with_shadows = with_shadows + params.shadows_amount / 100.0 * (0.5 - with_shadows);
  }

  var with_blacks = with_shadows;
  if (with_blacks < 0.25) {
    with_blacks = with_blacks + params.blacks_amount / 100.0 * (0.25 - with_blacks);
  }

  var with_highlights = with_blacks;
  if (with_highlights > 0.5) {
    with_highlights = with_highlights + params.highlights_amount / 100.0 * (1.0 - with_highlights);
  }

  var with_whites = with_highlights;
  if (with_whites > 0.75) {
    with_whites = with_whites + params.whites_amount / 100.0 * (1.0 - with_whites);
  }
  return with_whites;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let index = id.x;
  if (index >= params.sample_count) {
    return;
  }
  let exposed = input_samples[index] * params.exposure_multiplier;
  let balanced = exposed * white_balance_multiplier(index);
  output_samples[index] = apply_tone_ranges(apply_contrast(balanced));
}
