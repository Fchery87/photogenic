# Issue 11 — SQLite Catalog and import index

Status: done

## Progress (SQLite catalog wiring, 2026-07-12)
Closed the JS-side SQLite catalog wiring gap:
- **SQLite schema + backend** (`src/catalog/sqlite-schema.js`, `src/catalog/sqlite-backend.js`): node:sqlite-backed adapter with per-store tables (catalog_recipes, catalog_images, catalog_presets, catalog_workspace_state). Schema version 1 with migrations applied on open.
- **catalogBackend seam**: Added to `createLibraryStore`, `createPresetStore`, `createWorkspaceSessionStore` (recipe-store already had it). All four stores now accept `catalogBackend: { loadStore(), saveStore() }` for durable SQLite persistence.
- **Durable persistence verified**: recipe revision increments across restarts; library culling metadata (rating/flag/color label) survives; preset and workspace snapshots survive; all four stores share one SQLite file without collision.
- **Import wiring**: `importShoot` runs end-to-end with a SQLite-backed library store — one durable row per supported RAW/JPEG/TIFF/PNG source, no duplicates on re-import, metadata refresh updates file size/modified time in-place.
Verified: `npm test` 412/412 (+13 SQLite backend tests), `cargo test` 73/73 (Rust store unchanged), `npm run build` ok.

Still open: the production path (Tauri runtime → Rust rusqlite) is wired at the Rust command level (`catalog::import::import_sources` is registered) but the JS adapter currently targets the node:sqlite test path; wiring the JS `catalogBackend` to call Tauri invoke commands (like the native pipeline adapter) is future work pending Issue 12 (app UI bootstrap).

## Progress (Tauri catalog backend wiring, 2026-07-13)
Closed the remaining gap between the JS `catalogBackend` abstraction and the Tauri runtime:
- Created `src/catalog/tauri-catalog-backend.js`: implements the full `catalogBackend` interface (recipe, library, preset, workspace) using Tauri invoke commands backed by the Rust SQLite store.
- Each backend provides `loadStore()` and `saveStore()` methods that delegate to the corresponding Tauri commands (`list_library`, `get_recipe`, `save_recipe`, `list_presets`, `save_preset`, etc.).
- The Tauri catalog backend can be plugged into all four store factories (`createCatalogRecipeStore`, `createLibraryStore`, `createPresetStore`, `createWorkspaceSessionStore`) for durable SQLite persistence through the Rust layer.
Verified: `npm test` 454/454, `cargo test` 107/107, `npm run build` ok, `npm run smoke` 10/10.

## Goal
Move Catalog persistence and import indexing to durable SQLite storage while preserving the existing workflow seams for recipes, library state, presets, sidecars, and reopen state.

## In Scope
- SQLite Catalog schema, migrations, and store boundary.
- Catalog backend adapter so existing JavaScript workflows can run against durable storage.
- Durable persistence for Edit Recipes, Ratings, Flags, color labels, Presets, sidecar links, and workspace state.
- Real import indexing for supported RAW/JPEG/TIFF/PNG sources.
- Metadata refresh for file size, modified time, format classification, and EXIF-lite fields when available.

## Out of Scope
- Direct storage writes from UI components.
- Cloud sync, marketplace storage, or multi-user collaboration.
- Replacing the Source file or mutating originals during import.

## Acceptance Criteria
- Catalog initializes from an empty database with migrations applied.
- Recipe save/load survives process restart.
- SQLite-backed tables and reopen behavior are independently verified for Edit Recipes, Ratings, Flags, color labels, Presets, sidecar links, and workspace state.
- Existing recipe, library, preset, sidecar, and workspace workflow tests run against the SQLite-backed adapter rather than only the file-backed foundation stores.
- Folder import writes one durable image row per supported source.
- Format classification is consistent across RAW, JPEG, TIFF, and PNG.
- Metadata refresh updates changed file size and modified time without duplicating images.

## Verification
- `cargo test --manifest-path src-tauri/Cargo.toml catalog`
- `cargo test --manifest-path src-tauri/Cargo.toml catalog::import`
- `npm test -- test/catalog-recipe-store.test.js test/library-store.test.js test/preset-store.test.js`
- `npm test -- test/import-workflow.test.js test/catalog-workflow.test.js test/source-file-insights.test.js`
