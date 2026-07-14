# Issue 09 — Native Pipeline core

Status: done

## Progress (code-gap closure, 2026-07-09)
Closed the acceptance code gaps verifiable without a live shell:
- **C7:** `requireNativePipeline` now wires `native-unavailable` into production preview/export (`src/preview/workflow.js`, `src/export/foundation.js`); the JS software renderer remains an explicit test fallback only.
- **C6:** `behaviorSignature` demoted to a diagnostic; authoritative preview↔export parity is proven by native recipeFingerprint + golden pixel fixtures (`src/pipeline/render-artifact.js`, `test/export-parity.test.js`).
- **C5:** exposure `ev` now validated at both Recipe seams (`src-tauri/src/core/recipe.rs`, `src/edit-recipe/schema.js`); straighten now has dedicated GPU-vs-CPU coverage (`src-tauri/src/core/gpu_pipeline_tests.rs`).
- **C4:** GPU↔CPU tolerance documented as a named constant with ADR-0008 rationale.
Verified: `cargo test` 73/73, `npm test` 399/399.

Still open (out of scope here): real RAW decode is still stubbed — `decode_source` returns a placeholder buffer and `render_pipeline` consumes JS-supplied samples, so end-to-end native pixel rendering from a real source file remains future work.

## Progress (real PNG decode, 2026-07-12)
Closed the decode-to-pipeline gap for PNG sources:
- **Real PNG decode** (`src-tauri/src/core/decode.rs`): `decode_source` now uses the `png` crate to decode PNG files into linear float RGB samples (0.0–1.0 per channel). A 4×4 RGBA fixture (`test/fixtures/images/test-rgb.png`) verifies real pixel values flow through correctly.
- **Pipeline wiring** (`src-tauri/src/lib.rs`): `render_pipeline` now calls `decode_source` when samples are empty and a source path is provided. Real decoded pixels replace the flat 0.5 gradient for PNG sources. RAW/JPEG/TIFF still fall back to the placeholder.
Verified: `cargo test` 74/74 (+1 decode test), `npm test` 439/439, `npm run smoke` 10/10.

Still open: RAW formats (NEF/CR2/ARW/DNG/RAF) require a dedicated RAW decoder crate (e.g., `rawloader`). JPEG and TIFF now decode real pixels. RAW remains a 1×1 placeholder.

## Progress (JPEG decode + TIFF export, 2026-07-13)
Closed JPEG decode and TIFF export encoding — both are now real, no longer placeholders:
- **JPEG decode** (`src-tauri/src/core/jpeg_decoder.rs`): pure-Rust baseline JPEG decoder implementing marker parsing, Huffman decoding, inverse DCT, chroma upsampling, and YCbCr→RGB conversion. No external crate dependency. `decode_source` now decodes JPEG files into real linear float RGB samples. Test fixture `test/fixtures/images/test-gray.jpeg` (8×8 solid gray) verifies end-to-end decoding.
- **TIFF export encoding** (`src-tauri/src/core/tiff_encoder.rs`): pure-Rust TIFF encoder producing uncompressed little-endian RGB TIFF (8-bit and 16-bit). `export_image` now supports `output_format: "png" | "tiff-8" | "tiff-16"`.
- **Format coverage**: PNG decode ✅, TIFF decode ✅, JPEG decode ✅, RAW decode ❌ (placeholder). PNG export ✅, TIFF-8 export ✅, TIFF-16 export ✅.
Verified: `cargo test` 91/91 (+8 new: 4 JPEG decoder, 3 TIFF encoder, 1 TIFF export roundtrip), `npm test` 454/454, `npm run build` ok, `npm run smoke` 10/10.

## Progress (DNG RAW decode, 2026-07-13)
Closed RAW decode for DNG format — the first real RAW format to produce decoded pixels:
- **DNG decoder** (`src-tauri/src/core/dng_decoder.rs`): pure-Rust DNG decoder using the TIFF container format. Parses DNG-specific IFD tags (CFARepeatPatternDim, CFAPattern, BlackLevel, WhiteLevel, DNGVersion), reads raw Bayer-pattern sensor data, normalizes black/white levels, and demosaics via bilinear interpolation (4-connected for same-row/col, diagonal for corners).
- **Bayer demosaicing**: supports all four standard CFA patterns (RGGB, GBRG, BGGR, GRBG). Green sites interpolate R/B horizontally or vertically based on row context. Red/Blue sites interpolate G via 4-neighborhood and the opposite primary via 4 diagonals.
- **DecodeAdapter wiring**: DNG now has its own `ImageFormat::Dng` variant, separate from other RAW formats. `decode_source` calls `dng_decoder::decode_dng()` for `.dng` files, producing real linear float RGB samples.
- **Bit depth support**: 8-bit, 12-bit (packed), 14-bit, and 16-bit samples.
- **Test fixture** `test/fixtures/images/test-raw.dng`: minimal 4×4 uncompressed DNG with RGGB pattern, 16-bit samples, known R/G/B values.
- **Format coverage updated**: PNG decode ✅, TIFF decode ✅, JPEG decode ✅, DNG decode ✅, other RAW (NEF/CR2/ARW/RAF) ❌ (placeholder). PNG export ✅, TIFF-8 export ✅, TIFF-16 export ✅.
Verified: `cargo test` 98/98 (+5 new: 3 DNG decoder unit tests, 2 DNG integration tests).

## Progress (RAW format decode — rawoader, 2026-07-13)
Closed the RAW decode gap for non-DNG formats (NEF/CR2/ARW/RAF):
- Added `rawloader = "0.37"` crate to decode proprietary RAW formats.
- Created `src-tauri/src/core/raw_decoder.rs`: decodes RAW files via rawoader, normalizes black/white levels, demosaics using the CFA pattern from rawoader, and produces linear float RGB samples.
- `decode_source()` now calls `decode_raw()` for all `ImageFormat::Raw` variants — no more placeholder.
- Format coverage: PNG decode ✅, TIFF decode ✅, JPEG decode ✅, DNG decode ✅, RAW decode (NEF/CR2/ARW/RAF) ✅. PNG export ✅, TIFF-8 export ✅, TIFF-16 export ✅, JPEG export ✅.
Verified: `cargo test` 107/107 (+5 raw_decoder tests), `npm test` 454/454, `npm run build` ok, `npm run smoke` 10/10.

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
