# Issue 12 — Internal alpha UI

Status: ready-for-agent

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
