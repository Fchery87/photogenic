import { createLicensingWorkflow } from "./workflow.js";

function ensureSessionStore(sessionStore) {
  if (
    !sessionStore ||
    typeof sessionStore.saveSnapshot !== "function" ||
    typeof sessionStore.getSnapshot !== "function" ||
    typeof sessionStore.listSnapshotIds !== "function"
  ) {
    throw new TypeError("sessionStore with saveSnapshot(), getSnapshot(), and listSnapshotIds() is required");
  }
}

function buildAccessReport(licensingWorkflow, snapshot) {
  return {
    snapshotId: snapshot.snapshotId,
    evaluatedAt: snapshot.evaluatedAt,
    ...licensingWorkflow.summarizeAccessMetadata({
      license: snapshot.license,
      credits: snapshot.credits,
    }),
    access: licensingWorkflow.summarizeAccess({
      now: snapshot.evaluatedAt,
      license: snapshot.license,
      credits: snapshot.credits,
    }),
  };
}

export function createLicensingSessionWorkflow({ licensingWorkflow = createLicensingWorkflow(), sessionStore } = {}) {
  ensureSessionStore(sessionStore);

  return {
    licensingWorkflow,

    async saveSnapshot(snapshotId, payload = {}) {
      const result = await this.saveSnapshotReport(snapshotId, payload);
      return {
        snapshot: result.snapshot,
        report: result.report,
      };
    },

    async saveSnapshotReport(snapshotId, payload = {}) {
      if (!payload || typeof payload !== "object") throw new TypeError("licensing snapshot payload is required");
      const snapshot = await sessionStore.saveSnapshot(snapshotId, payload);
      return {
        operation: {
          kind: "save-licensing-snapshot",
          snapshotId,
          hasLicense: payload.license != null,
          hasCredits: payload.credits != null,
        },
        snapshot,
        report: buildAccessReport(licensingWorkflow, snapshot),
      };
    },

    async loadSnapshot(snapshotId) {
      return sessionStore.getSnapshot(snapshotId);
    },

    async listSnapshotIds() {
      return sessionStore.listSnapshotIds();
    },

    async loadReport(snapshotId) {
      const result = await this.loadReportWithOperation(snapshotId);
      return result ? { snapshot: result.snapshot, report: result.report } : null;
    },

    async loadReportWithOperation(snapshotId) {
      const snapshot = await sessionStore.getSnapshot(snapshotId);
      if (!snapshot) return null;
      return {
        operation: {
          kind: "load-licensing-report",
          snapshotId,
        },
        snapshot,
        report: buildAccessReport(licensingWorkflow, snapshot),
      };
    },
  };
}
