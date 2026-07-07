# Photogenic Internal Alpha Remaining Work Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish the remaining foundation work needed to turn the current deterministic seams into a dogfoodable internal-alpha RAW editor with a real single Pipeline, proven viewport path, desktop UI, durable catalog, real export, offline licensing, and cross-platform verification.

**Architecture:** Preserve ADR-0001: one Rust/wgpu Pipeline owns all pixel math for both Preview and Export. Keep the existing JavaScript seams as product/workflow contracts and migrate them behind Tauri IPC instead of duplicating image behavior in the UI. Treat Tauri as provisional until the ADR-0004 viewport gates pass with real Pipeline output.

**Tech Stack:** Tauri 2.x, Rust 1.77+, wgpu/WGSL, LibRaw or rawler for RAW decode, lcms2 for ICC transforms, SQLite, Node 20 test harness, JavaScript workflow seams, future React/TypeScript UI.

## Scope Guardrails

In scope:
- Internal-alpha foundation from `.scratch/photogenic-foundation/PRD.md`.
- Real RAW/preview/export Pipeline.
- Import, culling, develop controls, presets, Batch Sync, sidecars, export, offline License.
- Cross-platform smoke coverage on Windows, macOS, and Linux.

Out of scope:
- Public launch positioning.
- DNG export.
- Production Recognition features such as skin retouch, face parsing, AI masking, and AI culling.
- Generative cloud features and Credit billing beyond keeping the entitlement seam separate.

## Required Working Rules

- Use `@superpowers:test-driven-development` for every feature or bugfix task.
- Use `@superpowers:systematic-debugging` for any failing viewport, pipeline, export, or platform issue.
- Use `@superpowers:verification-before-completion` before claiming a task or milestone is done.
- Keep commits small. Prefer one commit per task after tests pass.
- Never create a second pixel pipeline in JavaScript. JS can orchestrate, cache, and display; Rust owns pixel math.

## Milestone 0: Stabilize The Current Foundation State

### Task 0.1: Review And Commit The Existing Foundation Work

**Files:**
- Read: `README.md`
- Read: `.scratch/photogenic-foundation/issues/*.md`
- Read: `src/**/*.js`
- Read: `test/**/*.js`
- Modify only if needed: `README.md`

**Step 1: Inspect the dirty tree**

Run:
```bash
git status --short
git diff -- README.md app/index.html app/main.js scripts/build.mjs src-tauri/src/lib.rs
```

Expected: Dirty tree shows the current foundation work and many untracked seam/test files.

**Step 2: Run the baseline checks**

Run:
```bash
npm test
npm run build
npm run lint
npm run typecheck
```

Expected: `npm test` passes all tests, `npm run build` writes `dist/`, lint/typecheck either pass or clearly document missing local tools.

**Step 3: Commit the current foundation snapshot**

Run:
```bash
git add README.md app scripts src src-tauri test package.json package-lock.json
git commit -m "feat: complete deterministic foundation seams"
```

Expected: A clean baseline commit exists before native engine work begins.

### Task 0.2: Expand The Local Issue Tracker From This Plan

**Files:**
- Create: `.scratch/photogenic-foundation/issues/09-native-pipeline-core.md`
- Create: `.scratch/photogenic-foundation/issues/10-viewport-proof-real-pipeline-output.md`
- Create: `.scratch/photogenic-foundation/issues/11-sqlite-catalog-and-import-index.md`
- Create: `.scratch/photogenic-foundation/issues/12-internal-alpha-ui.md`
- Create: `.scratch/photogenic-foundation/issues/13-real-export-backends.md`
- Create: `.scratch/photogenic-foundation/issues/14-offline-license-activation.md`
- Create: `.scratch/photogenic-foundation/issues/15-cross-platform-alpha-packaging.md`

**Step 1: Write issue files**

Each issue must include:
```markdown
Status: ready-for-agent

## Goal

## In Scope

## Out of Scope

## Acceptance Criteria

## Verification
```

**Step 2: Verify issue tracker consistency**

Run:
```bash
npm test
```

Expected: Existing tests still pass. No code behavior should change.

**Step 3: Commit**

```bash
git add .scratch/photogenic-foundation/issues
git commit -m "docs: add remaining internal alpha implementation issues"
```

## Milestone 1: Native Pipeline Core

### Task 1.1: Add A Rust Core Crate Boundary

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/core/mod.rs`
- Create: `src-tauri/src/core/recipe.rs`
- Create: `src-tauri/src/core/source.rs`
- Create: `src-tauri/src/core/pipeline.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Write failing Rust unit tests**

Create tests in `src-tauri/src/core/pipeline.rs`:
```rust
#[test]
fn pipeline_rejects_missing_source_path() {
  let result = PipelineRequest::new("", Recipe::default());
  assert!(result.is_err());
}

#[test]
fn preview_and_export_requests_share_recipe_fingerprint() {
  let recipe = Recipe::default();
  let preview = PipelineRequest::preview("fixtures/raw/hero.nef", recipe.clone());
  let export = PipelineRequest::export("fixtures/raw/hero.nef", recipe);
  assert_eq!(preview.recipe_fingerprint(), export.recipe_fingerprint());
}
```

**Step 2: Run test to verify it fails**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml core::pipeline
```

Expected: Fails because the core modules do not exist yet.

**Step 3: Implement minimal core types**

Implement:
- `Recipe` with version, ordered operations, and stable fingerprint.
- `SourceRef` with source path, observed dimensions, and format.
- `PipelineRequest` with `preview` and `export` constructors.
- No pixel math yet.

**Step 4: Run tests**

Run:
```bash
cargo test --manifest-path src-tauri/Cargo.toml core::pipeline
npm test
```

Expected: Rust tests pass and JS seams still pass.

**Step 5: Commit**

```bash
git add src-tauri
git commit -m "feat: add native pipeline core boundary"
```

### Task 1.2: Mirror The JavaScript Edit Recipe Contract In Rust

**Files:**
- Read: `src/edit-recipe/schema.js`
- Modify: `src-tauri/src/core/recipe.rs`
- Create: `src-tauri/src/core/recipe_tests.rs`
- Create: `test/fixtures/recipes/basic-exposure.json`
- Create: `test/fixtures/recipes/source-dependent-crop.json`

**Step 1: Write failing fixture compatibility tests**

Rust tests should load JSON fixtures and assert:
- Versioned recipes parse.
- Operation order is preserved.
- Fingerprints match a committed expected value.
- Non-JSON values are rejected.

**Step 2: Run test to verify it fails**

```bash
cargo test --manifest-path src-tauri/Cargo.toml recipe
```

Expected: Fails until Rust recipe parsing is implemented.

**Step 3: Implement recipe normalization**

Keep behavior compatible with `src/edit-recipe/schema.js`. If the Rust and JS fingerprints disagree, update neither casually; write a failing cross-language fixture first and resolve the mismatch explicitly.

**Step 4: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml recipe
npm test -- test/edit-recipe.test.js
```

Expected: Rust and JS recipe tests pass.

**Step 5: Commit**

```bash
git add src-tauri test/fixtures/recipes
git commit -m "feat: mirror edit recipe contract in native core"
```

### Task 1.3: Add RAW Decode Adapter

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/core/decode.rs`
- Create: `src-tauri/src/core/image_buffer.rs`
- Create: `test/fixtures/images/README.md`

**Step 1: Choose decoder**

Use LibRaw bindings if the team accepts the native dependency. Use `rawler` only if LibRaw setup blocks cross-platform Phase 0. Document the choice in `docs/adr/` only if it changes existing architecture assumptions.

**Step 2: Write failing decoder tests**

Tests should assert:
- Unsupported paths return typed errors.
- A committed small RAW fixture decodes to a linear buffer descriptor.
- JPEG/PNG/TIFF source paths remain accepted for non-RAW imports.

**Step 3: Implement minimal decode adapter**

Return:
- width
- height
- camera metadata when available
- linear working buffer or a placeholder CPU buffer that is explicitly marked `decoded`

**Step 4: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml decode
npm test -- test/import-workflow.test.js test/source-file-insights.test.js
```

Expected: Native decode tests pass; JS import metadata tests remain green.

**Step 5: Commit**

```bash
git add src-tauri test/fixtures/images
git commit -m "feat: add native RAW decode adapter"
```

### Task 1.4: Add Scene-Linear Working Buffer And CPU Fallback Renderer

**Files:**
- Modify: `src-tauri/src/core/image_buffer.rs`
- Create: `src-tauri/src/core/cpu_pipeline.rs`
- Create: `src-tauri/src/core/color.rs`
- Create: `src-tauri/src/core/pipeline_tests.rs`

**Step 1: Write failing tests**

Tests should assert:
- Working buffer stores linear float channels.
- Exposure adjustment modifies linear values predictably.
- CPU fallback can render a preview artifact without GPU availability.

**Step 2: Implement minimal CPU path**

Implement exposure only:
```text
linear_out = linear_in * 2^exposure_ev
```

Clamp only at output transform, not in the working buffer.

**Step 3: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml cpu_pipeline color
```

Expected: CPU fallback renders deterministic output metadata and pixel samples.

**Step 4: Commit**

```bash
git add src-tauri
git commit -m "feat: add scene-linear CPU fallback pipeline"
```

## Milestone 2: GPU Pipeline And Parity

### Task 2.1: Add wgpu Device Initialization And Capability Reporting

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/core/gpu.rs`
- Modify: `src-tauri/src/lib.rs`
- Create: `test/viewport-native-capabilities.test.js`

**Step 1: Write failing tests**

Rust test:
- Adapter selection returns either `GpuReady` or `CpuFallback`.
- Failure to create a GPU adapter does not panic.

JS/Tauri command contract test:
- Capability response includes `mode`, `adapterName`, and `fallbackReason`.

**Step 2: Implement capability command**

Expose a Tauri command:
```rust
#[tauri::command]
async fn pipeline_capabilities() -> PipelineCapabilities
```

**Step 3: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml gpu
npm test -- test/viewport-native-capabilities.test.js
```

Expected: Capability tests pass on both GPU and CPU-fallback machines.

**Step 4: Commit**

```bash
git add src-tauri test/viewport-native-capabilities.test.js
git commit -m "feat: report native pipeline capabilities"
```

### Task 2.2: Implement First WGSL Exposure Shader

**Files:**
- Create: `src-tauri/src/core/shaders/exposure.wgsl`
- Create: `src-tauri/src/core/gpu_pipeline.rs`
- Modify: `src-tauri/src/core/pipeline.rs`
- Create: `src-tauri/src/core/gpu_pipeline_tests.rs`

**Step 1: Write failing parity test against CPU exposure**

Assert a small synthetic linear buffer rendered through GPU exposure matches CPU exposure within tolerance.

**Step 2: Implement shader and dispatch**

Keep only one operation: exposure. Do not add WB, HSL, or tone controls yet.

**Step 3: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml gpu_pipeline
```

Expected: GPU exposure matches CPU exposure within the chosen tolerance.

**Step 4: Commit**

```bash
git add src-tauri
git commit -m "feat: add first wgpu exposure operation"
```

### Task 2.3: Replace Behavior-Signature Parity With Pixel Fixture Parity

**Files:**
- Modify: `src/pipeline/render-artifact.js`
- Modify: `src/preview/workflow.js`
- Modify: `src/export/workflow.js`
- Modify: `test/export-parity.test.js`
- Create: `test/fixtures/golden/README.md`
- Create: `test/fixtures/golden/exposure-preview.png`
- Create: `test/fixtures/golden/exposure-export.png`

**Step 1: Write failing JS parity test**

Update `test/export-parity.test.js` so it fails unless:
- Preview and Export call the same native Pipeline command.
- Pixel output differs only by resolution scaling tolerance.
- The artifact still records recipe fingerprint and source identity.

**Step 2: Add native render command**

In `src-tauri/src/lib.rs`, expose:
```rust
#[tauri::command]
async fn render_pipeline(request: PipelineRenderRequest) -> PipelineRenderResult
```

**Step 3: Route JS workflow through a native pipeline adapter**

Create:
- `src/pipeline/native-adapter.js`
- `test/pipeline-native-adapter.test.js`

The adapter should fall back to current deterministic software render only in explicit test mode. Production paths should report `native-unavailable` instead of silently using the JS renderer.

**Step 4: Verify**

```bash
npm test -- test/export-parity.test.js test/preview-workflow.test.js test/export-workflow.test.js
cargo test --manifest-path src-tauri/Cargo.toml pipeline
```

Expected: Pixel parity fixtures pass through the native command path.

**Step 5: Commit**

```bash
git add src src-tauri test
git commit -m "feat: route preview and export parity through native pipeline"
```

### Task 2.4: Add Core Develop Operations

**Files:**
- Modify: `src-tauri/src/core/recipe.rs`
- Modify: `src-tauri/src/core/cpu_pipeline.rs`
- Modify: `src-tauri/src/core/gpu_pipeline.rs`
- Create: `src-tauri/src/core/shaders/white_balance.wgsl`
- Create: `src-tauri/src/core/shaders/tone.wgsl`
- Create: `src-tauri/src/core/shaders/hsl.wgsl`
- Create: `src-tauri/src/core/shaders/detail.wgsl`
- Create: `src-tauri/src/core/shaders/transform.wgsl`
- Modify: `test/edit-recipe.test.js`

**Step 1: Add failing tests operation by operation**

Implement in this order:
1. White balance temperature/tint.
2. Exposure.
3. Contrast.
4. Highlights, shadows, whites, blacks.
5. Tone curve.
6. HSL.
7. Sharpening.
8. Noise reduction.
9. Crop, rotate, straighten.

Each operation gets:
- Recipe validation test.
- CPU output sample test.
- GPU-vs-CPU tolerance test.
- Preview-vs-export parity fixture when practical.

**Step 2: Implement one operation at a time**

Do not start the next operation until the current operation has passing CPU, GPU, and parity tests.

**Step 3: Verify after each operation**

```bash
cargo test --manifest-path src-tauri/Cargo.toml core
npm test -- test/edit-recipe.test.js test/export-parity.test.js
```

Expected: Operation is validated at the recipe seam and native Pipeline seam.

**Step 4: Commit after each operation**

Example:
```bash
git add src-tauri src test
git commit -m "feat: add native white balance operation"
```

## Milestone 3: Real Viewport Proof

### Task 3.1: Feed Real Native Pipeline Frames Into The Harness

**Files:**
- Modify: `src-tauri/src/lib.rs`
- Create: `src-tauri/src/viewport/mod.rs`
- Create: `src-tauri/src/viewport/frame_bridge.rs`
- Modify: `app/main.js`
- Modify: `src/viewport-proof/shell-source.js`
- Modify: `src/viewport-proof/gates.js`
- Modify: `test/viewport-proof.test.js`
- Modify: `test/viewport-shell-source.test.js`

**Step 1: Write failing gate tests**

Tests should assert:
- `raw_frame` cannot pass without native Pipeline frame provenance.
- `gradient` alone still cannot unlock shell decision.
- A measured native frame can mark `raw_frame` passed.

**Step 2: Implement native frame provenance**

Return structured metrics:
- source file id
- recipe fingerprint
- frame dimensions
- transfer method
- frame hash
- render duration

**Step 3: Verify**

```bash
npm test -- test/viewport-proof.test.js test/viewport-shell-source.test.js
cargo test --manifest-path src-tauri/Cargo.toml viewport
```

Expected: Harness distinguishes real native Pipeline frames from browser placeholders.

**Step 4: Commit**

```bash
git add app src src-tauri test
git commit -m "feat: prove native pipeline frame provenance in viewport"
```

### Task 3.2: Measure Zoom, Pan, Overlay, Color, And FPS Against Real Frames

**Files:**
- Modify: `src/viewport-proof/webview.js`
- Modify: `src/viewport-proof/fps.js`
- Modify: `src/viewport-proof/report.js`
- Modify: `src/viewport-proof/dashboard-foundation.js`
- Modify: `test/viewport-webview.test.js`
- Modify: `test/viewport-fps.test.js`
- Modify: `test/viewport-dashboard-foundation.test.js`

**Step 1: Write failing tests**

Tests should assert:
- Zoom/pan measurements are tied to the rendered frame bounds.
- Overlay measurements prove interaction over the frame, not beside it.
- Color sample comes from a known Pipeline output patch.
- Sustained FPS uses measured frame count and duration.

**Step 2: Implement measurements**

Update browser harness measurement code to sample actual rendered frame DOM/canvas/surface behavior. Do not mark color-managed pass from CSS colors.

**Step 3: Verify**

```bash
npm test -- test/viewport-webview.test.js test/viewport-fps.test.js test/viewport-dashboard-foundation.test.js
npm run tauri:dev
```

Expected: The harness reports individual gate status honestly on a local Tauri run.

**Step 4: Commit**

```bash
git add app src test
git commit -m "feat: measure viewport proof gates against real frames"
```

### Task 3.3: Decide Tauri Or Activate The Fallback Ladder

**Files:**
- Modify: `docs/adr/0004-gpu-surface-webview-compositing-is-phase0-keystone.md`
- Create: `docs/adr/0010-viewport-shell-decision.md`
- Modify if Tauri passes: `README.md`
- Modify if fallback needed: `src-tauri/src/viewport/*`

**Step 1: Run proof on all target OSes**

Run on Windows, macOS, and Linux:
```bash
npm run tauri:attempt
npm run tauri:dev
```

Capture proof reports into:
```text
.scratch/photogenic-foundation/verification/viewport-windows.json
.scratch/photogenic-foundation/verification/viewport-macos.json
.scratch/photogenic-foundation/verification/viewport-linux.json
```

**Step 2: Write decision record**

If all gates pass, lock Tauri for the internal alpha.

If any hard gate fails, choose the ADR-0004 fallback:
1. Native wgpu child surface under transparent webview.
2. Shared-texture or zero-copy interop.
3. Native UI fallback.

**Step 3: Verify**

```bash
npm test
npm run build
```

Expected: Docs and code agree on whether Tauri is locked or fallback work begins.

**Step 4: Commit**

```bash
git add docs README.md .scratch/photogenic-foundation/verification src-tauri
git commit -m "docs: record viewport shell decision"
```

## Milestone 4: Durable Catalog And Import Index

### Task 4.1: Add SQLite Catalog Store

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/catalog/mod.rs`
- Create: `src-tauri/src/catalog/schema.rs`
- Create: `src-tauri/src/catalog/store.rs`
- Create: `src-tauri/src/catalog/migrations/0001_initial.sql`
- Modify: `src/catalog/recipe-store.js`
- Modify: `test/catalog-recipe-store.test.js`

**Step 1: Write failing persistence tests**

Tests should assert:
- Catalog initializes from an empty DB.
- Recipe save/load survives process restart.
- Ratings, flags, color labels, presets, sidecar links, and workspace state have durable tables.

**Step 2: Implement SQLite store**

Use migrations. Do not replace the JS file store in one big step; add a `catalogBackend` adapter and run old tests against both backends where possible.

**Step 3: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml catalog
npm test -- test/catalog-recipe-store.test.js test/library-store.test.js test/preset-store.test.js
```

Expected: Existing catalog behavior passes on SQLite-backed storage.

**Step 4: Commit**

```bash
git add src src-tauri test
git commit -m "feat: add sqlite catalog backend"
```

### Task 4.2: Implement Real Import Indexing And Metadata Refresh

**Files:**
- Modify: `src-tauri/src/catalog/store.rs`
- Create: `src-tauri/src/catalog/import.rs`
- Modify: `src/catalog/import-workflow.js`
- Modify: `src/catalog/source-file-insights.js`
- Modify: `test/import-workflow.test.js`
- Modify: `test/source-file-insights.test.js`

**Step 1: Write failing tests**

Assert:
- Folder import writes one durable image row per supported source.
- RAW/JPEG/TIFF/PNG classification is consistent.
- EXIF-lite fields are stored when available.
- Refresh updates file size and modified time.

**Step 2: Implement import command and JS adapter**

Expose:
```rust
#[tauri::command]
async fn import_sources(request: ImportSourcesRequest) -> ImportSourcesResult
```

**Step 3: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml catalog::import
npm test -- test/import-workflow.test.js test/catalog-workflow.test.js
```

Expected: Import workflow operates through durable catalog indexing.

**Step 4: Commit**

```bash
git add src src-tauri test
git commit -m "feat: index imported sources in sqlite catalog"
```

## Milestone 5: Internal Alpha UI

### Task 5.1: Replace The Phase 0 Harness With An App Shell

**Files:**
- Modify: `package.json`
- Modify: `scripts/build.mjs`
- Create: `app/App.jsx` or `app/App.tsx`
- Create: `app/components/LibraryView.jsx`
- Create: `app/components/DevelopView.jsx`
- Create: `app/components/ExportPanel.jsx`
- Create: `app/styles.css`
- Modify: `app/index.html`
- Modify: `app/main.js`

**Step 1: Choose UI setup**

Use the smallest React/TypeScript setup that works with Tauri and the existing tests. Avoid introducing Next.js unless there is a concrete need.

**Step 2: Write failing UI smoke tests**

Create:
- `test/internal-alpha-ui.test.js`

Assert:
- App shell renders without the old harness-only layout.
- Library view can show imported images.
- Develop view can show selected image metadata and recipe controls.
- Export panel can queue an export.

**Step 3: Implement shell layout**

First screen should be the usable editor:
- Left or top library navigation.
- Center viewport.
- Filmstrip/grid.
- Right develop/export panels.

No marketing landing page.

**Step 4: Verify**

```bash
npm test -- test/internal-alpha-ui.test.js
npm run build
npm run tauri:dev
```

Expected: The editor shell loads in browser build and Tauri.

**Step 5: Commit**

```bash
git add app scripts package.json test
git commit -m "feat: add internal alpha editor shell"
```

### Task 5.2: Wire Import, Culling, Filtering, And Reopen State

**Files:**
- Modify: `app/components/LibraryView.jsx`
- Create: `app/components/Filmstrip.jsx`
- Create: `app/components/CullingControls.jsx`
- Modify: `src/catalog/dashboard-workflow.js`
- Modify: `src/catalog/workspace-session-workflow.js`
- Create: `test/internal-alpha-library-ui.test.js`

**Step 1: Write failing tests**

Assert:
- Import action adds images to visible library state.
- Rating/flag/reject updates persist.
- Filters update the visible image list.
- Reopen restores selected image and active filter.

**Step 2: Implement UI wiring through existing workflow seams**

Do not let components write storage directly. Route through catalog/workspace workflow adapters.

**Step 3: Verify**

```bash
npm test -- test/internal-alpha-library-ui.test.js test/catalog-dashboard-workflow.test.js
npm run build
```

Expected: Library/culling UI behavior is backed by persistence seams.

**Step 4: Commit**

```bash
git add app src test
git commit -m "feat: wire library culling and reopen state"
```

### Task 5.3: Wire Develop Controls To The Native Pipeline

**Files:**
- Modify: `app/components/DevelopView.jsx`
- Create: `app/components/DevelopControls.jsx`
- Create: `app/components/Viewport.jsx`
- Modify: `src/preview/workflow.js`
- Create: `test/internal-alpha-develop-ui.test.js`

**Step 1: Write failing tests**

Assert:
- Changing exposure updates the Edit Recipe.
- Preview request is superseded when a newer slider value arrives.
- Preview result records native Pipeline provenance.
- Save persists recipe to catalog.

**Step 2: Implement controls**

Add controls in this order:
1. White balance.
2. Exposure.
3. Tone controls.
4. Tone curve.
5. HSL.
6. Sharpening/noise reduction.
7. Crop/rotate/straighten.

**Step 3: Verify**

```bash
npm test -- test/internal-alpha-develop-ui.test.js test/preview-workflow.test.js
npm run build
```

Expected: Develop UI updates recipe and previews through the native Pipeline path.

**Step 4: Commit after each control group**

Example:
```bash
git add app src test
git commit -m "feat: wire exposure develop control"
```

### Task 5.4: Wire Presets And Batch Sync UI

**Files:**
- Create: `app/components/PresetPanel.jsx`
- Create: `app/components/BatchSyncDialog.jsx`
- Modify: `src/catalog/preset-workflow.js`
- Modify: `src/catalog/batch-session-workflow.js`
- Create: `test/internal-alpha-preset-batch-ui.test.js`

**Step 1: Write failing tests**

Assert:
- Source-independent preset can be saved from current recipe.
- Invalid source-dependent preset operation is rejected.
- Batch Sync applies selected operation types to selected targets.
- Batch session can be reopened.

**Step 2: Implement UI**

Use explicit operation checkboxes for Batch Sync. Preserve source-dependent operations on target images unless explicitly supported.

**Step 3: Verify**

```bash
npm test -- test/internal-alpha-preset-batch-ui.test.js test/preset-workflow.test.js test/batch-session-workflow.test.js
npm run build
```

Expected: UI and workflow semantics match existing seam tests.

**Step 4: Commit**

```bash
git add app src test
git commit -m "feat: add preset and batch sync UI"
```

## Milestone 6: Real Export Backends

### Task 6.1: Replace Foundation Export Companions With Pipeline Outputs

**Files:**
- Modify: `src/export/workflow.js`
- Modify: `src/export/session-workflow.js`
- Modify: `src/pipeline/native-adapter.js`
- Modify: `src-tauri/src/core/pipeline.rs`
- Create: `src-tauri/src/export/mod.rs`
- Create: `src-tauri/src/export/encode.rs`
- Modify: `test/export-workflow.test.js`
- Modify: `test/export-session-workflow.test.js`

**Step 1: Write failing tests**

Assert:
- Export invokes native Pipeline at requested output dimensions.
- Artifact sidecar records native Pipeline version and recipe fingerprint.
- Missing or stale companion file detection still works.

**Step 2: Implement native export command**

Expose:
```rust
#[tauri::command]
async fn export_image(request: ExportImageRequest) -> ExportImageResult
```

**Step 3: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml export
npm test -- test/export-workflow.test.js test/export-session-workflow.test.js
```

Expected: Export workflow writes real Pipeline outputs rather than placeholder companions.

**Step 4: Commit**

```bash
git add src src-tauri test
git commit -m "feat: export native pipeline outputs"
```

### Task 6.2: Implement JPEG, PNG, And TIFF-16 Encoding

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/export/encode.rs`
- Modify: `src/export/format-options.js`
- Modify: `test/export-format-options.test.js`
- Create: `src-tauri/src/export/encode_tests.rs`

**Step 1: Write failing tests**

Assert:
- JPEG quality affects encoded bytes.
- PNG preserves expected dimensions.
- TIFF path writes 16-bit output.
- ICC embed flag affects metadata or returns an explicit unsupported error until ICC is implemented.

**Step 2: Implement encoders**

Use maintained Rust crates. Keep encoder behavior behind one `EncodeOutput` boundary so future color-management fixes do not spread.

**Step 3: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml export::encode
npm test -- test/export-format-options.test.js test/export-workflow.test.js
```

Expected: JPEG, PNG, and TIFF-16 export paths are real and testable.

**Step 4: Commit**

```bash
git add src src-tauri test
git commit -m "feat: add jpeg png and tiff16 export encoders"
```

### Task 6.3: Add Parallel Batch Export

**Files:**
- Modify: `src/export/batch-queue.js`
- Modify: `src/export/workflow.js`
- Modify: `src-tauri/src/export/mod.rs`
- Modify: `test/export-batch.test.js`
- Modify: `test/export-workflow.test.js`

**Step 1: Write failing tests**

Assert:
- Batch queue respects deterministic job ordering.
- Worker concurrency limit is configurable.
- Failed job does not stop unrelated jobs.
- Cancellation prevents queued jobs from starting.

**Step 2: Implement bounded worker pool**

Use Rust/Tokio for actual export execution when running inside Tauri. Keep JS queue summaries stable for UI dashboards.

**Step 3: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml export
npm test -- test/export-batch.test.js test/export-workflow.test.js test/export-dashboard-workflow.test.js
```

Expected: Batch export is parallel internally and deterministic externally.

**Step 4: Commit**

```bash
git add src src-tauri test
git commit -m "feat: add parallel batch export execution"
```

## Milestone 7: Offline License Activation

### Task 7.1: Add Signed Local License Validation

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/src/licensing/mod.rs`
- Create: `src-tauri/src/licensing/license.rs`
- Modify: `src/licensing/entitlements.js`
- Modify: `src/licensing/workflow.js`
- Modify: `test/entitlements.test.js`
- Modify: `test/licensing-workflow.test.js`

**Step 1: Write failing tests**

Assert:
- Valid signed license enables local edit/export offline.
- Expired license denies local licensed features.
- Invalid signature denies local licensed features.
- Cloud Credit balance never enables local export.

**Step 2: Implement validation**

Use an asymmetric signature format. Store only public verification material in the app.

**Step 3: Verify**

```bash
cargo test --manifest-path src-tauri/Cargo.toml licensing
npm test -- test/entitlements.test.js test/licensing-workflow.test.js
```

Expected: License and Credit behavior remain separate.

**Step 4: Commit**

```bash
git add src src-tauri test
git commit -m "feat: validate signed offline licenses"
```

### Task 7.2: Add License Activation And Snapshot UI

**Files:**
- Create: `app/components/LicensePanel.jsx`
- Modify: `src/licensing/session-workflow.js`
- Modify: `src/licensing/dashboard-workflow.js`
- Create: `test/internal-alpha-license-ui.test.js`

**Step 1: Write failing tests**

Assert:
- License input stores a local snapshot.
- Offline reload uses cached license state.
- Export button explains inactive/expired license state.

**Step 2: Implement UI and workflow wiring**

Do not require online activation for the internal alpha unless the signed license file itself is missing.

**Step 3: Verify**

```bash
npm test -- test/internal-alpha-license-ui.test.js test/licensing-session-workflow.test.js test/licensing-dashboard-workflow.test.js
npm run build
```

Expected: Local license state is visible and export gating is understandable.

**Step 4: Commit**

```bash
git add app src test
git commit -m "feat: add offline license activation UI"
```

## Milestone 8: Cross-Platform Alpha Packaging And QA

### Task 8.1: Add Platform Smoke Scripts

**Files:**
- Modify: `package.json`
- Create: `scripts/smoke-alpha.mjs`
- Create: `scripts/collect-alpha-report.mjs`
- Create: `test/internal-alpha-smoke.test.js`

**Step 1: Write failing smoke test**

Assert the smoke script checks:
- Tauri availability.
- Pipeline capability command.
- Import fixture.
- Preview fixture.
- Export fixture.
- License fixture.
- Viewport proof summary.

**Step 2: Implement smoke script**

Output JSON into:
```text
.scratch/photogenic-foundation/verification/internal-alpha-smoke-<platform>.json
```

**Step 3: Verify**

```bash
npm test -- test/internal-alpha-smoke.test.js
npm run smoke:alpha
```

Expected: Local platform smoke report is written with explicit pass/fail fields.

**Step 4: Commit**

```bash
git add package.json scripts test
git commit -m "test: add internal alpha platform smoke script"
```

### Task 8.2: Package The Tauri Internal Alpha

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/Cargo.toml`
- Modify: `README.md`
- Create: `docs/internal-alpha-runbook.md`

**Step 1: Write packaging checklist**

Runbook must cover:
- macOS build and notarization placeholder.
- Windows installer build.
- Linux AppImage/deb/rpm build.
- Known GPU/CPU fallback expectations.
- Where smoke reports are stored.

**Step 2: Run packaging command locally**

```bash
npm run tauri:build
```

Expected: Tauri bundle command completes on the local platform or fails with a documented missing system dependency.

**Step 3: Verify**

```bash
npm test
npm run build
```

Expected: Packaging changes do not break app/test build.

**Step 4: Commit**

```bash
git add src-tauri README.md docs/internal-alpha-runbook.md
git commit -m "build: prepare internal alpha tauri packaging"
```

### Task 8.3: Final Internal Alpha Acceptance Run

**Files:**
- Modify: `.scratch/photogenic-foundation/PRD.md`
- Modify: `README.md`
- Create: `.scratch/photogenic-foundation/verification/internal-alpha-acceptance.md`

**Step 1: Run full verification**

```bash
npm test
npm run build
npm run lint
npm run typecheck
cargo test --manifest-path src-tauri/Cargo.toml
npm run smoke:alpha
npm run tauri:build
```

Expected:
- Unit and workflow tests pass.
- Native tests pass.
- Build passes.
- Smoke report confirms import -> cull -> develop -> preset -> Batch Sync -> export works offline.
- Viewport decision is locked or fallback decision is documented.

**Step 2: Write acceptance artifact**

Record:
- Git commit SHA.
- Platform tested.
- Viewport proof status.
- Pipeline capability mode.
- Export fixture outputs.
- License fixture status.
- Known limitations.

**Step 3: Update tracker statuses**

Mark issues 09-15 as `done` only when their acceptance criteria are actually met.

**Step 4: Commit**

```bash
git add README.md .scratch/photogenic-foundation
git commit -m "docs: record internal alpha acceptance"
```

## Dependency Order Summary

1. Stabilize and commit the current foundation snapshot.
2. Add native Pipeline core and recipe compatibility.
3. Add RAW decode and scene-linear CPU fallback.
4. Add wgpu exposure, then remaining develop operations.
5. Replace behavior-signature parity with native pixel parity.
6. Prove real native Pipeline frames in the viewport.
7. Lock Tauri or activate the ADR-0004 fallback ladder.
8. Move catalog/import indexing to SQLite.
9. Build the internal-alpha editor UI.
10. Replace placeholder export companions with real Pipeline outputs.
11. Add signed offline License activation.
12. Package and smoke-test across platforms.

## Completion Criteria

The plan is complete when:
- A user can import a folder of supported sources.
- The Catalog persists library state, recipes, presets, Batch Sync sessions, sidecar links, and reopen state durably.
- The app can Cull, develop a hero image, apply Batch Sync, and export JPEG/PNG/TIFF-16 fully offline.
- Preview and Export are rendered by the same native Pipeline and covered by pixel parity fixtures.
- The viewport path has passed ADR-0004 gates or the fallback architecture is implemented and documented.
- Offline License validation gates local edit/export independently from cloud Credits.
- Cross-platform smoke reports exist for Windows, macOS, and Linux.
- `npm test`, `npm run build`, `cargo test --manifest-path src-tauri/Cargo.toml`, and the internal-alpha smoke command pass on the release candidate.
