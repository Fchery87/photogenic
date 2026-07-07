import { createHash } from "node:crypto";
import { normalizeRecipe, recipeFingerprint } from "../edit-recipe/schema.js";

export const RENDER_ARTIFACT_VERSION = 1;

function normalizeSource(source) {
  if (!source || typeof source !== "object") throw new TypeError("source is required");
  if (typeof source.imageId !== "string" || !source.imageId) throw new TypeError("source.imageId is required");
  if (!Number.isInteger(source.width) || source.width <= 0) throw new TypeError("source.width must be a positive integer");
  if (!Number.isInteger(source.height) || source.height <= 0) throw new TypeError("source.height must be a positive integer");
  return {
    imageId: source.imageId,
    path: source.path ?? null,
    width: source.width,
    height: source.height,
    revision: source.revision ?? "v1",
    colorSpace: source.colorSpace ?? "scene-linear",
  };
}

export function computeBehaviorSignature({ source, recipe }) {
  const normalizedSource = normalizeSource(source);
  const normalizedRecipe = normalizeRecipe(recipe);
  return createHash("sha256")
    .update(
      JSON.stringify({
        source: normalizedSource,
        recipeFingerprint: recipeFingerprint(normalizedRecipe),
        operations: normalizedRecipe.operations.map((op) => ({ type: op.type, params: op.params })),
      }),
    )
    .digest("hex");
}

export function buildRenderArtifact({
  mode,
  source,
  recipe,
  generatedAt,
  proxyKey = null,
  outputName = null,
  exportOptions = null,
  renderedImage = null,
}) {
  if (mode !== "preview" && mode !== "export") throw new RangeError(`unsupported render mode: ${String(mode)}`);
  const normalizedSource = normalizeSource(source);
  const normalizedRecipe = normalizeRecipe(recipe);
  return {
    artifactVersion: RENDER_ARTIFACT_VERSION,
    mode,
    imageId: normalizedSource.imageId,
    dimensions: { width: normalizedSource.width, height: normalizedSource.height },
    colorSpace: normalizedSource.colorSpace,
    recipeFingerprint: recipeFingerprint(normalizedRecipe),
    operationTypes: normalizedRecipe.operations.map((op) => op.type),
    operationCount: normalizedRecipe.operations.length,
    proxyKey,
    outputName,
    exportOptions,
    renderedImage,
    behaviorSignature: computeBehaviorSignature({ source: normalizedSource, recipe: normalizedRecipe }),
    generatedAt: generatedAt ?? new Date().toISOString(),
  };
}
