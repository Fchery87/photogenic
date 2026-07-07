# Issue 13 — Real export backends

Status: ready-for-agent

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
