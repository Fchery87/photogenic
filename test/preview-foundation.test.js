import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createPreviewFoundation } from "../src/preview/foundation.js";
import { createProxyDescriptor } from "../src/preview/proxy.js";

const source = { imageId: "img-001", width: 6000, height: 4000, revision: "raw-v1", colorSpace: "scene-linear" };

test("proxy keys change when recipe or viewport changes", () => {
  const baseRecipe = createRecipe({ operations: [{ type: "exposure", params: { ev: 0.2 } }] });
  const warmerRecipe = createRecipe({ operations: [{ type: "temperature", params: { kelvinDelta: 300 } }] });
  const a = createProxyDescriptor({ source, recipe: baseRecipe, viewport: { width: 1200, height: 800 } });
  const b = createProxyDescriptor({ source, recipe: warmerRecipe, viewport: { width: 1200, height: 800 } });
  const c = createProxyDescriptor({ source, recipe: baseRecipe, viewport: { width: 1600, height: 900 } });
  assert.notEqual(a.proxyKey, b.proxyKey);
  assert.notEqual(a.proxyKey, c.proxyKey);
});

test("preview requests transition from queued to ready with deterministic artifacts", () => {
  const foundation = createPreviewFoundation({ clock: () => "2025-07-01T00:00:00.000Z" });
  const recipe = createRecipe({ operations: [{ type: "contrast", params: { amount: 12 } }] });
  const request = foundation.createRequest({ source, recipe, viewport: { width: 1200, height: 800 } });
  assert.equal(request.status, "queued");
  const resolved = foundation.fulfillRequest(request);
  assert.equal(resolved.status, "ready");
  assert.equal(resolved.previewArtifact.mode, "preview");
  assert.equal(resolved.previewArtifact.proxyKey, request.proxy.proxyKey);
  assert.equal(resolved.previewArtifact.behaviorSignature.length, 64);
});
