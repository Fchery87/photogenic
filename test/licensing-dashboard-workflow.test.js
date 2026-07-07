import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLicensingSessionStore } from "../src/licensing/session-store.js";
import { createLicensingDashboardWorkflow } from "../src/licensing/dashboard-workflow.js";

async function makeHarness() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-licensing-dashboard-"));
  let tick = 0;
  const clock = () => `2025-07-19T00:00:0${Math.min(tick++, 9)}.000Z`;
  const sessionStore = await createLicensingSessionStore({ path: path.join(dir, "licensing.json"), clock });

  await sessionStore.saveSnapshot("seat-a", {
    evaluatedAt: "2025-07-19T09:00:00.000Z",
    license: {
      status: "active",
      offlineValidUntil: "2025-07-20T00:00:00.000Z",
      validUntil: "2025-08-01T00:00:00.000Z",
    },
    credits: { balance: 4 },
  });

  await sessionStore.saveSnapshot("seat-b", {
    evaluatedAt: "2025-07-19T10:00:00.000Z",
    license: { status: "inactive" },
    credits: { balance: 0 },
  });

  await sessionStore.saveSnapshot("seat-c", {
    evaluatedAt: "2025-07-19T11:00:00.000Z",
    license: {
      status: "active",
      offlineValidUntil: "2025-07-25T00:00:00.000Z",
      validUntil: "2025-08-01T00:00:00.000Z",
    },
    credits: { balance: 0 },
  });

  await sessionStore.saveSnapshot("seat-d", {
    evaluatedAt: "2025-07-19T12:00:00.000Z",
    license: { status: "inactive" },
    credits: { balance: 2 },
  });

  return createLicensingDashboardWorkflow({ sessionStore });
}

test("licensing dashboard workflow summarizes saved licensing snapshots", async () => {
  const workflow = await makeHarness();
  const summary = await workflow.summarizeSnapshots();

  assert.deepEqual(summary.counts, {
    total: 4,
    activeLicenses: 2,
    inactiveLicenses: 2,
    withCredits: 2,
    withoutCredits: 2,
    activeWithCredits: 1,
    activeWithoutCredits: 1,
    inactiveWithCredits: 1,
    inactiveWithoutCredits: 1,
    withAccessIssue: 3,
    creditBalanceTotal: 6,
  });
  assert.deepEqual(summary.latestSnapshotIds, ["seat-d", "seat-c", "seat-b", "seat-a"]);
  assert.deepEqual(summary.latestActive, {
    snapshotId: "seat-c",
    evaluatedAt: "2025-07-19T11:00:00.000Z",
    updatedAt: "2025-07-19T00:00:02.000Z",
    licenseStatus: "active",
    creditBalance: 0,
    hasActiveLicense: true,
    hasCloudCredits: false,
    offlineValidUntil: "2025-07-25T00:00:00.000Z",
    validUntil: "2025-08-01T00:00:00.000Z",
  });
  assert.deepEqual(summary.latestInactive, {
    snapshotId: "seat-d",
    evaluatedAt: "2025-07-19T12:00:00.000Z",
    updatedAt: "2025-07-19T00:00:03.000Z",
    licenseStatus: "inactive",
    creditBalance: 2,
    hasActiveLicense: false,
    hasCloudCredits: true,
    offlineValidUntil: null,
    validUntil: null,
  });
  assert.deepEqual(summary.latestWithCredits, {
    snapshotId: "seat-d",
    evaluatedAt: "2025-07-19T12:00:00.000Z",
    updatedAt: "2025-07-19T00:00:03.000Z",
    licenseStatus: "inactive",
    creditBalance: 2,
    hasActiveLicense: false,
    hasCloudCredits: true,
    offlineValidUntil: null,
    validUntil: null,
  });
  assert.deepEqual(summary.latestWithoutCredits, {
    snapshotId: "seat-c",
    evaluatedAt: "2025-07-19T11:00:00.000Z",
    updatedAt: "2025-07-19T00:00:02.000Z",
    licenseStatus: "active",
    creditBalance: 0,
    hasActiveLicense: true,
    hasCloudCredits: false,
    offlineValidUntil: "2025-07-25T00:00:00.000Z",
    validUntil: "2025-08-01T00:00:00.000Z",
  });
  assert.deepEqual(summary.latestActiveWithCredits, {
    snapshotId: "seat-a",
    evaluatedAt: "2025-07-19T09:00:00.000Z",
    updatedAt: "2025-07-19T00:00:00.000Z",
    licenseStatus: "active",
    creditBalance: 4,
    hasActiveLicense: true,
    hasCloudCredits: true,
    offlineValidUntil: "2025-07-20T00:00:00.000Z",
    validUntil: "2025-08-01T00:00:00.000Z",
  });
  assert.deepEqual(summary.latestActiveWithoutCredits, {
    snapshotId: "seat-c",
    evaluatedAt: "2025-07-19T11:00:00.000Z",
    updatedAt: "2025-07-19T00:00:02.000Z",
    licenseStatus: "active",
    creditBalance: 0,
    hasActiveLicense: true,
    hasCloudCredits: false,
    offlineValidUntil: "2025-07-25T00:00:00.000Z",
    validUntil: "2025-08-01T00:00:00.000Z",
  });
  assert.deepEqual(summary.latestInactiveWithCredits, {
    snapshotId: "seat-d",
    evaluatedAt: "2025-07-19T12:00:00.000Z",
    updatedAt: "2025-07-19T00:00:03.000Z",
    licenseStatus: "inactive",
    creditBalance: 2,
    hasActiveLicense: false,
    hasCloudCredits: true,
    offlineValidUntil: null,
    validUntil: null,
  });
  assert.deepEqual(summary.latestInactiveWithoutCredits, {
    snapshotId: "seat-b",
    evaluatedAt: "2025-07-19T10:00:00.000Z",
    updatedAt: "2025-07-19T00:00:01.000Z",
    licenseStatus: "inactive",
    creditBalance: 0,
    hasActiveLicense: false,
    hasCloudCredits: false,
    offlineValidUntil: null,
    validUntil: null,
  });
  assert.deepEqual(summary.latestAccessIssue, {
    snapshotId: "seat-d",
    evaluatedAt: "2025-07-19T12:00:00.000Z",
    updatedAt: "2025-07-19T00:00:03.000Z",
    licenseStatus: "inactive",
    creditBalance: 2,
    hasActiveLicense: false,
    hasCloudCredits: true,
    offlineValidUntil: null,
    validUntil: null,
  });
  assert.deepEqual(summary.highestCreditBalance, {
    snapshotId: "seat-a",
    evaluatedAt: "2025-07-19T09:00:00.000Z",
    updatedAt: "2025-07-19T00:00:00.000Z",
    licenseStatus: "active",
    creditBalance: 4,
    hasActiveLicense: true,
    hasCloudCredits: true,
    offlineValidUntil: "2025-07-20T00:00:00.000Z",
    validUntil: "2025-08-01T00:00:00.000Z",
  });
});

test("licensing dashboard workflow handles empty licensing history", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-licensing-dashboard-empty-"));
  const sessionStore = await createLicensingSessionStore({
    path: path.join(dir, "licensing.json"),
    clock: () => "2025-07-19T00:00:00.000Z",
  });
  const workflow = createLicensingDashboardWorkflow({ sessionStore });
  const summary = await workflow.summarizeSnapshots();

  assert.deepEqual(summary.counts, {
    total: 0,
    activeLicenses: 0,
    inactiveLicenses: 0,
    withCredits: 0,
    withoutCredits: 0,
    activeWithCredits: 0,
    activeWithoutCredits: 0,
    inactiveWithCredits: 0,
    inactiveWithoutCredits: 0,
    withAccessIssue: 0,
    creditBalanceTotal: 0,
  });
  assert.deepEqual(summary.latestSnapshotIds, []);
  assert.equal(summary.latestActive, null);
  assert.equal(summary.latestInactive, null);
  assert.equal(summary.latestWithCredits, null);
  assert.equal(summary.latestWithoutCredits, null);
  assert.equal(summary.latestActiveWithCredits, null);
  assert.equal(summary.latestActiveWithoutCredits, null);
  assert.equal(summary.latestInactiveWithCredits, null);
  assert.equal(summary.latestInactiveWithoutCredits, null);
  assert.equal(summary.latestAccessIssue, null);
  assert.equal(summary.highestCreditBalance, null);
});

test("licensing dashboard workflow delegates summary shaping to the dashboard foundation", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-licensing-dashboard-delegation-"));
  const sessionStore = await createLicensingSessionStore({
    path: path.join(dir, "licensing.json"),
    clock: () => "2025-07-19T00:00:00.000Z",
  });
  await sessionStore.saveSnapshot("seat-a", {
    evaluatedAt: "2025-07-19T09:00:00.000Z",
    license: { status: "active" },
    credits: { balance: 0 },
  });

  const calls = [];
  const dashboardFoundation = {
    summarizeSnapshots(snapshots) {
      calls.push(snapshots);
      return {
        counts: { total: snapshots.length },
        latestSnapshotIds: ["delegated"],
        latestActive: null,
        latestInactive: null,
        latestWithCredits: null,
        latestWithoutCredits: null,
        latestActiveWithCredits: null,
        latestActiveWithoutCredits: null,
        latestInactiveWithCredits: null,
        latestInactiveWithoutCredits: null,
        latestAccessIssue: null,
        highestCreditBalance: null,
      };
    },
  };

  const workflow = createLicensingDashboardWorkflow({ sessionStore, dashboardFoundation });
  const summary = await workflow.summarizeSnapshots();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].snapshotId, "seat-a");
  assert.deepEqual(summary, {
    counts: { total: 1 },
    latestSnapshotIds: ["delegated"],
    latestActive: null,
    latestInactive: null,
    latestWithCredits: null,
    latestWithoutCredits: null,
    latestActiveWithCredits: null,
    latestActiveWithoutCredits: null,
    latestInactiveWithCredits: null,
    latestInactiveWithoutCredits: null,
    latestAccessIssue: null,
    highestCreditBalance: null,
  });
});


test("licensing dashboard workflow summarizeSnapshotsReport returns operation metadata with summary", async () => {
  const workflow = await makeHarness();
  const result = await workflow.summarizeSnapshotsReport();

  assert.deepEqual(result.operation, {
    kind: "summarize-licensing-snapshots",
    requestedSnapshotIds: ["seat-a", "seat-b", "seat-c", "seat-d"],
    processedSnapshotIds: ["seat-a", "seat-b", "seat-c", "seat-d"],
    skippedSnapshotIds: [],
  });
  assert.equal(result.summary.counts.total, 4);
  assert.equal(result.summary.counts.withAccessIssue, 3);
});

test("licensing dashboard workflow summarizeSnapshotsReport tracks skipped missing snapshot ids", async () => {
  const workflow = createLicensingDashboardWorkflow({
    sessionStore: {
      async listSnapshotIds() {
        return ["seat-a", "seat-missing", "seat-b"];
      },
      async getSnapshot(snapshotId) {
        if (snapshotId === "seat-missing") return null;
        return {
          snapshotId,
          updatedAt: snapshotId === "seat-a" ? "2025-07-19T00:00:00.000Z" : "2025-07-19T00:00:01.000Z",
          evaluatedAt: snapshotId === "seat-a" ? "2025-07-19T09:00:00.000Z" : "2025-07-19T10:00:00.000Z",
          license: { status: snapshotId === "seat-a" ? "active" : "inactive" },
          credits: { balance: snapshotId === "seat-a" ? 1 : 0 },
        };
      },
    },
  });

  const result = await workflow.summarizeSnapshotsReport();
  assert.deepEqual(result.operation, {
    kind: "summarize-licensing-snapshots",
    requestedSnapshotIds: ["seat-a", "seat-missing", "seat-b"],
    processedSnapshotIds: ["seat-a", "seat-b"],
    skippedSnapshotIds: ["seat-missing"],
  });
  assert.equal(result.summary.counts.total, 2);
});
