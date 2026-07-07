import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBatchSessionStore } from "../src/catalog/batch-session-store.js";
import { createBatchSessionWorkflow } from "../src/catalog/batch-session-workflow.js";
import { createCatalogRecipeStore } from "../src/catalog/recipe-store.js";
import { createRecipe } from "../src/edit-recipe/recipe.js";

async function makeWorkflowHarness() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-batch-session-workflow-"));
  const sessionClockValues = [
    "2025-07-05T01:00:00.000Z",
    "2025-07-05T01:00:01.000Z",
  ];
  const recipeClockValues = [
    "2025-07-05T02:00:00.000Z",
    "2025-07-05T02:00:01.000Z",
    "2025-07-05T02:00:02.000Z",
    "2025-07-05T02:00:03.000Z",
    "2025-07-05T02:00:04.000Z",
  ];
  let sessionClockIndex = 0;
  let recipeClockIndex = 0;

  const sessionStore = await createBatchSessionStore({
    path: path.join(dir, "batch-sessions.json"),
    clock: () => sessionClockValues[sessionClockIndex++] ?? sessionClockValues.at(-1),
  });
  const recipeStore = await createCatalogRecipeStore({
    path: path.join(dir, "catalog.json"),
    clock: () => recipeClockValues[recipeClockIndex++] ?? recipeClockValues.at(-1),
  });

  return {
    workflow: createBatchSessionWorkflow({ sessionStore, recipeStore }),
    recipeStore,
  };
}

test("batch session workflow loads and applies a stored batch-sync session through recipe helpers", async () => {
  const { workflow, recipeStore } = await makeWorkflowHarness();

  await recipeStore.save(
    "img-source",
    createRecipe({
      operations: [
        { type: "exposure", params: { ev: 0.7 } },
        { type: "temperature", params: { kelvinDelta: 250 } },
        { type: "crop", params: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } },
      ],
    }),
  );
  await recipeStore.save(
    "img-target-b",
    createRecipe({
      operations: [
        { type: "exposure", params: { ev: -0.5 } },
        { type: "contrast", params: { amount: 12 } },
      ],
    }),
  );
  await recipeStore.save(
    "img-target-a",
    createRecipe({
      operations: [
        { type: "temperature", params: { kelvinDelta: -200 } },
        { type: "mask", params: { kind: "subject", exposure: 0.3 } },
      ],
    }),
  );

  const session = await workflow.saveBatchSession("session-hero", {
    sourceImageId: "img-source",
    includedTypes: ["temperature", "exposure"],
    targetImageIds: ["img-target-b", "img-target-a"],
  });

  const loaded = await workflow.loadBatchSession("session-hero");
  assert.deepEqual(loaded, session);

  const report = await workflow.applyBatchSessionReport("session-hero");
  assert.equal(report.sourceImageId, "img-source");
  assert.deepEqual(report.applied.map((entry) => entry.imageId), ["img-target-a", "img-target-b"]);
  assert.deepEqual(report.operation, {
    kind: "apply-batch-session",
    sessionId: "session-hero",
    sourceImageId: "img-source",
    includedTypes: ["exposure", "temperature"],
    requestedTargetImageIds: ["img-target-a", "img-target-b"],
    appliedTargetImageIds: ["img-target-a", "img-target-b"],
  });

  const result = await workflow.applyBatchSession("session-hero");
  assert.equal(result.sourceImageId, "img-source");
  assert.deepEqual(result.applied.map((entry) => entry.imageId), ["img-target-a", "img-target-b"]);

  const targetA = await recipeStore.get("img-target-a");
  const targetB = await recipeStore.get("img-target-b");

  assert.equal(targetA.revision, 3);
  assert.deepEqual(targetA.recipe.operations, [
    { type: "mask", params: { kind: "subject", exposure: 0.3 } },
    { type: "exposure", params: { ev: 0.7 } },
    { type: "temperature", params: { kelvinDelta: 250 } },
  ]);
  assert.equal(targetB.revision, 3);
  assert.deepEqual(targetB.recipe.operations, [
    { type: "contrast", params: { amount: 12 } },
    { type: "exposure", params: { ev: 0.7 } },
    { type: "temperature", params: { kelvinDelta: 250 } },
  ]);
});
