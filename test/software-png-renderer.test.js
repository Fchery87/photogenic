import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { renderDeterministicSoftwarePng } from "../src/pipeline/software-png-renderer.js";

const source = {
  imageId: "img-001",
  path: "/shoots/day1/hero-image.CR3",
  width: 6000,
  height: 4000,
  revision: "raw-v1",
  colorSpace: "scene-linear",
};

test("software png renderer returns deterministic png bytes and metadata", () => {
  const recipe = createRecipe({ operations: [{ type: "contrast", params: { amount: 12 } }] });
  const first = renderDeterministicSoftwarePng({ source, recipe, width: 320, height: 200 });
  const second = renderDeterministicSoftwarePng({ source, recipe, width: 320, height: 200 });

  assert.deepEqual(first.bytes, second.bytes);
  assert.deepEqual(first.descriptor, second.descriptor);
  assert.deepEqual(first.bytes.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal(first.descriptor.kind, "image/png");
  assert.equal(first.descriptor.status, "rendered-image");
  assert.equal(first.descriptor.width, 320);
  assert.equal(first.descriptor.height, 200);
  assert.match(first.descriptor.note, /real image file/i);
});
