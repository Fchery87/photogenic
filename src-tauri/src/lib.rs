use serde::Serialize;
use tauri::WebviewWindow;

pub mod core;

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

#[tauri::command]
fn viewport_proof_results(window: WebviewWindow) -> Vec<ViewportProofResult> {
  let inner_size = window.inner_size().ok();
  let scale_factor = window.scale_factor().ok();
  let raw_frame_metrics = match (inner_size, scale_factor) {
    (Some(size), Some(scale)) => Some(ViewportProofMetrics {
      physical_width: Some(size.width),
      physical_height: Some(size.height),
      scale_factor: Some(scale),
      frame_count: None,
      duration_ms: None,
    }),
    (Some(size), None) => Some(ViewportProofMetrics {
      physical_width: Some(size.width),
      physical_height: Some(size.height),
      scale_factor: None,
      frame_count: None,
      duration_ms: None,
    }),
    _ => None,
  };

  let raw_frame_note = match (inner_size, scale_factor) {
    (Some(size), Some(scale)) => format!(
      "Tauri shell bridge connected. Webview window measured at {}x{} physical px with {:.2} scale factor, but raw-frame provenance is still unproven.",
      size.width, size.height, scale
    ),
    (Some(size), None) => format!(
      "Tauri shell bridge connected. Webview window measured at {}x{} physical px, but scale-factor lookup failed and raw-frame provenance is still unproven.",
      size.width, size.height
    ),
    _ => "Tauri shell bridge connected, but webview window metrics were unavailable; raw-frame provenance is still unproven.".to_string(),
  };

  vec![
    ViewportProofResult {
      id: "gradient",
      passed: false,
      fps: None,
      metrics: None,
      note: "Tauri shell bridge connected, but the real GPU→webview viewport measurement path is still incomplete. Gradient remains provisional until shell rendering is measured end-to-end.".to_string(),
    },
    ViewportProofResult {
      id: "raw_frame",
      passed: false,
      fps: None,
      metrics: raw_frame_metrics,
      note: raw_frame_note,
    },
  ]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_log::Builder::default().level(log::LevelFilter::Info).build())
    .invoke_handler(tauri::generate_handler![viewport_proof_results])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
