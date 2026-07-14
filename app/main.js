/**
 * Photogenic editor application (Issue 12).
 *
 * Connects the editor UI to the native backend via the Tauri bridge.
 * When the backend is not available (browser/test), the UI shows an honest
 * "disconnected" state instead of silently failing.
 */

import { createTauriBridge } from "./tauri-bridge.js";

const bridge = createTauriBridge();

// -- State ------------------------------------------------------------------

let selectedImageId = null;
let currentRecipe = { version: 1, operations: [] };
let libraryImages = [];
let cullingMap = {}; // imageId -> { rating, flagged, rejected, colorLabel }

// -- DOM helpers ------------------------------------------------------------

const $ = (id) => document.getElementById(id);

function setStatus(text) {
  const el = $("status-text");
  if (el) el.textContent = text;
}

function setBadge(id, text, cls) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
  el.className = `badge ${cls}`;
}

// -- Recipe <-> UI sync -----------------------------------------------------

const CONTROL_MAP = [
  { id: "exposure", opType: "exposure", param: "ev", label: "val-exposure", format: (v) => v.toFixed(1) },
  { id: "temperature", opType: "temperature", param: "kelvinDelta", label: "val-temperature", format: (v) => String(v) },
  { id: "tint", opType: "tint", param: "amount", label: "val-tint", format: (v) => String(v) },
  { id: "contrast", opType: "contrast", param: "amount", label: "val-contrast", format: (v) => String(v) },
  { id: "highlights", opType: "highlights", param: "amount", label: "val-highlights", format: (v) => String(v) },
  { id: "shadows", opType: "shadows", param: "amount", label: "val-shadows", format: (v) => String(v) },
  { id: "whites", opType: "whites", param: "amount", label: "val-whites", format: (v) => String(v) },
  { id: "blacks", opType: "blacks", param: "amount", label: "val-blacks", format: (v) => String(v) },
  { id: "sharpen", opType: "sharpen", param: "amount", label: "val-sharpen", format: (v) => String(v) },
  { id: "noise", opType: "noiseReduction", param: "amount", label: "val-noise", format: (v) => String(v) },
];

// Special controls that need custom recipe mapping (toneCurve, HSL, crop, rotate, straighten)
const SPECIAL_LABELS = [
  { id: "toneCurve", label: "val-toneCurve", format: (v) => String(v) },
  { id: "hsl-hue", label: "val-hsl-hue", format: (v) => String(v) },
  { id: "hsl-sat", label: "val-hsl-sat", format: (v) => String(v) },
  { id: "hsl-lum", label: "val-hsl-lum", format: (v) => String(v) },
  { id: "straighten", label: "val-straighten", format: (v) => v.toFixed(1) },
];

export function recipeFromControls(getValue, getSelect) {
  const operations = [];
  // Simple slider operations
  for (const ctrl of CONTROL_MAP) {
    const value = getValue(ctrl.id);
    if (value === 0) continue;
    operations.push({ type: ctrl.opType, params: { [ctrl.param]: value } });
  }
  // Tone curve (single midpoint slider → [[0,0],[0.5,y],[1,1]])
  const tcVal = getValue("toneCurve");
  if (tcVal !== 0) {
    const y = 0.5 + tcVal / 200;
    operations.push({ type: "toneCurve", params: { points: [[0, 0], [0.5, y], [1, 1]] } });
  }
  // HSL (red channel — combine 3 sliders)
  const hslHue = getValue("hsl-hue");
  const hslSat = getValue("hsl-sat");
  const hslLum = getValue("hsl-lum");
  if (hslHue !== 0 || hslSat !== 0 || hslLum !== 0) {
    operations.push({ type: "hsl", params: { target: "red", hue: hslHue, saturation: hslSat, luminance: hslLum } });
  }
  // Crop (combine 4 sliders — only when non-default)
  const cropX = getValue("crop-x");
  const cropY = getValue("crop-y");
  const cropW = getValue("crop-w");
  const cropH = getValue("crop-h");
  if ((cropX > 0 || cropY > 0 || cropW < 1 || cropH < 1) && cropW > 0 && cropH > 0) {
    operations.push({ type: "crop", params: { x: cropX, y: cropY, w: cropW, h: cropH } });
  }
  // Rotate (select dropdown)
  const rotateVal = getSelect ? getSelect("rotate") : 0;
  if (rotateVal && rotateVal !== 0) {
    operations.push({ type: "rotate", params: { degrees: parseInt(rotateVal, 10) } });
  }
  // Straighten
  const straightenVal = getValue("straighten");
  if (straightenVal !== 0) {
    operations.push({ type: "straighten", params: { angle: straightenVal } });
  }
  return { version: 1, operations };
}

export function controlsFromRecipe(recipe, setValue, setSelect) {
  const byType = new Map();
  for (const op of recipe?.operations ?? []) {
    byType.set(op.type, op.params);
  }
  for (const ctrl of CONTROL_MAP) {
    const params = byType.get(ctrl.opType);
    setValue(ctrl.id, params?.[ctrl.param] ?? 0);
  }
  // Tone curve midpoint
  const tcParams = byType.get("toneCurve");
  const tcMidY = tcParams?.points?.[1]?.[1];
  setValue("toneCurve", tcMidY != null ? Math.round((tcMidY - 0.5) * 200) : 0);
  // HSL
  const hslParams = byType.get("hsl");
  setValue("hsl-hue", hslParams?.hue ?? 0);
  setValue("hsl-sat", hslParams?.saturation ?? 0);
  setValue("hsl-lum", hslParams?.luminance ?? 0);
  // Crop
  const cropParams = byType.get("crop");
  setValue("crop-x", cropParams?.x ?? 0);
  setValue("crop-y", cropParams?.y ?? 0);
  setValue("crop-w", cropParams?.w ?? 1);
  setValue("crop-h", cropParams?.h ?? 1);
  // Rotate
  const rotParams = byType.get("rotate");
  if (setSelect) setSelect("rotate", String(rotParams?.degrees ?? 0));
  // Straighten
  const strParams = byType.get("straighten");
  setValue("straighten", strParams?.angle ?? 0);
}

// -- Library ----------------------------------------------------------------

async function refreshLibrary() {
  if (!bridge.available) {
    const grid = $("library-grid");
    if (grid) grid.innerHTML = '<p class="empty-state">Backend disconnected.</p>';
    return;
  }
  try {
    libraryImages = await bridge.listLibrary();
    // Load culling metadata
    try {
      const culling = await bridge.listCulling();
      cullingMap = {};
      for (const c of culling) {
        cullingMap[c.image_id || c.imageId] = c;
      }
    } catch { /* non-fatal */ }
    renderLibrary();
  } catch (error) {
    setStatus(`Library load failed: ${error.message}`);
  }
}

async function refreshPresetList() {
  const select = $("preset-select");
  const applyBtn = $("btn-apply-preset");
  if (!select) return;
  if (!bridge.available) return;
  try {
    const presets = await bridge.listPresets();
    select.innerHTML = '<option value="">— Load Preset —</option>';
    for (const p of presets) {
      const opt = document.createElement("option");
      opt.value = p.preset_id || p.presetId;
      opt.textContent = p.name;
      select.appendChild(opt);
    }
    select.disabled = false;
    if (applyBtn) applyBtn.disabled = false;
  } catch { /* non-fatal */ }
}

function renderLibrary() {
  const grid = $("library-grid");
  if (!grid) return;
  if (libraryImages.length === 0) {
    grid.innerHTML = '<p class="empty-state">No images imported yet.</p>';
    return;
  }
  grid.innerHTML = "";
  for (const img of libraryImages) {
    const item = document.createElement("div");
    item.className = "library-item";
    if (img.image_id === selectedImageId) item.classList.add("selected");
    item.dataset.imageId = img.image_id;

    const culling = cullingMap[img.image_id] || {};
    const rating = culling.rating || 0;
    const flagged = culling.flagged || false;
    const rejected = culling.rejected || false;
    const colorLabel = culling.color_label || culling.colorLabel || null;

    // Build star rating
    let starsHtml = "";
    for (let i = 1; i <= 5; i++) {
      starsHtml += `<span class="star ${i <= rating ? "star--on" : ""}" data-rating="${i}">★</span>`;
    }

    item.innerHTML = `
      <div class="thumb">${(img.observed_format || "?").toUpperCase().slice(0, 3)}</div>
      <div class="meta">
        <div class="name">${img.file_name || img.image_id}</div>
        <div class="format">${img.observed_format || "unknown"}</div>
      </div>
      <div class="culling">
        <div class="stars" data-action="rating">${starsHtml}</div>
        <div class="culling-actions">
          <button class="cull-btn ${flagged ? "cull-btn--active" : ""}" data-action="flag" title="Flag">⚑</button>
          <button class="cull-btn ${rejected ? "cull-btn--reject" : ""}" data-action="reject" title="Reject">✕</button>
          ${colorLabel ? `<span class="color-dot color-dot--${colorLabel}"></span>` : ""}
        </div>
      </div>
    `;

    // Image selection
    item.addEventListener("click", (e) => {
      // Don't select when clicking culling controls
      if (e.target.closest(".culling")) return;
      selectImage(img.image_id);
    });

    // Star rating
    item.querySelectorAll(".star").forEach((star) => {
      star.addEventListener("click", async (e) => {
        e.stopPropagation();
        const r = parseInt(star.dataset.rating, 10);
        try {
          const updated = await bridge.updateCulling(img.image_id, { rating: r });
          cullingMap[img.image_id] = updated;
          renderLibrary();
        } catch (err) {
          setStatus(`Rating failed: ${err.message}`);
        }
      });
    });

    // Flag toggle
    item.querySelector('[data-action="flag"]')?.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const updated = await bridge.updateCulling(img.image_id, { flagged: !flagged });
        cullingMap[img.image_id] = updated;
        renderLibrary();
      } catch (err) {
        setStatus(`Flag failed: ${err.message}`);
      }
    });

    // Reject toggle
    item.querySelector('[data-action="reject"]')?.addEventListener("click", async (e) => {
      e.stopPropagation();
      try {
        const updated = await bridge.updateCulling(img.image_id, { rejected: !rejected });
        cullingMap[img.image_id] = updated;
        renderLibrary();
      } catch (err) {
        setStatus(`Reject failed: ${err.message}`);
      }
    });

    grid.appendChild(item);
  }
}

// -- Selection --------------------------------------------------------------

async function selectImage(imageId) {
  selectedImageId = imageId;
  setStatus(`Selected ${imageId}`);
  renderLibrary();

  // Persist workspace state for reopen (criterion 3)
  if (bridge.available) {
    try {
      await bridge.saveWorkspaceState("default", {
        selectedImageId: imageId,
        activeFilter: "all",
      });
    } catch { /* non-fatal */ }
  }

  if (!bridge.available) return;
  try {
    const entry = await bridge.getRecipe(imageId);
    if (entry) {
      currentRecipe = entry.recipe;
      controlsFromRecipe(currentRecipe, (id, val) => {
        const input = $(`ctrl-${id}`);
        if (input) input.value = val;
      }, (id, val) => {
        const sel = $(`ctrl-${id}`);
        if (sel) sel.value = val;
      });
      const revEl = $("recipe-revision");
      if (revEl) revEl.textContent = `r${entry.revision}`;
    } else {
      currentRecipe = { version: 1, operations: [] };
      controlsFromRecipe(currentRecipe, (id, val) => {
        const input = $(`ctrl-${id}`);
        if (input) input.value = val;
      }, (id, val) => {
        const sel = $(`ctrl-${id}`);
        if (sel) sel.value = val;
      });
    }
  } catch (error) {
    setStatus(`Recipe load failed: ${error.message}`);
  }

  // Render preview after loading recipe
  renderPreview();
}

let previewRenderTimer = null;
let activePreviewRequest = null; // for stale-request supersession

/** Debounced preview render: called after develop control changes.
 *  Cancels stale in-flight requests per criterion 4 (supersede stale preview). */
function schedulePreviewRender() {
  if (previewRenderTimer) clearTimeout(previewRenderTimer);
  previewRenderTimer = setTimeout(renderPreview, 150);
}

async function renderPreview() {
  if (!selectedImageId) return;
  if (!bridge.available) {
    const empty = $("preview-empty");
    const canvas = $("preview-canvas");
    if (empty) empty.style.display = "block";
    if (canvas) canvas.style.display = "none";
    return;
  }

  const img = libraryImages.find((i) => i.image_id === selectedImageId);
  const sourcePath = img?.source_path || img?.sourcePath;
  if (!sourcePath) {
    setStatus("Preview: no source path for selected image.");
    return;
  }

  // Build the current recipe from controls
  const recipe = recipeFromControls(
    (id) => parseFloat($(`ctrl-${id}`)?.value ?? "0"),
    (id) => $(`ctrl-${id}`)?.value ?? "0",
  );

  // Supersede any in-flight request
  const requestId = Symbol("preview");
  activePreviewRequest = requestId;

  try {
    const result = await bridge.renderPipeline({
      mode: "preview",
      source: {
        imageId: selectedImageId,
        path: sourcePath,
        width: 0,
        height: 0,
      },
      recipe,
      width: 0,
      height: 0,
      samples: [],
    });

    // Ignore stale results
    if (activePreviewRequest !== requestId) return;

    // Draw samples on canvas
    const canvas = $("preview-canvas");
    const empty = $("preview-empty");
    if (!canvas) return;

    const { width, height, samples } = result;
    if (!width || !height || !samples || samples.length === 0) {
      setStatus("Preview: pipeline returned no pixels.");
      return;
    }

    canvas.width = width;
    canvas.height = height;
    canvas.style.display = "block";
    if (empty) empty.style.display = "none";

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.createImageData(width, height);
    const pixelCount = width * height;
    for (let i = 0; i < pixelCount; i++) {
      const sIdx = i * 3;
      const dIdx = i * 4;
      // Linear float → 8-bit sRGB OETF (match Rust export encoding)
      for (let ch = 0; ch < 3; ch++) {
        const linear = (samples[sIdx + ch] ?? 0);
        const srgb = linear <= 0.0031308
          ? linear * 12.92
          : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
        imageData.data[dIdx + ch] = Math.max(0, Math.min(255, Math.round(srgb * 255)));
      }
      imageData.data[dIdx + 3] = 255; // alpha
    }
    ctx.putImageData(imageData, 0, 0);

    // Record provenance
    const provEl = $("preview-provenance");
    if (provEl) {
      provEl.textContent = `${width}×${height} • ${result.recipeFingerprint?.slice(0, 12) ?? ""}…`;
    }
  } catch (error) {
    if (activePreviewRequest === requestId) {
      setStatus(`Preview render failed: ${error.message}`);
    }
  }
}

// -- Save recipe ------------------------------------------------------------

async function saveCurrentRecipe() {
  if (!selectedImageId || !bridge.available) return;
  currentRecipe = recipeFromControls(
    (id) => parseFloat($(`ctrl-${id}`)?.value ?? "0"),
    (id) => $(`ctrl-${id}`)?.value ?? "0",
  );
  try {
    const result = await bridge.saveRecipe(selectedImageId, currentRecipe);
    const revEl = $("recipe-revision");
    if (revEl) revEl.textContent = `r${result.revision}`;
    setStatus(`Saved recipe (revision ${result.revision})`);
  } catch (error) {
    setStatus(`Save failed: ${error.message}`);
  }
}

// -- Export ------------------------------------------------------------------

let exportJobs = [];

export function queueExportJob(imageId, format, quality) {
  const job = {
    id: `export-${exportJobs.length + 1}`,
    imageId,
    format,
    quality,
    status: "queued",
  };
  exportJobs.push(job);
  return job;
}

// -- Pipeline capabilities ---------------------------------------------------

async function checkPipeline() {
  if (!bridge.available) {
    setBadge("pipeline-badge", "Pipeline: offline", "badge--error");
    return;
  }
  try {
    const caps = await bridge.pipelineCapabilities();
    const mode = caps?.mode || "unknown";
    if (mode === "gpu") {
      setBadge("pipeline-badge", "GPU", "badge--ok");
    } else if (mode === "cpu") {
      setBadge("pipeline-badge", "CPU", "badge--warn");
    } else {
      setBadge("pipeline-badge", `Pipeline: ${mode}`, "badge--unknown");
    }
  } catch {
    setBadge("pipeline-badge", "Pipeline: error", "badge--error");
  }
}

// -- Wire up event listeners -------------------------------------------------

function wireControls() {
  for (const ctrl of [...CONTROL_MAP, ...SPECIAL_LABELS]) {
    const input = $(`ctrl-${ctrl.id}`);
    const label = $(ctrl.label);
    if (!input || !label) continue;
    input.addEventListener("input", () => {
      label.textContent = ctrl.format(parseFloat(input.value));
    });
    input.addEventListener("change", () => { saveCurrentRecipe(); schedulePreviewRender(); });
  }
  // Wire rotate select
  const rot = $("ctrl-rotate");
  if (rot) rot.addEventListener("change", () => saveCurrentRecipe());
  // Wire crop sliders
  for (const cid of ["crop-x", "crop-y", "crop-w", "crop-h"]) {
    const el = $(`ctrl-${cid}`);
    if (el) el.addEventListener("change", () => saveCurrentRecipe());
  }
  const q = $("export-quality");
  const ql = $("val-quality");
  if (q && ql) {
    q.addEventListener("input", () => { ql.textContent = q.value; });
  }
}

// -- Init -------------------------------------------------------------------

function init() {
  if (!bridge.available) {
    setBadge("pipeline-badge", "Backend: disconnected", "badge--error");
    setBadge("license-badge", "License: offline", "badge--error");
    setStatus("Tauri backend not available — running in disconnected mode.");
  } else {
    setBadge("license-badge", "Checking…", "badge--unknown");
    checkPipeline();
    refreshLibrary();
    // Restore last workspace state (criterion 3: reopen restores selected image)
    (async () => {
      try {
        const ws = await bridge.getWorkspaceState("default");
        if (ws?.stateJson) {
          const state = typeof ws.stateJson === "string" ? JSON.parse(ws.stateJson) : ws.stateJson;
          if (state.selectedImageId) {
            setStatus(`Restoring last session: ${state.selectedImageId}`);
            setTimeout(() => selectImage(state.selectedImageId), 500);
          }
        }
      } catch { /* non-fatal */ }
    })();
  }

  wireControls();
  $("btn-import")?.addEventListener("click", async () => {
    if (!bridge.available) {
      setStatus("Import requires a connected backend.");
      return;
    }
    // For alpha: prompt for file path (production will use Tauri file dialog)
    const input = prompt("Enter image file path(s), comma-separated:");
    if (!input) return;
    const paths = input.split(",").map((s) => s.trim()).filter(Boolean);
    if (paths.length === 0) return;
    try {
      const result = await bridge.importImages(paths);
      const n = result.imported?.length ?? 0;
      const skipped = result.skipped?.length ?? 0;
      setStatus(
        n > 0
          ? `Imported ${n} image(s)${skipped > 0 ? `, skipped ${skipped}` : ""}.`
          : `Import failed: ${skipped} skipped.`,
      );
      await refreshLibrary();
    } catch (error) {
      setStatus(`Import failed: ${error.message}`);
    }
  });
  $("btn-save-preset")?.addEventListener("click", async () => {
    if (currentRecipe.operations.length === 0) {
      setStatus("No operations to save as preset.");
      return;
    }
    const name = prompt("Preset name:", "Custom Preset");
    if (!name) return;
    const presetId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `preset-${Date.now()}`;
    try {
      await bridge.savePreset(presetId, name, currentRecipe);
      setStatus(`Saved preset '${name}'.`);
      await refreshPresetList();
    } catch (error) {
      setStatus(`Preset save failed: ${error.message}`);
    }
  });
  // Load preset list when backend is available
  if (bridge.available) refreshPresetList();
  // Criterion 7: Apply preset with validation; invalid presets are rejected
  $("btn-apply-preset")?.addEventListener("click", async () => {
    const presetId = $("preset-select")?.value;
    if (!presetId) {
      setStatus("Select a preset to apply.");
      return;
    }
    if (!selectedImageId) {
      setStatus("Select an image before applying a preset.");
      return;
    }
    try {
      const result = await bridge.applyPreset(presetId, selectedImageId);
      currentRecipe = result.recipe;
      controlsFromRecipe(currentRecipe, (id, val) => {
        const input = $(`ctrl-${id}`);
        if (input) input.value = val;
      }, (id, val) => {
        const sel = $(`ctrl-${id}`);
        if (sel) sel.value = val;
      });
      const revEl = $("recipe-revision");
      if (revEl) revEl.textContent = `r${result.revision}`;
      setStatus(`Applied preset '${result.appliedFromPreset}' to ${selectedImageId}.`);
    } catch (error) {
      // Criterion 7: Invalid preset operations are rejected with user-visible message
      setStatus(`Preset rejected: ${error.message}`);
    }
  });
  $("btn-batch-sync")?.addEventListener("click", async () => {
    if (!selectedImageId) {
      setStatus("Select a source image first.");
      return;
    }
    const types = [...document.querySelectorAll(".sync-type:checked")].map((el) => el.value);
    if (types.length === 0) {
      setStatus("Select at least one operation type to sync.");
      return;
    }
    setStatus(`Batch syncing [${types.join(", ")}]...`);
    try {
      const result = await bridge.batchSync(selectedImageId, types);
      setStatus(`Batch sync complete: ${result.message} (updated: ${result.updatedCount}, skipped: ${result.skippedCount}).`);
      refreshLibrary();
    } catch (error) {
      setStatus(`Batch sync failed: ${error.message}`);
    }
  });
  $("btn-export")?.addEventListener("click", async () => {
    if (!selectedImageId) {
      setStatus("Select an image to export.");
      return;
    }
    // Criterion 9: Export must not bypass licensing
    if (bridge.available) {
      try {
        const license = await bridge.checkLicense();
        if (!license.activated) {
          setStatus(`Export blocked: ${license.reason}`);
          return;
        }
      } catch (error) {
        setStatus(`License check failed: ${error.message}`);
        return;
      }
    }
    const format = $("export-format")?.value || "png";
    const quality = parseInt($("export-quality")?.value ?? "92", 10);
    const job = queueExportJob(selectedImageId, format, quality);
    setStatus(`Queued ${format.toUpperCase()} export for ${selectedImageId}.`);
    const list = $("export-jobs");
    if (list) {
      const el = document.createElement("div");
      el.className = "job-item";
      el.dataset.jobId = job.id;
      el.innerHTML = `<span>${job.id}: ${format.toUpperCase()}</span><span class="status--${job.status}">${job.status}</span>`;
      list.appendChild(el);
    }

    // Execute export through the pipeline when bridge is available
    if (bridge.available) {
      const img = libraryImages.find((i) => i.image_id === selectedImageId);
      const sourcePath = img?.source_path || img?.sourcePath;
      if (!sourcePath) {
        job.status = "failed";
        setStatus("Export failed: no source path for selected image.");
        return;
      }
      // Derive output path and extension from source and format
      const dotIdx = sourcePath.lastIndexOf(".");
      const baseName = dotIdx > 0 ? sourcePath.slice(0, dotIdx) : sourcePath;
      const ext = format === "tiff-16" || format === "tiff-8" ? ".tiff"
        : format === "jpeg" || format === "jpg" ? ".jpg"
        : ".png";
      const outputPath = `${baseName}-edited-${job.id}${ext}`;
      try {
        const result = await bridge.exportImage(
          selectedImageId,
          sourcePath,
          currentRecipe,
          outputPath,
          format,
          quality,
        );
        job.status = "done";
        setStatus(
          `Exported ${result.width}x${result.height} ${result.format.toUpperCase()} (${result.fileSizeBytes} bytes) → ${result.outputPath}`,
        );
      } catch (error) {
        job.status = "failed";
        setStatus(`Export failed: ${error.message}`);
      }
      // Update job item in UI
      const jobEl = list?.querySelector(`[data-job-id="${job.id}"]`);
      if (jobEl) {
        const statusEl = jobEl.querySelector(`[class^="status--"]`);
        if (statusEl) {
          statusEl.className = `status--${job.status}`;
          statusEl.textContent = job.status;
        }
      }
    }
  });
}

if (typeof document !== "undefined") {
  init();
}
