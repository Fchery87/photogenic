use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use rusqlite::{params, Connection, OptionalExtension};
use serde_json::Value;

use super::schema::{MIGRATION_0001, SCHEMA_VERSION};
use crate::core::Recipe;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CatalogRecipeEntry {
    pub image_id: String,
    pub recipe: Recipe,
    pub recipe_fingerprint: String,
    pub revision: i64,
    pub updated_at: String,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct ImportedImageRow {
    pub image_id: String,
    pub source_path: String,
    pub file_name: String,
    pub observed_format: String,
    pub byte_size: Option<i64>,
    pub modified_at: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct PresetEntry {
    pub preset_id: String,
    pub name: String,
    pub recipe_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct WorkspaceStateEntry {
    pub workspace_id: String,
    pub state_json: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct BatchSyncResult {
    pub updated_count: u32,
    pub skipped_count: u32,
    pub message: String,
}

/// Culling metadata for a library image.
/// `rating` is 0-5, `flagged`/`rejected` are booleans stored as 0/1,
/// `color_label` is an optional string (e.g. "red", "blue").
#[derive(Clone, Debug, Eq, PartialEq, serde::Serialize)]
pub struct CullingMetadata {
    pub image_id: String,
    pub rating: i32,
    pub flagged: bool,
    pub rejected: bool,
    pub color_label: Option<String>,
    pub updated_at: String,
}

pub struct SqliteCatalogStore {
    connection: Connection,
}

impl SqliteCatalogStore {
    pub fn open(path: impl AsRef<Path>) -> rusqlite::Result<Self> {
        let connection = Connection::open(path)?;
        connection.execute_batch("PRAGMA foreign_keys = ON;")?;
        let version: i32 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version == 0 {
            connection.execute_batch(MIGRATION_0001)?;
        }
        let version: i32 = connection.pragma_query_value(None, "user_version", |row| row.get(0))?;
        if version != SCHEMA_VERSION {
            return Err(rusqlite::Error::InvalidQuery);
        }
        Ok(Self { connection })
    }

    pub fn schema_version(&self) -> rusqlite::Result<i32> {
        self.connection
            .pragma_query_value(None, "user_version", |row| row.get(0))
    }

    pub fn table_names(&self) -> rusqlite::Result<Vec<String>> {
        let mut statement = self.connection.prepare(
            "SELECT name FROM sqlite_master
             WHERE type = 'table'
               AND (name LIKE 'catalog_%' OR name = 'library_culling_metadata')
             ORDER BY name ASC",
        )?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        rows.collect()
    }

    pub fn save_recipe(
        &self,
        image_id: &str,
        recipe: &Recipe,
        updated_at: &str,
    ) -> rusqlite::Result<CatalogRecipeEntry> {
        let previous_revision: Option<i64> = self
            .connection
            .query_row(
                "SELECT revision FROM catalog_recipes WHERE image_id = ?1",
                [image_id],
                |row| row.get(0),
            )
            .optional()?;
        let revision = previous_revision.unwrap_or(0) + 1;
        let recipe_json = serde_json::to_string(&recipe.to_value())
            .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))?;
        let recipe_fingerprint = recipe.fingerprint();

        self.connection.execute(
            "INSERT INTO catalog_images (image_id, source_path, imported_at, updated_at)
             VALUES (?1, NULL, ?2, ?2)
             ON CONFLICT(image_id) DO UPDATE SET updated_at = excluded.updated_at",
            params![image_id, updated_at],
        )?;
        self.connection.execute(
            "INSERT INTO catalog_recipes (image_id, recipe_json, recipe_fingerprint, revision, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(image_id) DO UPDATE SET
               recipe_json = excluded.recipe_json,
               recipe_fingerprint = excluded.recipe_fingerprint,
               revision = excluded.revision,
               updated_at = excluded.updated_at",
            params![image_id, recipe_json, recipe_fingerprint, revision, updated_at],
        )?;

        Ok(CatalogRecipeEntry {
            image_id: image_id.to_string(),
            recipe: recipe.clone(),
            recipe_fingerprint,
            revision,
            updated_at: updated_at.to_string(),
        })
    }

    pub fn get_recipe(&self, image_id: &str) -> rusqlite::Result<Option<CatalogRecipeEntry>> {
        self.connection
            .query_row(
                "SELECT image_id, recipe_json, recipe_fingerprint, revision, updated_at
                 FROM catalog_recipes
                 WHERE image_id = ?1",
                [image_id],
                |row| {
                    let recipe_json: String = row.get(1)?;
                    let recipe = Recipe::from_json_str(&recipe_json).map_err(|error| {
                        rusqlite::Error::FromSqlConversionFailure(
                            1,
                            rusqlite::types::Type::Text,
                            Box::new(error),
                        )
                    })?;
                    Ok(CatalogRecipeEntry {
                        image_id: row.get(0)?,
                        recipe,
                        recipe_fingerprint: row.get(2)?,
                        revision: row.get(3)?,
                        updated_at: row.get(4)?,
                    })
                },
            )
            .optional()
    }

    pub fn upsert_imported_image(
        &self,
        row: &ImportedImageRow,
        imported_at: &str,
    ) -> rusqlite::Result<ImportedImageRow> {
        self.connection.execute(
            "INSERT INTO catalog_images (
               image_id,
               source_path,
               file_name,
               observed_format,
               byte_size,
               modified_at,
               imported_at,
               updated_at
             )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
             ON CONFLICT(image_id) DO UPDATE SET
               source_path = excluded.source_path,
               file_name = excluded.file_name,
               observed_format = excluded.observed_format,
               byte_size = excluded.byte_size,
               modified_at = excluded.modified_at,
               updated_at = excluded.updated_at",
            params![
                row.image_id,
                row.source_path,
                row.file_name,
                row.observed_format,
                row.byte_size,
                row.modified_at,
                imported_at
            ],
        )?;
        self.connection.execute(
            "INSERT INTO catalog_imports (image_id, source_path, imported_at)
             VALUES (?1, ?2, ?3)",
            params![row.image_id, row.source_path, imported_at],
        )?;
        Ok(row.clone())
    }

    pub fn list_imported_images(&self) -> rusqlite::Result<Vec<ImportedImageRow>> {
        let mut statement = self.connection.prepare(
            "SELECT image_id, source_path, file_name, observed_format, byte_size, modified_at
             FROM catalog_images
             WHERE source_path IS NOT NULL
             ORDER BY source_path ASC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(ImportedImageRow {
                image_id: row.get(0)?,
                source_path: row.get(1)?,
                file_name: row.get(2)?,
                observed_format: row.get(3)?,
                byte_size: row.get(4)?,
                modified_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn refresh_imported_image_metadata(
        &self,
        image_id: &str,
    ) -> rusqlite::Result<ImportedImageRow> {
        let existing = self.connection.query_row(
            "SELECT image_id, source_path, file_name, observed_format, byte_size, modified_at
                 FROM catalog_images
                 WHERE image_id = ?1 AND source_path IS NOT NULL",
            [image_id],
            |row| {
                Ok(ImportedImageRow {
                    image_id: row.get(0)?,
                    source_path: row.get(1)?,
                    file_name: row.get(2)?,
                    observed_format: row.get(3)?,
                    byte_size: row.get(4)?,
                    modified_at: row.get(5)?,
                })
            },
        )?;
        let metadata = fs::metadata(&existing.source_path).ok();
        let byte_size = metadata.as_ref().map(|metadata| metadata.len() as i64);
        let modified_at = metadata
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|duration| format!("{}.{:03}Z", duration.as_secs(), duration.subsec_millis()));

        self.connection.execute(
            "UPDATE catalog_images
             SET byte_size = ?2,
                 modified_at = ?3,
                 updated_at = ?3
             WHERE image_id = ?1",
            params![image_id, byte_size, modified_at],
        )?;

        Ok(ImportedImageRow {
            byte_size,
            modified_at,
            ..existing
        })
    }

    // ------------------------------------------------------------------
    // Presets
    // ------------------------------------------------------------------

    pub fn save_preset(
        &self,
        preset_id: &str,
        name: &str,
        recipe_json: &str,
        updated_at: &str,
    ) -> rusqlite::Result<PresetEntry> {
        // Check if preset exists to preserve created_at
        let existing_created: Option<String> = self
            .connection
            .query_row(
                "SELECT created_at FROM catalog_presets WHERE preset_id = ?1",
                [preset_id],
                |row| row.get(0),
            )
            .optional()?;
        let created_at = existing_created.unwrap_or_else(|| updated_at.to_string());

        self.connection.execute(
            "INSERT INTO catalog_presets (preset_id, name, recipe_json, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(preset_id) DO UPDATE SET
               name = excluded.name,
               recipe_json = excluded.recipe_json,
               updated_at = excluded.updated_at",
            params![preset_id, name, recipe_json, created_at, updated_at],
        )?;

        Ok(PresetEntry {
            preset_id: preset_id.to_string(),
            name: name.to_string(),
            recipe_json: recipe_json.to_string(),
            created_at,
            updated_at: updated_at.to_string(),
        })
    }

    pub fn get_preset(&self, preset_id: &str) -> rusqlite::Result<Option<PresetEntry>> {
        let result = self
            .connection
            .query_row(
                "SELECT preset_id, name, recipe_json, created_at, updated_at
                 FROM catalog_presets WHERE preset_id = ?1",
                [preset_id],
                |row| {
                    Ok(PresetEntry {
                        preset_id: row.get(0)?,
                        name: row.get(1)?,
                        recipe_json: row.get(2)?,
                        created_at: row.get(3)?,
                        updated_at: row.get(4)?,
                    })
                },
            )
            .optional()?;
        Ok(result)
    }

    pub fn list_presets(&self) -> rusqlite::Result<Vec<PresetEntry>> {
        let mut stmt = self.connection.prepare(
            "SELECT preset_id, name, recipe_json, created_at, updated_at
             FROM catalog_presets ORDER BY name ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(PresetEntry {
                preset_id: row.get(0)?,
                name: row.get(1)?,
                recipe_json: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        })?;
        rows.collect()
    }

    // ------------------------------------------------------------------
    // Workspace state
    // ------------------------------------------------------------------

    pub fn save_workspace_state(
        &self,
        workspace_id: &str,
        state_json: &str,
        updated_at: &str,
    ) -> rusqlite::Result<WorkspaceStateEntry> {
        self.connection.execute(
            "INSERT INTO catalog_workspace_state (workspace_id, state_json, updated_at)
             VALUES (?1, ?2, ?3)
             ON CONFLICT(workspace_id) DO UPDATE SET
               state_json = excluded.state_json,
               updated_at = excluded.updated_at",
            params![workspace_id, state_json, updated_at],
        )?;

        Ok(WorkspaceStateEntry {
            workspace_id: workspace_id.to_string(),
            state_json: state_json.to_string(),
            updated_at: updated_at.to_string(),
        })
    }

    pub fn get_workspace_state(&self, workspace_id: &str) -> rusqlite::Result<Option<WorkspaceStateEntry>> {
        let result = self
            .connection
            .query_row(
                "SELECT workspace_id, state_json, updated_at
                 FROM catalog_workspace_state WHERE workspace_id = ?1",
                [workspace_id],
                |row| {
                    Ok(WorkspaceStateEntry {
                        workspace_id: row.get(0)?,
                        state_json: row.get(1)?,
                        updated_at: row.get(2)?,
                    })
                },
            )
            .optional()?;
        Ok(result)
    }

    // ------------------------------------------------------------------
    // Batch sync
    // ------------------------------------------------------------------

    /// Copy selected operation types from a source image's recipe to all
    /// other images in the library.  Operations of the selected types are
    /// replaced; all other operations are preserved.
    pub fn batch_sync_operations(
        &self,
        source_image_id: &str,
        operation_types: &[String],
        updated_at: &str,
    ) -> rusqlite::Result<BatchSyncResult> {
        // --- Resolve source recipe ---
        let source_entry = self
            .get_recipe(source_image_id)?
            .ok_or_else(|| rusqlite::Error::QueryReturnedNoRows)?;

        // Extract source operations whose type is in the selection.
        let source_ops: Vec<Value> = source_entry
            .recipe
            .operations()
            .iter()
            .filter(|op| {
                op.get("type")
                    .and_then(Value::as_str)
                    .map(|t| operation_types.iter().any(|ot| ot == t))
                    .unwrap_or(false)
            })
            .cloned()
            .collect();

        if source_ops.is_empty() {
            return Ok(BatchSyncResult {
                updated_count: 0,
                skipped_count: 0,
                message: "No matching operations found in source recipe".to_string(),
            });
        }

        // --- Iterate all images ---
        let images = self.list_imported_images()?;
        let mut updated = 0u32;
        let mut skipped = 0u32;

        for image in &images {
            if image.image_id == source_image_id {
                skipped += 1;
                continue;
            }

            // Load existing target recipe (or start fresh).
            let target_recipe = self
                .get_recipe(&image.image_id)?
                .map(|e| e.recipe)
                .unwrap_or_default();

            // Merge: remove ops of selected types, then append source ops.
            let mut target_value = target_recipe.to_value();
            if let Some(obj) = target_value.as_object_mut() {
                if let Some(Value::Array(ops)) = obj.get_mut("operations") {
                    ops.retain(|op| {
                        op.get("type")
                            .and_then(Value::as_str)
                            .map(|t| !operation_types.iter().any(|ot| ot == t))
                            .unwrap_or(true)
                    });
                    for op in &source_ops {
                        ops.push(op.clone());
                    }
                }
            }

            let merged = Recipe::from_value(target_value)
                .map_err(|e| rusqlite::Error::ToSqlConversionFailure(Box::new(e)))?;
            self.save_recipe(&image.image_id, &merged, updated_at)?;
            updated += 1;
        }

        Ok(BatchSyncResult {
            updated_count: updated,
            skipped_count: skipped,
            message: format!(
                "Synced {} operation type(s) to {} image(s)",
                operation_types.len(),
                updated
            ),
        })
    }

    // ------------------------------------------------------------------
    // Culling metadata
    // ------------------------------------------------------------------

    /// Upsert culling metadata for an image. Any field set to `Some` is
    /// updated; `None` fields are left unchanged.
    pub fn set_culling_metadata(
        &self,
        image_id: &str,
        rating: Option<i32>,
        flagged: Option<bool>,
        rejected: Option<bool>,
        color_label: Option<Option<&str>>, // outer None = no change, inner None = clear
        updated_at: &str,
    ) -> rusqlite::Result<CullingMetadata> {
        // Ensure the image exists in catalog_images
        self.connection.execute(
            "INSERT INTO catalog_images (image_id, source_path, imported_at, updated_at)
             VALUES (?1, NULL, ?2, ?2)
             ON CONFLICT(image_id) DO UPDATE SET updated_at = excluded.updated_at",
            params![image_id, updated_at],
        )?;

        // Check if culling row exists
        let existing: Option<()> = self
            .connection
            .query_row(
                "SELECT 1 FROM library_culling_metadata WHERE image_id = ?1",
                [image_id],
                |_| Ok(()),
            )
            .optional()?;

        if existing.is_none() {
            // Insert with defaults, then we'll update specific fields
            self.connection.execute(
                "INSERT INTO library_culling_metadata (image_id, rating, flagged, rejected, color_label, updated_at)
                 VALUES (?1, 0, 0, 0, NULL, ?2)",
                params![image_id, updated_at],
            )?;
        }

        // Build dynamic UPDATE for only the fields that changed
        let mut sets: Vec<String> = Vec::new();
        let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(image_id.to_string())];
        let mut idx = 2usize; // ?1 is image_id

        if let Some(r) = rating {
            sets.push(format!("rating = ?{}", idx));
            params_vec.push(Box::new(r));
            idx += 1;
        }
        if let Some(f) = flagged {
            sets.push(format!("flagged = ?{}", idx));
            params_vec.push(Box::new(f as i32));
            idx += 1;
        }
        if let Some(r) = rejected {
            sets.push(format!("rejected = ?{}", idx));
            params_vec.push(Box::new(r as i32));
            idx += 1;
        }
        if let Some(cl) = color_label {
            sets.push(format!("color_label = ?{}", idx));
            params_vec.push(Box::new(cl.map(|s| s.to_string())));
            idx += 1;
        }

        sets.push(format!("updated_at = ?{}", idx));
        params_vec.push(Box::new(updated_at.to_string()));

        if !sets.is_empty() {
            let sql = format!(
                "UPDATE library_culling_metadata SET {} WHERE image_id = ?1",
                sets.join(", ")
            );
            let param_refs: Vec<&dyn rusqlite::ToSql> =
                params_vec.iter().map(|p| p.as_ref()).collect();
            self.connection.execute(&sql, param_refs.as_slice())?;
        }

        // Return the full metadata
        self.get_culling_metadata(image_id)?
            .ok_or_else(|| {
                rusqlite::Error::QueryReturnedNoRows
            })
    }

    pub fn get_culling_metadata(&self, image_id: &str) -> rusqlite::Result<Option<CullingMetadata>> {
        self.connection
            .query_row(
                "SELECT image_id, rating, flagged, rejected, color_label, updated_at
                 FROM library_culling_metadata WHERE image_id = ?1",
                [image_id],
                |row| {
                    Ok(CullingMetadata {
                        image_id: row.get(0)?,
                        rating: row.get(1)?,
                        flagged: row.get::<_, i32>(2)? != 0,
                        rejected: row.get::<_, i32>(3)? != 0,
                        color_label: row.get(4)?,
                        updated_at: row.get(5)?,
                    })
                },
            )
            .optional()
            .map(|opt| opt)
    }

    /// List culling metadata for all images that have entries.
    pub fn list_culling_metadata(&self) -> rusqlite::Result<Vec<CullingMetadata>> {
        let mut stmt = self.connection.prepare(
            "SELECT image_id, rating, flagged, rejected, color_label, updated_at
             FROM library_culling_metadata ORDER BY image_id ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(CullingMetadata {
                image_id: row.get(0)?,
                rating: row.get(1)?,
                flagged: row.get::<_, i32>(2)? != 0,
                rejected: row.get::<_, i32>(3)? != 0,
                color_label: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use serde_json::Value;

    use crate::core::Recipe;
    use super::ImportedImageRow;

    use super::SqliteCatalogStore;

    fn temp_db_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("photogenic-catalog-{nanos}.sqlite"))
    }

    #[test]
    fn sqlite_catalog_initializes_empty_database_with_durable_tables() {
        let path = temp_db_path();
        let store = SqliteCatalogStore::open(&path).unwrap();

        assert_eq!(store.schema_version().unwrap(), 1);
        assert_eq!(
            store.table_names().unwrap(),
            vec![
                "catalog_images",
                "catalog_imports",
                "catalog_presets",
                "catalog_recipes",
                "catalog_sidecar_links",
                "catalog_workspace_state",
                "library_culling_metadata",
            ]
        );

        fs::remove_file(path).ok();
    }

    #[test]
    fn sqlite_catalog_recipe_save_survives_process_restart() {
        let path = temp_db_path();
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"exposure","params":{"ev":0.5}}]}"#,
        )
        .unwrap();
        let expected_fingerprint = recipe.fingerprint();

        {
            let store = SqliteCatalogStore::open(&path).unwrap();
            let saved = store
                .save_recipe("img-001", &recipe, "2026-07-09T05:40:00.000Z")
                .unwrap();
            assert_eq!(saved.image_id, "img-001");
            assert_eq!(saved.revision, 1);
            assert_eq!(saved.recipe_fingerprint, expected_fingerprint);
        }

        let reopened = SqliteCatalogStore::open(&path).unwrap();
        let loaded = reopened.get_recipe("img-001").unwrap().unwrap();
        assert_eq!(loaded.image_id, "img-001");
        assert_eq!(loaded.revision, 1);
        assert_eq!(loaded.recipe.fingerprint(), expected_fingerprint);
        assert_eq!(loaded.recipe.operation_types(), vec!["exposure"]);

        fs::remove_file(path).ok();
    }

    #[test]
    fn preset_save_and_load_survives_restart() {
        let path = temp_db_path();
        let recipe_json = r#"{"version":1,"operations":[{"type":"exposure","params":{"ev":0.5}}]}"#;

        {
            let store = SqliteCatalogStore::open(&path).unwrap();
            let entry = store
                .save_preset("preset-001", "Warm Sunset", recipe_json, "2025-07-01T00:00:00Z")
                .unwrap();
            assert_eq!(entry.preset_id, "preset-001");
            assert_eq!(entry.name, "Warm Sunset");
        }

        let reopened = SqliteCatalogStore::open(&path).unwrap();
        let loaded = reopened.get_preset("preset-001").unwrap().unwrap();
        assert_eq!(loaded.name, "Warm Sunset");
        assert_eq!(loaded.recipe_json, recipe_json);

        let all = reopened.list_presets().unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].preset_id, "preset-001");

        fs::remove_file(path).ok();
    }

    #[test]
    fn preset_update_preserves_created_at() {
        let path = temp_db_path();
        let store = SqliteCatalogStore::open(&path).unwrap();

        store
            .save_preset("p1", "Original", "{}", "2025-01-01T00:00:00Z")
            .unwrap();
        store
            .save_preset("p1", "Updated", "{\"version\":1}", "2025-06-01T00:00:00Z")
            .unwrap();

        let loaded = store.get_preset("p1").unwrap().unwrap();
        assert_eq!(loaded.name, "Updated");
        assert_eq!(loaded.created_at, "2025-01-01T00:00:00Z");
        assert_eq!(loaded.updated_at, "2025-06-01T00:00:00Z");

        fs::remove_file(path).ok();
    }

    #[test]
    fn workspace_state_save_and_load_survives_restart() {
        let path = temp_db_path();
        let state_json = r#"{"selectedImageId":"img-001","activeFilter":"all"}"#;

        {
            let store = SqliteCatalogStore::open(&path).unwrap();
            store
                .save_workspace_state("default", state_json, "2025-07-01T00:00:00Z")
                .unwrap();
        }

        let reopened = SqliteCatalogStore::open(&path).unwrap();
        let loaded = reopened.get_workspace_state("default").unwrap().unwrap();
        assert_eq!(loaded.workspace_id, "default");
        assert_eq!(loaded.state_json, state_json);

        // Non-existent workspace returns None
        assert!(reopened.get_workspace_state("nonexistent").unwrap().is_none());

        fs::remove_file(path).ok();
    }

    #[test]
    fn batch_sync_replaces_selected_operation_types() {
        let path = temp_db_path();
        let store = SqliteCatalogStore::open(&path).unwrap();
        let ts = "2025-07-01T00:00:00Z";

        // Source image with exposure + temperature + contrast
        let source_recipe = Recipe::from_value(serde_json::json!({
            "version": 1,
            "operations": [
                {"type":"exposure","params":{"ev":0.5}},
                {"type":"temperature","params":{"kelvinDelta":2000}},
                {"type":"contrast","params":{"amount":15}}
            ]
        })).unwrap();
        store.save_recipe("source", &source_recipe, ts).unwrap();
        store.upsert_imported_image(
            &ImportedImageRow { image_id: "source".to_string(), source_path: "/src/img1.raw".to_string(), file_name: "img1.raw".to_string(), observed_format: "raw".to_string(), byte_size: None, modified_at: None },
            ts,
        ).unwrap();

        // Target image with its own exposure + sharpen
        let target_recipe = Recipe::from_value(serde_json::json!({
            "version": 1,
            "operations": [
                {"type":"exposure","params":{"ev":-1.0}},
                {"type":"sharpen","params":{"amount":50}}
            ]
        })).unwrap();
        store.save_recipe("target", &target_recipe, ts).unwrap();
        store.upsert_imported_image(
            &ImportedImageRow { image_id: "target".to_string(), source_path: "/src/img2.raw".to_string(), file_name: "img2.raw".to_string(), observed_format: "raw".to_string(), byte_size: None, modified_at: None },
            ts,
        ).unwrap();

        // Sync exposure + temperature (NOT contrast, NOT sharpen)
        let result = store
            .batch_sync_operations("source", &["exposure".to_string(), "temperature".to_string()], ts)
            .unwrap();

        assert_eq!(result.updated_count, 1);
        assert_eq!(result.skipped_count, 1);

        // Verify target now has source's exposure+temperature and keeps its sharpen
        let updated = store.get_recipe("target").unwrap().unwrap();
        let types = updated.recipe.operation_types();
        assert!(types.contains(&"exposure"), "should have exposure from source");
        assert!(types.contains(&"temperature"), "should have temperature from source");
        assert!(types.contains(&"sharpen"), "should keep original sharpen");
        assert!(!types.contains(&"contrast"), "should NOT have contrast (not synced)");

        // Verify the exposure value was replaced (source's 0.5, not target's -1.0)
        let exposure_op = updated.recipe.operations()
            .iter()
            .find(|op| op.get("type").and_then(Value::as_str) == Some("exposure"))
            .unwrap();
        assert_eq!(
            exposure_op.get("params").and_then(|p| p.get("ev")).and_then(Value::as_f64),
            Some(0.5)
        );

        fs::remove_file(path).ok();
    }

    #[test]
    fn batch_sync_no_matching_operations_is_noop() {
        let path = temp_db_path();
        let store = SqliteCatalogStore::open(&path).unwrap();
        let ts = "2025-07-01T00:00:00Z";

        let source_recipe = Recipe::from_value(serde_json::json!({
            "version": 1,
            "operations": [{"type":"contrast","params":{"amount":10}}]
        })).unwrap();
        store.save_recipe("source", &source_recipe, ts).unwrap();
        store.upsert_imported_image(
            &ImportedImageRow { image_id: "source".to_string(), source_path: "/src/img1.raw".to_string(), file_name: "img1.raw".to_string(), observed_format: "raw".to_string(), byte_size: None, modified_at: None },
            ts,
        ).unwrap();

        let result = store
            .batch_sync_operations("source", &["exposure".to_string()], ts)
            .unwrap();

        assert_eq!(result.updated_count, 0);
        assert!(result.message.contains("No matching"));

        fs::remove_file(path).ok();
    }

    #[test]
    fn culling_metadata_partial_updates_and_persists() {
        let path = temp_db_path();
        let store = SqliteCatalogStore::open(&path).unwrap();
        let ts = "2025-07-01T00:00:00Z";

        // Set rating only
        let r1 = store.set_culling_metadata("img-a", Some(3), None, None, None, ts).unwrap();
        assert_eq!(r1.rating, 3);
        assert!(!r1.flagged);
        assert!(!r1.rejected);
        assert_eq!(r1.color_label, None);

        // Set flagged only — rating should persist
        let r2 = store.set_culling_metadata("img-a", None, Some(true), None, None, ts).unwrap();
        assert_eq!(r2.rating, 3);
        assert!(r2.flagged);

        // Set color label
        let r3 = store.set_culling_metadata("img-a", None, None, None, Some(Some("red")), ts).unwrap();
        assert_eq!(r3.color_label.as_deref(), Some("red"));
        assert_eq!(r3.rating, 3);
        assert!(r2.flagged);

        // Reject
        let r4 = store.set_culling_metadata("img-a", None, None, Some(true), None, ts).unwrap();
        assert!(r4.rejected);

        // Clear color label
        let r5 = store.set_culling_metadata("img-a", None, None, None, Some(None), ts).unwrap();
        assert_eq!(r5.color_label, None);

        // Survives restart
        let reopened = SqliteCatalogStore::open(&path).unwrap();
        let loaded = reopened.get_culling_metadata("img-a").unwrap().unwrap();
        assert_eq!(loaded.rating, 3);
        assert!(loaded.flagged);
        assert!(loaded.rejected);
        assert_eq!(loaded.color_label, None);

        // Non-existent image returns None
        assert!(reopened.get_culling_metadata("nope").unwrap().is_none());

        // List returns all entries
        store.set_culling_metadata("img-b", Some(5), Some(true), None, Some(Some("blue")), ts).unwrap();
        let all = reopened.list_culling_metadata().unwrap();
        assert_eq!(all.len(), 2);

        fs::remove_file(path).ok();
    }
}
