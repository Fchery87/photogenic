/**
 * Offline license activation (Issue 14).
 *
 * The activation flow verifies the license signature with the embedded public
 * key, checks status and expiry, and caches the verified license as a snapshot
 * for offline reload. All checks happen locally — no network call is required.
 *
 * Activation never throws on a denied license; it returns a descriptive result
 * so the caller (e.g. export controls) can surface the reason to the user
 * without blocking unrelated library workflows.
 */

import { verifyLicense } from "./license-key.js";

const toMillis = (value) => {
  if (typeof value !== "string") return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) ? millis : null;
};

/**
 * Activate a signed license for offline use.
 *
 * @param {object} options
 * @param {object} options.signedLicense  - License payload with base64 `signature`.
 * @param {string} options.publicKey      - PEM-encoded Ed25519 public key.
 * @param {string} [options.now]          - ISO timestamp for expiry evaluation.
 * @returns {{ activated: boolean, license: object | null, reason: string, snapshot: object | null }}
 */
export function activateLicense({ signedLicense, publicKey, now = new Date().toISOString() } = {}) {
  // Step 1: Verify the cryptographic signature.
  const verification = verifyLicense(signedLicense, publicKey);
  if (!verification.valid) {
    return {
      activated: false,
      license: null,
      reason: verification.reason,
      snapshot: null,
    };
  }

  const license = verification.license;

  // Step 2: Check license status.
  if (license.status !== "active") {
    return {
      activated: false,
      license: null,
      reason: `Local license is ${String(license.status ?? "unknown")} — local edit/export features are denied.`,
      snapshot: null,
    };
  }

  // Step 3: Check expiry windows (offline grace period first, then absolute).
  const nowMs = toMillis(now) ?? Date.now();
  const offlineValidUntil = toMillis(license.offlineValidUntil);
  const validUntil = toMillis(license.validUntil);

  if (offlineValidUntil !== null && nowMs > offlineValidUntil) {
    return {
      activated: false,
      license: null,
      reason: "Local license snapshot has expired for offline use — reconnect to refresh.",
      snapshot: null,
    };
  }

  if (validUntil !== null && nowMs > validUntil) {
    return {
      activated: false,
      license: null,
      reason: "Local license validity window has expired.",
      snapshot: null,
    };
  }

  // Step 4: Cache the verified license as an offline snapshot.
  const snapshot = { license, now, activatedAt: now };

  return {
    activated: true,
    license,
    reason: "License verified and activated for offline use.",
    snapshot,
  };
}

/**
 * Check whether a cached (already-activated) license snapshot still grants
 * access to a local feature. Used for offline reload — the signature was
 * already verified at activation time, so this only checks expiry.
 *
 * @param {object} options
 * @param {string} options.feature     - "local-edit" or "local-export".
 * @param {object} [options.license]   - Cached license from the snapshot.
 * @param {object} [options.credits]   - Cloud credits (always ignored for local features).
 * @param {string} [options.now]       - ISO timestamp.
 * @returns {{ allowed: boolean, reason: string, feature: string, creditsIgnored: boolean }}
 */
export function checkLocalAccess({ feature, license, credits, now = new Date().toISOString() } = {}) {
  if (feature !== "local-edit" && feature !== "local-export") {
    throw new RangeError(`unsupported local feature: ${String(feature)}`);
  }

  const creditsIgnored = credits !== undefined;

  if (!license || typeof license !== "object") {
    return {
      allowed: false,
      reason: "No cached license snapshot is available — activate a license first.",
      feature,
      creditsIgnored,
    };
  }

  if (license.status !== "active") {
    return {
      allowed: false,
      reason: `Local license is ${String(license.status ?? "unknown")}.`,
      feature,
      creditsIgnored,
    };
  }

  const nowMs = toMillis(now) ?? Date.now();
  const offlineValidUntil = toMillis(license.offlineValidUntil);
  const validUntil = toMillis(license.validUntil);

  if (offlineValidUntil !== null && nowMs > offlineValidUntil) {
    return {
      allowed: false,
      reason: "Local license snapshot expired for offline use.",
      feature,
      creditsIgnored,
    };
  }

  if (validUntil !== null && nowMs > validUntil) {
    return {
      allowed: false,
      reason: "Local license validity window has expired.",
      feature,
      creditsIgnored,
    };
  }

  return {
    allowed: true,
    reason: `Local feature '${feature}' is allowed by the cached license.`,
    feature,
    creditsIgnored,
  };
}

/**
 * Produce a human-readable licensing state for export controls.
 * Returns a descriptive object without throwing, so unrelated library
 * workflows are never blocked by a licensing check.
 *
 * @param {object} [snapshot]  - The cached licensing snapshot ({ license, credits, now }).
 * @returns {{ state: "active" | "inactive" | "expired" | "no-license", canExport: boolean, reason: string }}
 */
export function describeExportLicensingState(snapshot = {}) {
  const now = snapshot.now ?? new Date().toISOString();

  if (!snapshot.license) {
    return {
      state: "no-license",
      canExport: false,
      reason: "No local license is active — activate a signed license to enable export.",
    };
  }

  const access = checkLocalAccess({
    feature: "local-export",
    license: snapshot.license,
    credits: snapshot.credits,
    now,
  });

  if (access.allowed) {
    return {
      state: "active",
      canExport: true,
      reason: "Local license is active — export is enabled.",
    };
  }

  // Distinguish expired from inactive for clearer UI messaging.
  const nowMs = toMillis(now) ?? Date.now();
  const offlineValidUntil = toMillis(snapshot.license.offlineValidUntil);
  const validUntil = toMillis(snapshot.license.validUntil);
  const isExpired =
    (offlineValidUntil !== null && nowMs > offlineValidUntil) ||
    (validUntil !== null && nowMs > validUntil);

  return {
    state: isExpired ? "expired" : "inactive",
    canExport: false,
    reason: access.reason,
  };
}
