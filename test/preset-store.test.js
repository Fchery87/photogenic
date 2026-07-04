import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe, PRESET_ALLOWED_OPERATION_TYPES } from "../src/edit-recipe/recipe.js";
import { createPresetStore } from "../src/catalog/preset-store.js";

async function makeTempPresetStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preset-"));
  return createPresetStore({ path: path.join(dir, "presets.json") });
}

test("preset store saves and loads a source-independent preset", async () => {
  const store = await makeTempPresetStore();
  const saved = await store.savePreset("studio-base", {
    name: "Studio Base",
    recipe: createRecipe({
      operations: [
        { type: "exposure", params: { ev: 0.3 } },
        { type: "temperature", params: { kelvinDelta: 200 } },
      ],
    }),
  });
  const loaded = await store.getPreset("studio-base");
  assert.equal(saved.name, "Studio Base");
  assert.deepEqual(loaded.includedTypes, [...PRESET_ALLOWED_OPERATION_TYPES]);
  assert.deepEqual(loaded.recipe.operations.map((op) => op.type), ["exposure", "temperature"]);
});

test("preset store rejects source-dependent operations in presets", async () => {
  const store = await makeTempPresetStore();
  await assert.rejects(
    () => store.savePreset("bad", {
      name: "Bad",
      recipe: createRecipe({ operations: [{ type: "crop", params: { x: 0, y: 0, w: 1, h: 1 } }] }),
      includedTypes: ["crop"],
    }),
    /unsupported type/i,
  );
});

test("applying a stored preset replaces only covered operation types", async () => {
  const store = await makeTempPresetStore();
  await store.savePreset("warm-base", {
    name: "Warm Base",
    recipe: createRecipe({ operations: [{ type: "temperature", params: { kelvinDelta: 250 } }] }),
    includedTypes: ["temperature"],
  });
  const target = createRecipe({
    operations: [
      { type: "temperature", params: { kelvinDelta: -100 } },
      { type: "crop", params: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } },
    ],
  });
  const applied = await store.applyPreset("warm-base", target);
  assert.deepEqual(applied.operations, [
    { type: "crop", params: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } },
    { type: "temperature", params: { kelvinDelta: 250 } },
  ]);
});
