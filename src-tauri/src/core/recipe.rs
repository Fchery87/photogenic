use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::error::Error;
use std::fmt;

pub const RECIPE_SCHEMA_VERSION: u32 = 1;

const ALLOWED_OPERATION_TYPES: &[&str] = &[
    "exposure",
    "contrast",
    "highlights",
    "shadows",
    "temperature",
    "tint",
    "crop",
    "straighten",
    "mask",
];

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Recipe {
    version: u32,
    operations: Vec<Value>,
    meta: Map<String, Value>,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RecipeErrorKind {
    InvalidJson,
    InvalidShape,
    UnsupportedVersion,
    InvalidOperations,
    UnsupportedOperation,
    InvalidParams,
    InvalidNumber,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecipeError {
    kind: RecipeErrorKind,
    message: String,
}

impl Default for Recipe {
    fn default() -> Self {
        Self {
            version: RECIPE_SCHEMA_VERSION,
            operations: Vec::new(),
            meta: Map::new(),
        }
    }
}

impl RecipeError {
    fn new(kind: RecipeErrorKind, message: impl Into<String>) -> Self {
        Self {
            kind,
            message: message.into(),
        }
    }

    pub fn kind(&self) -> RecipeErrorKind {
        self.kind
    }
}

impl fmt::Display for RecipeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl Error for RecipeError {}

impl Recipe {
    #[cfg(test)]
    pub fn from_operation_names(operations: Vec<&str>) -> Self {
        Self {
            version: RECIPE_SCHEMA_VERSION,
            operations: operations
                .into_iter()
                .map(|operation_type| {
                    let mut operation = Map::new();
                    operation.insert(
                        "type".to_string(),
                        Value::String(operation_type.to_string()),
                    );
                    operation.insert("params".to_string(), Value::Object(Map::new()));
                    Value::Object(operation)
                })
                .collect(),
            meta: Map::new(),
        }
    }

    pub fn from_json_str(json: &str) -> Result<Self, RecipeError> {
        let value: Value = serde_json::from_str(json).map_err(|error| {
            RecipeError::new(
                RecipeErrorKind::InvalidJson,
                format!("invalid recipe JSON: {error}"),
            )
        })?;
        Self::from_value(value)
    }

    pub fn from_value(value: Value) -> Result<Self, RecipeError> {
        let object = value.as_object().ok_or_else(|| {
            RecipeError::new(RecipeErrorKind::InvalidShape, "recipe must be an object")
        })?;

        let version = match object.get("version") {
            None | Some(Value::Null) => u64::from(RECIPE_SCHEMA_VERSION),
            Some(Value::Number(number)) => recipe_version_number(number)?,
            Some(_) => {
                return Err(RecipeError::new(
                    RecipeErrorKind::UnsupportedVersion,
                    "recipe version must be a number",
                ))
            }
        };

        if version != u64::from(RECIPE_SCHEMA_VERSION) {
            return Err(RecipeError::new(
                RecipeErrorKind::UnsupportedVersion,
                format!("unsupported recipe version: {version}"),
            ));
        }

        let operations = match object.get("operations") {
            Some(Value::Array(operations)) => operations.clone(),
            Some(_) => {
                return Err(RecipeError::new(
                    RecipeErrorKind::InvalidOperations,
                    "recipe.operations must be an array",
                ))
            }
            None => Vec::new(),
        };

        for (index, operation) in operations.iter().enumerate() {
            validate_operation(operation, index)?;
            validate_js_safe_numbers(operation, &format!("recipe.operations[{index}]"))?;
        }

        let meta = match object.get("meta") {
            Some(Value::Object(meta)) => meta.clone(),
            Some(_) | None => Map::new(),
        };
        validate_js_safe_numbers(&Value::Object(meta.clone()), "recipe.meta")?;

        Ok(Self {
            version: RECIPE_SCHEMA_VERSION,
            operations,
            meta,
        })
    }

    pub fn version(&self) -> u32 {
        self.version
    }

    pub fn operations(&self) -> &[Value] {
        &self.operations
    }

    pub fn operation_types(&self) -> Vec<&str> {
        self.operations
            .iter()
            .filter_map(|operation| operation.get("type").and_then(Value::as_str))
            .collect()
    }

    pub fn fingerprint(&self) -> String {
        let canonical = canonical_recipe_value(self);
        let serialized = stringify_like_json_stringify(&canonical);
        let mut hasher = Sha256::new();
        hasher.update(serialized.as_bytes());
        format!("{:x}", hasher.finalize())
    }
}

fn validate_operation(operation: &Value, index: usize) -> Result<(), RecipeError> {
    let object = operation.as_object().ok_or_else(|| {
        RecipeError::new(
            RecipeErrorKind::InvalidOperations,
            format!("operation {index} must be an object"),
        )
    })?;

    let operation_type = object.get("type").and_then(Value::as_str).ok_or_else(|| {
        RecipeError::new(
            RecipeErrorKind::UnsupportedOperation,
            format!("operation {index} has unsupported type"),
        )
    })?;

    if !ALLOWED_OPERATION_TYPES.contains(&operation_type) {
        return Err(RecipeError::new(
            RecipeErrorKind::UnsupportedOperation,
            format!("operation {index} has unsupported type: {operation_type}"),
        ));
    }

    if !matches!(object.get("params"), Some(Value::Object(_))) {
        return Err(RecipeError::new(
            RecipeErrorKind::InvalidParams,
            format!("operation {index} params must be an object"),
        ));
    }

    Ok(())
}

fn recipe_version_number(number: &serde_json::Number) -> Result<u64, RecipeError> {
    if let Some(unsigned) = number.as_u64() {
        return Ok(unsigned);
    }
    if let Some(float) = number.as_f64() {
        if float.fract() == 0.0 && float >= 0.0 && float <= u64::MAX as f64 {
            return Ok(float as u64);
        }
    }
    Err(RecipeError::new(
        RecipeErrorKind::UnsupportedVersion,
        "recipe version must be a positive integer",
    ))
}

fn canonical_recipe_value(recipe: &Recipe) -> Value {
    let mut object = Map::new();
    object.insert(
        "version".to_string(),
        Value::Number(RECIPE_SCHEMA_VERSION.into()),
    );
    object.insert(
        "operations".to_string(),
        Value::Array(recipe.operations.iter().map(canonicalize).collect()),
    );
    object.insert(
        "meta".to_string(),
        canonicalize(&Value::Object(recipe.meta.clone())),
    );
    canonicalize(&Value::Object(object))
}

fn canonicalize(value: &Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.iter().map(canonicalize).collect()),
        Value::Object(object) => {
            let mut keys: Vec<_> = object.keys().collect();
            keys.sort();
            let mut sorted = Map::new();
            for key in keys {
                sorted.insert(key.clone(), canonicalize(&object[key]));
            }
            Value::Object(sorted)
        }
        _ => value.clone(),
    }
}

fn stringify_like_json_stringify(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(value) => value.to_string(),
        Value::Number(number) => stringify_number_like_json_stringify(number),
        Value::String(value) => {
            serde_json::to_string(value).expect("serializing a JSON string cannot fail")
        }
        Value::Array(values) => {
            let items: Vec<_> = values.iter().map(stringify_like_json_stringify).collect();
            format!("[{}]", items.join(","))
        }
        Value::Object(object) => {
            let mut keys: Vec<_> = object.keys().collect();
            keys.sort();
            let properties: Vec<_> = keys
                .into_iter()
                .map(|key| {
                    let serialized_key = serde_json::to_string(key)
                        .expect("serializing a JSON object key cannot fail");
                    format!(
                        "{serialized_key}:{}",
                        stringify_like_json_stringify(&object[key])
                    )
                })
                .collect();
            format!("{{{}}}", properties.join(","))
        }
    }
}

fn stringify_number_like_json_stringify(number: &serde_json::Number) -> String {
    if let Some(unsigned) = number.as_u64() {
        return unsigned.to_string();
    }
    if let Some(signed) = number.as_i64() {
        return signed.to_string();
    }

    let value = number
        .as_f64()
        .expect("serde_json numbers are representable as f64 when not integer-backed");
    if value == 0.0 {
        return "0".to_string();
    }

    let mut buffer = ryu_js::Buffer::new();
    buffer.format_finite(value).to_string()
}

fn validate_js_safe_numbers(value: &Value, path: &str) -> Result<(), RecipeError> {
    match value {
        Value::Number(number) => {
            if let Some(unsigned) = number.as_u64() {
                if unsigned > 9_007_199_254_740_991 {
                    return Err(RecipeError::new(
                        RecipeErrorKind::InvalidNumber,
                        format!("{path} contains an integer outside JavaScript's safe range"),
                    ));
                }
            } else if let Some(signed) = number.as_i64() {
                if signed < -9_007_199_254_740_991 || signed > 9_007_199_254_740_991 {
                    return Err(RecipeError::new(
                        RecipeErrorKind::InvalidNumber,
                        format!("{path} contains an integer outside JavaScript's safe range"),
                    ));
                }
            }
            Ok(())
        }
        Value::Array(values) => {
            for (index, item) in values.iter().enumerate() {
                validate_js_safe_numbers(item, &format!("{path}[{index}]"))?;
            }
            Ok(())
        }
        Value::Object(object) => {
            for (key, item) in object {
                validate_js_safe_numbers(item, &format!("{path}.{key}"))?;
            }
            Ok(())
        }
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::{Recipe, RecipeErrorKind, RECIPE_SCHEMA_VERSION};
    use std::fs;
    use std::path::PathBuf;

    fn fixture_path(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("test")
            .join("fixtures")
            .join("recipes")
            .join(name)
    }

    #[test]
    fn recipe_fingerprint_distinguishes_operation_boundaries() {
        let single_operation = Recipe::from_operation_names(vec!["a|b"]);
        let two_operations = Recipe::from_operation_names(vec!["a", "b"]);

        assert_ne!(single_operation.fingerprint(), two_operations.fingerprint());
    }

    #[test]
    fn parses_versioned_recipe_fixture_and_preserves_operation_order() {
        let json = fs::read_to_string(fixture_path("basic-exposure.json")).unwrap();
        let recipe = Recipe::from_json_str(&json).unwrap();

        assert_eq!(recipe.version(), 1);
        assert_eq!(recipe.operation_types(), vec!["exposure"]);
    }

    #[test]
    fn fingerprints_match_javascript_contract_for_basic_exposure_fixture() {
        let json = fs::read_to_string(fixture_path("basic-exposure.json")).unwrap();
        let recipe = Recipe::from_json_str(&json).unwrap();

        assert_eq!(
            recipe.fingerprint(),
            "fc72971e4992641d91c55f8f8e2de8d60986ebb84f09082af1b52b65bb70230d"
        );
    }

    #[test]
    fn fingerprints_match_javascript_contract_for_source_dependent_crop_fixture() {
        let json = fs::read_to_string(fixture_path("source-dependent-crop.json")).unwrap();
        let recipe = Recipe::from_json_str(&json).unwrap();

        assert_eq!(recipe.operation_types(), vec!["crop"]);
        assert_eq!(
            recipe.fingerprint(),
            "52ef41f57269dc9430c6ff5aa91506c869995a2af4cb91afb36c8796a33b36fa"
        );
    }

    #[test]
    fn null_recipe_version_defaults_to_schema_version_like_javascript() {
        let recipe = Recipe::from_json_str(r#"{"version":null,"operations":[]}"#).unwrap();

        assert_eq!(recipe.version(), RECIPE_SCHEMA_VERSION);
        assert_eq!(
            recipe.fingerprint(),
            "bafd6bd2c594c2f3f4253bb3061f137a573c2a470b39a4972c195fc69a82f17b"
        );
    }

    #[test]
    fn floating_integer_recipe_version_matches_javascript_number_behavior() {
        let recipe = Recipe::from_json_str(r#"{"version":1.0,"operations":[]}"#).unwrap();

        assert_eq!(recipe.version(), RECIPE_SCHEMA_VERSION);
        assert_eq!(
            recipe.fingerprint(),
            "bafd6bd2c594c2f3f4253bb3061f137a573c2a470b39a4972c195fc69a82f17b"
        );
    }

    #[test]
    fn rejects_unsupported_recipe_version() {
        let error = Recipe::from_json_str(r#"{"version":2,"operations":[]}"#).unwrap_err();
        assert_eq!(error.kind(), RecipeErrorKind::UnsupportedVersion);
    }

    #[test]
    fn rejects_oversized_recipe_version_instead_of_truncating() {
        let error = Recipe::from_json_str(r#"{"version":4294967297,"operations":[]}"#).unwrap_err();

        assert_eq!(error.kind(), RecipeErrorKind::UnsupportedVersion);
    }

    #[test]
    fn rejects_numbers_outside_javascript_safe_integer_range() {
        let error = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"exposure","params":{"ev":9007199254740993}}]}"#,
        )
        .unwrap_err();

        assert_eq!(error.kind(), RecipeErrorKind::InvalidNumber);
    }

    #[test]
    fn fingerprint_matches_javascript_contract_for_negative_zero() {
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"exposure","params":{"ev":-0}}]}"#,
        )
        .unwrap();

        assert_eq!(
            recipe.fingerprint(),
            "de05a52ca4e99632272b767a7f3440983c27d370950c5aac9a85cd1419421eb0"
        );
    }

    #[test]
    fn fingerprint_matches_javascript_contract_for_micro_decimal() {
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"exposure","params":{"ev":0.000001}}]}"#,
        )
        .unwrap();

        assert_eq!(
            recipe.fingerprint(),
            "a65c478621fc71bdcb7f3731659cdda3fa51558af2b6975536e5ba37d2640d33"
        );
    }

    #[test]
    fn fingerprint_matches_javascript_contract_for_precise_decimal() {
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"exposure","params":{"ev":1.2345678901234567}}]}"#,
        )
        .unwrap();

        assert_eq!(
            recipe.fingerprint(),
            "8a766cbe7df44c04bb8b64ee9cdc1db9661744b0d5e90f3a61a30100e4368cbb"
        );
    }

    #[test]
    fn fingerprint_matches_javascript_contract_for_small_precise_decimal() {
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"exposure","params":{"ev":0.000001234567890123}}]}"#,
        )
        .unwrap();

        assert_eq!(
            recipe.fingerprint(),
            "db944e09e6f84db88248d75bcb6029e50c53d11aa5572815e61176609af0d951"
        );
    }

    #[test]
    fn rejects_missing_operation_params() {
        let error = Recipe::from_json_str(r#"{"version":1,"operations":[{"type":"exposure"}]}"#)
            .unwrap_err();

        assert_eq!(error.kind(), RecipeErrorKind::InvalidParams);
    }

    #[test]
    fn rejects_unsupported_operation_types() {
        let error =
            Recipe::from_json_str(r#"{"version":1,"operations":[{"type":"glow","params":{}}]}"#)
                .unwrap_err();

        assert_eq!(error.kind(), RecipeErrorKind::UnsupportedOperation);
    }

    #[test]
    fn rejects_non_json_recipe_input() {
        let error = Recipe::from_json_str("null").unwrap_err();
        assert_eq!(error.kind(), RecipeErrorKind::InvalidShape);
    }
}
