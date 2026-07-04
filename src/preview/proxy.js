import { createHash } from "node:crypto";
import { recipeFingerprint } from "../edit-recipe/schema.js";

export function createProxyDescriptor({ source, recipe, viewport }) {
  if (!source || typeof source !== "object") throw new TypeError("source is required");
  if (!viewport || typeof viewport !== "object") throw new TypeError("viewport is required");
  const width = viewport.width;
  const height = viewport.height;
  if (!Number.isInteger(width) || width <= 0) throw new TypeError("viewport.width must be a positive integer");
  if (!Number.isInteger(height) || height <= 0) throw new TypeError("viewport.height must be a positive integer");
  const fingerprint = recipeFingerprint(recipe);
  const invalidationInputs = {
    imageId: source.imageId,
    sourceRevision: source.revision ?? "v1",
    viewport: { width, height },
    recipeFingerprint: fingerprint,
  };
  const proxyKey = createHash("sha256").update(JSON.stringify(invalidationInputs)).digest("hex");
  return {
    proxyKey,
    invalidationInputs,
    viewport: { width, height },
    recipeFingerprint: fingerprint,
  };
}
