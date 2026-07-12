import { test } from "node:test";
import assert from "node:assert/strict";

import { generateLicenseKeyPair, signLicense } from "../src/licensing/license-key.js";
import {
  activateLicense,
  checkLocalAccess,
  describeExportLicensingState,
} from "../src/licensing/activation.js";

// Shared key pair for all tests
const keyPair = generateLicenseKeyPair();

function makeValidLicense(overrides = {}) {
  return signLicense(
    {
      licenseId: "lic-test-001",
      status: "active",
      validUntil: "2099-12-31T23:59:59Z",
      offlineValidUntil: "2099-12-31T23:59:59Z",
      features: ["local-edit", "local-export"],
      issuedAt: "2025-01-01T00:00:00Z",
      holder: "internal-alpha-tester",
      ...overrides,
    },
    keyPair.privateKey,
  );
}

// ---------------------------------------------------------------------------
// Criterion 1: Valid signed License enables local edit/export while offline
// ---------------------------------------------------------------------------

test("valid signed license activates and enables local edit/export while offline", () => {
  const signed = makeValidLicense();
  const result = activateLicense({
    signedLicense: signed,
    publicKey: keyPair.publicKey,
    now: "2025-07-01T00:00:00Z",
  });

  assert.equal(result.activated, true);
  assert.equal(result.license.status, "active");
  assert.ok(result.snapshot, "activation produces a cached snapshot");

  const editAccess = checkLocalAccess({
    feature: "local-edit",
    license: result.license,
    now: "2025-07-01T00:00:00Z",
  });
  assert.equal(editAccess.allowed, true);

  const exportAccess = checkLocalAccess({
    feature: "local-export",
    license: result.license,
    now: "2025-07-01T00:00:00Z",
  });
  assert.equal(exportAccess.allowed, true);
});

// ---------------------------------------------------------------------------
// Criterion 2: Expired License denies local licensed features
// ---------------------------------------------------------------------------

test("expired license (offlineValidUntil passed) denies activation", () => {
  const signed = makeValidLicense({
    validUntil: "2099-12-31T23:59:59Z",
    offlineValidUntil: "2025-01-01T00:00:00Z",
  });
  const result = activateLicense({
    signedLicense: signed,
    publicKey: keyPair.publicKey,
    now: "2025-07-01T00:00:00Z",
  });

  assert.equal(result.activated, false);
  assert.equal(result.license, null);
  assert.match(result.reason, /expired for offline use/i);
});

test("expired license (validUntil passed) denies activation", () => {
  const signed = makeValidLicense({
    validUntil: "2025-01-01T00:00:00Z",
    offlineValidUntil: "2099-12-31T23:59:59Z",
  });
  const result = activateLicense({
    signedLicense: signed,
    publicKey: keyPair.publicKey,
    now: "2025-07-01T00:00:00Z",
  });

  assert.equal(result.activated, false);
  assert.match(result.reason, /validity window has expired/i);
});

test("cached license that expires after activation denies subsequent access", () => {
  const signed = makeValidLicense({
    offlineValidUntil: "2025-06-01T00:00:00Z",
  });
  // Activate while still valid
  const result = activateLicense({
    signedLicense: signed,
    publicKey: keyPair.publicKey,
    now: "2025-05-01T00:00:00Z",
  });
  assert.equal(result.activated, true);

  // Check access after expiry
  const access = checkLocalAccess({
    feature: "local-export",
    license: result.license,
    now: "2025-07-01T00:00:00Z",
  });
  assert.equal(access.allowed, false);
  assert.match(access.reason, /expired/i);
});

// ---------------------------------------------------------------------------
// Criterion 3: Invalid signature denies local licensed features
// ---------------------------------------------------------------------------

test("tampered license payload is rejected by signature verification", () => {
  const signed = makeValidLicense();
  // Tamper with a field after signing
  const tampered = { ...signed, status: "active", holder: "attacker" };
  const result = activateLicense({
    signedLicense: tampered,
    publicKey: keyPair.publicKey,
    now: "2025-07-01T00:00:00Z",
  });

  assert.equal(result.activated, false);
  assert.match(result.reason, /invalid/i);
});

test("license signed by a different key pair is rejected", () => {
  const otherKeyPair = generateLicenseKeyPair();
  const signedByOther = signLicense(
    {
      licenseId: "lic-foreign",
      status: "active",
      validUntil: "2099-12-31T23:59:59Z",
      offlineValidUntil: "2099-12-31T23:59:59Z",
    },
    otherKeyPair.privateKey,
  );

  const result = activateLicense({
    signedLicense: signedByOther,
    publicKey: keyPair.publicKey,
    now: "2025-07-01T00:00:00Z",
  });

  assert.equal(result.activated, false);
  assert.match(result.reason, /invalid/i);
});

test("license with missing signature is rejected", () => {
  const unsigned = {
    licenseId: "lic-unsigned",
    status: "active",
    validUntil: "2099-12-31T23:59:59Z",
    offlineValidUntil: "2099-12-31T23:59:59Z",
  };
  const result = activateLicense({
    signedLicense: unsigned,
    publicKey: keyPair.publicKey,
    now: "2025-07-01T00:00:00Z",
  });

  assert.equal(result.activated, false);
  assert.match(result.reason, /missing.*signature/i);
});

// ---------------------------------------------------------------------------
// Criterion 4: Cloud Credit balance never enables local export
// ---------------------------------------------------------------------------

test("cloud credits do not enable local export when no license is present", () => {
  const access = checkLocalAccess({
    feature: "local-export",
    license: null,
    credits: { balance: 999 },
    now: "2025-07-01T00:00:00Z",
  });

  assert.equal(access.allowed, false);
  assert.equal(access.creditsIgnored, true, "credits are explicitly ignored for local features");
});

test("cloud credits do not enable local export even with an active license", () => {
  const signed = makeValidLicense();
  const result = activateLicense({
    signedLicense: signed,
    publicKey: keyPair.publicKey,
    now: "2025-07-01T00:00:00Z",
  });

  const access = checkLocalAccess({
    feature: "local-export",
    license: result.license,
    credits: { balance: 999 },
    now: "2025-07-01T00:00:00Z",
  });

  assert.equal(access.allowed, true, "license grants access");
  assert.equal(access.creditsIgnored, true, "but credits were ignored — license is the sole source");
});

test("cloud credits do not rescue an expired license for local export", () => {
  const signed = makeValidLicense({
    offlineValidUntil: "2025-01-01T00:00:00Z",
  });
  const result = activateLicense({
    signedLicense: signed,
    publicKey: keyPair.publicKey,
    now: "2024-06-01T00:00:00Z",
  });
  assert.equal(result.activated, true);

  const access = checkLocalAccess({
    feature: "local-export",
    license: result.license,
    credits: { balance: 999 },
    now: "2025-07-01T00:00:00Z",
  });

  assert.equal(access.allowed, false, "expired license denies export");
  assert.equal(access.creditsIgnored, true, "credits cannot rescue a local feature");
});

// ---------------------------------------------------------------------------
// Criterion 5: Offline reload uses the cached License snapshot
// ---------------------------------------------------------------------------

test("offline reload from cached snapshot preserves access without re-activation", () => {
  const signed = makeValidLicense();
  const result = activateLicense({
    signedLicense: signed,
    publicKey: keyPair.publicKey,
    now: "2025-07-01T00:00:00Z",
  });

  // Simulate offline reload: use only the cached snapshot's license
  // (no signedLicense, no publicKey, no network)
  const cachedLicense = result.snapshot.license;

  const editAccess = checkLocalAccess({
    feature: "local-edit",
    license: cachedLicense,
    now: "2025-07-01T12:00:00Z",
  });
  assert.equal(editAccess.allowed, true, "offline reload from cached snapshot grants edit access");

  const exportAccess = checkLocalAccess({
    feature: "local-export",
    license: cachedLicense,
    now: "2025-07-01T12:00:00Z",
  });
  assert.equal(exportAccess.allowed, true, "offline reload from cached snapshot grants export access");
});

test("offline reload from cached snapshot eventually expires", () => {
  const signed = makeValidLicense({
    offlineValidUntil: "2025-07-02T00:00:00Z",
  });
  const result = activateLicense({
    signedLicense: signed,
    publicKey: keyPair.publicKey,
    now: "2025-07-01T00:00:00Z",
  });

  const cachedLicense = result.snapshot.license;

  // Before expiry
  const before = checkLocalAccess({
    feature: "local-export",
    license: cachedLicense,
    now: "2025-07-01T12:00:00Z",
  });
  assert.equal(before.allowed, true);

  // After offline grace period
  const after = checkLocalAccess({
    feature: "local-export",
    license: cachedLicense,
    now: "2025-07-03T00:00:00Z",
  });
  assert.equal(after.allowed, false);
  assert.match(after.reason, /expired/i);
});

// ---------------------------------------------------------------------------
// Criterion 6: Export controls explain licensing state without blocking
// ---------------------------------------------------------------------------

test("describeExportLicensingState returns active state when license is valid", () => {
  const signed = makeValidLicense();
  const result = activateLicense({
    signedLicense: signed,
    publicKey: keyPair.publicKey,
    now: "2025-07-01T00:00:00Z",
  });

  const state = describeExportLicensingState({
    license: result.license,
    now: "2025-07-01T00:00:00Z",
  });

  assert.equal(state.state, "active");
  assert.equal(state.canExport, true);
});

test("describeExportLicensingState returns no-license state when no license is cached", () => {
  const state = describeExportLicensingState({});

  assert.equal(state.state, "no-license");
  assert.equal(state.canExport, false);
  assert.match(state.reason, /activate.*license/i);
});

test("describeExportLicensingState returns expired state for an expired cached license", () => {
  const signed = makeValidLicense({
    offlineValidUntil: "2025-01-01T00:00:00Z",
  });
  const result = activateLicense({
    signedLicense: signed,
    publicKey: keyPair.publicKey,
    now: "2024-06-01T00:00:00Z",
  });

  const state = describeExportLicensingState({
    license: result.license,
    now: "2025-07-01T00:00:00Z",
  });

  assert.equal(state.state, "expired");
  assert.equal(state.canExport, false);
});

test("describeExportLicensingState returns inactive state for a non-active license", () => {
  const signed = makeValidLicense({ status: "revoked" });
  // Even though signature is valid, status is not active
  const state = describeExportLicensingState({
    license: { status: "revoked", validUntil: "2099-01-01T00:00:00Z" },
    now: "2025-07-01T00:00:00Z",
  });

  assert.equal(state.state, "inactive");
  assert.equal(state.canExport, false);
});

test("describeExportLicensingState never throws — library workflows are never blocked", () => {
  // Various bad inputs should all return descriptive objects, never throw
  const cases = [
    {},
    { license: null },
    { license: "garbage" },
    { license: { status: "active" } }, // no dates
  ];

  for (const snapshot of cases) {
    const state = describeExportLicensingState(snapshot);
    assert.ok(typeof state === "object");
    assert.ok(typeof state.reason === "string");
    assert.ok(["active", "inactive", "expired", "no-license"].includes(state.state));
  }
});
