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
    "whites",
    "blacks",
    "toneCurve",
    "hsl",
    "sharpen",
    "noiseReduction",
    "temperature",
    "tint",
    "crop",
    "rotate",
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

    pub fn to_value(&self) -> Value {
        let mut object = Map::new();
        object.insert(
            "version".to_string(),
            Value::Number(serde_json::Number::from(self.version)),
        );
        object.insert(
            "operations".to_string(),
            Value::Array(self.operations.clone()),
        );
        object.insert("meta".to_string(), Value::Object(self.meta.clone()));
        Value::Object(object)
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

    validate_operation_params(operation_type, object.get("params").unwrap(), index)?;

    Ok(())
}

fn validate_operation_params(
    operation_type: &str,
    params: &Value,
    index: usize,
) -> Result<(), RecipeError> {
    let params = params.as_object().ok_or_else(|| {
        RecipeError::new(
            RecipeErrorKind::InvalidParams,
            format!("operation {index} params must be an object"),
        )
    })?;
    match operation_type {
        "exposure" => validate_required_number(params, "ev", index),
        "temperature" => validate_required_number(params, "kelvinDelta", index),
        "tint" => validate_required_number(params, "amount", index),
        "contrast" | "highlights" | "shadows" | "whites" | "blacks" | "sharpen"
        | "noiseReduction" => validate_required_number(params, "amount", index),
        "toneCurve" => validate_constrained_tone_curve(params, index),
        "hsl" => validate_red_hsl_adjustment(params, index),
        "crop" => validate_crop(params, index),
        "rotate" => validate_rotate(params, index),
        "straighten" => validate_required_number(params, "angle", index),
        _ => Ok(()),
    }
}

fn validate_crop(params: &Map<String, Value>, index: usize) -> Result<(), RecipeError> {
    let x = required_finite_number(params, "x", index)?;
    let y = required_finite_number(params, "y", index)?;
    let w = required_finite_number_alias(params, "w", "width", index)?;
    let h = required_finite_number_alias(params, "h", "height", index)?;
    if x >= 0.0 && y >= 0.0 && w > 0.0 && h > 0.0 && x + w <= 1.0 && y + h <= 1.0 {
        return Ok(());
    }
    Err(invalid_params(
        index,
        "crop params must be finite normalized x, y, w, and h",
    ))
}

fn validate_rotate(params: &Map<String, Value>, index: usize) -> Result<(), RecipeError> {
    let degrees = required_finite_number(params, "degrees", index)?;
    if [0.0, 90.0, 180.0, 270.0, -90.0, -180.0, -270.0].contains(&degrees) {
        return Ok(());
    }
    Err(invalid_params(
        index,
        "rotate degrees must be 0, 90, 180, or 270",
    ))
}

fn validate_red_hsl_adjustment(
    params: &Map<String, Value>,
    index: usize,
) -> Result<(), RecipeError> {
    if params.get("range").and_then(Value::as_str) != Some("red") {
        return Err(invalid_hsl(index));
    }
    for field in ["hue", "saturation", "luminance"] {
        match params.get(field).and_then(Value::as_f64) {
            Some(value) if value.is_finite() => {}
            _ => return Err(invalid_hsl(index)),
        }
    }
    Ok(())
}

fn invalid_hsl(index: usize) -> RecipeError {
    RecipeError::new(
        RecipeErrorKind::InvalidParams,
        format!(
            "operation {index} hsl params must target red with finite hue, saturation, and luminance"
        ),
    )
}

fn validate_constrained_tone_curve(
    params: &Map<String, Value>,
    index: usize,
) -> Result<(), RecipeError> {
    let Some(Value::Array(points)) = params.get("points") else {
        return Err(invalid_tone_curve(index));
    };
    if points.len() != 3 {
        return Err(invalid_tone_curve(index));
    }
    let parsed: Option<Vec<(f64, f64)>> = points
        .iter()
        .map(|point| {
            let values = point.as_array()?;
            if values.len() != 2 {
                return None;
            }
            let x = values[0].as_f64()?;
            let y = values[1].as_f64()?;
            if !x.is_finite() || !y.is_finite() {
                return None;
            }
            Some((x, y))
        })
        .collect();
    let Some(parsed) = parsed else {
        return Err(invalid_tone_curve(index));
    };
    if parsed[0] != (0.0, 0.0) || parsed[1].0 != 0.5 || parsed[2] != (1.0, 1.0) {
        return Err(invalid_tone_curve(index));
    }
    Ok(())
}

fn invalid_tone_curve(index: usize) -> RecipeError {
    RecipeError::new(
        RecipeErrorKind::InvalidParams,
        format!("operation {index} tone curve points must be [[0,0],[0.5,y],[1,1]]"),
    )
}

fn required_finite_number(
    params: &Map<String, Value>,
    field: &str,
    index: usize,
) -> Result<f64, RecipeError> {
    match params.get(field).and_then(Value::as_f64) {
        Some(value) if value.is_finite() => Ok(value),
        _ => Err(RecipeError::new(
            RecipeErrorKind::InvalidParams,
            format!("operation {index} params.{field} must be a finite number"),
        )),
    }
}

fn required_finite_number_alias(
    params: &Map<String, Value>,
    primary: &str,
    alias: &str,
    index: usize,
) -> Result<f64, RecipeError> {
    if params.contains_key(primary) {
        return required_finite_number(params, primary, index);
    }
    required_finite_number(params, alias, index)
}

fn invalid_params(index: usize, message: &str) -> RecipeError {
    RecipeError::new(
        RecipeErrorKind::InvalidParams,
        format!("operation {index} {message}"),
    )
}

fn validate_required_number(
    params: &Map<String, Value>,
    field: &str,
    index: usize,
) -> Result<(), RecipeError> {
    required_finite_number(params, field, index).map(|_| ())
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
    fn validates_white_balance_temperature_and_tint_params() {
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"temperature","params":{"kelvinDelta":450}},{"type":"tint","params":{"amount":-12}}]}"#,
        )
        .unwrap();

        assert_eq!(recipe.operation_types(), vec!["temperature", "tint"]);
    }

    #[test]
    fn rejects_malformed_white_balance_params() {
        let temperature = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"temperature","params":{"kelvinDelta":"warm"}}]}"#,
        )
        .unwrap_err();
        let tint = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"tint","params":{"amount":null}}]}"#,
        )
        .unwrap_err();

        assert_eq!(temperature.kind(), RecipeErrorKind::InvalidParams);
        assert_eq!(tint.kind(), RecipeErrorKind::InvalidParams);
    }

    #[test]
    fn validates_exposure_params() {
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"exposure","params":{"ev":0.75}}]}"#,
        )
        .unwrap();

        assert_eq!(recipe.operation_types(), vec!["exposure"]);
    }

    #[test]
    fn rejects_malformed_exposure_params() {
        let non_numeric = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"exposure","params":{"ev":"bright"}}]}"#,
        )
        .unwrap_err();
        let missing = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"exposure","params":{}}]}"#,
        )
        .unwrap_err();

        assert_eq!(non_numeric.kind(), RecipeErrorKind::InvalidParams);
        assert_eq!(missing.kind(), RecipeErrorKind::InvalidParams);
    }

    #[test]
    fn validates_contrast_params() {
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"contrast","params":{"amount":25}}]}"#,
        )
        .unwrap();

        assert_eq!(recipe.operation_types(), vec!["contrast"]);
    }

    #[test]
    fn rejects_malformed_contrast_params() {
        let error = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"contrast","params":{"amount":"punchy"}}]}"#,
        )
        .unwrap_err();

        assert_eq!(error.kind(), RecipeErrorKind::InvalidParams);
    }

    #[test]
    fn validates_tone_range_params() {
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"highlights","params":{"amount":-10}},{"type":"shadows","params":{"amount":20}},{"type":"whites","params":{"amount":10}},{"type":"blacks","params":{"amount":-20}}]}"#,
        )
        .unwrap();

        assert_eq!(
            recipe.operation_types(),
            vec!["highlights", "shadows", "whites", "blacks"]
        );
    }

    #[test]
    fn rejects_malformed_tone_range_params() {
        for operation_type in ["highlights", "shadows", "whites", "blacks"] {
            let error = Recipe::from_json_str(&format!(
                r#"{{"version":1,"operations":[{{"type":"{operation_type}","params":{{"amount":"bad"}}}}]}}"#
            ))
            .unwrap_err();

            assert_eq!(error.kind(), RecipeErrorKind::InvalidParams);
        }
    }

    #[test]
    fn validates_constrained_rgb_tone_curve_params() {
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"toneCurve","params":{"points":[[0,0],[0.5,0.6],[1,1]]}}]}"#,
        )
        .unwrap();

        assert_eq!(recipe.operation_types(), vec!["toneCurve"]);
    }

    #[test]
    fn rejects_malformed_tone_curve_params() {
        let unsorted = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"toneCurve","params":{"points":[[0,0],[0.4,0.6],[1,1]]}}]}"#,
        )
        .unwrap_err();
        let non_numeric = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"toneCurve","params":{"points":[[0,0],[0.5,"lift"],[1,1]]}}]}"#,
        )
        .unwrap_err();

        assert_eq!(unsorted.kind(), RecipeErrorKind::InvalidParams);
        assert_eq!(non_numeric.kind(), RecipeErrorKind::InvalidParams);
    }

    #[test]
    fn validates_red_hsl_params() {
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"hsl","params":{"range":"red","hue":30,"saturation":20,"luminance":-10}}]}"#,
        )
        .unwrap();

        assert_eq!(recipe.operation_types(), vec!["hsl"]);
    }

    #[test]
    fn rejects_malformed_hsl_params() {
        let unsupported_range = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"hsl","params":{"range":"blue","hue":0,"saturation":0,"luminance":0}}]}"#,
        )
        .unwrap_err();
        let non_numeric = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"hsl","params":{"range":"red","hue":"warm","saturation":0,"luminance":0}}]}"#,
        )
        .unwrap_err();

        assert_eq!(unsupported_range.kind(), RecipeErrorKind::InvalidParams);
        assert_eq!(non_numeric.kind(), RecipeErrorKind::InvalidParams);
    }

    #[test]
    fn validates_sharpen_params() {
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"sharpen","params":{"amount":20}}]}"#,
        )
        .unwrap();

        assert_eq!(recipe.operation_types(), vec!["sharpen"]);
    }

    #[test]
    fn rejects_malformed_sharpen_params() {
        let error = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"sharpen","params":{"amount":"crisp"}}]}"#,
        )
        .unwrap_err();

        assert_eq!(error.kind(), RecipeErrorKind::InvalidParams);
    }

    #[test]
    fn validates_noise_reduction_params() {
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"noiseReduction","params":{"amount":20}}]}"#,
        )
        .unwrap();

        assert_eq!(recipe.operation_types(), vec!["noiseReduction"]);
    }

    #[test]
    fn rejects_malformed_noise_reduction_params() {
        let error = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"noiseReduction","params":{"amount":"smooth"}}]}"#,
        )
        .unwrap_err();

        assert_eq!(error.kind(), RecipeErrorKind::InvalidParams);
    }

    #[test]
    fn validates_crop_rotate_and_straighten_params() {
        let recipe = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"crop","params":{"x":0.25,"y":0,"w":0.5,"h":1}},{"type":"rotate","params":{"degrees":90}},{"type":"straighten","params":{"angle":-1.5}}]}"#,
        )
        .unwrap();

        assert_eq!(
            recipe.operation_types(),
            vec!["crop", "rotate", "straighten"]
        );
    }

    #[test]
    fn rejects_malformed_transform_params() {
        let empty_crop = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"crop","params":{"x":0,"y":0,"w":0,"h":1}}]}"#,
        )
        .unwrap_err();
        let unsupported_rotate = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"rotate","params":{"degrees":45}}]}"#,
        )
        .unwrap_err();
        let non_numeric_straighten = Recipe::from_json_str(
            r#"{"version":1,"operations":[{"type":"straighten","params":{"angle":"level"}}]}"#,
        )
        .unwrap_err();

        assert_eq!(empty_crop.kind(), RecipeErrorKind::InvalidParams);
        assert_eq!(unsupported_rotate.kind(), RecipeErrorKind::InvalidParams);
        assert_eq!(
            non_numeric_straighten.kind(),
            RecipeErrorKind::InvalidParams
        );
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
