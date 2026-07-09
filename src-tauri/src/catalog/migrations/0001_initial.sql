CREATE TABLE IF NOT EXISTS catalog_images (
  image_id TEXT PRIMARY KEY,
  source_path TEXT,
  file_name TEXT,
  observed_format TEXT,
  byte_size INTEGER,
  modified_at TEXT,
  pixel_width INTEGER,
  pixel_height INTEGER,
  orientation INTEGER,
  observed_capture_at TEXT,
  camera_make TEXT,
  camera_model TEXT,
  lens_model TEXT,
  imported_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS catalog_images_source_path_idx
  ON catalog_images(source_path);

CREATE TABLE IF NOT EXISTS catalog_imports (
  import_id INTEGER PRIMARY KEY AUTOINCREMENT,
  image_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  FOREIGN KEY (image_id) REFERENCES catalog_images(image_id) ON DELETE CASCADE
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
