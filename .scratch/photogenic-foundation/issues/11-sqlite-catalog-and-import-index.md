# Issue 11 — SQLite Catalog and import index

Status: ready-for-agent

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
