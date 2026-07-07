import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { normalizeRecipe } from "../edit-recipe/schema.js";
export const SIDECAR_SCHEMA_VERSION = 1;
export function serializeSidecar({ imageId, recipe, exportedAt, catalogRevision }) {
  if (typeof imageId !== "string" || !imageId) throw new TypeError("imageId is required");
  return JSON.stringify({ sidecarVersion: SIDECAR_SCHEMA_VERSION, imageId, exportedAt: exportedAt ?? new Date().toISOString(), catalogRevision: Number.isInteger(catalogRevision) ? catalogRevision : 0, recipe: normalizeRecipe(recipe) }, null, 2) + "\n";
}
export function parseSidecar(text) {
  const parsed = JSON.parse(text);
  if (parsed.sidecarVersion !== SIDECAR_SCHEMA_VERSION) throw new RangeError(`unsupported sidecar version: ${String(parsed.sidecarVersion)}`);
  if (typeof parsed.imageId !== "string" || !parsed.imageId) throw new TypeError("sidecar imageId is required");
  return { sidecarVersion: SIDECAR_SCHEMA_VERSION, imageId: parsed.imageId, exportedAt: parsed.exportedAt, catalogRevision: Number.isInteger(parsed.catalogRevision) ? parsed.catalogRevision : 0, recipe: normalizeRecipe(parsed.recipe) };
}
export const writeSidecarFile = async (p, payload) => { await mkdir(dirname(p), { recursive: true }); await writeFile(p, serializeSidecar(payload), "utf8"); };
export const readSidecarFile = async (p) => parseSidecar(await readFile(p, "utf8"));

export async function readSidecarFileMetadata(p) {
  try {
    const file = await stat(p);
    return {
      path: p,
      status: "present",
      byteSize: Number.isInteger(file.size) ? file.size : null,
      modifiedAt: file.mtime instanceof Date && !Number.isNaN(file.mtime.valueOf()) ? file.mtime.toISOString() : null,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        path: p,
        status: "missing",
        byteSize: null,
        modifiedAt: null,
      };
    }
    throw error;
  }
}
