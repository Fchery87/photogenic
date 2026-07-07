import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createProxyDescriptor } from "../src/preview/proxy.js";
import { createProxyCache } from "../src/preview/proxy-cache.js";

const source = { imageId: "img-001", width: 6000, height: 4000, revision: "raw-v1", colorSpace: "scene-linear" };

function descriptor(recipe, viewport) {
  return createProxyDescriptor({ source, recipe, viewport });
}

test("proxy cache stores descriptors with deterministic invalidation inputs", () => {
  const cache = createProxyCache({ maxEntries: 2, clock: () => "2025-07-01T00:00:00.000Z" });
  const record = cache.put(descriptor(createRecipe(), { width: 1200, height: 800 }), "/tmp/proxy-a.jpg");
  assert.equal(record.filePath, "/tmp/proxy-a.jpg");
  assert.equal(record.invalidationInputs.imageId, "img-001");
  assert.equal(record.viewport.width, 1200);
});

test("proxy cache evicts the least recently used entry when capacity is exceeded", () => {
  let tick = 0;
  const cache = createProxyCache({ maxEntries: 2, clock: () => `2025-07-01T00:00:0${tick++}.000Z` });
  const a = descriptor(createRecipe(), { width: 1200, height: 800 });
  const b = descriptor(createRecipe({ operations: [{ type: "contrast", params: { amount: 4 } }] }), { width: 1200, height: 800 });
  const c = descriptor(createRecipe({ operations: [{ type: "temperature", params: { kelvinDelta: 100 } }] }), { width: 1200, height: 800 });
  cache.put(a, "/tmp/a.jpg");
  cache.put(b, "/tmp/b.jpg");
  cache.get(a.proxyKey);
  cache.put(c, "/tmp/c.jpg");
  assert.equal(cache.get(b.proxyKey), null);
  assert.ok(cache.get(a.proxyKey));
  assert.ok(cache.get(c.proxyKey));
});

test("proxy cache can invalidate entries by source revision or recipe fingerprint", () => {
  const cache = createProxyCache({ maxEntries: 3, clock: () => "2025-07-01T00:00:00.000Z" });
  const base = descriptor(createRecipe(), { width: 1200, height: 800 });
  const warmer = descriptor(createRecipe({ operations: [{ type: "temperature", params: { kelvinDelta: 100 } }] }), { width: 1200, height: 800 });
  cache.put(base, "/tmp/base.jpg");
  cache.put(warmer, "/tmp/warmer.jpg");
  const removed = cache.invalidateWhere((record) => record.recipeFingerprint === base.recipeFingerprint);
  assert.equal(removed, 1);
  assert.equal(cache.get(base.proxyKey), null);
  assert.ok(cache.get(warmer.proxyKey));
});
