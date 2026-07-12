/**
 * Offline license signing and verification (Issue 14).
 *
 * Uses Ed25519 via node:crypto for offline-first license signing. The license
 * issuer holds the private key; the application embeds the public key and
 * verifies signatures locally without any network call.
 *
 * A signed license is a plain object extended with a base64 `signature` field
 * computed over a canonical JSON serialization of the license payload. This
 * ensures the signature is reproducible regardless of key insertion order.
 */

import {
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  createPublicKey,
  createPrivateKey,
} from "node:crypto";

/**
 * Deterministic JSON serialization (sorted keys at every depth) so the
 * signature is reproducible regardless of how the license object was constructed.
 */
function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

/**
 * Compute the canonical message string that the signature covers.
 * Excludes the `signature` field itself if present.
 */
function licenseMessage(payload) {
  const { signature: _signature, ...rest } = payload;
  return canonicalJson(rest);
}

/**
 * Generate an Ed25519 key pair for license signing.
 * @returns {{ publicKey: string, privateKey: string }} PEM-encoded keys.
 */
export function generateLicenseKeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "pem" }),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

/**
 * Sign a license payload with the issuer's private key.
 *
 * @param {object} payload - The license fields (licenseId, status, validUntil, offlineValidUntil, features, etc.)
 * @param {string} privateKeyPem - PEM-encoded Ed25519 private key.
 * @returns {object} The payload with an added base64 `signature` field.
 */
export function signLicense(payload, privateKeyPem) {
  if (!payload || typeof payload !== "object") {
    throw new TypeError("payload must be an object");
  }
  if (typeof privateKeyPem !== "string" || !privateKeyPem) {
    throw new TypeError("privateKeyPem is required");
  }
  const privateKey = createPrivateKey(privateKeyPem);
  const message = licenseMessage(payload);
  const signature = cryptoSign(null, Buffer.from(message, "utf8"), privateKey);
  return { ...payload, signature: signature.toString("base64") };
}

/**
 * Verify a signed license's signature against the application's public key.
 *
 * @param {object} signedLicense - The license payload with a `signature` field.
 * @param {string} publicKeyPem - PEM-encoded Ed25519 public key.
 * @returns {{ valid: boolean, reason?: string, license?: object }}
 */
export function verifyLicense(signedLicense, publicKeyPem) {
  if (!signedLicense || typeof signedLicense !== "object") {
    return { valid: false, reason: "License payload is missing or not an object." };
  }
  if (typeof signedLicense.signature !== "string" || !signedLicense.signature) {
    return { valid: false, reason: "License is missing a signature." };
  }
  if (typeof publicKeyPem !== "string" || !publicKeyPem) {
    return { valid: false, reason: "Public key is required for verification." };
  }

  try {
    const publicKey = createPublicKey(publicKeyPem);
    const message = licenseMessage(signedLicense);
    const valid = cryptoVerify(
      null,
      Buffer.from(message, "utf8"),
      publicKey,
      Buffer.from(signedLicense.signature, "base64"),
    );
    if (!valid) {
      return { valid: false, reason: "License signature is invalid — the license may have been tampered with." };
    }
    const { signature: _sig, ...license } = signedLicense;
    return { valid: true, license };
  } catch (error) {
    return { valid: false, reason: `Signature verification failed: ${error.message}` };
  }
}
