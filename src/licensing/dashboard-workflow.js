import { createLicensingDashboardFoundation } from "./dashboard-foundation.js";

export function createLicensingDashboardWorkflow({
  sessionStore,
  dashboardFoundation = createLicensingDashboardFoundation(),
} = {}) {
  if (!sessionStore || typeof sessionStore.getSnapshot !== "function" || typeof sessionStore.listSnapshotIds !== "function") {
    throw new TypeError("sessionStore with getSnapshot() and listSnapshotIds() is required");
  }
  if (!dashboardFoundation || typeof dashboardFoundation.summarizeSnapshots !== "function") {
    throw new TypeError("dashboardFoundation with summarizeSnapshots() is required");
  }

  return {
    dashboardFoundation,

    async summarizeSnapshots() {
      const result = await this.summarizeSnapshotsReport();
      return result.summary;
    },

    async summarizeSnapshotsReport() {
      const snapshotIds = await sessionStore.listSnapshotIds();
      const snapshots = [];
      const processedSnapshotIds = [];
      const skippedSnapshotIds = [];
      for (const snapshotId of snapshotIds) {
        const snapshot = await sessionStore.getSnapshot(snapshotId);
        if (snapshot) {
          snapshots.push(snapshot);
          processedSnapshotIds.push(snapshotId);
        } else {
          skippedSnapshotIds.push(snapshotId);
        }
      }

      return {
        operation: {
          kind: "summarize-licensing-snapshots",
          requestedSnapshotIds: snapshotIds,
          processedSnapshotIds,
          skippedSnapshotIds,
        },
        summary: dashboardFoundation.summarizeSnapshots(snapshots),
      };
    },
  };
}
