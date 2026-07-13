/**
 * Tauri command bridge for the editor UI (Issue 12).
 *
 * Wraps the Tauri `invoke()` IPC so the editor's JS code doesn't depend on the
 * Tauri global directly. When Tauri is not available (browser/Node/test), the
 * bridge reports `available: false` and all methods reject with a clear error,
 * so the UI can show an honest "backend disconnected" state.
 */

function resolveInvoke() {
  const tauri = typeof globalThis !== "undefined" ? globalThis.__TAURI__ : undefined;
  if (!tauri) return undefined;
  // Tauri v2 exposes invoke at __TAURI__.core.invoke
  if (tauri.core && typeof tauri.core.invoke === "function") return tauri.core.invoke;
  // Tauri v1 fallback
  if (typeof tauri.invoke === "function") return tauri.invoke;
  return undefined;
}

export function createTauriBridge() {
  const invoke = resolveInvoke();
  const available = typeof invoke === "function";

  function call(command, args) {
    if (!available) {
      return Promise.reject(
        new Error(`Tauri backend not available — cannot invoke '${command}'.`),
      );
    }
    return invoke(command, args);
  }

  return {
    available,

    /** List all imported images from the SQLite catalog. */
    listLibrary() {
      return call("list_library");
    },

    /** Get the saved recipe for an image (or null if none). */
    getRecipe(imageId) {
      return call("get_recipe", { imageId });
    },

    /** Save a recipe for an image. Returns the saved entry with revision. */
    saveRecipe(imageId, recipe, updatedAt) {
      return call("save_recipe", { imageId, recipe, updatedAt });
    },

    /** Render a preview/export through the native pipeline. */
    renderPipeline(request) {
      return call("render_pipeline", request);
    },

    /** Detect GPU/CPU pipeline capabilities. */
    pipelineCapabilities() {
      return call("pipeline_capabilities");
    },

    /** Import source files into the catalog. */
    importSources(request) {
      return call("import_sources", request);
    },

    /** List all saved presets from the catalog. */
    listPresets() {
      return call("list_presets");
    },

    /** Save a source-independent preset. */
    savePreset(presetId, name, recipe) {
      return call("save_preset", { presetId, name, recipe });
    },

    /** Get the saved workspace state (for reopen). */
    getWorkspaceState(workspaceId) {
      return call("get_workspace_state", { workspaceId });
    },

    /** Save the workspace state (selected image, active filter, etc.). */
    saveWorkspaceState(workspaceId, stateJson) {
      return call("save_workspace_state", { workspaceId, stateJson });
    },

    /** Batch sync: copy selected operation types from source to all images. */
    batchSync(sourceImageId, operationTypes) {
      return call("batch_sync", { sourceImageId, operationTypes });
    },

    /** Apply a preset to an image with full recipe validation. */
    applyPreset(presetId, targetImageId) {
      return call("apply_preset", { presetId, targetImageId });
    },

    /** Check licensing state (criterion 9: export gating). */
    checkLicense() {
      return call("check_license");
    },
  };
}
