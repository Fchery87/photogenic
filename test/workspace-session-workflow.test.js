import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceSessionStore } from "../src/catalog/workspace-session-store.js";
import { createWorkspaceSessionWorkflow } from "../src/catalog/workspace-session-workflow.js";
import { createLibraryStore } from "../src/catalog/library-store.js";
import { createPresetStore } from "../src/catalog/preset-store.js";
import { createBatchSessionStore } from "../src/catalog/batch-session-store.js";
import { createRecipe } from "../src/edit-recipe/recipe.js";

async function makeHarness() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-workspace-workflow-"));
  let tick = 0;
  const clock = () => `2025-07-09T00:00:0${Math.min(tick++, 9)}.000Z`;

  const sessionStore = await createWorkspaceSessionStore({ path: path.join(dir, "workspace.json"), clock });
  const libraryStore = await createLibraryStore({ path: path.join(dir, "library.json"), clock });
  const presetStore = await createPresetStore({ path: path.join(dir, "presets.json"), clock });
  const batchSessionStore = await createBatchSessionStore({ path: path.join(dir, "batch.json"), clock });

  await libraryStore.importImage({ imageId: "img-001", sourcePath: "/shoot/day1/img-001.CR3" });
  await presetStore.savePreset("warm-base", {
    name: "Warm Base",
    recipe: createRecipe({ operations: [{ type: "temperature", params: { kelvinDelta: 300 } }] }),
    includedTypes: ["temperature"],
  });
  await batchSessionStore.saveSession("session-hero", {
    sourceImageId: "img-001",
    includedTypes: ["temperature"],
    targetImageIds: ["img-001"],
  });

  const workflow = createWorkspaceSessionWorkflow({ sessionStore, libraryStore, presetStore, batchSessionStore });
  return { workflow };
}

test("workspace workflow saves and summarizes a reopen snapshot against existing references", async () => {
  const { workflow } = await makeHarness();
  const saved = await workflow.saveWorkspace("workspace-main", {
    selectedImageId: "img-001",
    activeFilter: "keepers",
    activePresetId: "warm-base",
    activeBatchSessionId: "session-hero",
    expandedImageIds: ["img-001"],
  });

  assert.equal(saved.selectedImageId, "img-001");
  const summary = await workflow.summarizeWorkspace("workspace-main");
  assert.equal(summary.snapshot.activeFilter, "keepers");
  assert.equal(summary.selectedImage.imageId, "img-001");
  assert.equal(summary.activePreset.presetId, "warm-base");
  assert.equal(summary.activeBatchSession.sessionId, "session-hero");

  const report = await workflow.summarizeWorkspaceReport("workspace-main");
  assert.deepEqual(report.operation, {
    kind: "summarize-workspace-session",
    snapshotId: "workspace-main",
    selectedImageId: "img-001",
    activePresetId: "warm-base",
    activeBatchSessionId: "session-hero",
  });
  assert.equal(report.snapshot.activeFilter, "keepers");
});

test("workspace workflow rejects snapshots that reference missing library images", async () => {
  const { workflow } = await makeHarness();
  await assert.rejects(
    () => workflow.saveWorkspace("workspace-bad", {
      selectedImageId: "missing-image",
      activeFilter: "all",
      expandedImageIds: [],
    }),
    /no library entry stored/i,
  );
});


test("workspace workflow summarizeWorkspaceReport returns null for missing snapshots", async () => {
  const { workflow } = await makeHarness();
  assert.equal(await workflow.summarizeWorkspaceReport("missing"), null);
});
