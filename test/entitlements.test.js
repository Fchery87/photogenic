import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateCloudEntitlement, evaluateLocalEntitlement } from "../src/licensing/entitlements.js";

test("active offline-valid license allows local export regardless of cloud credits", () => {
  const result = evaluateLocalEntitlement({
    feature: "local-export",
    now: "2025-07-10T00:00:00.000Z",
    license: {
      status: "active",
      offlineValidUntil: "2025-07-20T00:00:00.000Z",
      validUntil: "2025-08-01T00:00:00.000Z",
    },
    credits: { balance: 0 },
  });
  assert.equal(result.allowed, true);
  assert.equal(result.creditsIgnored, true);
});

test("expired offline snapshot denies local licensed features", () => {
  const result = evaluateLocalEntitlement({
    feature: "local-edit",
    now: "2025-07-21T00:00:00.000Z",
    license: {
      status: "active",
      offlineValidUntil: "2025-07-20T00:00:00.000Z",
      validUntil: "2025-08-01T00:00:00.000Z",
    },
  });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /offline/i);
});

test("inactive license denies local export", () => {
  const result = evaluateLocalEntitlement({
    feature: "local-export",
    license: { status: "inactive" },
  });
  assert.equal(result.allowed, false);
});

test("cloud features are evaluated separately from license state", () => {
  const noCredits = evaluateCloudEntitlement({ feature: "cloud-generative", credits: { balance: 0 } });
  const someCredits = evaluateCloudEntitlement({ feature: "cloud-generative", credits: { balance: 12 } });
  assert.equal(noCredits.allowed, false);
  assert.equal(someCredits.allowed, true);
});
