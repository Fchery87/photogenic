# Issue 12 — Internal alpha UI

Status: ready-for-agent

## Progress (editor UI + Tauri bridge + full develop controls + preset/workspace, 2026-07-12)
Closed the implementable portions:
- **Editor UI shell** (`app/index.html`, `app/editor.css`, `app/main.js`): replaces the Phase 0 viewport harness with a real editor layout — library sidebar, center preview, develop panel with 19 recipe controls covering all operation types, batch-sync panel, export panel, status bar, and pipeline/license badges.
- **Tauri command bridge** (`app/tauri-bridge.js`): wraps the Tauri invoke IPC with graceful degradation. When Tauri is unavailable, the bridge reports `available: false` and all methods reject with a clear error.
- **Tauri catalog commands** (`src-tauri/src/lib.rs`): seven commands expose the SQLite catalog store: `list_library`, `get_recipe`, `save_recipe`, `list_presets`, `save_preset`, `get_workspace_state`, `save_workspace_state`.
- **Recipe↔control mapping** tested: all 15 recipe operation types (exposure, temperature, tint, contrast, highlights, shadows, whites, blacks, toneCurve, HSL, sharpen, noiseReduction, crop, rotate, straighten).
- **Preset save** wired (criterion 6): the UI saves a source-independent preset via `bridge.savePreset()`.
- **Workspace reopen** wired (criterion 3): the UI saves the selected image ID on change and restores it on startup via `bridge.getWorkspaceState()`.
- **Editor verified rendering** in headless Chrome with 19 develop controls, library sidebar, export panel.
Verified: `npm test` 450/450, `cargo test` 78/78, `npm run build` ok.

Still open (environment-blocked, cannot fully close from this workspace):
- The UI cannot be visually verified in Tauri runtime (no display server).
- Import file picker needs Tauri file-dialog API.
- Batch sync and export execution need additional Tauri commands wiring the JS workflows.
- Criterion 7 (reject invalid preset operations) needs preset apply/validate Tauri command.
- Criterion 9 (export without bypassing licensing) needs export + licensing Tauri commands.

## Goal
Replace the Phase 0 harness with a usable internal-alpha editor shell that supports import, culling, develop controls, presets, Batch Sync, export queueing, and reopen state through the established workflow seams.

## In Scope
- Small Tauri-compatible React/TypeScript or React/JavaScript app shell.
- Library navigation, center viewport, filmstrip/grid, culling controls, develop controls, preset panel, Batch Sync dialog, and export panel.
- Import, rating, flag/reject, filtering, selected image, and active filter state wired through catalog/workspace workflows.
- Develop controls wired to Edit Recipe updates and native Pipeline preview requests.
- Preset and Batch Sync UI using existing source-independent Recipe semantics.

## Out of Scope
- Marketing landing pages or public launch positioning.
- Components writing directly to storage.
- New pixel processing behavior in the UI.
- Production Recognition, AI retouch, or generative cloud features.

## Acceptance Criteria
- App shell renders as an editor rather than the old harness-only layout.
- Library view shows imported images and persists culling state.
- Reopen restores selected image and active filter.
- Develop controls update the Edit Recipe, supersede stale preview requests, and record native Pipeline provenance.
- Develop controls cover White Balance, exposure, tone controls, tone curve, HSL, sharpening/noise reduction, and crop/rotate/straighten.
- Current Recipe can be saved as a source-independent Preset.
- Invalid source-dependent Preset operations are rejected.
- Batch Sync uses explicit operation selection controls, applies selected operation types to selected target images, preserves unsupported source-dependent target operations unless explicitly supported, and can be reopened.
- Export panel can queue an export without bypassing licensing or export workflow seams.

## Verification
- `npm test -- test/internal-alpha-ui.test.js`
- `npm test -- test/internal-alpha-library-ui.test.js test/catalog-dashboard-workflow.test.js`
- `npm test -- test/internal-alpha-develop-ui.test.js test/preview-workflow.test.js`
- `npm test -- test/internal-alpha-preset-batch-ui.test.js test/preset-workflow.test.js test/batch-session-workflow.test.js`
- `npm run build`
- `npm run tauri:dev`
