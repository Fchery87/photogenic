import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLicensingSessionStore } from "../src/licensing/session-store.js";
import { createLicensingSessionWorkflow } from "../src/licensing/session-workflow.js";

async function makeWorkflow() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-licensing-workflow-"));
  let tick = 0;
  const sessionStore = await createLicensingSessionStore({
    path: path.join(dir, "licensing-snapshots.json"),
    clock: () => `2025-07-15T00:00:0${Math.min(tick++, 9)}.000Z`,
  });
  return createLicensingSessionWorkflow({ sessionStore });
}

test("licensing session workflow stores a snapshot and returns a summarized access report", async () => {
  const workflow = await makeWorkflow();
  const saved = await workflow.saveSnapshot("seat-a", {
    evaluatedAt: "2025-07-15T12:00:00.000Z",
    license: {
      status: "active",
      offlineValidUntil: "2025-07-20T00:00:00.000Z",
      validUntil: "2025-08-01T00:00:00.000Z",
    },
    credits: { balance: 2 },
  });

  assert.equal(saved.snapshot.snapshotId, "seat-a");
  assert.equal(saved.report.snapshotId, "seat-a");
  assert.equal(saved.report.licenseStatus, "active");
  assert.equal(saved.report.creditBalance, 2);
  assert.equal(saved.report.hasActiveLicense, true);
  assert.equal(saved.report.hasCloudCredits, true);
  assert.equal(saved.report.offlineValidUntil, "2025-07-20T00:00:00.000Z");
  assert.equal(saved.report.validUntil, "2025-08-01T00:00:00.000Z");
  assert.equal(saved.report.access.localEdit.allowed, true);
  assert.equal(saved.report.access.localExport.allowed, true);
  assert.equal(saved.report.access.cloudGenerative.allowed, true);
});

test("licensing session workflow reloads the saved snapshot into a stable access report", async () => {
  const workflow = await makeWorkflow();
  await workflow.saveSnapshot("seat-b", {
    evaluatedAt: "2025-07-21T12:00:00.000Z",
    license: {
      status: "active",
      offlineValidUntil: "2025-07-20T00:00:00.000Z",
      validUntil: "2025-08-01T00:00:00.000Z",
    },
    credits: { balance: 0 },
  });

  const loaded = await workflow.loadReport("seat-b");
  assert.equal(loaded.snapshot.snapshotId, "seat-b");
  assert.equal(loaded.report.evaluatedAt, "2025-07-21T12:00:00.000Z");
  assert.equal(loaded.report.hasActiveLicense, true);
  assert.equal(loaded.report.hasCloudCredits, false);
  assert.equal(loaded.report.access.localEdit.allowed, false);
  assert.match(loaded.report.access.localEdit.reason, /offline/i);
  assert.equal(loaded.report.access.cloudGenerative.allowed, false);
  assert.equal(loaded.report.access.cloudGenerative.balance, 0);
});


test("licensing session workflow report helpers return operation metadata", async () => {
  const workflow = await makeWorkflow();
  const saved = await workflow.saveSnapshotReport("seat-op", {
    evaluatedAt: "2025-07-15T13:00:00.000Z",
    license: { status: "inactive" },
    credits: { balance: 3 },
  });

  assert.deepEqual(saved.operation, {
    kind: "save-licensing-snapshot",
    snapshotId: "seat-op",
    hasLicense: true,
    hasCredits: true,
  });
  const loaded = await workflow.loadReportWithOperation("seat-op");
  assert.deepEqual(loaded.operation, {
    kind: "load-licensing-report",
    snapshotId: "seat-op",
  });
  assert.equal(loaded.report.creditBalance, 3);
});
