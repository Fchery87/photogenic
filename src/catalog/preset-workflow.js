import { copyBatchSync } from "../edit-recipe/recipe.js";

export function createPresetWorkflow({ presetStore } = {}) {
  if (!presetStore || typeof presetStore.savePreset !== "function" || typeof presetStore.applyPreset !== "function") {
    throw new TypeError("presetStore with savePreset() and applyPreset() is required");
  }

  return {
    async savePresetFromRecipe(presetId, payload) {
      const result = await this.savePresetFromRecipeReport(presetId, payload);
      return result.preset;
    },

    async savePresetFromRecipeReport(presetId, payload) {
      const preset = await presetStore.savePreset(presetId, payload);
      return {
        operation: {
          kind: "save-preset-from-recipe",
          presetId,
          includedTypes: [...preset.includedTypes],
        },
        preset,
      };
    },

    async applyPresetToRecipe(presetId, targetRecipe) {
      const result = await this.applyPresetToRecipeReport(presetId, targetRecipe);
      return result.recipe;
    },

    async applyPresetToRecipeReport(presetId, targetRecipe) {
      const recipe = await presetStore.applyPreset(presetId, targetRecipe);
      return {
        operation: {
          kind: "apply-preset-to-recipe",
          presetId,
          operationCount: recipe.operations.length,
        },
        recipe,
      };
    },

    async batchSyncFromRecipe(sourceRecipe, targets, includedTypes) {
      const result = await this.batchSyncFromRecipeReport(sourceRecipe, targets, includedTypes);
      return result.synced;
    },

    async batchSyncFromRecipeReport(sourceRecipe, targets, includedTypes) {
      if (!Array.isArray(targets)) {
        throw new TypeError("targets must be an array of recipes");
      }
      const synced = targets.map((targetRecipe, index) => ({
        index,
        recipe: copyBatchSync(sourceRecipe, targetRecipe, includedTypes),
      }));
      return {
        operation: {
          kind: "batch-sync-from-recipe",
          targetCount: targets.length,
          includedTypes: Array.isArray(includedTypes) ? [...includedTypes].sort() : [],
          syncedIndexes: synced.map((entry) => entry.index),
        },
        synced,
      };
    },
  };
}
