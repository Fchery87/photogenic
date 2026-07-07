import { test } from "node:test";
import assert from "node:assert/strict";
import { createLicensingFoundation } from "../src/licensing/foundation.js";

test("licensing foundation extracts deterministic metadata from license and credits", () => {
  const foundation = createLicensingFoundation();
  const summary = foundation.summarizeEntitlements({
    license: {
      status: "active",
      offlineValidUntil: "2025-07-20T00:00:00.000Z",
      validUntil: "2025-08-01T00:00:00.000Z",
    },
    credits: { balance: 3 },
  });

  assert.deepEqual(summary, {
    licenseStatus: "active",
    creditBalance: 3,
    hasActiveLicense: true,
    hasCloudCredits: true,
    offlineValidUntil: "2025-07-20T00:00:00.000Z",
    validUntil: "2025-08-01T00:00:00.000Z",
  });
});

test("licensing foundation normalizes missing or partial entitlement inputs", () => {
  const foundation = createLicensingFoundation();
  const summary = foundation.summarizeEntitlements({
    license: { status: "inactive" },
    credits: { balance: 1.5 },
  });

  assert.deepEqual(summary, {
    licenseStatus: "inactive",
    creditBalance: 0,
    hasActiveLicense: false,
    hasCloudCredits: false,
    offlineValidUntil: null,
    validUntil: null,
  });

  assert.deepEqual(foundation.summarizeEntitlements(), {
    licenseStatus: "missing",
    creditBalance: 0,
    hasActiveLicense: false,
    hasCloudCredits: false,
    offlineValidUntil: null,
    validUntil: null,
  });
});
