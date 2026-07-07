import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createPresetStore } from "../src/catalog/preset-store.js";
import { createPresetWorkflow } from "../src/catalog/preset-workflow.js";

async function makeWorkflow() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preset-workflow-"));
  const presetStore = await createPresetStore({ path: path.join(dir, "presets.json") });
  return createPresetWorkflow({ presetStore });
}

test("preset workflow saves a preset from a source recipe and reapplies it to a target recipe", async () => {
  const workflow = await makeWorkflow();
  await workflow.savePresetFromRecipe("warm-base", {
    name: "Warm Base",
    recipe: createRecipe({
      operations: [{ type: "temperature", params: { kelvinDelta: 300 } }],
    }),
    includedTypes: ["temperature"],
  });

  const applied = await workflow.applyPresetToRecipe(
    "warm-base",
    createRecipe({
      operations: [
        { type: "temperature", params: { kelvinDelta: -100 } },
        { type: "crop", params: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } },
      ],
    }),
  );

  assert.deepEqual(applied.operations, [
    { type: "crop", params: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } },
    { type: "temperature", params: { kelvinDelta: 300 } },
  ]);
});

test("preset workflow batch-syncs selected operations across multiple targets", async () => {
  const workflow = await makeWorkflow();
  const sourceRecipe = createRecipe({
    operations: [
      { type: "exposure", params: { ev: 0.4 } },
      { type: "contrast", params: { amount: 10 } },
      { type: "crop", params: { x: 0, y: 0, w: 1, h: 1 } },
    ],
  });
  const targets = [
    createRecipe({ operations: [{ type: "temperature", params: { kelvinDelta: 120 } }] }),
    createRecipe({ operations: [{ type: "shadows", params: { amount: -8 } }] }),
  ];

  const synced = await workflow.batchSyncFromRecipe(sourceRecipe, targets, ["exposure", "contrast"]);

  assert.equal(synced.length, 2);
  assert.deepEqual(synced[0].recipe.operations, [
    { type: "temperature", params: { kelvinDelta: 120 } },
    { type: "exposure", params: { ev: 0.4 } },
    { type: "contrast", params: { amount: 10 } },
  ]);
  assert.deepEqual(synced[1].recipe.operations, [
    { type: "shadows", params: { amount: -8 } },
    { type: "exposure", params: { ev: 0.4 } },
    { type: "contrast", params: { amount: 10 } },
  ]);
});


test("preset workflow report helpers return operation metadata", async () => {
  const workflow = await makeWorkflow();
  const saved = await workflow.savePresetFromRecipeReport("warm-base", {
    name: "Warm Base",
    recipe: createRecipe({
      operations: [{ type: "temperature", params: { kelvinDelta: 300 } }],
    }),
    includedTypes: ["temperature"],
  });
  assert.deepEqual(saved.operation, {
    kind: "save-preset-from-recipe",
    presetId: "warm-base",
    includedTypes: ["temperature"],
  });

  const applied = await workflow.applyPresetToRecipeReport(
    "warm-base",
    createRecipe({
      operations: [
        { type: "temperature", params: { kelvinDelta: -100 } },
        { type: "crop", params: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } },
      ],
    }),
  );
  assert.deepEqual(applied.operation, {
    kind: "apply-preset-to-recipe",
    presetId: "warm-base",
    operationCount: 2,
  });

  const synced = await workflow.batchSyncFromRecipeReport(
    createRecipe({
      operations: [
        { type: "exposure", params: { ev: 0.4 } },
        { type: "contrast", params: { amount: 10 } },
      ],
    }),
    [
      createRecipe({ operations: [{ type: "temperature", params: { kelvinDelta: 120 } }] }),
      createRecipe({ operations: [{ type: "shadows", params: { amount: -8 } }] }),
    ],
    ["contrast", "exposure"],
  );
  assert.deepEqual(synced.operation, {
    kind: "batch-sync-from-recipe",
    targetCount: 2,
    includedTypes: ["contrast", "exposure"],
    syncedIndexes: [0, 1],
  });
  assert.equal(synced.synced.length, 2);
});
