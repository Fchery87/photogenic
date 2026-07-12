/**
 * SQLite catalog schema for the JavaScript adapter layer (Issue 11).
 *
 * The Rust layer (`src-tauri/src/catalog/migrations/0001_initial.sql`) defines the
 * full relational production schema with typed columns. This JS schema mirrors the
 * same table names so both layers agree on the catalog boundary, but stores each
 * store entry as a JSON document (`entry_json`) keyed by the entity id. This lets
 * the existing JS workflow tests run against durable SQLite storage without
 * needing a 30-column relational mapping that would diverge from the Rust schema.
 *
 * In production the JS workflows delegate to the Rust store via Tauri commands;
 * in tests they use this node:sqlite-backed adapter directly.
 */

export const SQLITE_CATALOG_SCHEMA_VERSION = 1;

export const CATALOG_TABLE_NAMES = Object.freeze([
  "catalog_recipes",
  "catalog_images",
  "catalog_presets",
  "catalog_workspace_state",
]);

export const CATALOG_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS catalog_recipes (
  image_id    TEXT PRIMARY KEY,
  entry_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_images (
  image_id    TEXT PRIMARY KEY,
  entry_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_presets (
  preset_id   TEXT PRIMARY KEY,
  entry_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_workspace_state (
  workspace_id TEXT PRIMARY KEY,
  entry_json   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

PRAGMA user_version = ${SQLITE_CATALOG_SCHEMA_VERSION};
`;

/** Store type → table name + id column mapping. */
export const STORE_TABLE_MAP = Object.freeze({
  recipe: { table: "catalog_recipes", idColumn: "image_id" },
  library: { table: "catalog_images", idColumn: "image_id" },
  preset: { table: "catalog_presets", idColumn: "preset_id" },
  workspace: { table: "catalog_workspace_state", idColumn: "workspace_id" },
});
