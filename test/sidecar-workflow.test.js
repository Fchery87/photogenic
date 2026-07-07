import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createCatalogRecipeStore } from "../src/catalog/recipe-store.js";
import { createSidecarWorkflow } from "../src/catalog/sidecar-workflow.js";

async function makeWorkflow() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-sidecar-workflow-"));
  const clockValues = [
    "2025-07-07T00:00:00.000Z",
    "2025-07-07T00:00:01.000Z",
    "2025-07-07T00:00:02.000Z",
    "2025-07-07T00:00:03.000Z",
  ];
  let i = 0;
  const recipeStore = await createCatalogRecipeStore({
    path: path.join(dir, "catalog.json"),
    clock: () => clockValues[i++] ?? clockValues.at(-1),
  });
  return { dir, recipeStore, workflow: createSidecarWorkflow({ recipeStore }) };
}

test("sidecar workflow exports a catalog recipe and reports its fingerprint", async () => {
  const { dir, recipeStore, workflow } = await makeWorkflow();
  await recipeStore.save("img-001", createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }));
  const sidecarPath = path.join(dir, "img-001.photogenic.json");
  const exported = await workflow.exportRecipe("img-001", sidecarPath);
  assert.equal(exported.imageId, "img-001");
  assert.equal(exported.revision, 1);
  assert.equal(exported.sidecar.imageId, "img-001");
  assert.equal(exported.sidecarFingerprint.length, 64);
  assert.equal(exported.sidecarFile.path, sidecarPath);
  assert.equal(exported.sidecarFile.status, "present");
  assert.ok(exported.sidecarFile.byteSize > 0);
  assert.equal(exported.sidecarLinkedAt, "2025-07-07T00:00:02.000Z");
  assert.deepEqual(exported.revisionDrift, { status: "matched", delta: 0 });
  assert.deepEqual(exported.sidecarFreshness, { status: "modified-after-link", modifiedAfterLink: true });
});

test("sidecar workflow reports in-sync when catalog and sidecar recipes match", async () => {
  const { dir, recipeStore, workflow } = await makeWorkflow();
  await recipeStore.save("img-002", createRecipe({ operations: [{ type: "contrast", params: { amount: 14 } }] }));
  const sidecarPath = path.join(dir, "img-002.photogenic.json");
  await workflow.exportRecipe("img-002", sidecarPath);
  const sync = await workflow.inspectSync("img-002", sidecarPath);
  assert.equal(sync.status, "in-sync");
  assert.equal(sync.catalogFingerprint, sync.sidecarFingerprint);
  assert.equal(sync.sidecarFile.path, sidecarPath);
  assert.equal(sync.sidecarFile.status, "present");
  assert.equal(sync.sidecarLinkedAt, "2025-07-07T00:00:02.000Z");
  assert.deepEqual(sync.revisionDrift, { status: "matched", delta: 0 });
  assert.deepEqual(sync.sidecarFreshness, { status: "modified-after-link", modifiedAfterLink: true });
});

test("sidecar workflow reports conflict when sidecar recipe differs from catalog", async () => {
  const { dir, recipeStore, workflow } = await makeWorkflow();
  await recipeStore.save("img-003", createRecipe({ operations: [{ type: "exposure", params: { ev: 0.2 } }] }));
  const sidecarPath = path.join(dir, "img-003.photogenic.json");
  await writeFile(
    sidecarPath,
    JSON.stringify({
      sidecarVersion: 1,
      imageId: "img-003",
      exportedAt: "2025-07-07T00:00:09.000Z",
      catalogRevision: 1,
      recipe: {
        version: 1,
        operations: [{ type: "exposure", params: { ev: 1.1 } }],
        meta: {},
      },
    }, null, 2) + "\n",
  );
  const sync = await workflow.inspectSync("img-003", sidecarPath);
  assert.equal(sync.status, "conflict");
  assert.equal(sync.sidecarFile.path, sidecarPath);
  assert.equal(sync.sidecarFile.status, "present");
  assert.deepEqual(sync.revisionDrift, { status: "matched", delta: 0 });
  const imported = await workflow.importRecipe("img-003", sidecarPath, { onConflict: "replace-catalog" });
  assert.equal(imported.winner, "sidecar");
  assert.equal(imported.sidecarFile.path, sidecarPath);
  assert.equal(imported.sidecarFile.status, "present");
  assert.equal(imported.sidecarLinkedAt, "2025-07-07T00:00:02.000Z");
  assert.equal(imported.sidecarFingerprint.length, 64);
  assert.deepEqual(imported.revisionDrift, { status: "catalog-newer", delta: 1 });
  assert.deepEqual(imported.sidecarFreshness, { status: "modified-after-link", modifiedAfterLink: true });
});


test("sidecar workflow reports revision drift when sidecar revision is newer than catalog", async () => {
  const { dir, recipeStore, workflow } = await makeWorkflow();
  await recipeStore.save("img-004", createRecipe({ operations: [{ type: "contrast", params: { amount: 7 } }] }));
  const sidecarPath = path.join(dir, "img-004.photogenic.json");
  await writeFile(
    sidecarPath,
    JSON.stringify({
      sidecarVersion: 1,
      imageId: "img-004",
      exportedAt: "2025-07-07T00:00:09.000Z",
      catalogRevision: 5,
      recipe: {
        version: 1,
        operations: [{ type: "contrast", params: { amount: 7 } }],
        meta: {},
      },
    }, null, 2) + "\n",
  );
  const sync = await workflow.inspectSync("img-004", sidecarPath);
  assert.equal(sync.status, "in-sync");
  assert.deepEqual(sync.revisionDrift, { status: "sidecar-newer", delta: -4 });
  assert.deepEqual(sync.sidecarFreshness, { status: "unknown", modifiedAfterLink: null });
});


test("sidecar workflow import reports metadata when a sidecar matches the catalog", async () => {
  const { dir, recipeStore, workflow } = await makeWorkflow();
  await recipeStore.save("img-005", createRecipe({ operations: [{ type: "contrast", params: { amount: 5 } }] }));
  const sidecarPath = path.join(dir, "img-005.photogenic.json");
  await workflow.exportRecipe("img-005", sidecarPath);
  const imported = await workflow.importRecipe("img-005", sidecarPath);
  assert.equal(imported.status, "in-sync");
  assert.equal(imported.winner, "catalog");
  assert.equal(imported.sidecarFile.path, sidecarPath);
  assert.equal(imported.sidecarFile.status, "present");
  assert.equal(imported.sidecarLinkedAt, "2025-07-07T00:00:03.000Z");
  assert.equal(imported.sidecarFingerprint.length, 64);
  assert.deepEqual(imported.revisionDrift, { status: "matched", delta: 0 });
  assert.deepEqual(imported.sidecarFreshness, { status: "modified-after-link", modifiedAfterLink: true });
});


test("sidecar workflow reports modified-after-link freshness when a linked sidecar file changes on disk", async () => {
  const { dir, recipeStore, workflow } = await makeWorkflow();
  await recipeStore.save("img-006", createRecipe({ operations: [{ type: "contrast", params: { amount: 11 } }] }));
  const sidecarPath = path.join(dir, "img-006.photogenic.json");
  await workflow.exportRecipe("img-006", sidecarPath);
  await writeFile(
    sidecarPath,
    JSON.stringify({
      sidecarVersion: 1,
      imageId: "img-006",
      exportedAt: "2025-07-07T00:00:09.000Z",
      catalogRevision: 1,
      recipe: {
        version: 1,
        operations: [{ type: "contrast", params: { amount: 11 } }],
        meta: {},
      },
    }, null, 2) + "\n",
  );
  const sync = await workflow.inspectSync("img-006", sidecarPath);
  assert.equal(sync.sidecarFreshness.status, "modified-after-link");
  assert.equal(sync.sidecarFreshness.modifiedAfterLink, true);
});


test("sidecar workflow report helpers return operation metadata", async () => {
  const { dir, recipeStore, workflow } = await makeWorkflow();
  await recipeStore.save("img-007", createRecipe({ operations: [{ type: "contrast", params: { amount: 13 } }] }));
  const sidecarPath = path.join(dir, "img-007.photogenic.json");

  const exported = await workflow.exportRecipeReport("img-007", sidecarPath);
  assert.deepEqual(exported.operation, {
    kind: "export-sidecar-recipe",
    imageId: "img-007",
    sidecarPath,
  });
  assert.equal(exported.exported.imageId, "img-007");

  const inspected = await workflow.inspectSyncReport("img-007", sidecarPath);
  assert.deepEqual(inspected.operation, {
    kind: "inspect-sidecar-sync",
    imageId: "img-007",
    sidecarPath,
    hasCatalogEntry: true,
  });
  assert.equal(inspected.sync.status, "in-sync");

  const imported = await workflow.importRecipeReport("img-007", sidecarPath, { onConflict: "replace-catalog" });
  assert.deepEqual(imported.operation, {
    kind: "import-sidecar-recipe",
    imageId: "img-007",
    sidecarPath,
    conflictMode: "replace-catalog",
  });
  assert.equal(imported.imported.sidecarFile.status, "present");
});
