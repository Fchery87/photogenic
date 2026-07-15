# Photogenic Production Readiness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Take Photogenic from its current Phase-0 scaffold to a production-ready, commercially distributable AI photo editor competitive with Evoto.ai.

**Architecture:** Keep the existing Tauri 2 + React 19 + Rust core. Rebuild the render path around GPU compute (wgpu) with proxy-resolution previews and binary frame transfer (custom URI protocol — never JSON pixels). Replace hand-rolled decoders with proven crates (`image`, `rawler`). Add a color-managed pipeline (linearize on decode, camera WB + color matrix for RAW, sRGB on output). Layer AI retouching on ONNX Runtime (`ort`) with a local model manager. Finish with signing, updater, licensing server, and telemetry backend.

**Tech Stack:** Rust (wgpu 24, rusqlite, rawler, image, kamadak-exif, fast_image_resize, ort), Tauri 2 (custom URI scheme protocol, updater plugin), React 19 + Vite, ONNX models (YuNet, face parsing, LaMa-class inpainting, MODNet-class matting), GitHub Actions CI/CD.

---

## How to read this plan

- **4 phases, strictly ordered.** Phase N+1 assumes Phase N's exit criteria are met. Within a phase, tasks are ordered by dependency; tasks marked ⚡ can be parallelized with the previous task.
- **Phase 1 tasks are written at full TDD granularity** (they are the critical path and touch the trickiest code). Phases 2–4 are written as precise specs: exact files, test names, commands, and acceptance gates — expand each into red/green/commit steps at execution time using @superpowers:test-driven-development.
- **Every task ends in a commit.** Run `npm test && cargo test --manifest-path src-tauri/Cargo.toml` before every commit unless the task says otherwise.
- **Verification:** after each milestone, run the milestone's Exit Gate. Do not proceed on a red gate.

### Current-state findings this plan fixes (from 2026-07-15 code review)

| # | Finding | Fixed in |
|---|---------|----------|
| F1 | Preview renders full-res on CPU, pixels serialized as JSON `Vec<f32>` over IPC (`src-tauri/src/lib.rs:300`, `app/src/runtime.ts:164`) | Tasks 1.6–1.9 |
| F2 | `GpuPipeline` is dead code — exported but never called by any command | Task 1.10 |
| F3 | Sharpen/noise-reduction are per-sample scalar functions — mathematically can't work (`cpu_pipeline.rs:142,154`) | Task 1.12 |
| F4 | No color management: sRGB bytes treated as linear on decode; no camera WB/color-matrix for RAW; no EXIF orientation; export re-applies OETF (brightens no-op round-trips) | Tasks 1.4–1.5 |
| F5 | Hand-rolled JPEG (baseline-only, no progressive), TIFF, DNG decoders; `rawloader` limited camera coverage | Task 1.3 |
| F6 | No thumbnails (format-text badge only), no EXIF in catalog | Task 1.13 |
| F7 | No zoom/pan; canvas is bare `putImageData` | Task 1.11 |
| F8 | No undo/redo | Task 1.14 |
| F9 | `straighten` op is a no-op (`transform.rs:19`); `mask` accepted by schema, unimplemented | Tasks 1.12 (straighten), 2.1 (mask) |
| F10 | License badge can never show "active": backend returns `{activated}`, frontend reads `lic?.status` (`App.tsx:42`) | Task 1.1 |
| F11 | Dev harness ships in release: viewport-proof thread on startup writes to `.scratch/` via compile-time `CARGO_MANIFEST_DIR` path; hardcoded `fps = 60.0` | Task 1.2 |
| F12 | Updater non-functional: empty `pubkey`, `releases.photogenic.example.com` placeholder endpoint | Task 4.1–4.3 |
| F13 | Licensing is offline-file-only: no activation server, trial, purchase flow, device management | Task 4.4 |
| F14 | Telemetry/crash logs are local-only, no submission backend | Task 4.6 |
| F15 | Export is single-image; UI "batch queue" is a local JS array; no resize/color-space/metadata options | Tasks 2.3–2.4 |
| F16 | `export_image`/`decode_source` accept arbitrary paths from the webview (arbitrary read/write via IPC) | Task 2.6 |
| F17 | Catalog is `Mutex<SqliteCatalogStore>` — single connection, sync commands block | Task 2.7 |
| F18 | Zero AI/ML infrastructure (the core Evoto differentiator) | Phase 3 |

### Effort map (1 experienced engineer, rough)

- Phase 1 — Real Editor Core: **6–8 weeks**
- Phase 2 — Pro Editing Basics: **5–7 weeks**
- Phase 3 — AI Retouching: **12–20 weeks** (model-dependent)
- Phase 4 — Commercialization: **4–6 weeks** (plus external lead times: code-signing certs, Apple/Microsoft accounts)

---

# PHASE 1 — Make the Editor Real

**Objective:** A photographer can import a 24MP RAW, see a correct-color preview, drag sliders with < 100 ms visual feedback, zoom/pan, undo, and export a file that matches the preview.

**Exit Gate (run at end of phase):**
1. `npm test` and `cargo test` green on Linux/macOS/Windows CI.
2. Manual: import a real `.NEF` or `.ARW` ≥ 24MP → thumbnail appears < 2 s; select → preview < 1 s; drag exposure → update < 100 ms (log render+transfer time in status bar); colors have no green cast; zoom to 100% and pan; undo/redo 10 steps; export JPEG → opens in system viewer matching preview.
3. Release build (`npm run tauri:build`) writes nothing to `.scratch/`, no viewport-proof thread.

## Milestone 1.A — Quick fixes and de-scaffolding

### Task 1.1: Fix the license badge field mismatch

**Files:**
- Modify: `app/src/App.tsx:40-54`
- Test: `test/components/topbar.test.js` (extend)

**Step 1: Write the failing test** — in `test/components/topbar.test.js`, add a test that mounts `App` with a mocked bridge whose `checkLicense` resolves `{ activated: true, reason: "License active: lic-1" }` and asserts the badge text becomes `License: active`. Follow the existing mock pattern in that file (the suite already stubs `bridge`).

**Step 2: Run it, verify it fails** — `npm run test:components`. Expected: badge stays `License: unknown`.

**Step 3: Implement** — in `App.tsx`, replace the `lic?.status` logic:

```tsx
bridge.checkLicense().then((lic: any) => {
  if (lic?.activated === true) {
    setLicenseBadge({ text: "License: active", cls: "badge--ok" });
  } else if (typeof lic?.reason === "string" && /expired/i.test(lic.reason)) {
    setLicenseBadge({ text: "License: expired", cls: "badge--warn" });
  } else {
    setLicenseBadge({ text: "License: inactive", cls: "badge--unknown" });
  }
})
```

**Step 4: Run tests to verify pass** — `npm run test:components`.

**Step 5: Commit** — `git commit -m "fix: read activated flag from check_license in license badge"`

### Task 1.2: Feature-gate the viewport-proof harness out of release builds

**Files:**
- Modify: `src-tauri/Cargo.toml` (add `[features] viewport-proof = []`, include it in `default` only for dev if desired — recommended: not in default)
- Modify: `src-tauri/src/lib.rs` — wrap `save_viewport_setup_heartbeat`, `collect_and_save_viewport_proof`, the 3-second spawn thread in `setup`, `write_proof_file`, `chrono_now`, `days_to_ymd`, `is_leap`, and the `viewport_proof_results`/`save_viewport_proof` commands in `#[cfg(feature = "viewport-proof")]`
- Modify: `app/src/runtime.ts` — guard `collectViewportProof()` behind `import.meta.env.DEV`
- Modify: `.github/workflows/ci.yml` — CI test job builds with `--features viewport-proof` so the harness stays tested

**Steps:**
1. Add the feature flag; gate the Rust items. The specta `collect_commands!` list must also be conditional — split into two `specta_builder()` bodies with `#[cfg]`, or register the two proof commands only under the feature.
2. Also delete the runtime `.scratch/` path usage: under the feature flag, write reports to `app_data_dir()/verification/` instead of `env!("CARGO_MANIFEST_DIR")/../.scratch/...` (fixes the baked build-machine path).
3. `cargo build --manifest-path src-tauri/Cargo.toml` (no feature) and `cargo test --manifest-path src-tauri/Cargo.toml --features viewport-proof` both green.
4. `npm test` green (viewport-proof JS tests still run; they exercise `src/viewport-proof/*` seams, not the app).
5. Commit: `feat: gate viewport-proof harness behind cargo feature, move reports to app data dir`

### Task 1.3: Replace hand-rolled decoders with `image` + `rawler` ⚡

**Files:**
- Modify: `src-tauri/Cargo.toml` — add `image = { version = "0.25", default-features = false, features = ["png", "jpeg", "tiff"] }`, `rawler = "0.6"`, `kamadak-exif = "0.5"`; remove `rawloader`, `png` stays (encoder used in export) or switch export to `image` too
- Modify: `src-tauri/src/core/decode.rs` — `decode_png`, `decode_jpeg`, `decode_tiff` delegate to `image::load_from_memory_with_format`; `decode_raw` and `decode_dng` delegate to `rawler`
- Delete (after parity): `src-tauri/src/core/jpeg_decoder.rs`, `src-tauri/src/core/dng_decoder.rs`, `src-tauri/src/core/raw_decoder.rs`
- Test: existing `decode.rs` tests + new fixtures in `test/fixtures/images/` (add a progressive JPEG, a 16-bit TIFF, keep the PNG)

**Step 1: Write failing tests first:**
- `decode_progressive_jpeg_succeeds` — decode `test/fixtures/images/progressive.jpg` (generate: `convert test-rgb.png -interlace JPEG progressive.jpg`, or `cjpeg -progressive`). Currently fails (custom decoder is baseline-only).
- `decode_raw_returns_camera_metadata` — decoding a RAW fixture returns a `DecodedSource` that now carries `camera_wb: Option<[f32; 4]>` and `color_matrix: Option<[[f32; 3]; 3]>` (new fields on `DecodedSource`/`DecodedImageBuffer` metadata struct). Use a small real RAW fixture — rawler's own test corpus has tiny samples; vendor one ≤ 2 MB with license noted in `test/fixtures/images/README`.

**Step 2:** `cargo test decode` → new tests fail.

**Step 3: Implement.** Key shape:

```rust
// decode.rs
fn decode_with_image_crate(bytes: &[u8], fmt: image::ImageFormat) -> Result<DecodedImageBuffer, DecodeError> {
    let img = image::load_from_memory_with_format(bytes, fmt)
        .map_err(|e| DecodeError::new(DecodeErrorKind::ReadFailed, format!("decode failed: {e}")))?;
    let rgb = img.to_rgb32f(); // f32, still *encoded* sRGB values at this point
    DecodedImageBuffer::linear_float(rgb.width(), rgb.height(), rgb.into_raw())
        .map_err(|e| DecodeError::new(DecodeErrorKind::ReadFailed, e))
}

fn decode_raw(bytes: &[u8]) -> Result<DecodedSource, DecodeError> {
    let raw = rawler::decode(&mut std::io::Cursor::new(bytes), &rawler::decoders::RawDecodeParams::default())?;
    // rawler exposes: raw.develop() path OR raw image + wb_coeffs + xyz-to-cam matrix.
    // Use rawler's develop/demosaic to get linear camera-RGB f32, and surface:
    //   camera_wb  = raw.wb_coeffs
    //   color_matrix = raw.camera_to_srgb_matrix (compute from XYZ matrices, see Task 1.5)
    ...
}
```

Note: keep `DecodedImageBuffer` API stable; add a `SourceMetadata { camera_wb, color_matrix, orientation, exif: Option<ExifSummary> }` field threaded through `DecodedSource`. EXIF via `kamadak-exif` on the original bytes.

**Step 4:** All decode tests green, including old PNG/TIFF tests. `export_image` tests still green.

**Step 5:** Delete the three hand-rolled decoder modules, remove `rawloader`. `cargo test` green. Commit: `feat: replace hand-rolled decoders with image + rawler, extract camera metadata and EXIF`

## Milestone 1.B — Color management (correctness)

### Task 1.4: Linearize on decode, encode on output — one owner for gamma

**Files:**
- Create: `src-tauri/src/core/color.rs` (replace the current 14-line stub) — `srgb_to_linear(f32) -> f32`, `linear_to_srgb(f32) -> f32`, plus slice helpers
- Modify: `src-tauri/src/core/decode.rs` — apply `srgb_to_linear` to `image`-crate outputs (PNG/JPEG/8- and 16-bit TIFF). RAW output from rawler is already linear — do NOT linearize it
- Modify: `src-tauri/src/lib.rs` `export_image` — keep its existing linear→sRGB OETF (now correct because input is truly linear)
- Test: `src-tauri/src/core/color.rs` unit tests + a round-trip test

**Step 1: Failing test** — `decode_then_export_identity_roundtrip`: decode `test-rgb.png`, run empty recipe through `CpuPipeline`, encode to PNG, decode again; assert max per-channel delta ≤ 1/255. Currently fails (double gamma → bright).

**Step 2:** `cargo test roundtrip` → fails with large delta.

**Step 3: Implement:**

```rust
pub fn srgb_to_linear(v: f32) -> f32 {
    if v <= 0.04045 { v / 12.92 } else { ((v + 0.055) / 1.055).powf(2.4) }
}
pub fn linear_to_srgb(v: f32) -> f32 {
    if v <= 0.0031308 { v * 12.92 } else { 1.055 * v.powf(1.0 / 2.4) - 0.055 }
}
```

Apply in `decode_with_image_crate` over all samples.

**Step 4:** Round-trip test green. **Step 5:** Commit: `fix: linearize sRGB sources on decode — identity recipe now round-trips`

### Task 1.5: Camera white balance, color matrix, and EXIF orientation for RAW

**Files:**
- Create: `src-tauri/src/core/raw_develop.rs` — `develop_raw(buffer, meta) -> DecodedImageBuffer`: apply `camera_wb` multipliers → clip → 3×3 camera-to-sRGB(linear) matrix (derived from rawler's XYZ-to-camera matrix: `cam_to_srgb = srgb_to_xyz⁻¹ · xyz_to_cam⁻¹`, normalized so white maps to white)
- Modify: `src-tauri/src/core/decode.rs` — call `develop_raw` inside RAW path; apply EXIF orientation (rotate/flip buffer) for ALL formats
- Test: `raw_develop.rs` unit tests with synthetic matrices; orientation test with a rotated-EXIF JPEG fixture

**Tests to write first:**
- `camera_wb_neutralizes_gray`: synthetic camera-RGB gray patch with wb coeffs `[2.0, 1.0, 1.5, 0]` → after develop, R≈G≈B.
- `orientation_6_rotates_90cw`: 2×1 fixture with EXIF orientation 6 decodes to 1×2 with pixels transposed.

**Acceptance:** real RAW fixture renders without green cast (manual check + snapshot the mean R/G/B ratios in a test with tolerance).

**Commit:** `feat: develop RAW with camera WB + color matrix, honor EXIF orientation`

## Milestone 1.C — Kill JSON pixels: binary frame transfer + proxy rendering

Design (applies to Tasks 1.6–1.9): the webview never receives pixel JSON again. Two channels:

1. **Small, typed JSON via existing specta commands** — recipes, catalog, render *descriptions*.
2. **Pixels via a custom URI scheme protocol** `photogenic://` registered in Rust with `register_asynchronous_uri_scheme_protocol`. Endpoints: `photogenic://render/{image_id}?w={w}&h={h}&rev={staging_rev}` → RGBA8 bytes (or PNG for simplicity first) of the *proxy-resolution* render; `photogenic://thumb/{image_id}` → cached JPEG thumbnail. JS side: `fetch()` → `blob()` → `createImageBitmap()` → `drawImage`. Slider flow: input → `set_preview_recipe` (tiny JSON, bumps staging rev) → fetch frame URL with new rev (rev in URL busts any caching).

### Task 1.6: Preview staging state + `set_preview_recipe` command

**Files:**
- Modify: `src-tauri/src/lib.rs` — `AppState` gains `preview: Mutex<PreviewStaging>` where `PreviewStaging { image_id: Option<String>, recipe: Recipe, rev: u64 }`; add specta command `set_preview_recipe(image_id: String, recipe: serde_json::Value) -> Result<u64, String>` (validates recipe, stores, returns incremented rev)
- Test: Rust unit test `set_preview_recipe_increments_rev_and_validates`

TDD: test that invalid recipe returns `Err`, valid recipe returns monotonically increasing rev. Commit: `feat: add preview staging state and set_preview_recipe command`.

### Task 1.7: Proxy-resolution render service

**Files:**
- Create: `src-tauri/src/core/preview_service.rs` — `render_proxy(source_path, recipe, max_w, max_h) -> Result<RgbaFrame, String>`; decode (with an LRU of decoded sources, capacity 2–3 entries keyed by path+mtime — decoding a 24MP RAW per slider tick is the other half of the latency problem), downscale with `fast_image_resize` (add `fast_image_resize = "5"` to Cargo.toml) to fit max_w×max_h, run pipeline at proxy size, convert linear→sRGB u8 RGBA
- Test: `render_proxy_downscales_and_caches` — 2nd call with same path does not re-decode (assert via decode-count hook or timing-free counter)

**Key detail:** downscale happens BEFORE the pipeline runs (pipeline cost scales with proxy pixels, not source pixels). Crop/rotate operate in normalized coordinates so they are resolution-independent — verify `transform.rs` uses normalized params (it does: crop x/y/w/h are 0–1).

Commit: `feat: proxy-resolution preview render service with decode cache`.

### Task 1.8: `photogenic://` protocol handler serving frames and thumbnails

**Files:**
- Modify: `src-tauri/src/lib.rs` — in the builder chain:

```rust
.register_asynchronous_uri_scheme_protocol("photogenic", move |app, request, responder| {
    // parse path: /render/{image_id} or /thumb/{image_id}; query: w, h, rev
    // look up source path from catalog, recipe from PreviewStaging (or saved recipe if rev absent)
    // std::thread::spawn or async task: preview_service::render_proxy(...)
    // responder.respond(http::Response::builder()
    //     .header("Content-Type", "application/octet-stream")
    //     .header("X-Frame-Width", w).header("X-Frame-Height", h)
    //     .body(rgba_bytes)?)
})
```

- Modify: `src-tauri/tauri.conf.json` CSP — add `photogenic:` to `connect-src` and `img-src`: `"csp": "default-src 'self'; img-src 'self' data: photogenic: http://photogenic.localhost; connect-src 'self' photogenic: http://photogenic.localhost; style-src 'self' 'unsafe-inline'"` (Windows uses `http://{scheme}.localhost` form — include both).
- Test: Rust-side unit test for the URL parser (`parse_frame_request("photogenic://render/img-1?w=800&h=600&rev=4")`); protocol handler itself is covered by the Phase-1 exit gate manual check + a Tauri integration smoke in `scripts/smoke.mjs`.

Commit: `feat: photogenic:// protocol serves binary preview frames`.

### Task 1.9: Frontend: fetch frames, drop JSON pixel path

**Files:**
- Modify: `app/src/runtime.ts` — replace `renderPreview()` body: `await bridge.setPreviewRecipe(id, recipe)` → `const resp = await fetch(\`photogenic://render/${id}?w=${cw}&h=${ch}&rev=${rev}\`)` (on Windows/WebView2 the scheme is exposed as `http://photogenic.localhost/render/...` — add a tiny `frameUrl()` helper that picks by platform via `navigator.userAgent` or a bridge-provided flag) → `createImageBitmap(new ImageData(...))` or decode PNG blob → `ctx.drawImage`. Reduce debounce from 150 ms to 30 ms. Keep request-cancellation via `rev` comparison.
- Modify: `app/tauri-bridge.js` + `app/src/bridge.ts` — add `setPreviewRecipe`; mark old `renderPipeline` deprecated (keep the Rust command for `src/` seam tests for now, but the app must not call it with empty `samples` anymore)
- Test: `test/components/preview.test.js` — mock `fetch` returning a 2×2 RGBA payload; assert canvas drawn and provenance bar updated. Existing JSON-path assertions are updated to the new flow.

**Acceptance (measure, don't assume):** add a status-bar timing readout `render Xms · transfer Yms`; on a 24MP source, X+Y < 100 ms on the dev machine.

Commit: `feat: preview via binary frame fetch — JSON pixel transfer removed from app`.

### Task 1.10: Wire the GPU pipeline with CPU fallback

**Files:**
- Modify: `src-tauri/src/core/gpu_pipeline.rs` — extend from `render_exposure` to a full `render(buffer, recipe, mode)` matching `CpuPipeline::render`'s contract (the `tone.wgsl` DevelopParams struct already models the full op set — bind it)
- Create: `src-tauri/src/core/engine.rs` — `RenderEngine::new()` detects GPU once (reuse `detect_pipeline_capabilities`), holds `Option<GpuPipeline>`; `render()` tries GPU, falls back to CPU on error, records `last_backend: "gpu" | "cpu"`
- Modify: `preview_service.rs` and `export_image` to call `RenderEngine` (held in `AppState`, lazy-init behind `OnceLock`)
- Test: extend `gpu_pipeline_tests.rs` — **parity test**: for a fixed 64×64 source and a recipe using every op type, GPU and CPU outputs match within 1/255 per channel (skip GPU asserts when no adapter, but always run CPU side). This parity test is the contract that keeps preview (GPU) and export (must match preview) honest.

**Acceptance:** pipeline badge in TopBar shows "GPU" on a GPU machine and preview visibly speeds up (log timings before/after in the task notes).

Commit: `feat: route preview and export through RenderEngine with GPU + CPU parity`.

## Milestone 1.D — Editor UX floor

### Task 1.11: Zoom/pan viewport

**Files:**
- Modify: `app/src/components/PreviewArea.tsx` — wrap canvas in a viewport div; state: `{ zoom: fit | 1.0 | ..., panX, panY }`; wheel = zoom around cursor, drag = pan, double-click toggles fit/100%
- Modify: `app/src/runtime.ts` — request proxy frames at `viewport_size × zoom` capped at source size; re-fetch on zoom settle (debounced 100 ms), CSS-transform the existing bitmap while zooming for instant feedback
- Test: `test/components/preview.test.js` — zoom state transitions; wheel event → scale updates; frame URL requested with larger w/h after zoom

Commit: `feat: zoom and pan in preview viewport with resolution-on-demand`.

### Task 1.12: Real sharpen, noise reduction, and straighten

**Files:**
- Modify: `src-tauri/src/core/cpu_pipeline.rs` — replace per-sample `apply_sharpening`/`apply_noise_reduction` with 2D neighborhood ops: sharpen = unsharp mask (Gaussian blur σ≈1.0, `out = base + amount × (base − blur)`); NR = bilateral-style or box-blur luma smoothing (first pass: chroma-preserving Gaussian on luma, amount-weighted). These need width/height — change the internal op signatures from `(sample, amount)` to `(&[f32], w, h, amount) -> Vec<f32>` and reorder: geometric transforms → point ops → neighborhood ops
- Modify: `src-tauri/src/core/transform.rs:19` — implement `straighten`: rotate by `angle` degrees with bilinear sampling and auto-crop to the largest inscribed rect
- Modify: `src-tauri/src/core/shaders/tone.wgsl` + `gpu_pipeline.rs` — GPU equivalents (separable Gaussian in two passes); parity test from Task 1.10 must still pass with sharpen/NR in the recipe
- Test (write first): `sharpen_increases_edge_contrast` (step-edge image: post-sharpen gradient magnitude at the edge > pre); `noise_reduction_reduces_variance` (noisy flat field: post-NR variance < pre, mean preserved ±1%); `straighten_rotates_content` (diagonal line becomes horizontal within tolerance)

Commit: `feat: real unsharp-mask sharpening, luma NR, and straighten`.

### Task 1.13: Thumbnails and EXIF in the catalog ⚡

**Files:**
- Modify: `src-tauri/src/catalog/store.rs` + `schema.rs` — migration v2: `ALTER TABLE imported_images ADD COLUMN` for `thumb_path TEXT`, `exif_json TEXT`, `width INTEGER`, `height INTEGER`, `captured_at TEXT`, `camera_model TEXT` (follow the existing migration pattern in `store.rs`; add `schema_version` pragma handling if absent)
- Create: `src-tauri/src/catalog/thumbnails.rs` — on import (and backfill on startup for rows with NULL thumb), decode → downscale to 256px JPEG (quality 80) → write to `app_data_dir/thumbnails/{image_id}.jpg`; RAW: prefer the embedded JPEG preview via rawler (fast) over full develop
- Modify: `import_images_into_store` — spawn thumbnail generation on a worker thread; emit Tauri event `thumbnail-ready {imageId}` per completion
- Modify: `app/src/components/LibraryGrid.tsx` — `<img src={"photogenic://thumb/" + img.imageId}>` with the format badge as fallback; listen for `thumbnail-ready` to refresh; show `camera_model` and capture date in the row
- Test: Rust — `import_generates_thumbnail_and_exif` (import PNG fixture → thumb file exists, width/height populated); JS — LibraryGrid renders `img` tags with protocol URLs

Commit: `feat: thumbnail pipeline and EXIF metadata in library`.

### Task 1.14: Undo/redo history

**Files:**
- Create: `app/src/history.ts` — bounded stack (100 entries) of recipe snapshots per image: `push(recipe)`, `undo() -> recipe|null`, `redo() -> recipe|null`; coalesce entries from the same slider within 500 ms (one undo step per gesture, not per debounce tick)
- Modify: `app/src/runtime.ts` — push on `photogenic:recipe-changed`; `Ctrl/Cmd+Z` → undo, `Ctrl/Cmd+Shift+Z` → redo → dispatch `photogenic:recipe-loaded` + save + re-render
- Modify: `app/src/components/TopBar.tsx` — undo/redo buttons with disabled states
- Test: `test/history.test.js` — push/undo/redo semantics, coalescing, bound; `test/components/topbar.test.js` — buttons dispatch events

Commit: `feat: per-image undo/redo with gesture coalescing`.

### Task 1.15: Phase 1 exit gate + performance baseline

**Files:**
- Create: `scripts/perf-baseline.mjs` — scripted run (reuse `scripts/smoke.mjs` harness) that imports a fixture, renders 20 preview frames with varying exposure, prints p50/p95 render+transfer ms; store results in `docs/runbooks/perf-baseline.md`
- Run the full Phase 1 Exit Gate checklist (top of Phase 1) manually; record results in `docs/runbooks/phase1-exit.md`

Commit: `chore: phase 1 exit gate results and perf baseline`.

---

# PHASE 2 — Pro Editing Basics

**Objective:** The tool is credible for a working photographer's non-AI workflow: local adjustments, full HSL, real batch export, safe IPC, more cameras.

**Exit Gate:** batch-export 50 RAWs to resized JPEGs with progress and cancel; paint a radial mask that lifts shadows locally, visible in preview and identical in export; full-range HSL; all IPC paths scoped; catalog operations don't block rendering.

### Task 2.1: Mask/local-adjustment engine (F9)

**Files:** `src-tauri/src/core/masks.rs` (new), `cpu_pipeline.rs`, `tone.wgsl`/`gpu_pipeline.rs`, `src-tauri/src/core/recipe.rs` (mask param schema), `app/src/components/MaskPanel.tsx` (new), `app/src/runtime.ts`, tests both sides.

**Spec:** `mask` op params: `{ kind: "linear"|"radial"|"brush", geometry: {...normalized coords...}, feather: 0..1, adjustments: { exposure?, contrast?, shadows?, highlights?, temperature?, saturation? } }`. Engine: rasterize mask to a coverage map at render resolution → apply the adjustment subset weighted by coverage. Brush masks: store stroke list (normalized points + radius + flow), rasterize on demand; cap stored strokes per mask (e.g., 2,000) to bound recipe size — recipes stay JSON-serializable and fingerprintable (existing fingerprint machinery keeps working). UI: mask list + add linear/radial/brush; overlay rendering on canvas (red 50% coverage visualization toggle).
**Tests first:** rasterizer unit tests (linear gradient coverage values at known points; radial falloff; feather widens transition), pipeline test (masked exposure changes only masked region), GPU parity extension.
**Estimated:** 2–3 weeks; this is the largest Phase 2 task. Commit per sub-piece (rasterizer / pipeline / UI).

### Task 2.2: Full HSL (8 ranges) + vibrance/saturation ⚡

**Files:** `cpu_pipeline.rs` (`apply_red_hsl_samples` → generalized `apply_hsl(target_range, ...)` over red/orange/yellow/green/aqua/blue/purple/magenta with smooth hue-range weights), `recipe.rs` (accept `target` enum), shaders, `DevelopPanel.tsx` (range selector), tests: per-range isolation (shifting red hue leaves a blue patch untouched), plus new global `saturation`/`vibrance` ops.
**Commit:** `feat: full 8-range HSL with vibrance and saturation`.

### Task 2.3: Real batch export queue (Rust-side) (F15)

**Files:** `src-tauri/src/export/mod.rs` (new module): job model `{ id, image_ids, options, status, progress, error }`, worker pool (`std::thread` × `num_cpus/2`), commands `queue_export(image_ids, options) -> job_id`, `cancel_export(job_id)`, `list_export_jobs()`; progress via Tauri events `export-progress {jobId, done, total, currentImage}`. Uses saved recipes from catalog. `ExportPanel.tsx` rewires to real jobs with progress bars and cancel; remove the local `exportJobs` array in `runtime.ts`.
**Tests first:** Rust — queue 3 images, all complete, files exist; cancellation stops before finishing; a failing source marks the job `failed` with per-image errors, others complete. JS — panel renders progress events.
**Commit:** `feat: rust-side parallel batch export with progress and cancel`.

### Task 2.4: Export options: resize, quality, metadata, color space ⚡

**Files:** `src-tauri/src/export/options.rs` — `{ format, quality, resize: {mode: long_edge|dimensions|none, px}, keep_metadata: bool, srgb_tag: bool }`; resize via `fast_image_resize` post-pipeline; EXIF copy via `img-parts` (JPEG) or write minimal EXIF + embed sRGB ICC profile bytes. `ExportPanel.tsx` gains the options UI.
**Tests:** exported long-edge-2048 JPEG has max dimension 2048; metadata present when `keep_metadata`; quality affects file size monotonically.
**Commit:** `feat: export resize, quality, metadata, and sRGB tagging options`.

### Task 2.5: Lens corrections + camera coverage pass

**Files:** `src-tauri/src/core/lens.rs` (new) — distortion/vignetting correction from `lensfun` database (via `lensfun-rs` binding, or ship a parsed subset of the lensfun XML — decide at implementation; XML-subset avoids a C dependency), matched from EXIF lens/camera fields; new recipe op `lensCorrection { auto: true }`. Verify rawler coverage against a target camera list (top 20 bodies used by portrait/wedding photographers — Canon R5/R6, Nikon Z6/Z7/Z8, Sony A7 III/IV/A7R V, Fuji X-T4/5...); document gaps in `docs/runbooks/camera-coverage.md`, add per-camera fixtures where licenses permit.
**Tests:** vignette correction brightens corners of a synthetic vignetted field; distortion correction straightens a synthetic barrel grid.
**Commit:** `feat: auto lens corrections from lensfun data`.

### Task 2.6: IPC path scoping (F16)

**Files:** `src-tauri/src/lib.rs` — central `PathPolicy` in `AppState`: reads allowed only under user-imported roots (recorded at import time in catalog) + explicit dialog picks; writes only under user-chosen export directory picked via native dialog (`tauri-plugin-dialog` — add plugin + capability, dialog runs Rust-side so the webview never fabricates a path); `export_image`/`queue_export` take a directory token from the dialog, not a raw path.
**Tests:** export to `/etc/photogenic-test` rejected; read of un-imported path rejected.
**Commit:** `feat: scope filesystem access behind import roots and export dialog picks`.

### Task 2.7: Catalog concurrency + async commands (F17)

**Files:** `src-tauri/src/catalog/store.rs` — enable WAL (`PRAGMA journal_mode=WAL`), move store behind a small connection pool or a dedicated catalog thread with an mpsc command channel; convert hot commands (`list_library`, `get_recipe`, `save_recipe`) to `async fn` so slider-driven recipe saves never contend with thumbnail/import writes. Benchmark before/after in `perf-baseline.mjs` (add a "save recipe while importing 100 files" scenario).
**Commit:** `perf: WAL + dedicated catalog thread, async catalog commands`.

---

# PHASE 3 — AI Retouching (the Evoto gap, F18)

**Objective:** The first genuinely competitive AI feature set, local-first: face-aware retouching applied in batch with consistent results. Order matters — each task builds infrastructure the next consumes.

**Strategic notes (read before starting):**
- **Local-first inference is the differentiator** vs Evoto's cloud credits: zero marginal cost, works offline, privacy story. Accept cloud inference later only for models too heavy for consumer GPUs (generative fill).
- **Model licensing is a launch blocker, not a footnote.** Every model shipped must have a commercial-use license (Apache-2.0/MIT or purchased). Known traps: RMBG-1.4 (non-commercial), many face-parsing checkpoints trained on non-commercial datasets. Task 3.1 includes the audit artifact.
- **AI ops are recipe operations** like everything else (`{ type: "aiSkinSmooth", params: { amount, maskRef } }`) — they produce masks/warps/pixel patches cached per (image, model-version, params-hash) so recipes stay declarative, undoable, and batch-syncable via the existing `batch_sync` machinery. Cache lives in `app_data_dir/ai-cache/`.

**Exit Gate:** on a 50-image portrait shoot: detect faces on all images < 60 s total; one-click "retouch profile" (skin smooth + blemish removal + eye/teeth enhance) applied to all with per-image face-adaptive results; before/after toggle; export batch matches previews; all shipped models pass the license audit.

### Task 3.1: ONNX Runtime foundation + model manager

**Files:** `src-tauri/Cargo.toml` (`ort = "2"` with `cuda`/`directml`/`coreml` features per-target), `src-tauri/src/ai/mod.rs`, `src-tauri/src/ai/engine.rs` (session cache, EP selection: CUDA→DirectML→CoreML→CPU, warmup, tensor pre/post helpers), `src-tauri/src/ai/models.rs` (manifest: name, version, sha256, url, license, size; download to `app_data_dir/models/` with resume + hash verify; `list_models`/`ensure_model` commands; models are NOT bundled in the installer), `docs/runbooks/model-licenses.md` (the audit table — model, source, license, commercial-ok, evidence link).
**Tests:** manifest parse/verify; hash-mismatch rejection; EP fallback order (mock); a 1×1 identity-model inference smoke (ship a tiny test ONNX in fixtures).
**Estimated:** 2 weeks. **Commit:** `feat: onnx runtime engine with model manager and license audit`.

### Task 3.2: Face detection + landmarks

**Models:** YuNet (face detection, ~230 KB, MIT-family license via OpenCV Zoo) + PIPNet or 2D-106-landmark ONNX (verify license; fallback: train/buy — decision recorded in model-licenses.md).
**Files:** `src-tauri/src/ai/faces.rs` — `detect_faces(image) -> Vec<Face { bbox, landmarks_106, confidence }>`; runs at capped resolution (long edge 1024) with coords mapped back to full-res; results cached in catalog (`faces_json` column, migration v3); command `detect_faces(image_id)`; frontend face-bbox overlay toggle in `PreviewArea`.
**Tests:** fixture portrait (CC0 image) detects ≥1 face with landmarks inside bbox; no-face image returns empty; cache hit skips inference.
**Estimated:** 2 weeks. **Commit:** `feat: face detection and landmarks with catalog caching`.

### Task 3.3: Skin mask + skin smoothing

**Models:** face-parsing/skin-segmentation ONNX with commercial license (candidates: MediaPipe selfie/face segmentation family — Apache-2.0).
**Files:** `src-tauri/src/ai/skin.rs` — per-face skin mask (excluding eyes/brows/lips/hair from parsing classes) → feathered coverage map; smoothing = **frequency separation on GPU**: low-pass (Gaussian σ scaled to face size) blended by `amount` within skin mask, high-pass texture preserved (this is what separates pro results from "blur filter"). New recipe op `aiSkinSmooth { amount, texturePreserve }` consuming the cached mask; slider in a new `RetouchPanel.tsx`.
**Tests:** mask excludes eye/lip regions on fixture; smoothing reduces mid-frequency variance inside mask while edge energy (Sobel) at jawline stays within 5%; recipe round-trip + fingerprint stability.
**Estimated:** 3 weeks. **Commit:** `feat: ai skin mask and frequency-separation skin smoothing`.

### Task 3.4: Blemish removal (auto + click-to-heal)

**Models:** small inpainting model (LaMa-class, verify license) for heal patches; blemish detection = classical blob detection (LoG on high-pass luma within skin mask) first — model-free, fast, good enough for v1.
**Files:** `src-tauri/src/ai/heal.rs` — `auto_blemishes(image, faces) -> Vec<Spot>`; `heal_spot(image, spot) -> Patch` (inpaint 64–128px crop, cache patch); recipe op `aiHeal { spots: [...], auto: bool }` composites cached patches. UI: click-to-heal on preview canvas + "auto" button with sensitivity slider.
**Tests:** synthetic dark spot on flat skin-tone field is detected and healed (post-heal local variance ≈ background); patches survive recipe save/reload.
**Estimated:** 3 weeks. **Commit:** `feat: automatic and click-to-heal blemish removal`.

### Task 3.5: Eye and teeth enhancement ⚡

**Files:** `src-tauri/src/ai/features.rs` — landmark-derived eye (iris/sclera) and mouth regions from Task 3.2 landmarks (no new model): ops `aiEyeEnhance { clarity, brighten }` (masked local contrast + subtle exposure on iris, sclera desaturate-toward-white with a cap to avoid the "zombie" look) and `aiTeethWhiten { amount }` (masked yellow-desaturation + brighten, capped).
**Tests:** regions derived from landmarks land inside face bbox; adjustments clamp at caps; zero-amount is identity.
**Estimated:** 1.5 weeks. **Commit:** `feat: eye enhancement and teeth whitening from landmarks`.

### Task 3.6: Background segmentation + replace/blur

**Models:** MODNet or ISNet portrait matting ONNX (Apache-2.0 — verify checkpoint provenance).
**Files:** `src-tauri/src/ai/matting.rs` — full-image alpha matte (inference at 1024, guided-filter upsample to full res); recipe ops `aiBackgroundBlur { radius }`, `aiBackgroundReplace { color | imageRef }`; UI in RetouchPanel.
**Tests:** fixture portrait matte has high alpha on subject, low on background (measure against a hand-made trimap fixture); blur leaves subject sharp (edge energy on face region unchanged ±5%).
**Estimated:** 2.5 weeks. **Commit:** `feat: portrait matting with background blur and replace`.

### Task 3.7: Retouch profiles + batch AI

**Files:** `src-tauri/src/ai/profiles.rs` + catalog migration — a profile = named set of AI op params (`{ skinSmooth: 30, autoHeal: true, eyes: {...}, teeth: 20 }`); command `apply_profile(profile_id, image_ids)` runs detection→ops per image on a worker pool with progress events (reuse Task 2.3's job infrastructure); per-image parameters adapt to detected face size/count. UI: profile save/apply in `BatchSyncPanel` (extends existing batch-sync UX).
**Tests:** profile applied to 3 fixture images yields per-image recipes with AI ops present and face-scaled σ values; job progress events fire; cancel works.
**Estimated:** 2 weeks. **Commit:** `feat: retouch profiles applied in batch with face-adaptive params`.

### Task 3.8 (stretch, gated on 3.1–3.7 shipping): Reshape + relight

Face/body reshape via landmark-driven mesh warp (moving-least-squares on a control grid; slider presets "slim face", "jaw", with hard amount caps), portrait relighting (normal-estimation model — license audit first). Spec to be written as its own plan when Phase 3 core ships; do not start before.

---

# PHASE 4 — Commercialization & Distribution

**Objective:** Someone can buy, download, install, activate, auto-update, and crash-report Photogenic on all three OSes without touching a terminal.

**Exit Gate:** a fresh machine per OS: purchase (test-mode) → download signed installer → install → trial/activate → edit → export → receive an auto-update from a staged release; crash test (debug menu "crash now") appears in the telemetry backend with consent granted, and does NOT without consent.

### Task 4.1: Release build pipeline

**Files:** `.github/workflows/release.yml` (new) — tag-triggered (`v*`): 3-OS matrix running `npm run tauri:build`, uploading installers (`.msi`/`.exe` NSIS, `.dmg`, `.AppImage`/`.deb`) + `latest.json` updater manifest as release assets. Version stamping: single source of truth in `src-tauri/tauri.conf.json` `version`; add `scripts/bump-version.mjs` syncing `package.json` + `Cargo.toml`; fill real values in `Cargo.toml` (`authors`, `license`, `repository` — currently `"you"`/empty). Window defaults: bump `tauri.conf.json` to 1440×900, `minWidth/minHeight` 1100×700; replace stock icons with real branding (`icons/` — needs a design asset, flag as external dependency).
**Commit:** `ci: tag-triggered release pipeline producing installers for all platforms`.

### Task 4.2: Code signing + notarization ⚡ (external lead time — start accounts NOW)

- **Windows:** Azure Trusted Signing (or EV cert); wire into `tauri.conf.json > bundle > windows > signCommand`/cert config; secrets in GH Actions.
- **macOS:** Apple Developer account → Developer ID Application cert → `APPLE_SIGNING_IDENTITY` + `notarytool` env in the release workflow (Tauri handles notarization when env vars present).
- **Linux:** sign AppImage with gpg; publish key fingerprint in docs.
**Acceptance:** installers pass SmartScreen/Gatekeeper on clean VMs with no warnings. Document the full key inventory + rotation in `docs/runbooks/signing.md`.
**Commit:** `ci: windows and macos signing + notarization in release pipeline`.

### Task 4.3: Working auto-updater (F12)

**Files:** generate updater keypair (`npx @tauri-apps/cli signer generate` — private key into GH Actions secret `TAURI_SIGNING_PRIVATE_KEY`, NEVER committed); `tauri.conf.json` — real `pubkey`, endpoint `https://releases.<realdomain>/latest.json` (static file on S3+CloudFront or Cloudflare R2 — pick at implementation; also fine: GitHub Releases `latest.json` URL for v1); release workflow signs update artifacts (`createUpdaterArtifacts` already true); frontend: update-available toast in `TopBar` → `check()`/`downloadAndInstall()` via `@tauri-apps/plugin-updater` JS API (add npm dep + capability already present).
**Tests:** `test/updater-config.test.js` extended — pubkey non-empty, endpoint not example.com; staged-rollout manual test in exit gate.
**Commit:** `feat: functional signed auto-updater`.

### Task 4.4: License activation server + purchase flow (F13)

**Decision point (make before building):** buy vs build. **Recommended: buy** — Stripe Checkout + a thin activation service, or an off-the-shelf licensing service (Keygen.sh, LemonSqueezy licenses) to avoid running custom auth infra. The client work is identical either way:
**Files (client):** `src-tauri/src/licensing/activation.rs` — `activate(license_key) -> license.json` (POST to server, receives the Ed25519-signed license the existing `verification.rs` already validates — the offline-verify design is good, keep it); device fingerprint (hashed machine id via `tauri-plugin-os` info) with N-device limit enforced server-side; 14-day trial: signed trial license issued on first-run email capture (or keyless local trial with grace, decide with business owner); `check_license` gains expiry + grace handling (7 days offline grace after expiry-check failure). UI: activation dialog (key entry, status, deactivate).
**Files (server, if build):** separate repo/worker — endpoints `/activate`, `/deactivate`, `/validate`; signs with the private key matching the embedded pubkey; Stripe webhook issues keys on purchase.
**Tests (client):** activation happy path against a mock server; device-limit rejection; expiry → export blocked with clear message; tampered license rejected (existing tests cover signature).
**Estimated:** 2–3 weeks client + service setup. **Commit:** `feat: online activation with trial and device limits`.

### Task 4.5: In-app onboarding + docs ⚡

**Files:** `app/src/components/Onboarding.tsx` — first-run: welcome → pick folder to import → guided first edit (3 tooltips) → export; `docs/` user-facing quickstart (published to product site later); keyboard-shortcut cheat sheet (`?` overlay).
**Commit:** `feat: first-run onboarding flow`.

### Task 4.6: Telemetry + crash reporting backend (F14)

**Files:** add `tauri-plugin-sentry` (or plain Sentry Rust SDK + JS SDK) gated STRICTLY behind the existing consent file (`telemetry-consent.json` — reuse ADR-0009 machinery; the panic-hook consent check in `lib.rs` already models this); consent UI in settings panel (currently consent file has no UI — add toggle with plain-language description); crash uploads + anonymous usage events (feature usage counts only, no image data ever); document data policy in `docs/runbooks/telemetry.md` + privacy policy.
**Tests:** consent off → no network calls (mock transport); consent on → panic produces one queued event.
**Commit:** `feat: opt-in sentry crash and usage telemetry`.

### Task 4.7: Beta program + final QA

- Recruit 10–20 photographers (Evoto users ideally); distribute signed beta builds via the updater's beta channel (`latest-beta.json` endpoint, channel picker in settings).
- QA matrix in `docs/runbooks/qa-matrix.md`: 3 OSes × {integrated GPU, discrete GPU, no GPU} × {small library, 5k-image library} × top-10 camera RAW formats.
- Triage bar for launch: zero data-loss bugs, zero crashes-on-launch, p95 slider latency < 150 ms on a 2021 mid-range laptop.
**Commit:** `chore: beta channel and launch QA matrix`.

---

## Dependency graph (phase-level)

```
1.1, 1.2 (independent quick fixes)
1.3 → 1.4 → 1.5 (decode → gamma → RAW color)
1.6 → 1.7 → 1.8 → 1.9 (staging → proxy render → protocol → frontend)   [needs 1.3–1.5]
1.10 (GPU) after 1.7; 1.12 extends 1.10's parity contract
1.11, 1.13, 1.14 parallel after 1.9
Phase 2: 2.1–2.2 after 1.10/1.12; 2.3–2.4 after 1.9; 2.5–2.7 anytime in phase
Phase 3: 3.1 → 3.2 → {3.3 → 3.4, 3.5} → 3.6 → 3.7 → (3.8)
Phase 4: 4.1 → 4.2 → 4.3; 4.4 anytime; 4.5–4.7 last. START 4.2 ACCOUNT SETUP DURING PHASE 1.
```

## Risk register

| Risk | Mitigation |
|------|------------|
| GPU pipeline instability across drivers (esp. Linux/older Intel) | CPU fallback is a hard requirement (Task 1.10); parity test keeps both paths honest; QA matrix includes no-GPU |
| Commercial-safe model availability for parsing/matting | License audit is Task 3.1 deliverable; budget for purchased/licensed models or training as fallback; do not ship anything unaudited |
| `ort` binary size + per-platform EP packaging pain | Models downloaded post-install (not bundled); EPs feature-gated per target; CPU EP always works |
| tauri-specta rc API churn | Pin exact versions (already pinned); protocol-handler path avoids specta for binary routes |
| Windows custom-scheme quirks (`http://photogenic.localhost`) | Task 1.9 abstracts URL construction in one helper; exit-gate manual test on Windows |
| One-person team vs 12-month scope | Phases are independently shippable: Phase 1+2 = a sellable non-AI editor (early-bird pricing), Phase 3 unlocks the Evoto positioning |

## What is deliberately OUT of scope (YAGNI until users demand)

Mobile/Android build (config exists; ignore), tethering, cloud sync/multi-device catalogs, plugin SDK, video, HEIC (add in Phase 2.5 camera pass only if beta users need it), the `src/` JS seam layer (leave as test scaffolding; delete opportunistically when a real module replaces the seam it models).
