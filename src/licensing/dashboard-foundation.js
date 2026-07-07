import { createLicensingFoundation } from "./foundation.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function summarizeCounts(snapshots, licensingFoundation) {
  return snapshots.reduce(
    (summary, snapshot) => {
      const metadata = licensingFoundation.summarizeEntitlements(snapshot);
      summary.total += 1;
      summary.creditBalanceTotal += metadata.creditBalance;
      if (metadata.hasActiveLicense) {
        summary.activeLicenses += 1;
      } else {
        summary.inactiveLicenses += 1;
      }
      if (metadata.hasCloudCredits) {
        summary.withCredits += 1;
      } else {
        summary.withoutCredits += 1;
      }
      if (metadata.hasActiveLicense && metadata.hasCloudCredits) {
        summary.activeWithCredits += 1;
      }
      if (metadata.hasActiveLicense && !metadata.hasCloudCredits) {
        summary.activeWithoutCredits += 1;
      }
      if (!metadata.hasActiveLicense && metadata.hasCloudCredits) {
        summary.inactiveWithCredits += 1;
      }
      if (!metadata.hasActiveLicense && !metadata.hasCloudCredits) {
        summary.inactiveWithoutCredits += 1;
      }
      if (!metadata.hasActiveLicense || !metadata.hasCloudCredits) {
        summary.withAccessIssue += 1;
      }
      return summary;
    },
    {
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
  );
}

function summarizeSnapshot(snapshot, licensingFoundation) {
  return {
    snapshotId: snapshot.snapshotId,
    evaluatedAt: snapshot.evaluatedAt,
    updatedAt: snapshot.updatedAt,
    ...licensingFoundation.summarizeEntitlements(snapshot),
  };
}

export function createLicensingDashboardFoundation({ licensingFoundation = createLicensingFoundation() } = {}) {
  if (!licensingFoundation || typeof licensingFoundation.summarizeEntitlements !== "function") {
    throw new TypeError("licensingFoundation with summarizeEntitlements() is required");
  }

  return {
    licensingFoundation,

    summarizeSnapshots(snapshots = []) {
      const normalizedSnapshots = Array.isArray(snapshots) ? snapshots.map((snapshot) => clone(snapshot)) : [];
      const latest = [...normalizedSnapshots].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const latestActive = latest.find((snapshot) => licensingFoundation.summarizeEntitlements(snapshot).hasActiveLicense) ?? null;
      const latestInactive = latest.find((snapshot) => !licensingFoundation.summarizeEntitlements(snapshot).hasActiveLicense) ?? null;
      const latestWithCredits = latest.find((snapshot) => licensingFoundation.summarizeEntitlements(snapshot).hasCloudCredits) ?? null;
      const latestWithoutCredits = latest.find((snapshot) => !licensingFoundation.summarizeEntitlements(snapshot).hasCloudCredits) ?? null;
      const latestActiveWithCredits = latest.find((snapshot) => {
        const summary = licensingFoundation.summarizeEntitlements(snapshot);
        return summary.hasActiveLicense && summary.hasCloudCredits;
      }) ?? null;
      const latestActiveWithoutCredits = latest.find((snapshot) => {
        const summary = licensingFoundation.summarizeEntitlements(snapshot);
        return summary.hasActiveLicense && !summary.hasCloudCredits;
      }) ?? null;
      const latestInactiveWithCredits = latest.find((snapshot) => {
        const summary = licensingFoundation.summarizeEntitlements(snapshot);
        return !summary.hasActiveLicense && summary.hasCloudCredits;
      }) ?? null;
      const latestInactiveWithoutCredits = latest.find((snapshot) => {
        const summary = licensingFoundation.summarizeEntitlements(snapshot);
        return !summary.hasActiveLicense && !summary.hasCloudCredits;
      }) ?? null;
      const latestAccessIssue = latest.find((snapshot) => {
        const summary = licensingFoundation.summarizeEntitlements(snapshot);
        return !summary.hasActiveLicense || !summary.hasCloudCredits;
      }) ?? null;
      const highestCreditBalance = [...latest].sort((a, b) => {
        const aCredits = licensingFoundation.summarizeEntitlements(a).creditBalance;
        const bCredits = licensingFoundation.summarizeEntitlements(b).creditBalance;
        const byCredits = bCredits - aCredits;
        if (byCredits !== 0) return byCredits;
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      })[0] ?? null;

      return {
        counts: summarizeCounts(normalizedSnapshots, licensingFoundation),
        latestSnapshotIds: latest.map((snapshot) => snapshot.snapshotId),
        latestActive: latestActive ? summarizeSnapshot(latestActive, licensingFoundation) : null,
        latestInactive: latestInactive ? summarizeSnapshot(latestInactive, licensingFoundation) : null,
        latestWithCredits: latestWithCredits ? summarizeSnapshot(latestWithCredits, licensingFoundation) : null,
        latestWithoutCredits: latestWithoutCredits ? summarizeSnapshot(latestWithoutCredits, licensingFoundation) : null,
        latestActiveWithCredits: latestActiveWithCredits ? summarizeSnapshot(latestActiveWithCredits, licensingFoundation) : null,
        latestActiveWithoutCredits: latestActiveWithoutCredits ? summarizeSnapshot(latestActiveWithoutCredits, licensingFoundation) : null,
        latestInactiveWithCredits: latestInactiveWithCredits ? summarizeSnapshot(latestInactiveWithCredits, licensingFoundation) : null,
        latestInactiveWithoutCredits: latestInactiveWithoutCredits ? summarizeSnapshot(latestInactiveWithoutCredits, licensingFoundation) : null,
        latestAccessIssue: latestAccessIssue ? summarizeSnapshot(latestAccessIssue, licensingFoundation) : null,
        highestCreditBalance: highestCreditBalance ? summarizeSnapshot(highestCreditBalance, licensingFoundation) : null,
      };
    },
  };
}
