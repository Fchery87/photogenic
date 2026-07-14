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
  if (tauri.core && typeof tauri.core.invoke === "function") return tauri.core.invoke;
  if (typeof tauri.invoke === "function") return tauri.invoke;
  return undefined;
}

export function createTauriBridge() {
  function getInvoke() {
    return resolveInvoke();
  }

  function call(command, args) {
    const invoke = getInvoke();
    if (!invoke) {
      return Promise.reject(
        new Error(`Tauri backend not available — cannot invoke '${command}'.`),
      );
    }
    return invoke(command, args);
  }

  return {
    /** Whether invoke is currently available. Lazy — checked on each call. */
    get available() {
      return typeof getInvoke() === "function";
    },

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

    /** Update culling metadata (rating, flag, reject, color label). */
    updateCulling(imageId, updates) {
      return call("update_culling", { imageId, ...updates });
    },

    /** List all culling metadata entries. */
    listCulling() {
      return call("list_culling");
    },

    /** Export: decode → pipeline → encode (PNG/JPEG/TIFF) → write file. */
    exportImage(imageId, sourcePath, recipe, outputPath, outputFormat, quality) {
      return call("export_image", {
        imageId,
        sourcePath,
        recipe,
        outputPath,
        outputFormat: outputFormat || undefined,
        quality: quality !== undefined ? quality : undefined,
      });
    },

    /** Import source file paths into the catalog. */
    importImages(sourcePaths) {
      return call("import_images", { sourcePaths });
    },

    /** Call viewport_proof_results Tauri command. */
    callViewportProof() {
      return call("viewport_proof_results");
    },

    /** Save the viewport proof report JSON to the verification directory. */
    saveViewportProof(reportJson) {
      return call("save_viewport_proof", { reportJson });
    },
  };
}
