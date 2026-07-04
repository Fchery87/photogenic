import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { applyPreset, createPresetFromRecipe } from "../edit-recipe/recipe.js";

const PRESET_STORE_VERSION = 1;
const emptyStore = () => ({ version: PRESET_STORE_VERSION, presets: {} });
const clone = (v) => JSON.parse(JSON.stringify(v));
const nowIso = () => new Date().toISOString();

function normalizePresetEntry(presetId, entry) {
  const preset = createPresetFromRecipe({
    name: entry.name,
    recipe: entry.recipe,
    includedTypes: entry.includedTypes,
    meta: entry.meta ?? {},
  });
  return {
    presetId,
    ...preset,
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : nowIso(),
  };
}

export async function createPresetStore({ path, clock = nowIso }) {
  if (typeof path !== "string" || !path) throw new TypeError("path is required");

  async function loadStore() {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8"));
      if (parsed.version !== PRESET_STORE_VERSION || !parsed.presets) {
        throw new RangeError("unsupported preset store version");
      }
      const presets = {};
      for (const [presetId, entry] of Object.entries(parsed.presets)) {
        presets[presetId] = normalizePresetEntry(presetId, entry);
      }
      return { version: PRESET_STORE_VERSION, presets };
    } catch (error) {
      if (error && error.code === "ENOENT") return emptyStore();
      throw error;
    }
  }

  async function saveStore(store) {
    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.tmp`;
    await writeFile(tempPath, JSON.stringify(store, null, 2) + "\n", "utf8");
    await rename(tempPath, path);
  }

  return {
    async savePreset(presetId, payload) {
      if (typeof presetId !== "string" || !presetId) throw new TypeError("presetId is required");
      const store = await loadStore();
      const preset = createPresetFromRecipe(payload);
      store.presets[presetId] = {
        presetId,
        ...preset,
        updatedAt: clock(),
      };
      await saveStore(store);
      return clone(store.presets[presetId]);
    },

    async getPreset(presetId) {
      const store = await loadStore();
      return store.presets[presetId] ? clone(store.presets[presetId]) : null;
    },

    async listPresetIds() {
      return Object.keys((await loadStore()).presets).sort();
    },

    async applyPreset(presetId, targetRecipe) {
      const preset = await this.getPreset(presetId);
      if (!preset) throw new Error(`no preset stored for presetId: ${presetId}`);
      return applyPreset(targetRecipe, preset);
    },
  };
}
