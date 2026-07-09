use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use super::store::{ImportedImageRow, SqliteCatalogStore};

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSourcesRequest {
    pub database_path: String,
    pub source_paths: Vec<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSourceEntry {
    pub image_id: String,
    pub source_path: String,
    pub file_name: String,
    pub observed_format: String,
    pub byte_size: Option<i64>,
    pub modified_at: Option<String>,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedImportSource {
    pub source_path: String,
    pub reason: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSourcesResult {
    pub imported: Vec<ImportSourceEntry>,
    pub skipped: Vec<SkippedImportSource>,
}

#[tauri::command]
pub fn import_sources(request: ImportSourcesRequest) -> Result<ImportSourcesResult, String> {
    if request.database_path.is_empty() {
        return Err("database path is required".to_string());
    }
    let store =
        SqliteCatalogStore::open(&request.database_path).map_err(|error| error.to_string())?;
    let mut imported = Vec::new();
    let mut skipped = Vec::new();

    for source_path in request.source_paths {
        let Some(observed_format) = classify_source_path(&source_path) else {
            skipped.push(SkippedImportSource {
                source_path,
                reason: "unsupported-format".to_string(),
            });
            continue;
        };
        let row = imported_image_row(&source_path, observed_format)?;
        let saved = store
            .upsert_imported_image(&row, "1970-01-01T00:00:00.000Z")
            .map_err(|error| error.to_string())?;
        imported.push(ImportSourceEntry {
            image_id: saved.image_id,
            source_path: saved.source_path,
            file_name: saved.file_name,
            observed_format: saved.observed_format,
            byte_size: saved.byte_size,
            modified_at: saved.modified_at,
        });
    }

    Ok(ImportSourcesResult { imported, skipped })
}

fn imported_image_row(
    source_path: &str,
    observed_format: &str,
) -> Result<ImportedImageRow, String> {
    let path = PathBuf::from(source_path);
    let metadata = fs::metadata(&path).ok();
    Ok(ImportedImageRow {
        image_id: stable_image_id(source_path),
        source_path: source_path.to_string(),
        file_name: path
            .file_name()
            .and_then(|file_name| file_name.to_str())
            .unwrap_or(source_path)
            .to_string(),
        observed_format: observed_format.to_string(),
        byte_size: metadata.as_ref().map(|metadata| metadata.len() as i64),
        modified_at: metadata
            .and_then(|metadata| metadata.modified().ok())
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|duration| format!("{}.{:03}Z", duration.as_secs(), duration.subsec_millis())),
    })
}

fn classify_source_path(source_path: &str) -> Option<&'static str> {
    let extension = Path::new(source_path)
        .extension()
        .and_then(|extension| extension.to_str())?
        .to_ascii_lowercase();
    match extension.as_str() {
        "cr2" | "cr3" | "nef" | "arw" | "dng" | "raf" => Some("raw"),
        "jpg" | "jpeg" => Some("jpeg"),
        "png" => Some("png"),
        "tif" | "tiff" => Some("tiff"),
        _ => None,
    }
}

fn stable_image_id(source_path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    source_path.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::{import_sources, ImportSourcesRequest};
    use crate::catalog::store::SqliteCatalogStore;

    fn temp_dir_path() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("photogenic-import-{nanos}"))
    }

    #[test]
    fn import_sources_writes_durable_rows_for_supported_sources() {
        let dir = temp_dir_path();
        fs::create_dir_all(&dir).unwrap();
        let raw_path = dir.join("frame.CR3");
        let jpeg_path = dir.join("frame.JPG");
        let png_path = dir.join("frame.PNG");
        let tiff_path = dir.join("frame.TIF");
        let text_path = dir.join("notes.txt");
        fs::write(&raw_path, b"raw").unwrap();
        fs::write(&jpeg_path, b"\xff\xd8\xff\xd9").unwrap();
        fs::write(&png_path, b"\x89PNG\r\n\x1a\n").unwrap();
        fs::write(&tiff_path, b"II*\0").unwrap();
        fs::write(&text_path, b"notes").unwrap();
        let db_path = dir.join("catalog.sqlite");

        let result = import_sources(ImportSourcesRequest {
            database_path: db_path.to_string_lossy().into_owned(),
            source_paths: vec![
                raw_path.to_string_lossy().into_owned(),
                jpeg_path.to_string_lossy().into_owned(),
                png_path.to_string_lossy().into_owned(),
                tiff_path.to_string_lossy().into_owned(),
                text_path.to_string_lossy().into_owned(),
            ],
        })
        .unwrap();

        assert_eq!(result.imported.len(), 4);
        assert_eq!(result.skipped.len(), 1);
        assert_eq!(
            result
                .imported
                .iter()
                .map(|entry| entry.observed_format.as_str())
                .collect::<Vec<_>>(),
            vec!["raw", "jpeg", "png", "tiff"]
        );

        let reopened = SqliteCatalogStore::open(&db_path).unwrap();
        assert_eq!(reopened.list_imported_images().unwrap().len(), 4);

        fs::remove_dir_all(dir).ok();
    }

    #[test]
    fn refresh_imported_source_metadata_updates_byte_size_and_modified_time() {
        let dir = temp_dir_path();
        fs::create_dir_all(&dir).unwrap();
        let raw_path = dir.join("refresh.CR3");
        fs::write(&raw_path, b"raw").unwrap();
        let db_path = dir.join("catalog.sqlite");
        let result = import_sources(ImportSourcesRequest {
            database_path: db_path.to_string_lossy().into_owned(),
            source_paths: vec![raw_path.to_string_lossy().into_owned()],
        })
        .unwrap();
        let image_id = result.imported[0].image_id.clone();
        let before = result.imported[0].modified_at.clone();

        std::thread::sleep(std::time::Duration::from_millis(5));
        fs::write(&raw_path, b"raw-bytes-expanded").unwrap();

        let reopened = SqliteCatalogStore::open(&db_path).unwrap();
        let refreshed = reopened.refresh_imported_image_metadata(&image_id).unwrap();
        assert_eq!(refreshed.byte_size, Some(18));
        assert_ne!(refreshed.modified_at, before);

        fs::remove_dir_all(dir).ok();
    }
}
