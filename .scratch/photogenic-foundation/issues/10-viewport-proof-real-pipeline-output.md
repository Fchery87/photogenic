# Issue 10 — Viewport proof with real Pipeline output

Status: ready-for-agent

## Goal
Prove the chosen shell can display real native Pipeline frames with honest viewport measurements, then lock Tauri for internal alpha or activate the ADR-0004 fallback ladder.

## In Scope
- Native frame provenance from the Pipeline into the viewport harness.
- Gate tests that reject gradients or browser placeholders as proof of real RAW/native frame output.
- Zoom, pan, overlay, color sample, and sustained FPS measurements tied to actual rendered frame bounds.
- Platform proof reports for Windows, macOS, and Linux.
- ADR update recording whether Tauri is locked or which fallback path is activated.

## Out of Scope
- Declaring the shell decision complete from synthetic gradients or CSS-only color checks.
- Reimplementing image processing in the webview.
- Public launch packaging or final UI polish.

## Acceptance Criteria
- `raw_frame` can pass only with measured native Pipeline frame provenance.
- Viewport reports include source id, Recipe fingerprint, dimensions, transfer method, frame hash, and render duration.
- Zoom/pan and overlay gates measure interaction over the rendered frame.
- Color validation samples known Pipeline output, not CSS decoration.
- Sustained FPS is based on measured frame count and duration and must meet the 60fps gate threshold before the shell decision can be locked.
- Any hard gate failure keeps the shell decision provisional and activates the ADR-0004 fallback decision path.
- Shell-decision evidence includes `.scratch/photogenic-foundation/verification/viewport-windows.json`, `.scratch/photogenic-foundation/verification/viewport-macos.json`, and `.scratch/photogenic-foundation/verification/viewport-linux.json`.
- The shell decision is recorded in ADRs with fallback work activated if any hard gate fails.

## Verification
- `npm test -- test/viewport-proof.test.js test/viewport-shell-source.test.js`
- `npm test -- test/viewport-webview.test.js test/viewport-fps.test.js test/viewport-dashboard-foundation.test.js`
- `cargo test --manifest-path src-tauri/Cargo.toml viewport`
- `npm run tauri:attempt`
- `npm run tauri:dev`
