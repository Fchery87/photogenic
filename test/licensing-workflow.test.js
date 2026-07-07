import { test } from "node:test";
import assert from "node:assert/strict";
import { createLicensingWorkflow } from "../src/licensing/workflow.js";

const activeLicense = {
  status: "active",
  offlineValidUntil: "2025-07-20T00:00:00.000Z",
  validUntil: "2025-08-01T00:00:00.000Z",
};

test("licensing workflow routes local features through the local-license entitlement path", () => {
  const workflow = createLicensingWorkflow();
  const result = workflow.evaluateFeatureAccess({
    feature: "local-export",
    now: "2025-07-10T00:00:00.000Z",
    license: activeLicense,
    credits: { balance: 0 },
  });

  assert.equal(result.channel, "local-license");
  assert.equal(result.allowed, true);
  assert.equal(result.creditsIgnored, true);
});

test("licensing workflow routes cloud features through the credit balance path", () => {
  const workflow = createLicensingWorkflow();
  const denied = workflow.evaluateFeatureAccess({ feature: "cloud-generative", credits: { balance: 0 } });
  const allowed = workflow.evaluateFeatureAccess({ feature: "cloud-generative", credits: { balance: 4 } });

  assert.equal(denied.channel, "cloud-credits");
  assert.equal(denied.allowed, false);
  assert.equal(allowed.allowed, true);
});

test("licensing workflow summarizes the full snapshot without conflating local and cloud access", () => {
  const workflow = createLicensingWorkflow();
  const metadata = workflow.summarizeAccessMetadata({
    license: activeLicense,
    credits: { balance: 3 },
  });
  const summary = workflow.summarizeAccess({
    now: "2025-07-21T00:00:00.000Z",
    license: activeLicense,
    credits: { balance: 3 },
  });

  assert.equal(metadata.licenseStatus, "active");
  assert.equal(metadata.creditBalance, 3);
  assert.equal(metadata.hasActiveLicense, true);
  assert.equal(metadata.hasCloudCredits, true);
  assert.equal(summary.localEdit.allowed, false);
  assert.match(summary.localEdit.reason, /offline/i);
  assert.equal(summary.localExport.allowed, false);
  assert.equal(summary.cloudGenerative.allowed, true);
  assert.equal(summary.cloudGenerative.channel, "cloud-credits");
});


test("licensing workflow summarizeAccessReport returns operation metadata plus metadata and access", () => {
  const workflow = createLicensingWorkflow();
  const report = workflow.summarizeAccessReport({
    now: "2025-07-21T00:00:00.000Z",
    license: activeLicense,
    credits: { balance: 3 },
  });

  assert.deepEqual(report.operation, {
    kind: "summarize-licensing-access",
    now: "2025-07-21T00:00:00.000Z",
    hasLicense: true,
    hasCredits: true,
  });
  assert.equal(report.metadata.licenseStatus, "active");
  assert.equal(report.access.cloudGenerative.allowed, true);
});
