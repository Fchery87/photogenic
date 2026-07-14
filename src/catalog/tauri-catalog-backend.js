/**
 * Tauri catalog backend (Issue 11).
 *
 * Implements the `catalogBackend` interface using Tauri invoke commands
 * so the JS store factories can run against the Rust SQLite store.
 *
 * Each backend is bound to a store type and a Tauri bridge, providing
 * `loadStore()` → Tauri invoke and `saveStore()` → Tauri invoke.
 */

export function createTauriCatalogBackend(bridge) {
  if (!bridge || !bridge.available) {
    throw new Error("Tauri bridge is not available for catalog backend");
  }

  return {
    recipe: createRecipeBackend(bridge),
    library: createLibraryBackend(bridge),
    preset: createPresetBackend(bridge),
    workspace: createWorkspaceBackend(bridge),
  };
}

function createRecipeBackend(bridge) {
  return {
    async loadStore() {
      try {
        const all = await bridge.listLibrary();
        const recipes = {};
        for (const entry of all || []) {
          if (entry.recipe) {
            recipes[entry.image_id] = {
              recipe: entry.recipe,
              recipeFingerprint: entry.recipeFingerprint || "",
              revision: entry.revision || 1,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt,
            };
          }
        }
        return { recipes };
      } catch {
        return { recipes: {} };
      }
    },

    async saveStore(store) {
      for (const [imageId, entry] of Object.entries(store.recipes || {})) {
        try {
          await bridge.saveRecipe(
            imageId,
            entry.recipe,
            entry.updatedAt,
          );
        } catch {
          // Best-effort save per entry
        }
      }
    },
  };
}

function createLibraryBackend(bridge) {
  return {
    async loadStore() {
      try {
        const images = await bridge.listLibrary();
        return {
          images: (images || []).map((img) => ({
            image_id: img.image_id || img.imageId,
            source_path: img.source_path || img.sourcePath,
            file_size: img.file_size || img.fileSize || 0,
            modified_at: img.modified_at || img.modifiedAt,
            format: img.format || "unknown",
            rating: img.rating ?? 0,
            flagged: img.flagged ?? false,
            rejected: img.rejected ?? false,
            color_label: img.color_label || img.colorLabel || "",
          })),
        };
      } catch {
        return { images: [] };
      }
    },

    async saveStore(store) {
      for (const img of store.images || []) {
        try {
          await bridge.updateCulling(img.image_id, {
            rating: img.rating,
            flagged: img.flagged,
            rejected: img.rejected,
            colorLabel: img.color_label || img.colorLabel,
          });
        } catch {
          // Best-effort save per entry
        }
      }
    },
  };
}

function createPresetBackend(bridge) {
  return {
    async loadStore() {
      try {
        const presets = await bridge.listPresets();
        return { presets: presets || [] };
      } catch {
        return { presets: [] };
      }
    },

    async saveStore(store) {
      for (const preset of store.presets || []) {
        try {
          await bridge.savePreset(
            preset.id || preset.presetId,
            preset.name,
            preset.recipe || preset.operations,
          );
        } catch {
          // Best-effort save per preset
        }
      }
    },
  };
}

function createWorkspaceBackend(bridge) {
  const WORKSPACE_ID = "default";

  return {
    async loadStore() {
      try {
        const state = await bridge.getWorkspaceState(WORKSPACE_ID);
        if (state) return state;
      } catch {
        // missing state is fine
      }
      return { workspaceId: WORKSPACE_ID, selectedImageId: null };
    },

    async saveStore(store) {
      try {
        await bridge.saveWorkspaceState(
          WORKSPACE_ID,
          JSON.stringify(store),
        );
      } catch {
        // Best-effort save
      }
    },
  };
}
