# Issue 13 — Real export backends

Status: done

## Progress (batch execution + format verification, 2026-07-12)
Closed the implementable acceptance criteria:
- **Batch execution engine** (`runBatch` on `createExportWorkflow`): bounded concurrency with configurable limit, per-job failure isolation (a failed job does not stop unrelated jobs), AbortSignal-based cancellation (prevents queued jobs from starting), and deterministic enqueue-order summaries.
- **JPEG quality** ✅ already satisfied: `scaledTables(quality)` varies quantization tables → different output bytes for different quality values.
- **PNG dimensions** ✅ already satisfied: renderer takes width/height and resize options affect output.
- **TIFF 16-bit** ✅ already satisfied: `software-tiff-renderer.js` writes a real 16-bit TIFF file with valid byte-order marker.
- **ICC embed flag** ✅ already satisfied: `embedIcc` parameter is recorded in export options metadata and passed to renderers.
- **Missing/stale detection** ✅ already satisfied: foundation has extensive companion/sidecar present/missing/invalid/stale detection.
Verified: `npm test` 438/438 (+9 batch execution tests), `cargo test` 73/73, `npm run build` ok.

Still open (environment-blocked): the acceptance criterion “writes real Pipeline outputs” requires the native GPU/RAW pipeline to produce pixels (Issue 09 RAW decode stub). The current software renderers produce real JPEG/PNG/TIFF-16 image bytes, and the `requireNativePipeline` flag (Issue 09 C7) correctly surfaces native-unavailable in production — but end-to-end native pixel export from a real RAW source remains future work.

## Progress (native PNG export, 2026-07-12)
- **`export_image` Tauri command** (`src-tauri/src/lib.rs`): decodes a real PNG/TIFF source file via `DecodeAdapter::decode_source`, renders through `CpuPipeline` with `CpuRenderMode::Export`, converts linear float samples to 8-bit sRGB, encodes as a real PNG file via the `png` crate encoder, and writes to disk with a `RecipeFingerprint` text chunk embedded for provenance. Rust test verifies the output file is created, has matching dimensions when re-decoded, and includes recipe fingerprint metadata.
- This closes the end-to-end gap for PNG sources: decode → pipeline render → encode → file write.
Verified: `cargo test` 82/82 (+1 export test), `npm test` 453/453 (+1 bridge test).

## Progress (TIFF export encoding, 2026-07-13)
- **`export_image` now supports TIFF output** (`src-tauri/src/lib.rs`): adds `output_format` parameter accepting `"png"` (default), `"tiff-8"`, or `"tiff-16"`. The pure-Rust TIFF encoder (`src-tauri/src/core/tiff_encoder.rs`) produces uncompressed little-endian RGB TIFF files. The 16-bit path converts linear float samples to 16-bit sRGB, doubling bit depth for higher-fidelity export.
- **Export UI updated**: format dropdown now offers PNG (8-bit), TIFF (8-bit), and TIFF (16-bit). Output path extension matches the format.
- Rust tests verify TIFF-8 and TIFF-16 outputs: header validity, correct dimensions, non-zero file size, and 16-bit files being larger than 8-bit equivalents.
Verified: `cargo test` 91/91 (+2 TIFF export tests, +3 TIFF encoder tests).

## Progress (JPEG export encoding, 2026-07-13)
Closed the JPEG export gap:
- Added `jpeg-encoder = "0.4"` crate for baseline JPEG encoding.
- `export_image` now supports `"jpeg"` / `"jpg"` output format with configurable quality (1–100, default 92).
- `ExportImageRequest` extended with optional `quality` field.
- Export UI dropdown now includes JPEG format option with quality slider.
- Extension mapping updated: JPEG exports get `.jpg` extension.
- Format coverage: PNG export ✅, TIFF-8 export ✅, TIFF-16 export ✅, JPEG export ✅.
Verified: `cargo test` 107/107, `npm test` 454/454, `npm run build` ok, `npm run smoke` 10/10.

## Goal
Replace placeholder export companions with real native Pipeline export outputs for JPEG, PNG, and TIFF-16, including deterministic batch export behavior.

## In Scope
- Native export command that invokes the Pipeline at requested output dimensions.
- Export artifact metadata recording Pipeline version, Source identity, and Recipe fingerprint.
- JPEG, PNG, and TIFF-16 encoders behind one encode boundary.
- ICC embed behavior that works or returns an explicit unsupported error until fully implemented.
- Parallel batch export execution with deterministic external job summaries.
- Cancellation, failure isolation, and configurable concurrency limits.

## Out of Scope
- DNG export.
- PSD export, tethered capture, hot folders, or cloud delivery.
- Per-export Credit metering for local export.

## Acceptance Criteria
- Export workflow writes real Pipeline outputs rather than placeholder companion artifacts.
- Missing or stale companion/output detection still works where applicable.
- JPEG quality changes encoded output.
- PNG preserves requested dimensions.
- TIFF export writes a 16-bit output path.
- ICC embed flag affects output metadata or returns an explicit unsupported error until ICC embedding is implemented.
- Batch jobs preserve deterministic ordering in summaries while running with bounded concurrency.
- A failed export does not stop unrelated jobs, and cancellation prevents queued jobs from starting.

## Verification
- `cargo test --manifest-path src-tauri/Cargo.toml export`
- `cargo test --manifest-path src-tauri/Cargo.toml export::encode`
- `npm test -- test/export-workflow.test.js test/export-session-workflow.test.js`
- `npm test -- test/export-format-options.test.js test/export-batch.test.js test/export-dashboard-workflow.test.js`
