/**
 * SQLite-backed catalog adapter for the JavaScript layer (Issue 11).
 *
 * Provides `catalogBackend` objects compatible with the existing store factories
 * (createCatalogRecipeStore, createLibraryStore, createPresetStore,
 * createWorkspaceSessionStore). Each backend implements `loadStore()` /
 * `saveStore()` backed by a durable SQLite database via node:sqlite DatabaseSync.
 *
 * Usage in tests:
 *   const backend = createSqliteCatalogBackend({ dbPath: "/tmp/catalog.sqlite" });
 *   const store = createCatalogRecipeStore({ catalogBackend: backend.recipe });
 *
 * In production (Tauri runtime), the JS workflows would delegate to the Rust store
 * via Tauri commands instead of this direct node:sqlite path.
 */

import { DatabaseSync } from "node:sqlite";
import {
  CATALOG_SCHEMA_SQL,
  CATALOG_TABLE_NAMES,
  SQLITE_CATALOG_SCHEMA_VERSION,
  STORE_TABLE_MAP,
} from "./sqlite-schema.js";

const STORE_KEY_MAP = Object.freeze({
  recipe: "images",
  library: "images",
  preset: "presets",
  workspace: "snapshots",
});

/**
 * Create a SQLite-backed catalog backend.
 *
 * @param {object} options
 * @param {string} options.dbPath     - Path to the SQLite database file.
 * @returns {{ recipe: object, library: object, preset: object, workspace: object, close: () => void, tableNames: () => string[], schemaVersion: () => number }}
 */
export function createSqliteCatalogBackend({ dbPath }) {
  if (typeof dbPath !== "string" || !dbPath) {
    throw new TypeError("dbPath is required");
  }

  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(CATALOG_SCHEMA_SQL);

  function createStoreBackend(storeType) {
    const { table, idColumn } = STORE_TABLE_MAP[storeType];
    const storeKey = STORE_KEY_MAP[storeType];

    return {
      async loadStore() {
        const rows = db.prepare(`SELECT entry_json FROM ${table}`).all();
        if (rows.length === 0) return null;
        const entries = {};
        for (const row of rows) {
          const entry = JSON.parse(row.entry_json);
          const id = entry[idColumn] ?? entry.imageId ?? entry.presetId ?? entry.snapshotId;
          if (id) entries[id] = entry;
        }
        return { version: 1, [storeKey]: entries };
      },

      async saveStore(store) {
        if (!store || typeof store !== "object") {
          throw new TypeError("store must be an object");
        }
        const entries = store[storeKey] ?? {};
        const insert = db.prepare(
          `INSERT OR REPLACE INTO ${table} (${idColumn}, entry_json, updated_at) VALUES (?, ?, ?)`,
        );
        const deleteAll = db.prepare(`DELETE FROM ${table}`);

        db.exec("BEGIN");
        try {
          deleteAll.run();
          for (const [id, entry] of Object.entries(entries)) {
            const updatedAt = entry.updatedAt ?? entry.createdAt ?? new Date().toISOString();
            insert.run(id, JSON.stringify(entry), updatedAt);
          }
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
      },
    };
  }

  return {
    recipe: createStoreBackend("recipe"),
    library: createStoreBackend("library"),
    preset: createStoreBackend("preset"),
    workspace: createStoreBackend("workspace"),

    close() {
      db.close();
    },

    tableNames() {
      const rows = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?, ?) ORDER BY name",
        )
        .all(...CATALOG_TABLE_NAMES);
      return rows.map((r) => r.name);
    },

    schemaVersion() {
      const row = db.prepare("PRAGMA user_version").get();
      return row.user_version ?? 0;
    },
  };
}

export { SQLITE_CATALOG_SCHEMA_VERSION };
