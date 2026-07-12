# Issue 13 — Real export backends

Status: ready-for-agent

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
