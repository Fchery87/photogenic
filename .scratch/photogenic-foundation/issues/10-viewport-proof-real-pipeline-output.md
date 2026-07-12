# Issue 10 — Viewport proof with real Pipeline output

Status: ready-for-agent

## Progress (code-gap closure, 2026-07-09)
Closed the code gaps verifiable in a headless box:
- The viewport workflow now forwards `measureWebviewGates`/`measureSustainedFps`, so a saved proof session can capture all six gates, not just gradient + raw_frame (`src/viewport-proof/workflow.js`).
- The verdict now exposes `fallbackActivated` + `measuredGateFailures`; placeholder/shell-unavailable sentinels are marked `measured: false` so missing evidence never activates the ADR-0004 fallback ladder, while a measured hard-gate failure does (`src/viewport-proof/gates.js`, `src/viewport-proof/shell-source.js`).
Verified: `npm test` 399/399 (all viewport suites green).

Still open (environment-blocked, NOT closeable in this workspace): the actual interactive viewport measurement cannot be captured in this headless Linux box — no display server, so `npm run tauri:dev` cannot open a window and `viewport_proof_results` is never invoked; `scripts/tauri-attempt.mjs` also blocks on `npx @tauri-apps/cli@latest` network resolution. macOS/Windows proof requires their native hosts. The three `verification/viewport-*.json` reports therefore remain `shellDecisionUnlocked: false`, the shell decision stays provisional (ADR-0010), and Issue 10 cannot be marked done from this workspace.

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
