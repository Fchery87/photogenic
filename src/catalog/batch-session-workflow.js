import { copyBatchSync } from "../edit-recipe/recipe.js";

export function createBatchSessionWorkflow({ sessionStore, recipeStore } = {}) {
  if (
    !sessionStore ||
    typeof sessionStore.saveSession !== "function" ||
    typeof sessionStore.getSession !== "function"
  ) {
    throw new TypeError("sessionStore with saveSession() and getSession() is required");
  }
  if (!recipeStore || typeof recipeStore.get !== "function" || typeof recipeStore.save !== "function") {
    throw new TypeError("recipeStore with get() and save() is required");
  }

  return {
    async saveBatchSession(sessionId, payload) {
      return sessionStore.saveSession(sessionId, payload);
    },

    async loadBatchSession(sessionId) {
      return sessionStore.getSession(sessionId);
    },

    async applyBatchSession(sessionId) {
      const result = await this.applyBatchSessionReport(sessionId);
      return {
        session: result.session,
        sourceImageId: result.sourceImageId,
        applied: result.applied,
      };
    },

    async applyBatchSessionReport(sessionId) {
      const session = await sessionStore.getSession(sessionId);
      if (!session) throw new Error(`no batch session stored for sessionId: ${sessionId}`);

      const source = await recipeStore.get(session.sourceImageId);
      if (!source) throw new Error(`no recipe stored for source imageId: ${session.sourceImageId}`);

      const targets = [];
      const requestedTargetImageIds = [...session.targetImageIds];
      for (const imageId of session.targetImageIds) {
        const target = await recipeStore.get(imageId);
        if (!target) throw new Error(`no recipe stored for target imageId: ${imageId}`);
        targets.push({ imageId, target });
      }

      const applied = [];
      for (const { imageId, target } of targets) {
        const recipe = copyBatchSync(source.recipe, target.recipe, session.includedTypes);
        const saved = await recipeStore.save(imageId, recipe);
        applied.push({
          imageId,
          recipe: saved.recipe,
          recipeFingerprint: saved.recipeFingerprint,
          revision: saved.revision,
          updatedAt: saved.updatedAt,
        });
      }

      return {
        operation: {
          kind: "apply-batch-session",
          sessionId,
          sourceImageId: session.sourceImageId,
          includedTypes: [...session.includedTypes],
          requestedTargetImageIds,
          appliedTargetImageIds: applied.map((entry) => entry.imageId),
        },
        session,
        sourceImageId: session.sourceImageId,
        applied,
      };
    },
  };
}
