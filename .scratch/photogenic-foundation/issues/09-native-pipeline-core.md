# Issue 09 — Native Pipeline core

Status: ready-for-agent

## Goal
Establish the single Rust/wgpu Pipeline that owns Preview and Export pixel math, mirrors the JavaScript Edit Recipe contract, decodes real sources, and supports both GPU acceleration and CPU fallback.

## In Scope
- Rust core crate/module boundary for Recipe, Source, PipelineRequest, Pipeline capabilities, decode, image buffers, and render paths.
- Stable Recipe parsing, normalization, ordering, and fingerprint compatibility with the existing JavaScript seam.
- RAW decode adapter plus accepted JPEG/PNG/TIFF source handling.
- Scene-linear 32-bit float Working Space with deterministic CPU fallback.
- wgpu capability reporting and first GPU operations, beginning with exposure and expanding through the foundation develop controls.
- Native render command used by Preview and Export parity tests.

## Out of Scope
- A second JavaScript pixel pipeline for production behavior.
- Final portrait Recognition, AI masking, generative edits, or DNG export.
- UI polish beyond adapter work needed to route workflows through the native Pipeline.

## Acceptance Criteria
- Preview and Export requests share the same Recipe fingerprint and native Pipeline boundary.
- Missing sources, unsupported formats, GPU unavailability, and decode failures return typed errors rather than panics.
- CPU fallback renders deterministic preview artifacts without GPU availability.
- GPU exposure matches CPU exposure within documented tolerance.
- Core develop operations are validated at the Recipe seam and Pipeline seam: White Balance, exposure, contrast, highlights, shadows, whites, blacks, tone curve, HSL, sharpening, noise reduction, crop, rotate, and straighten.
- Each develop operation has Recipe validation coverage, CPU output sample coverage, GPU-vs-CPU tolerance coverage, and Preview↔Export parity fixture coverage where practical.
- Behavior-signature parity is replaced by native pixel fixture parity for Preview and Export.
- Production Preview and Export paths report `native-unavailable` when the native Pipeline cannot be reached; the existing deterministic JavaScript renderer may be used only in explicit test mode.

## Verification
- `cargo test --manifest-path src-tauri/Cargo.toml core`
- `cargo test --manifest-path src-tauri/Cargo.toml decode`
- `cargo test --manifest-path src-tauri/Cargo.toml gpu`
- `cargo test --manifest-path src-tauri/Cargo.toml gpu_pipeline`
- `npm test -- test/edit-recipe.test.js test/export-parity.test.js test/preview-workflow.test.js test/export-workflow.test.js`
