use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::WebviewWindow;

pub mod core;
pub mod catalog;
pub mod viewport;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ViewportProofMetrics {
  #[serde(skip_serializing_if = "Option::is_none")]
  physical_width: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  physical_height: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  scale_factor: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  frame_count: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  duration_ms: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  source_file_id: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  recipe_fingerprint: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  frame_width: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  frame_height: Option<u32>,
  #[serde(skip_serializing_if = "Option::is_none")]
  transfer_method: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  frame_hash: Option<String>,
  #[serde(skip_serializing_if = "Option::is_none")]
  render_duration_ms: Option<u64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  red: Option<u8>,
  #[serde(skip_serializing_if = "Option::is_none")]
  green: Option<u8>,
  #[serde(skip_serializing_if = "Option::is_none")]
  blue: Option<u8>,
  #[serde(skip_serializing_if = "Option::is_none")]
  alpha: Option<u8>,
}

#[derive(Serialize)]
struct ViewportProofResult {
  id: &'static str,
  passed: bool,
  #[serde(skip_serializing_if = "Option::is_none")]
  fps: Option<f64>,
  #[serde(skip_serializing_if = "Option::is_none")]
  metrics: Option<ViewportProofMetrics>,
  note: String,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
enum PipelineRenderMode {
  Preview,
  Export,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PipelineRenderSource {
  image_id: String,
  path: Option<String>,
  revision: Option<String>,
  width: u32,
  height: u32,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PipelineRenderSourceIdentity {
  image_id: String,
  path: Option<String>,
  revision: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PipelineRenderOutput {
  width: u32,
  height: u32,
  format: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PipelineRenderRequest {
  mode: PipelineRenderMode,
  source: PipelineRenderSource,
  recipe: serde_json::Value,
  #[serde(default)]
  output: Option<PipelineRenderOutput>,
  #[serde(default)]
  width: u32,
  #[serde(default)]
  height: u32,
  #[serde(default)]
  samples: Vec<f32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PipelineRenderHash {
  algorithm: &'static str,
  value: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PipelineRenderResult {
  mode: PipelineRenderMode,
  width: u32,
  height: u32,
  format: String,
  source_identity: PipelineRenderSourceIdentity,
  recipe_fingerprint: String,
  pixel_hash: PipelineRenderHash,
  samples: Vec<f32>,
}

#[tauri::command]
fn viewport_proof_results(window: WebviewWindow) -> Vec<ViewportProofResult> {
  let inner_size = window.inner_size().ok();
  let scale_factor = window.scale_factor().ok();
  let native_frame =
    viewport::frame_bridge::measure_native_frame("viewport-proof-native-frame", 2, 2).ok();
  let raw_frame_metrics = match (inner_size, scale_factor) {
    (Some(size), Some(scale)) => Some(ViewportProofMetrics {
      physical_width: Some(size.width),
      physical_height: Some(size.height),
      scale_factor: Some(scale),
      frame_count: None,
      duration_ms: None,
      source_file_id: native_frame
        .as_ref()
        .map(|frame| frame.source_file_id.clone()),
      recipe_fingerprint: native_frame
        .as_ref()
        .map(|frame| frame.recipe_fingerprint.clone()),
      frame_width: native_frame.as_ref().map(|frame| frame.frame_width),
      frame_height: native_frame.as_ref().map(|frame| frame.frame_height),
      transfer_method: native_frame
        .as_ref()
        .map(|frame| frame.transfer_method.clone()),
      frame_hash: native_frame.as_ref().map(|frame| frame.frame_hash.clone()),
      render_duration_ms: native_frame.as_ref().map(|frame| frame.render_duration_ms),
      red: native_frame.as_ref().map(|frame| frame.red),
      green: native_frame.as_ref().map(|frame| frame.green),
      blue: native_frame.as_ref().map(|frame| frame.blue),
      alpha: native_frame.as_ref().map(|frame| frame.alpha),
    }),
    (Some(size), None) => Some(ViewportProofMetrics {
      physical_width: Some(size.width),
      physical_height: Some(size.height),
      scale_factor: None,
      frame_count: None,
      duration_ms: None,
      source_file_id: native_frame
        .as_ref()
        .map(|frame| frame.source_file_id.clone()),
      recipe_fingerprint: native_frame
        .as_ref()
        .map(|frame| frame.recipe_fingerprint.clone()),
      frame_width: native_frame.as_ref().map(|frame| frame.frame_width),
      frame_height: native_frame.as_ref().map(|frame| frame.frame_height),
      transfer_method: native_frame
        .as_ref()
        .map(|frame| frame.transfer_method.clone()),
      frame_hash: native_frame.as_ref().map(|frame| frame.frame_hash.clone()),
      render_duration_ms: native_frame.as_ref().map(|frame| frame.render_duration_ms),
      red: native_frame.as_ref().map(|frame| frame.red),
      green: native_frame.as_ref().map(|frame| frame.green),
      blue: native_frame.as_ref().map(|frame| frame.blue),
      alpha: native_frame.as_ref().map(|frame| frame.alpha),
    }),
    _ => native_frame.as_ref().map(|frame| ViewportProofMetrics {
      physical_width: None,
      physical_height: None,
      scale_factor: None,
      frame_count: None,
      duration_ms: None,
      source_file_id: Some(frame.source_file_id.clone()),
      recipe_fingerprint: Some(frame.recipe_fingerprint.clone()),
      frame_width: Some(frame.frame_width),
      frame_height: Some(frame.frame_height),
      transfer_method: Some(frame.transfer_method.clone()),
      frame_hash: Some(frame.frame_hash.clone()),
      render_duration_ms: Some(frame.render_duration_ms),
      red: Some(frame.red),
      green: Some(frame.green),
      blue: Some(frame.blue),
      alpha: Some(frame.alpha),
    }),
  };

  let raw_frame_note = if let Some(frame) = native_frame.as_ref() {
    match (inner_size, scale_factor) {
      (Some(size), Some(scale)) => format!(
        "Native Pipeline frame rendered for {} at {}x{} and transferred by {} (hash {}). Webview window measured at {}x{} physical px with {:.2} scale factor.",
        frame.source_file_id,
        frame.frame_width,
        frame.frame_height,
        frame.transfer_method,
        frame.frame_hash,
        size.width,
        size.height,
        scale
      ),
      (Some(size), None) => format!(
        "Native Pipeline frame rendered for {} at {}x{} and transferred by {} (hash {}). Webview window measured at {}x{} physical px.",
        frame.source_file_id,
        frame.frame_width,
        frame.frame_height,
        frame.transfer_method,
        frame.frame_hash,
        size.width,
        size.height
      ),
      _ => format!(
        "Native Pipeline frame rendered for {} at {}x{} and transferred by {} (hash {}). Webview window metrics were unavailable.",
        frame.source_file_id,
        frame.frame_width,
        frame.frame_height,
        frame.transfer_method,
        frame.frame_hash
      ),
    }
  } else {
    match (inner_size, scale_factor) {
      (Some(size), Some(scale)) => format!(
        "Tauri shell bridge connected. Webview window measured at {}x{} physical px with {:.2} scale factor, but native Pipeline frame provenance was unavailable.",
        size.width, size.height, scale
      ),
      (Some(size), None) => format!(
        "Tauri shell bridge connected. Webview window measured at {}x{} physical px, but scale-factor lookup failed and native Pipeline frame provenance was unavailable.",
        size.width, size.height
      ),
      _ => "Tauri shell bridge connected, but webview window metrics and native Pipeline frame provenance were unavailable.".to_string(),
    }
  };

  vec![
    ViewportProofResult {
      id: "gradient",
      passed: native_frame.is_some(),
      fps: None,
      metrics: None,
      note: "Tauri shell bridge connected and native Pipeline frame provenance is available for the viewport proof harness.".to_string(),
    },
    ViewportProofResult {
      id: "raw_frame",
      passed: native_frame.is_some(),
      fps: None,
      metrics: raw_frame_metrics,
      note: raw_frame_note,
    },
  ]
}

#[tauri::command]
async fn pipeline_capabilities() -> core::PipelineCapabilities {
  core::detect_pipeline_capabilities().await
}

#[tauri::command]
async fn render_pipeline(request: PipelineRenderRequest) -> Result<PipelineRenderResult, String> {
  let recipe = core::Recipe::from_value(request.recipe).map_err(|error| error.to_string())?;
  let output_width = request
    .output
    .as_ref()
    .map(|output| output.width)
    .unwrap_or(if request.width > 0 { request.width } else { request.source.width });
  let output_height = request
    .output
    .as_ref()
    .map(|output| output.height)
    .unwrap_or(if request.height > 0 { request.height } else { request.source.height });
  let output_format = request
    .output
    .as_ref()
    .map(|output| output.format.clone())
    .unwrap_or_else(|| "linear-float32".to_string());
  let sample_count = output_width
    .checked_mul(output_height)
    .ok_or_else(|| "render output dimensions are too large".to_string())? as usize;
  let samples = if request.samples.is_empty() {
    // Issue 09: try real source decode when a path is provided.
    // Falls back to a flat gradient when decode returns a placeholder
    // (RAW/JPEG/TIFF not yet decoded) or when no path is available.
    if let Some(ref source_path) = request.source.path {
      let adapter = core::DecodeAdapter::new();
      match adapter.decode_source(source_path) {
        Ok(decoded) if decoded.buffer().storage() == core::PixelStorage::LinearFloat32 => {
          decoded.buffer().samples().to_vec()
        }
        _ => vec![0.5; sample_count],
      }
    } else {
      vec![0.5; sample_count]
    }
  } else {
    request.samples
  };
  let source_buffer = core::DecodedImageBuffer::linear_float(output_width, output_height, samples)
    .map_err(|error| error.to_string())?;
  let rendered = core::CpuPipeline::new()
    .render(&source_buffer, &recipe, core::CpuRenderMode::Preview)
    .map_err(|error| error.to_string())?;
  let rendered_samples = rendered.buffer().samples().to_vec();

  Ok(PipelineRenderResult {
    mode: request.mode,
    width: output_width,
    height: output_height,
    format: output_format,
    source_identity: PipelineRenderSourceIdentity {
      image_id: request.source.image_id,
      path: request.source.path,
      revision: request.source.revision,
    },
    recipe_fingerprint: recipe.fingerprint(),
    pixel_hash: PipelineRenderHash {
      algorithm: "sha256",
      value: hash_f32_samples(&rendered_samples),
    },
    samples: rendered_samples,
  })
}

fn hash_f32_samples(samples: &[f32]) -> String {
  let mut hasher = Sha256::new();
  for sample in samples {
    hasher.update(sample.to_le_bytes());
  }
  format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod render_pipeline_tests {
  use super::{render_pipeline, PipelineRenderMode, PipelineRenderRequest, PipelineRenderSource};
  use serde_json::json;

  #[test]
  fn render_pipeline_returns_recipe_and_source_identity() {
    let result = pollster::block_on(render_pipeline(PipelineRenderRequest {
      mode: PipelineRenderMode::Preview,
      source: PipelineRenderSource {
        image_id: "img-rust-001".to_string(),
        path: Some("/fixtures/img-rust-001.nef".to_string()),
        revision: Some("raw-v1".to_string()),
        width: 2,
        height: 1,
      },
      recipe: json!({"version":1,"operations":[{"type":"exposure","params":{"ev":1}}]}),
      output: None,
      width: 2,
      height: 1,
      samples: vec![0.25, 0.5],
    }))
    .unwrap();

    assert_eq!(result.mode, PipelineRenderMode::Preview);
    assert_eq!(result.width, 2);
    assert_eq!(result.height, 1);
    assert_eq!(result.samples, vec![0.5, 1.0]);
    assert_eq!(result.source_identity.image_id, "img-rust-001");
    assert!(result.recipe_fingerprint.len() >= 64);
  }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
    .invoke_handler(tauri::generate_handler![
      viewport_proof_results,
      pipeline_capabilities,
      render_pipeline,
      catalog::import::import_sources
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
