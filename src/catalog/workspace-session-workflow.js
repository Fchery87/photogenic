export function createWorkspaceSessionWorkflow({ sessionStore, libraryStore, presetStore = null, batchSessionStore = null } = {}) {
  if (!sessionStore || typeof sessionStore.saveSnapshot !== "function" || typeof sessionStore.getSnapshot !== "function") {
    throw new TypeError("sessionStore with saveSnapshot() and getSnapshot() is required");
  }
  if (!libraryStore || typeof libraryStore.get !== "function") {
    throw new TypeError("libraryStore with get() is required");
  }

  return {
    async saveWorkspace(snapshotId, payload) {
      if (!payload || typeof payload !== "object") throw new TypeError("workspace payload is required");

      if (payload.selectedImageId) {
        const image = await libraryStore.get(payload.selectedImageId);
        if (!image) throw new Error(`no library entry stored for imageId: ${payload.selectedImageId}`);
      }

      if (payload.activePresetId && presetStore) {
        const preset = await presetStore.getPreset(payload.activePresetId);
        if (!preset) throw new Error(`no preset stored for presetId: ${payload.activePresetId}`);
      }

      if (payload.activeBatchSessionId && batchSessionStore) {
        const session = await batchSessionStore.getSession(payload.activeBatchSessionId);
        if (!session) throw new Error(`no batch session stored for sessionId: ${payload.activeBatchSessionId}`);
      }

      return sessionStore.saveSnapshot(snapshotId, payload);
    },

    async loadWorkspace(snapshotId) {
      return sessionStore.getSnapshot(snapshotId);
    },

    async summarizeWorkspace(snapshotId) {
      const result = await this.summarizeWorkspaceReport(snapshotId);
      return result;
    },

    async summarizeWorkspaceReport(snapshotId) {
      const snapshot = await sessionStore.getSnapshot(snapshotId);
      if (!snapshot) return null;

      const selectedImage = snapshot.selectedImageId ? await libraryStore.get(snapshot.selectedImageId) : null;
      const activePreset = snapshot.activePresetId && presetStore ? await presetStore.getPreset(snapshot.activePresetId) : null;
      const activeBatchSession = snapshot.activeBatchSessionId && batchSessionStore
        ? await batchSessionStore.getSession(snapshot.activeBatchSessionId)
        : null;

      return {
        operation: {
          kind: "summarize-workspace-session",
          snapshotId,
          selectedImageId: snapshot.selectedImageId ?? null,
          activePresetId: snapshot.activePresetId ?? null,
          activeBatchSessionId: snapshot.activeBatchSessionId ?? null,
        },
        snapshot,
        selectedImage,
        activePreset,
        activeBatchSession,
      };
    },
  };
}
