use serde_json::Value;
use std::collections::BTreeMap;

/// Embedded public key (32 raw Ed25519 bytes).
const PUBLIC_KEY_BYTES: [u8; 32] = hex_decode_pubkey();

const HEX_PUBKEY: &str = "e548f635ca1c7c3806f67e2a7261a82faa6aa23dca1218f2ae67ec4f50282b9c";

const fn hex_decode_pubkey() -> [u8; 32] {
    let hex = HEX_PUBKEY.as_bytes();
    let mut key = [0u8; 32];
    let mut i = 0;
    while i < 32 {
        key[i] = (hex_digit(hex[i * 2]) << 4) | hex_digit(hex[i * 2 + 1]);
        i += 1;
    }
    key
}

const fn hex_digit(b: u8) -> u8 {
    match b {
        b'0'..=b'9' => b - b'0',
        b'a'..=b'f' => b - b'a' + 10,
        b'A'..=b'F' => b - b'A' + 10,
        _ => 0,
    }
}

/// Compute the canonical JSON message that the signature covers.
/// Excludes the `signature` field, sorts keys at every depth.
fn canonical_message(license: &Value) -> String {
    canonical_json(exclude_signature(license))
}

fn exclude_signature(value: &Value) -> Value {
    match value {
        Value::Object(map) => {
            let filtered: BTreeMap<_, _> = map
                .iter()
                .filter(|(k, _)| *k != "signature")
                .map(|(k, v)| (k.clone(), exclude_signature(v)))
                .collect();
            Value::Object(serde_json::Map::from_iter(filtered))
        }
        Value::Array(arr) => {
            Value::Array(arr.iter().map(exclude_signature).collect())
        }
        other => other.clone(),
    }
}

fn canonical_json(value: Value) -> String {
    match value {
        Value::Object(map) => {
            let mut pairs: Vec<_> = map.iter().collect();
            pairs.sort_by(|a, b| a.0.cmp(b.0));
            let inner: Vec<String> = pairs
                .into_iter()
                .map(|(k, v)| {
                    format!(
                        "{}:{}",
                        serde_json::to_string(k).unwrap_or_default(),
                        canonical_json(v.clone())
                    )
                })
                .collect();
            format!("{{{}}}", inner.join(","))
        }
        Value::Array(arr) => {
            let inner: Vec<String> = arr.into_iter().map(canonical_json).collect();
            format!("[{}]", inner.join(","))
        }
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                i.to_string()
            } else if let Some(f) = n.as_f64() {
                if f.fract() == 0.0 && f.is_finite() {
                    format!("{:.0}", f)
                } else {
                    f.to_string()
                }
            } else {
                n.to_string()
            }
        }
        Value::String(s) => serde_json::to_string(&s).unwrap_or_default(),
    }
}

/// Verify the Ed25519 signature on a license JSON value.
///
/// The license must have a base64-encoded `signature` field.
/// Returns `Ok(license_without_signature)` if valid, `Err(reason)` if invalid.
pub fn verify_license_signature(license: &Value) -> Result<Value, String> {
    let signature_b64 = license
        .get("signature")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "License is missing a signature.".to_string())?;

    let signature_bytes = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        signature_b64,
    )
    .map_err(|e| format!("Invalid signature encoding: {e}"))?;

    if signature_bytes.len() != 64 {
        return Err("Invalid Ed25519 signature length.".to_string());
    }

    let message = canonical_message(license);

    let public_key = ed25519_compact::PublicKey::new(PUBLIC_KEY_BYTES);
    let signature = ed25519_compact::Signature::from_slice(&signature_bytes)
        .map_err(|e| format!("Invalid signature: {e}"))?;

    public_key
        .verify(message.as_bytes(), &signature)
        .map_err(|_| {
            "License signature is invalid — the license may have been tampered with.".to_string()
        })?;

    Ok(exclude_signature(license))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn canonical_json_excludes_signature() {
        let input: Value = serde_json::from_str(
            r#"{"b":1,"a":2,"signature":"xyz"}"#,
        )
        .unwrap();
        let msg = canonical_message(&input);
        // Should not contain the signature field
        assert!(!msg.contains("signature"));
        // Should contain both a and b
        assert!(msg.contains("\"a\""));
        assert!(msg.contains("\"b\""));
    }

    #[test]
    fn canonical_json_sorts_keys() {
        let input: Value = serde_json::from_str(r#"{"z":1,"a":2}"#).unwrap();
        let msg = canonical_message(&input);
        // "a" should appear before "z"
        assert!(msg.find("\"a\"").unwrap() < msg.find("\"z\"").unwrap());
    }

    #[test]
    fn canonical_json_handles_nested_objects() {
        let input: Value = serde_json::from_str(
            r#"{"outer":{"inner":2,"alpha":1}}"#,
        )
        .unwrap();
        let msg = canonical_message(&input);
        assert!(msg.contains("\"alpha\""));
        assert!(msg.contains("\"inner\""));
    }

    #[test]
    fn hex_pubkey_constant_is_correct_length() {
        assert_eq!(HEX_PUBKEY.len(), 64);
        assert_eq!(PUBLIC_KEY_BYTES.len(), 32);
    }
}
