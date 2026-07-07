import { test } from "node:test";
import assert from "node:assert/strict";
import { createLicensingDashboardFoundation } from "../src/licensing/dashboard-foundation.js";

test("licensing dashboard foundation summarizes deterministic licensing snapshot metadata", () => {
  const foundation = createLicensingDashboardFoundation();
  const snapshots = [
    {
      snapshotId: "seat-a",
      evaluatedAt: "2025-07-19T09:00:00.000Z",
      updatedAt: "2025-07-19T00:00:00.000Z",
      license: {
        status: "active",
        offlineValidUntil: "2025-07-20T00:00:00.000Z",
        validUntil: "2025-08-01T00:00:00.000Z",
      },
      credits: { balance: 4 },
    },
    {
      snapshotId: "seat-b",
      evaluatedAt: "2025-07-19T10:00:00.000Z",
      updatedAt: "2025-07-19T00:00:01.000Z",
      license: { status: "inactive" },
      credits: { balance: 0 },
    },
    {
      snapshotId: "seat-c",
      evaluatedAt: "2025-07-19T11:00:00.000Z",
      updatedAt: "2025-07-19T00:00:02.000Z",
      license: {
        status: "active",
        offlineValidUntil: "2025-07-25T00:00:00.000Z",
        validUntil: "2025-08-05T00:00:00.000Z",
      },
      credits: { balance: 0 },
    },
    {
      snapshotId: "seat-d",
      evaluatedAt: "2025-07-19T12:00:00.000Z",
      updatedAt: "2025-07-19T00:00:03.000Z",
      license: { status: "inactive" },
      credits: { balance: 2 },
    },
  ];

  const summary = foundation.summarizeSnapshots(snapshots);

  assert.deepEqual(summary, {
    counts: {
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
    },
    latestSnapshotIds: ["seat-d", "seat-c", "seat-b", "seat-a"],
    latestActive: {
      snapshotId: "seat-c",
      evaluatedAt: "2025-07-19T11:00:00.000Z",
      updatedAt: "2025-07-19T00:00:02.000Z",
      licenseStatus: "active",
      creditBalance: 0,
      hasActiveLicense: true,
      hasCloudCredits: false,
      offlineValidUntil: "2025-07-25T00:00:00.000Z",
      validUntil: "2025-08-05T00:00:00.000Z",
    },
    latestInactive: {
      snapshotId: "seat-d",
      evaluatedAt: "2025-07-19T12:00:00.000Z",
      updatedAt: "2025-07-19T00:00:03.000Z",
      licenseStatus: "inactive",
      creditBalance: 2,
      hasActiveLicense: false,
      hasCloudCredits: true,
      offlineValidUntil: null,
      validUntil: null,
    },
    latestWithCredits: {
      snapshotId: "seat-d",
      evaluatedAt: "2025-07-19T12:00:00.000Z",
      updatedAt: "2025-07-19T00:00:03.000Z",
      licenseStatus: "inactive",
      creditBalance: 2,
      hasActiveLicense: false,
      hasCloudCredits: true,
      offlineValidUntil: null,
      validUntil: null,
    },
    latestWithoutCredits: {
      snapshotId: "seat-c",
      evaluatedAt: "2025-07-19T11:00:00.000Z",
      updatedAt: "2025-07-19T00:00:02.000Z",
      licenseStatus: "active",
      creditBalance: 0,
      hasActiveLicense: true,
      hasCloudCredits: false,
      offlineValidUntil: "2025-07-25T00:00:00.000Z",
      validUntil: "2025-08-05T00:00:00.000Z",
    },
    latestActiveWithCredits: {
      snapshotId: "seat-a",
      evaluatedAt: "2025-07-19T09:00:00.000Z",
      updatedAt: "2025-07-19T00:00:00.000Z",
      licenseStatus: "active",
      creditBalance: 4,
      hasActiveLicense: true,
      hasCloudCredits: true,
      offlineValidUntil: "2025-07-20T00:00:00.000Z",
      validUntil: "2025-08-01T00:00:00.000Z",
    },
    latestActiveWithoutCredits: {
      snapshotId: "seat-c",
      evaluatedAt: "2025-07-19T11:00:00.000Z",
      updatedAt: "2025-07-19T00:00:02.000Z",
      licenseStatus: "active",
      creditBalance: 0,
      hasActiveLicense: true,
      hasCloudCredits: false,
      offlineValidUntil: "2025-07-25T00:00:00.000Z",
      validUntil: "2025-08-05T00:00:00.000Z",
    },
    latestInactiveWithCredits: {
      snapshotId: "seat-d",
      evaluatedAt: "2025-07-19T12:00:00.000Z",
      updatedAt: "2025-07-19T00:00:03.000Z",
      licenseStatus: "inactive",
      creditBalance: 2,
      hasActiveLicense: false,
      hasCloudCredits: true,
      offlineValidUntil: null,
      validUntil: null,
    },
    latestInactiveWithoutCredits: {
      snapshotId: "seat-b",
      evaluatedAt: "2025-07-19T10:00:00.000Z",
      updatedAt: "2025-07-19T00:00:01.000Z",
      licenseStatus: "inactive",
      creditBalance: 0,
      hasActiveLicense: false,
      hasCloudCredits: false,
      offlineValidUntil: null,
      validUntil: null,
    },
    latestAccessIssue: {
      snapshotId: "seat-d",
      evaluatedAt: "2025-07-19T12:00:00.000Z",
      updatedAt: "2025-07-19T00:00:03.000Z",
      licenseStatus: "inactive",
      creditBalance: 2,
      hasActiveLicense: false,
      hasCloudCredits: true,
      offlineValidUntil: null,
      validUntil: null,
    },
    highestCreditBalance: {
      snapshotId: "seat-a",
      evaluatedAt: "2025-07-19T09:00:00.000Z",
      updatedAt: "2025-07-19T00:00:00.000Z",
      licenseStatus: "active",
      creditBalance: 4,
      hasActiveLicense: true,
      hasCloudCredits: true,
      offlineValidUntil: "2025-07-20T00:00:00.000Z",
      validUntil: "2025-08-01T00:00:00.000Z",
    },
  });

  snapshots[2].credits.balance = 9;
  assert.equal(summary.latestActive.creditBalance, 0);
});

test("licensing dashboard foundation handles empty licensing history", () => {
  const foundation = createLicensingDashboardFoundation();
  const summary = foundation.summarizeSnapshots();

  assert.deepEqual(summary, {
    counts: {
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
    },
    latestSnapshotIds: [],
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
