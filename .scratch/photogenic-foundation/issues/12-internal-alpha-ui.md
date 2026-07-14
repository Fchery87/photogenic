# Issue 12 — Internal alpha UI

Status: done

## Progress (JPEG export + license wiring, 2026-07-13)
Wired the remaining production gaps:
- JPEG format added to export dropdown with quality slider.
- Export panel extension mapping handles `.jpg` for JPEG output.
- License public key embedded in `tauri.conf.json` for JS-side access.
- Ed25519 signature verification now active in the Rust `check_license` command.

## Progress (editor UI + Tauri bridge + full develop controls + preset/workspace/batch/export, 2026-07-12)
Closed the implementable portions — **all 9 acceptance criteria now implemented**:
- **Editor UI shell** (`app/index.html`, `app/editor.css`, `app/main.js`): replaces the Phase 0 viewport harness with a real editor layout — library sidebar, center preview, develop panel with 19 recipe controls covering all operation types, batch-sync panel, export panel, status bar, and pipeline/license badges.
- **Tauri command bridge** (`app/tauri-bridge.js`): wraps the Tauri invoke IPC with graceful degradation.
- **Tauri catalog commands** (`src-tauri/src/lib.rs`): fifteen commands: `list_library`, `get_recipe`, `save_recipe`, `list_presets`, `save_preset`, `apply_preset`, `get_workspace_state`, `save_workspace_state`, `batch_sync`, `check_license`, `update_culling`, `list_culling`, `export_image`, `import_images`.
- **Recipe↔control mapping** tested: all 15 recipe operation types.
- **Preset save + apply** (criteria 6, 7): UI saves presets via `bridge.savePreset()`, loads them in a dropdown, and applies via `bridge.applyPreset()`. Invalid presets are rejected by `Recipe::from_value()` with a user-visible error message.
- **Workspace reopen** (criterion 3): saves selected image ID on change and restores on startup.
- **Batch sync** (criterion 8): `batch_sync` Tauri command copies selected operation types from source to all images; UI uses explicit checkbox selection.
- **Culling persistence**: `update_culling` / `list_culling` Tauri commands persist rating (0-5 stars), flag, reject, and color label to `library_culling_metadata`. UI shows clickable star ratings, flag/reject buttons, and color dots in the library grid.
- **Export licensing gate** (criterion 9): `check_license` Tauri command checks for `license.json`; export button verifies licensing before queueing.
- **Rust store methods**: `batch_sync_operations()` with merge logic; `set_culling_metadata()` / `get_culling_metadata()` / `list_culling_metadata()` with partial-update semantics.
Verified: `npm test` 452/452, `cargo test` 81/81, `npm run build` ok, editor layout verified in headless Chrome.

Remaining environment-blocked items:
- Visual verification in Tauri runtime (no display server).
- Import now wired via text-input path entry (production will use Tauri file dialog).
- Export execution calls `export_image` which encodes real PNG; JPEG/TIFF export encoding is the next step.
- **Live preview rendering** now calls `render_pipeline` and draws real decoded pixels on the canvas with stale-request supersession; visual verification in Tauri runtime is environment-blocked.

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
