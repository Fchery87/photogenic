CREATE TABLE IF NOT EXISTS catalog_images (
  image_id TEXT PRIMARY KEY,
  source_path TEXT,
  imported_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_recipes (
  image_id TEXT PRIMARY KEY,
  recipe_json TEXT NOT NULL,
  recipe_fingerprint TEXT NOT NULL,
  revision INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (image_id) REFERENCES catalog_images(image_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS library_culling_metadata (
  image_id TEXT PRIMARY KEY,
  rating INTEGER NOT NULL DEFAULT 0,
  flagged INTEGER NOT NULL DEFAULT 0,
  rejected INTEGER NOT NULL DEFAULT 0,
  color_label TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (image_id) REFERENCES catalog_images(image_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS catalog_presets (
  preset_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  recipe_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS catalog_sidecar_links (
  image_id TEXT PRIMARY KEY,
  sidecar_path TEXT NOT NULL,
  sidecar_linked_at TEXT NOT NULL,
  catalog_revision INTEGER NOT NULL,
  FOREIGN KEY (image_id) REFERENCES catalog_images(image_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS catalog_workspace_state (
  workspace_id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

PRAGMA user_version = 1;
