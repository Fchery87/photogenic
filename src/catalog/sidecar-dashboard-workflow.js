import { createSidecarDashboardFoundation } from "./sidecar-dashboard-foundation.js";

export function createSidecarDashboardWorkflow({
  recipeStore,
  sidecarWorkflow,
  dashboardFoundation = createSidecarDashboardFoundation(),
} = {}) {
  if (!recipeStore || typeof recipeStore.listImageIds !== "function" || typeof recipeStore.get !== "function") {
    throw new TypeError("recipeStore with listImageIds() and get() is required");
  }
  if (!sidecarWorkflow || typeof sidecarWorkflow.inspectSync !== "function") {
    throw new TypeError("sidecarWorkflow with inspectSync() is required");
  }
  if (!dashboardFoundation || typeof dashboardFoundation.summarizeSavedSyncStates !== "function") {
    throw new TypeError("dashboardFoundation with summarizeSavedSyncStates() is required");
  }

  return {
    dashboardFoundation,

    async summarizeSavedSyncStates() {
      const result = await this.summarizeSavedSyncStatesReport();
      return result.summary;
    },

    async summarizeSavedSyncStatesReport() {
      const imageIds = await recipeStore.listImageIds();
      const entries = [];
      for (const imageId of imageIds) {
        const entry = await recipeStore.get(imageId);
        if (entry) entries.push(entry);
      }

      const linked = entries.filter((entry) => typeof entry.sidecarPath === "string" && entry.sidecarPath);
      const requestedImageIds = linked.map((entry) => entry.imageId);
      const syncStates = [];
      const processedImageIds = [];
      const missingSidecarImageIds = [];

      for (const entry of linked) {
        try {
          const sync = await sidecarWorkflow.inspectSync(entry.imageId, entry.sidecarPath);
          syncStates.push({
            imageId: entry.imageId,
            sidecarPath: entry.sidecarPath,
            updatedAt: entry.updatedAt,
            sidecarLinkedAt: entry.sidecarLinkedAt ?? null,
            ...sync,
          });
          processedImageIds.push(entry.imageId);
        } catch (error) {
          if (error && error.code === "ENOENT") {
            syncStates.push({
              imageId: entry.imageId,
              sidecarPath: entry.sidecarPath,
              updatedAt: entry.updatedAt,
              sidecarLinkedAt: entry.sidecarLinkedAt ?? null,
              status: "missing-sidecar",
              catalogFingerprint: entry.recipeFingerprint,
              sidecarFingerprint: null,
              catalogRevision: entry.revision,
              sidecarRevision: null,
              sidecarFile: {
                path: entry.sidecarPath,
                status: "missing",
                byteSize: null,
                modifiedAt: null,
              },
              revisionDrift: {
                status: "unknown",
                delta: null,
              },
              sidecarFreshness: {
                status: "missing",
                modifiedAfterLink: null,
              },
            });
            processedImageIds.push(entry.imageId);
            missingSidecarImageIds.push(entry.imageId);
            continue;
          }
          throw error;
        }
      }

      return {
        operation: {
          kind: "summarize-saved-sidecar-sync-states",
          requestedImageIds,
          processedImageIds,
          missingSidecarImageIds,
          skippedImageIds: imageIds.filter((imageId) => !requestedImageIds.includes(imageId)),
        },
        summary: dashboardFoundation.summarizeSavedSyncStates({ entries, syncStates }),
      };
    },
  };
}
