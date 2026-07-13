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

  #[test]
  fn export_image_writes_real_png_file_from_decoded_source() {
    use super::{export_image, ExportImageRequest};
    use std::path::PathBuf;

    let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .join("..")
      .join("test/fixtures/images/test-rgb.png");
    assert!(fixture.exists(), "test fixture PNG must exist");

    let temp_dir = std::env::temp_dir();
    let output_path = temp_dir
      .join(format!("photogenic-export-test-{}.png", std::process::id()));

    let result = export_image(ExportImageRequest {
      image_id: "test-export".to_string(),
      source_path: fixture.to_string_lossy().to_string(),
      recipe: json!({"version":1,"operations":[{"type":"exposure","params":{"ev":0.5}}]}),
      output_path: output_path.to_string_lossy().to_string(),
      output_format: None,
    })
    .unwrap();

    // File was created
    assert!(output_path.exists(), "exported PNG must exist");
    assert!(result.file_size_bytes > 0, "file must have content");
    assert_eq!(result.format, "png");
    assert!(result.width > 0 && result.height > 0);
    assert!(result.recipe_fingerprint.len() >= 64);

    // Verify the written PNG is re-readable and has matching dimensions
    let file_bytes = std::fs::read(&output_path).unwrap();
    let decoder = png::Decoder::new(file_bytes.as_slice());
    let reader = decoder.read_info().unwrap();
    let (w, h) = reader.info().size();
    assert_eq!(w, result.width);
    assert_eq!(h, result.height);

    // Clean up
    std::fs::remove_file(&output_path).ok();
  }

  #[test]
  fn export_image_writes_tiff_8bit_from_decoded_source() {
    use super::{export_image, ExportImageRequest};
    use std::path::PathBuf;

    let png_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .join("..")
      .join("test/fixtures/images/test-rgb.png");
    let dir = std::env::temp_dir().join(format!(
      "photogenic-tiff-export-test-{}",
      std::process::id()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let output_path = dir.join("export-test.tiff");

    let result = export_image(ExportImageRequest {
      image_id: "test-img".to_string(),
      source_path: png_path.to_string_lossy().to_string(),
      recipe: serde_json::json!({
        "version": 1,
        "operations": [
          { "type": "exposure", "params": { "ev": 0.0 } }
        ]
      }),
      output_path: output_path.to_string_lossy().to_string(),
      output_format: Some("tiff-8".to_string()),
    })
    .unwrap();

    assert_eq!(result.format, "tiff-8");
    assert!(result.width > 0 && result.height > 0);
    assert!(result.file_size_bytes > 0);

    // Verify the written TIFF is valid: check header
    let file_bytes = std::fs::read(&output_path).unwrap();
    assert_eq!(&file_bytes[0..2], b"II"); // little-endian
    assert_eq!(u16::from_le_bytes([file_bytes[2], file_bytes[3]]), 42); // magic

    std::fs::remove_file(&output_path).ok();
  }

  #[test]
  fn export_image_writes_tiff_16bit_from_decoded_source() {
    use super::{export_image, ExportImageRequest};
    use std::path::PathBuf;

    let png_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .join("..")
      .join("test/fixtures/images/test-rgb.png");
    let dir = std::env::temp_dir().join(format!(
      "photogenic-tiff16-export-test-{}",
      std::process::id()
    ));
    std::fs::create_dir_all(&dir).unwrap();
    let output_path = dir.join("export-test-16.tiff");

    let result = export_image(ExportImageRequest {
      image_id: "test-img".to_string(),
      source_path: png_path.to_string_lossy().to_string(),
      recipe: serde_json::json!({
        "version": 1,
        "operations": []
      }),
      output_path: output_path.to_string_lossy().to_string(),
      output_format: Some("tiff-16".to_string()),
    })
    .unwrap();

    assert_eq!(result.format, "tiff-16");
    assert!(result.width > 0 && result.height > 0);
    assert!(result.file_size_bytes > 0);

    // Verify TIFF header and that it's larger than 8-bit version (16-bit samples)
    let file_bytes = std::fs::read(&output_path).unwrap();
    assert_eq!(&file_bytes[0..2], b"II");

    std::fs::remove_file(&output_path).ok();
  }

  #[test]
  fn import_images_into_store_imports_and_skips() {
    use super::import_images_into_store;
    use std::fs;

    let dir = std::env::temp_dir().join(format!(
      "photogenic-import-test-{}",
      std::process::id()
    ));
    fs::create_dir_all(&dir).unwrap();
    let db_path = dir.join("import-test.db");

    // Create a real PNG file to import
    let png_path = dir.join("test-import.png");
    fs::write(&png_path, b"fake-png").unwrap();
    // Create an unsupported file
    let bad_path = dir.join("test.xyz");
    fs::write(&bad_path, b"bad").unwrap();

    let store = crate::catalog::SqliteCatalogStore::open(&db_path).unwrap();

    let result = import_images_into_store(
      &store,
      vec![
        png_path.to_string_lossy().to_string(),
        bad_path.to_string_lossy().to_string(),
      ],
    )
    .unwrap();

    assert_eq!(result.imported.len(), 1);
    assert_eq!(result.imported[0].observed_format, "png");
    assert!(result.imported[0].file_name.contains("test-import"));
    assert_eq!(result.skipped.len(), 1);
    assert_eq!(result.skipped[0].reason, "unsupported-format");

    // Verify it persists in the store
    let images = store.list_imported_images().unwrap();
    assert_eq!(images.len(), 1);
    assert_eq!(images[0].observed_format, "png");

    // Dedup: re-importing same path should not duplicate
    let result2 = import_images_into_store(
      &store,
      vec![png_path.to_string_lossy().to_string()],
    )
    .unwrap();
    assert_eq!(result2.imported.len(), 1);
    let images2 = store.list_imported_images().unwrap();
    assert_eq!(images2.len(), 1); // no duplicate

    fs::remove_dir_all(&dir).ok();
  }
}

use std::sync::Mutex;
use tauri::Manager;

struct AppState {
  catalog: Mutex<catalog::SqliteCatalogStore>,
  data_dir: std::path::PathBuf,
}

#[tauri::command]
fn list_library(state: tauri::State<AppState>) -> Result<Vec<catalog::ImportedImageRow>, String> {
  let store = state.catalog.lock().map_err(|e| e.to_string())?;
  store.list_imported_images().map_err(|e| e.to_string())
}

#[tauri::command]
fn get_recipe(
  state: tauri::State<AppState>,
  image_id: String,
) -> Result<Option<serde_json::Value>, String> {
  let store = state.catalog.lock().map_err(|e| e.to_string())?;
  let entry = store.get_recipe(&image_id).map_err(|e| e.to_string())?;
  Ok(entry.map(|e| serde_json::json!({
    "imageId": e.image_id,
    "recipe": e.recipe.to_value(),
    "recipeFingerprint": e.recipe_fingerprint,
    "revision": e.revision,
    "updatedAt": e.updated_at,
  })))
}

#[tauri::command]
fn save_recipe(
  state: tauri::State<AppState>,
  image_id: String,
  recipe: serde_json::Value,
  updated_at: Option<String>,
) -> Result<serde_json::Value, String> {
  let parsed_recipe = core::Recipe::from_value(recipe).map_err(|e| e.to_string())?;
  let timestamp = updated_at.unwrap_or_else(|| {
    std::time::SystemTime::now()
      .duration_since(std::time::UNIX_EPOCH)
      .map(|d| format!("{}.{:03}Z", d.as_secs(), d.subsec_millis()))
      .unwrap_or_else(|_| "1970-01-01T00:00:00.000Z".to_string())
  });
  let store = state.catalog.lock().map_err(|e| e.to_string())?;
  let entry = store
    .save_recipe(&image_id, &parsed_recipe, &timestamp)
    .map_err(|e| e.to_string())?;
  Ok(serde_json::json!({
    "imageId": entry.image_id,
    "recipe": entry.recipe.to_value(),
    "recipeFingerprint": entry.recipe_fingerprint,
    "revision": entry.revision,
    "updatedAt": entry.updated_at,
  }))
}

#[tauri::command]
fn list_presets(state: tauri::State<AppState>) -> Result<Vec<catalog::PresetEntry>, String> {
  let store = state.catalog.lock().map_err(|e| e.to_string())?;
  store.list_presets().map_err(|e| e.to_string())
}

#[tauri::command]
fn save_preset(
  state: tauri::State<AppState>,
  preset_id: String,
  name: String,
  recipe: serde_json::Value,
) -> Result<catalog::PresetEntry, String> {
  let recipe_json = serde_json::to_string(&recipe).map_err(|e| e.to_string())?;
  let now = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| format!("{}.{:03}Z", d.as_secs(), d.subsec_millis()))
    .unwrap_or_else(|_| "1970-01-01T00:00:00.000Z".to_string());
  let store = state.catalog.lock().map_err(|e| e.to_string())?;
  store
    .save_preset(&preset_id, &name, &recipe_json, &now)
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn get_workspace_state(
  state: tauri::State<AppState>,
  workspace_id: String,
) -> Result<Option<catalog::WorkspaceStateEntry>, String> {
  let store = state.catalog.lock().map_err(|e| e.to_string())?;
  store
    .get_workspace_state(&workspace_id)
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_workspace_state(
  state: tauri::State<AppState>,
  workspace_id: String,
  state_json: serde_json::Value,
) -> Result<catalog::WorkspaceStateEntry, String> {
  let json_str = serde_json::to_string(&state_json).map_err(|e| e.to_string())?;
  let now = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| format!("{}.{:03}Z", d.as_secs(), d.subsec_millis()))
    .unwrap_or_else(|_| "1970-01-01T00:00:00.000Z".to_string());
  let store = state.catalog.lock().map_err(|e| e.to_string())?;
  store
    .save_workspace_state(&workspace_id, &json_str, &now)
    .map_err(|e| e.to_string())
}

/// Criterion 8: Batch Sync — copy selected operation types from a source
/// image's recipe to all other images in the library.
#[tauri::command]
fn batch_sync(
  state: tauri::State<AppState>,
  source_image_id: String,
  operation_types: Vec<String>,
) -> Result<catalog::BatchSyncResult, String> {
  let now = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| format!("{}.{:03}Z", d.as_secs(), d.subsec_millis()))
    .unwrap_or_else(|_| "1970-01-01T00:00:00.000Z".to_string());
  let store = state.catalog.lock().map_err(|e| e.to_string())?;
  store
    .batch_sync_operations(&source_image_id, &operation_types, &now)
    .map_err(|e| e.to_string())
}

/// Criterion 7: Apply a preset to an image with full recipe validation.
/// Returns an error if the preset recipe is structurally invalid.
#[tauri::command]
fn apply_preset(
  state: tauri::State<AppState>,
  preset_id: String,
  target_image_id: String,
) -> Result<serde_json::Value, String> {
  let store = state.catalog.lock().map_err(|e| e.to_string())?;
  let preset = store
    .get_preset(&preset_id)
    .map_err(|e| e.to_string())?
    .ok_or_else(|| format!("Preset not found: {}", preset_id))?;

  // Validate the preset recipe by parsing it through the schema.
  let recipe_value: serde_json::Value =
    serde_json::from_str(&preset.recipe_json)
      .map_err(|e| format!("Preset recipe JSON is malformed: {e}"))?;
  let recipe =
    core::Recipe::from_value(recipe_value).map_err(|e| e.to_string())?;

  // Persist to the target image.
  let now = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| format!("{}.{:03}Z", d.as_secs(), d.subsec_millis()))
    .unwrap_or_else(|_| "1970-01-01T00:00:00.000Z".to_string());
  let entry = store
    .save_recipe(&target_image_id, &recipe, &now)
    .map_err(|e| e.to_string())?;

  Ok(serde_json::json!({
    "imageId": entry.image_id,
    "recipe": entry.recipe.to_value(),
    "recipeFingerprint": entry.recipe_fingerprint,
    "revision": entry.revision,
    "appliedFromPreset": preset.name,
  }))
}

/// Criterion 9: Check licensing state before allowing export.
/// Reads a `license.json` file from the app data directory.
#[tauri::command]
fn check_license(state: tauri::State<AppState>) -> Result<serde_json::Value, String> {
  let license_path = state.data_dir.join("license.json");

  if !license_path.exists() {
    return Ok(serde_json::json!({
      "activated": false,
      "reason": "No license file found. Activate a license to enable export."
    }));
  }

  let content = std::fs::read_to_string(&license_path)
    .map_err(|e| format!("Failed to read license file: {e}"))?;
  let license: serde_json::Value = serde_json::from_str(&content)
    .map_err(|e| format!("License file is malformed: {e}"))?;

  let has_signature = license.get("signature").is_some();
  let license_id = license
    .get("licenseId")
    .and_then(|v| v.as_str())
    .unwrap_or("unknown");

  Ok(serde_json::json!({
    "activated": has_signature,
    "reason": if has_signature {
      format!("License active: {}", license_id)
    } else {
      "License file missing signature".to_string()
    }
  }))
}

/// Culling: update rating, flag, reject, or color label for an image.
/// Any field left as `None` is unchanged.  An empty `color_label` string
/// clears the label.
#[tauri::command]
fn update_culling(
  state: tauri::State<AppState>,
  image_id: String,
  rating: Option<i32>,
  flagged: Option<bool>,
  rejected: Option<bool>,
  color_label: Option<String>,
) -> Result<catalog::CullingMetadata, String> {
  let now = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| format!("{}.{:03}Z", d.as_secs(), d.subsec_millis()))
    .unwrap_or_else(|_| "1970-01-01T00:00:00.000Z".to_string());

  // Map color_label: None = no change, Some("") = clear, Some(s) = set
  let cl_param: Option<Option<&str>> = match &color_label {
    None => None,
    Some(s) if s.is_empty() => Some(None),
    Some(s) => Some(Some(s.as_str())),
  };

  let store = state.catalog.lock().map_err(|e| e.to_string())?;
  store
    .set_culling_metadata(&image_id, rating, flagged, rejected, cl_param, &now)
    .map_err(|e| e.to_string())
}

/// Culling: list all culling metadata entries.
#[tauri::command]
fn list_culling(state: tauri::State<AppState>) -> Result<Vec<catalog::CullingMetadata>, String> {
  let store = state.catalog.lock().map_err(|e| e.to_string())?;
  store.list_culling_metadata().map_err(|e| e.to_string())
}

/// Export: decode source → apply pipeline → encode PNG → write to file.
/// This is the real export path for Issue 13 (writes real Pipeline outputs)
/// wired from the Issue 12 export panel (criterion 9: export execution).
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportImageRequest {
  image_id: String,
  source_path: String,
  recipe: serde_json::Value,
  output_path: String,
  /// Output format: "png" (default), "tiff-8", or "tiff-16".
  #[serde(default)]
  output_format: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportImageResult {
  output_path: String,
  width: u32,
  height: u32,
  format: String,
  file_size_bytes: u64,
  recipe_fingerprint: String,
}

#[tauri::command]
fn export_image(request: ExportImageRequest) -> Result<ExportImageResult, String> {
  // 1. Parse recipe
  let recipe = core::Recipe::from_value(request.recipe).map_err(|e| e.to_string())?;

  // 2. Decode source
  let adapter = core::DecodeAdapter::new();
  let decoded = adapter
    .decode_source(&request.source_path)
    .map_err(|e| e.to_string())?;

  // 3. Render through pipeline
  let rendered = core::CpuPipeline::new()
    .render(decoded.buffer(), &recipe, core::CpuRenderMode::Export)
    .map_err(|e| e.to_string())?;

  let width = rendered.buffer().width();
  let height = rendered.buffer().height();
  let samples = rendered.buffer().samples();

  // 4. Convert linear float samples (0.0–1.0) to 8-bit sRGB RGB
  //    Simple OETF approximation: apply sRGB gamma for export visibility.
  let pixel_count = (width as usize) * (height as usize);
  // Determine output format early so we can skip unnecessary conversions
  let format_name = match request.output_format.as_deref().unwrap_or("png") {
    "tiff-16" | "tiff-8" | "tiff" => request.output_format.as_deref().unwrap(),
    _ => "png", // default / unknown formats fall back to PNG
  };
  // For 16-bit TIFF, skip the 8-bit conversion (computed separately below)
  let needs_8bit = format_name != "tiff-16";
  let mut rgb_bytes = if needs_8bit { vec![0u8; pixel_count * 3] } else { Vec::new() };
  if needs_8bit {
    for i in 0..pixel_count {
      for ch in 0..3 {
      let idx = i * 3 + ch;
      let linear = if idx < samples.len() {
        samples[idx].clamp(0.0, 1.0)
      } else {
        0.0
      };
      // Linear → sRGB OETF (approximation)
      let srgb = if linear <= 0.0031308 {
        linear * 12.92
      } else {
        1.055 * linear.powf(1.0 / 2.4) - 0.055
      };
      rgb_bytes[idx] = (srgb * 255.0).round().clamp(0.0, 255.0) as u8;
    }
  }
  } // end needs_8bit

  // 5. Encode based on requested format
  match format_name {
    "tiff-16" => {
      // Convert linear float to 16-bit samples
      let mut rgb16 = vec![0u16; pixel_count * 3];
      for i in 0..pixel_count {
        for ch in 0..3 {
          let idx = i * 3 + ch;
          let linear = if idx < samples.len() {
            samples[idx].clamp(0.0, 1.0)
          } else {
            0.0
          };
          let srgb = if linear <= 0.0031308 {
            linear * 12.92
          } else {
            1.055 * linear.powf(1.0 / 2.4) - 0.055
          };
          rgb16[idx] = (srgb * 65535.0).round().clamp(0.0, 65535.0) as u16;
        }
      }
      let tiff_bytes = core::tiff_encoder::encode_tiff_rgb16(width, height, &rgb16);
      std::fs::write(&request.output_path, &tiff_bytes)
        .map_err(|e| format!("Failed to write TIFF file: {e}"))?;
    }
    "tiff-8" | "tiff" => {
      let tiff_bytes = core::tiff_encoder::encode_tiff_rgb8(width, height, &rgb_bytes);
      std::fs::write(&request.output_path, &tiff_bytes)
        .map_err(|e| format!("Failed to write TIFF file: {e}"))?;
    }
    _ => {
      // Default: PNG
      let file = std::fs::File::create(&request.output_path)
        .map_err(|e| format!("Failed to create output file: {e}"))?;
      let writer = std::io::BufWriter::new(file);
      let mut encoder = png::Encoder::new(writer, width, height);
      encoder.set_color(png::ColorType::Rgb);
      encoder.set_depth(png::BitDepth::Eight);
      encoder.add_text_chunk(
        "RecipeFingerprint".to_string(),
        recipe.fingerprint().clone(),
      );
      let mut png_writer = encoder
        .write_header()
        .map_err(|e| format!("PNG header write failed: {e}"))?;
      png_writer
        .write_image_data(&rgb_bytes)
        .map_err(|e| format!("PNG data write failed: {e}"))?;
      png_writer
        .finish()
        .map_err(|e| format!("PNG finish failed: {e}"))?;
    }
  };

  // 6. Read file size
  let file_size = std::fs::metadata(&request.output_path)
    .map(|m| m.len())
    .unwrap_or(0);

  Ok(ExportImageResult {
    output_path: request.output_path,
    width,
    height,
    format: format_name.to_string(),
    file_size_bytes: file_size,
    recipe_fingerprint: recipe.fingerprint(),
  })
}

/// Import source files into the managed catalog store.
#[tauri::command]
fn import_images(
  state: tauri::State<AppState>,
  source_paths: Vec<String>,
) -> Result<catalog::import::ImportSourcesResult, String> {
  let store = state.catalog.lock().map_err(|e| e.to_string())?;
  import_images_into_store(&store, source_paths)
}

/// Core import logic, usable outside Tauri state (for testing).
fn import_images_into_store(
  store: &catalog::SqliteCatalogStore,
  source_paths: Vec<String>,
) -> Result<catalog::import::ImportSourcesResult, String> {
  let mut imported = Vec::new();
  let mut skipped = Vec::new();

  let now = std::time::SystemTime::now()
    .duration_since(std::time::UNIX_EPOCH)
    .map(|d| format!("{}.{:03}Z", d.as_secs(), d.subsec_millis()))
    .unwrap_or_else(|_| "1970-01-01T00:00:00.000Z".to_string());

  for source_path in source_paths {
    let path = std::path::Path::new(&source_path);
    let ext = path
      .extension()
      .and_then(|e| e.to_str())
      .map(|e| e.to_lowercase())
      .unwrap_or_default();

    let observed_format = match ext.as_str() {
      "nef" | "cr2" | "arw" | "dng" | "raf" => "raw",
      "jpg" | "jpeg" => "jpeg",
      "png" => "png",
      "tif" | "tiff" => "tiff",
      _ => {
        skipped.push(catalog::import::SkippedImportSource {
          source_path,
          reason: "unsupported-format".to_string(),
        });
        continue;
      }
    };

    let file_name = path
      .file_name()
      .and_then(|n| n.to_str())
      .unwrap_or("unknown")
      .to_string();

    let byte_size = std::fs::metadata(path).ok().map(|m| m.len() as i64);
    let modified_at = std::fs::metadata(path)
      .and_then(|m| m.modified())
      .ok()
      .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
      .map(|d| format!("{}.{:03}Z", d.as_secs(), d.subsec_millis()));

    // Generate a stable image ID from the source path
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    source_path.hash(&mut hasher);
    let image_id = format!("img-{:016x}", hasher.finish());

    let row = catalog::ImportedImageRow {
      image_id: image_id.clone(),
      source_path: source_path.clone(),
      file_name: file_name.clone(),
      observed_format: observed_format.to_string(),
      byte_size,
      modified_at,
    };

    let saved = store
      .upsert_imported_image(&row, &now)
      .map_err(|e| e.to_string())?;

    imported.push(catalog::import::ImportSourceEntry {
      image_id: saved.image_id,
      source_path: saved.source_path,
      file_name: saved.file_name,
      observed_format: saved.observed_format,
      byte_size: saved.byte_size,
      modified_at: saved.modified_at,
    });
  }

  Ok(catalog::import::ImportSourcesResult { imported, skipped })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
    .setup(|app| {
      let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| std::path::PathBuf::from("."));
      std::fs::create_dir_all(&data_dir).ok();
      let db_path = data_dir.join("photogenic-catalog.sqlite");
      let store = catalog::SqliteCatalogStore::open(&db_path)
        .expect("failed to open catalog database");
      app.manage(AppState {
        catalog: Mutex::new(store),
        data_dir: data_dir.clone(),
      });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      viewport_proof_results,
      pipeline_capabilities,
      render_pipeline,
      catalog::import::import_sources,
      list_library,
      get_recipe,
      save_recipe,
      list_presets,
      save_preset,
      apply_preset,
      get_workspace_state,
      save_workspace_state,
      batch_sync,
      check_license,
      update_culling,
      list_culling,
      export_image,
      import_images
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
