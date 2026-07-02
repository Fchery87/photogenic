import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { normalizeRecipe, recipeFingerprint } from "../edit-recipe/schema.js";
import { readSidecarFile, writeSidecarFile } from "./sidecar.js";
const STORE_FORMAT_VERSION = 1;
const emptyStore = () => ({ version: STORE_FORMAT_VERSION, images: {} });
const clone = (v) => JSON.parse(JSON.stringify(v));
const nowIso = () => new Date().toISOString();
export async function createCatalogRecipeStore({ path, clock = nowIso }) {
  if (typeof path !== "string" || !path) throw new TypeError("path is required");
  async function loadStore() {
    try { const parsed = JSON.parse(await readFile(path, "utf8")); if (parsed.version !== STORE_FORMAT_VERSION || !parsed.images) throw new RangeError("unsupported catalog store version"); return parsed; }
    catch (error) { if (error && error.code === "ENOENT") return emptyStore(); throw error; }
  }
  async function saveStore(store) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(store, null, 2) + "\n", "utf8"); }
  function toEntry(imageId, recipe, previousEntry) { const normalized = normalizeRecipe(recipe); return { imageId, recipe: normalized, recipeFingerprint: recipeFingerprint(normalized), revision: (previousEntry?.revision ?? 0) + 1, updatedAt: clock(), sidecarPath: previousEntry?.sidecarPath ?? null }; }
  return {
    async get(imageId) { const store = await loadStore(); return store.images[imageId] ? clone(store.images[imageId]) : null; },
    async save(imageId, recipe) { if (typeof imageId !== "string" || !imageId) throw new TypeError("imageId is required"); const store = await loadStore(); const entry = toEntry(imageId, recipe, store.images[imageId]); store.images[imageId] = entry; await saveStore(store); return clone(entry); },
    async listImageIds() { return Object.keys((await loadStore()).images).sort(); },
    async exportSidecar(imageId, sidecarPath) { const store = await loadStore(); const entry = store.images[imageId]; if (!entry) throw new Error(`no recipe stored for imageId: ${imageId}`); await writeSidecarFile(sidecarPath, { imageId, recipe: entry.recipe, catalogRevision: entry.revision, exportedAt: clock() }); entry.sidecarPath = sidecarPath; store.images[imageId] = entry; await saveStore(store); return { imageId, sidecarPath, revision: entry.revision }; },
    async importSidecar(imageId, sidecarPath, { onConflict = "catalog-wins" } = {}) { const sidecar = await readSidecarFile(sidecarPath); if (sidecar.imageId !== imageId) throw new Error(`sidecar imageId mismatch: expected ${imageId}, got ${sidecar.imageId}`); const store = await loadStore(); const catalogEntry = store.images[imageId] ?? null; const sidecarFingerprint = recipeFingerprint(sidecar.recipe); if (!catalogEntry) { const inserted = toEntry(imageId, sidecar.recipe, null); inserted.sidecarPath = sidecarPath; store.images[imageId] = inserted; await saveStore(store); return { status: "imported", winner: "sidecar", entry: clone(inserted) }; } if (catalogEntry.recipeFingerprint === sidecarFingerprint) { catalogEntry.sidecarPath = sidecarPath; store.images[imageId] = catalogEntry; await saveStore(store); return { status: "in-sync", winner: "catalog", entry: clone(catalogEntry) }; } if (onConflict === "replace-catalog") { const replaced = toEntry(imageId, sidecar.recipe, catalogEntry); replaced.sidecarPath = sidecarPath; store.images[imageId] = replaced; await saveStore(store); return { status: "imported", winner: "sidecar", entry: clone(replaced) }; } catalogEntry.sidecarPath = sidecarPath; store.images[imageId] = catalogEntry; await saveStore(store); return { status: "conflict", winner: "catalog", entry: clone(catalogEntry), sidecar: { imageId: sidecar.imageId, recipeFingerprint: sidecarFingerprint, catalogRevision: sidecar.catalogRevision, exportedAt: sidecar.exportedAt }, reason: "Catalog remains the source of truth. Sidecar import is explicit/manual when recipes differ." }; },
  };
}
