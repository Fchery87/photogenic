use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use rusqlite::{params, Connection, OptionalExtension};

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

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ImportedImageRow {
    pub image_id: String,
    pub source_path: String,
    pub file_name: String,
    pub observed_format: String,
    pub byte_size: Option<i64>,
    pub modified_at: Option<String>,
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
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::core::Recipe;

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
        let recipe = Recipe::from_operation_names(vec!["exposure"]);
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
}
