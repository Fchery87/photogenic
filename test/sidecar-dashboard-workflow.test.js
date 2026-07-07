import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createCatalogRecipeStore } from "../src/catalog/recipe-store.js";
import { createSidecarWorkflow } from "../src/catalog/sidecar-workflow.js";
import { createSidecarDashboardWorkflow } from "../src/catalog/sidecar-dashboard-workflow.js";

async function makeHarness() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-sidecar-dashboard-"));
  const clockValues = [
    "2025-07-20T00:00:00.000Z",
    "2025-07-20T00:00:01.000Z",
    "2025-07-20T00:00:02.000Z",
    "2025-07-20T00:00:03.000Z",
    "2025-07-20T00:00:04.000Z",
    "2025-07-20T00:00:05.000Z",
    "2025-07-20T00:00:06.000Z",
    "2025-07-20T00:00:07.000Z",
    "2025-07-20T00:00:08.000Z",
    "2025-07-20T00:00:09.000Z",
  ];
  let i = 0;
  const recipeStore = await createCatalogRecipeStore({
    path: path.join(dir, "catalog.json"),
    clock: () => clockValues[i++] ?? clockValues.at(-1),
  });
  const sidecarWorkflow = createSidecarWorkflow({ recipeStore });
  return {
    dir,
    recipeStore,
    sidecarWorkflow,
    dashboardWorkflow: createSidecarDashboardWorkflow({ recipeStore, sidecarWorkflow }),
  };
}

test("sidecar dashboard workflow summarizes saved sync states across images", async () => {
  const { dir, recipeStore, sidecarWorkflow, dashboardWorkflow } = await makeHarness();

  await recipeStore.save("img-unsaved", createRecipe({ operations: [{ type: "contrast", params: { amount: 2 } }] }));

  await recipeStore.save("img-sync", createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }));
  await sidecarWorkflow.exportRecipe("img-sync", path.join(dir, "img-sync.photogenic.json"));

  await recipeStore.save("img-conflict", createRecipe({ operations: [{ type: "exposure", params: { ev: 0.2 } }] }));
  const conflictPath = path.join(dir, "img-conflict.photogenic.json");
  await writeFile(
    conflictPath,
    JSON.stringify({
      sidecarVersion: 1,
      imageId: "img-conflict",
      exportedAt: "2025-07-20T01:00:00.000Z",
      catalogRevision: 1,
      recipe: {
        version: 1,
        operations: [{ type: "exposure", params: { ev: 1.1 } }],
        meta: {},
      },
    }, null, 2) + "\n",
  );
  await sidecarWorkflow.importRecipe("img-conflict", conflictPath);

  await recipeStore.save("img-missing", createRecipe({ operations: [{ type: "contrast", params: { amount: 9 } }] }));
  const missingPath = path.join(dir, "img-missing.photogenic.json");
  await sidecarWorkflow.exportRecipe("img-missing", missingPath);
  await rm(missingPath);

  await recipeStore.save("img-sidecar-newer", createRecipe({ operations: [{ type: "contrast", params: { amount: 7 } }] }));
  const sidecarNewerPath = path.join(dir, "img-sidecar-newer.photogenic.json");
  await writeFile(
    sidecarNewerPath,
    JSON.stringify({
      sidecarVersion: 1,
      imageId: "img-sidecar-newer",
      exportedAt: "2025-07-20T01:00:01.000Z",
      catalogRevision: 5,
      recipe: {
        version: 1,
        operations: [{ type: "contrast", params: { amount: 7 } }],
        meta: {},
      },
    }, null, 2) + "\n",
  );
  await sidecarWorkflow.importRecipe("img-sidecar-newer", sidecarNewerPath);

  const summary = await dashboardWorkflow.summarizeSavedSyncStates();

  assert.deepEqual(summary.counts, {
    totalImages: 5,
    withSavedSidecars: 4,
    withoutSavedSidecars: 1,
    withLinkedTimestamp: 4,
    withoutLinkedTimestamp: 0,
    inSync: 2,
    conflicts: 1,
    missingSidecars: 1,
    syncIssues: 2,
    withObservedSidecarFile: 3,
    withMissingObservedSidecarFile: 1,
    withMatchedRevision: 2,
    withCatalogNewerRevision: 0,
    withSidecarNewerRevision: 1,
    withUnknownRevisionDrift: 1,
    withRevisionIssue: 2,
    unchangedSinceLink: 0,
    modifiedAfterLink: 3,
    missingSinceLink: 1,
    unknownFreshness: 0,
    withFreshnessIssue: 4,
  });
  assert.deepEqual(summary.savedSidecarFiles, {
    byteSizeTotal: 891,
    withKnownByteSize: 3,
    withKnownModifiedAt: 3,
    latestModifiedAt: summary.latestSidecarNewerRevision.sidecarFile.modifiedAt,
  });
  assert.deepEqual(summary.linkedTimeline, {
    withLinkedAt: 4,
    withoutLinkedAt: 0,
    earliestLinkedAt: "2025-07-20T00:00:03.000Z",
    latestLinkedAt: "2025-07-20T00:00:09.000Z",
    spanMs: 6000,
    spanStatus: "range",
  });
  assert.deepEqual(summary.latestImageIds, ["img-sidecar-newer", "img-missing", "img-conflict", "img-sync", "img-unsaved"]);
  assert.deepEqual(summary.latestLinkedImageIds, ["img-sidecar-newer", "img-missing", "img-conflict", "img-sync"]);
  assert.equal(summary.earliestLinkedWithTimestamp.imageId, "img-sync");
  assert.equal(summary.latestLinkedWithTimestamp.imageId, "img-sidecar-newer");
  assert.equal(summary.latestLinkedWithoutTimestamp, null);
  assert.equal(summary.latestInSync.imageId, "img-sidecar-newer");
  assert.equal(summary.latestInSync.status, "in-sync");
  assert.equal(summary.latestSyncIssue.imageId, "img-missing");
  assert.equal(summary.latestSyncIssue.status, "missing-sidecar");
  assert.equal(summary.latestInSync.sidecarFile.status, "present");
  assert.deepEqual(summary.latestInSync.revisionDrift, { status: "sidecar-newer", delta: -4 });
  assert.equal(summary.latestMatchedRevision.imageId, "img-conflict");
  assert.deepEqual(summary.latestMatchedRevision.revisionDrift, { status: "matched", delta: 0 });
  assert.equal(summary.latestRevisionIssue.imageId, "img-sidecar-newer");
  assert.deepEqual(summary.latestRevisionIssue.revisionDrift, { status: "sidecar-newer", delta: -4 });
  assert.equal(summary.latestConflict.imageId, "img-conflict");
  assert.equal(summary.latestConflict.status, "conflict");
  assert.equal(summary.latestConflict.sidecarFile.status, "present");
  assert.deepEqual(summary.latestConflict.revisionDrift, { status: "matched", delta: 0 });
  assert.equal(summary.latestMissingSidecar.imageId, "img-missing");
  assert.equal(summary.latestMissingSidecar.status, "missing-sidecar");
  assert.equal(summary.latestObservedSidecarFile.imageId, "img-sidecar-newer");
  assert.equal(summary.latestObservedSidecarFile.sidecarFile.status, "present");
  assert.equal(summary.latestMissingObservedSidecarFile.imageId, "img-missing");
  assert.equal(summary.latestMissingObservedSidecarFile.sidecarFile.status, "missing");
  assert.equal(summary.largestObservedSidecarFile.imageId, "img-sidecar-newer");
  assert.equal(summary.largestObservedSidecarFile.sidecarFile.byteSize, 303);
  assert.equal(summary.latestMissingSidecar.sidecarFingerprint, null);
  assert.equal(summary.latestMissingSidecar.sidecarFile.status, "missing");
  assert.deepEqual(summary.latestMissingSidecar.revisionDrift, { status: "unknown", delta: null });
  assert.equal(summary.latestCatalogNewerRevision, null);
  assert.equal(summary.latestSidecarNewerRevision.imageId, "img-sidecar-newer");
  assert.deepEqual(summary.latestSidecarNewerRevision.revisionDrift, { status: "sidecar-newer", delta: -4 });
  assert.equal(summary.latestUnknownRevisionDrift.imageId, "img-missing");
  assert.deepEqual(summary.latestUnknownRevisionDrift.revisionDrift, { status: "unknown", delta: null });
  assert.equal(summary.latestUnchangedSinceLink, null);
  assert.equal(summary.latestFreshnessIssue.imageId, "img-sidecar-newer");
  assert.deepEqual(summary.latestFreshnessIssue.sidecarFreshness, { status: "modified-after-link", modifiedAfterLink: true });
  assert.equal(summary.latestModifiedAfterLink.imageId, "img-sidecar-newer");
  assert.deepEqual(summary.latestModifiedAfterLink.sidecarFreshness, { status: "modified-after-link", modifiedAfterLink: true });
  assert.equal(summary.latestMissingSinceLink.imageId, "img-missing");
  assert.deepEqual(summary.latestMissingSinceLink.sidecarFreshness, { status: "missing", modifiedAfterLink: null });
  assert.equal(summary.latestUnknownFreshness, null);
});

test("sidecar dashboard workflow handles catalog entries without saved sidecars", async () => {
  const { recipeStore, dashboardWorkflow } = await makeHarness();
  await recipeStore.save("img-only", createRecipe({ operations: [{ type: "contrast", params: { amount: -4 } }] }));

  const summary = await dashboardWorkflow.summarizeSavedSyncStates();

  assert.deepEqual(summary.counts, {
    totalImages: 1,
    withSavedSidecars: 0,
    withoutSavedSidecars: 1,
    withLinkedTimestamp: 0,
    withoutLinkedTimestamp: 0,
    inSync: 0,
    conflicts: 0,
    missingSidecars: 0,
    syncIssues: 0,
    withObservedSidecarFile: 0,
    withMissingObservedSidecarFile: 0,
    withMatchedRevision: 0,
    withCatalogNewerRevision: 0,
    withSidecarNewerRevision: 0,
    withUnknownRevisionDrift: 0,
    withRevisionIssue: 0,
    unchangedSinceLink: 0,
    modifiedAfterLink: 0,
    missingSinceLink: 0,
    unknownFreshness: 0,
    withFreshnessIssue: 0,
  });
  assert.deepEqual(summary.savedSidecarFiles, {
    byteSizeTotal: 0,
    withKnownByteSize: 0,
    withKnownModifiedAt: 0,
    latestModifiedAt: null,
  });
  assert.deepEqual(summary.linkedTimeline, {
    withLinkedAt: 0,
    withoutLinkedAt: 0,
    earliestLinkedAt: null,
    latestLinkedAt: null,
    spanMs: null,
    spanStatus: "unknown",
  });
  assert.deepEqual(summary.latestImageIds, ["img-only"]);
  assert.deepEqual(summary.latestLinkedImageIds, []);
  assert.equal(summary.earliestLinkedWithTimestamp, null);
  assert.equal(summary.latestLinkedWithTimestamp, null);
  assert.equal(summary.latestLinkedWithoutTimestamp, null);
  assert.equal(summary.latestInSync, null);
  assert.equal(summary.latestSyncIssue, null);
  assert.equal(summary.latestMatchedRevision, null);
  assert.equal(summary.latestRevisionIssue, null);
  assert.equal(summary.latestConflict, null);
  assert.equal(summary.latestObservedSidecarFile, null);
  assert.equal(summary.latestMissingObservedSidecarFile, null);
  assert.equal(summary.largestObservedSidecarFile, null);
  assert.equal(summary.latestMissingSidecar, null);
  assert.equal(summary.latestUnknownRevisionDrift, null);
  assert.equal(summary.latestFreshnessIssue, null);
  assert.equal(summary.latestMissingSinceLink, null);
});

test("sidecar dashboard workflow delegates summary shaping to the dashboard foundation", async () => {
  const calls = [];
  const workflow = createSidecarDashboardWorkflow({
    recipeStore: {
      async listImageIds() {
        calls.push({ type: "listImageIds" });
        return ["img-unsaved", "img-linked"];
      },
      async get(imageId) {
        calls.push({ type: "get", imageId });
        if (imageId === "img-unsaved") {
          return {
            imageId,
            updatedAt: "2025-07-20T00:00:00.000Z",
            sidecarPath: null,
            recipeFingerprint: "catalog-unsaved",
            revision: 1,
          };
        }
        return {
          imageId,
          updatedAt: "2025-07-20T00:00:01.000Z",
          sidecarPath: "/tmp/img-linked.photogenic.json",
          recipeFingerprint: "catalog-linked",
          revision: 2,
        };
      },
    },
    sidecarWorkflow: {
      async inspectSync(imageId, sidecarPath) {
        calls.push({ type: "inspectSync", imageId, sidecarPath });
        return {
          imageId,
          status: "in-sync",
          catalogFingerprint: "catalog-linked",
          sidecarFingerprint: "sidecar-linked",
          catalogRevision: 2,
          sidecarRevision: 2,
          sidecarFile: { path: sidecarPath, status: "present", byteSize: 99, modifiedAt: "2025-07-20T00:00:01.000Z" },
          revisionDrift: { status: "matched", delta: 0 },
          sidecarFreshness: { status: "unknown", modifiedAfterLink: null },
        };
      },
    },
    dashboardFoundation: {
      summarizeSavedSyncStates(input) {
        calls.push({ type: "foundation", input });
        return {
          counts: { totalImages: input.entries.length, withLinkedTimestamp: 1, withoutLinkedTimestamp: 0, syncIssues: 0, withRevisionIssue: 0, withFreshnessIssue: 0 },
          savedSidecarFiles: { byteSizeTotal: 99, withKnownByteSize: 1, withKnownModifiedAt: 1, latestModifiedAt: "2025-07-20T00:00:01.000Z" },
          linkedTimeline: { withLinkedAt: 1, withoutLinkedAt: 0, earliestLinkedAt: "2025-07-20T00:00:01.000Z", latestLinkedAt: "2025-07-20T00:00:01.000Z", spanMs: 0, spanStatus: "single-point" },
          latestImageIds: ["delegated"],
          latestLinkedImageIds: ["delegated-linked"],
          earliestLinkedWithTimestamp: { imageId: "delegated-linked", sidecarPath: "/tmp/img-linked.photogenic.json", updatedAt: "2025-07-20T00:00:01.000Z", sidecarLinkedAt: "2025-07-20T00:00:01.000Z" },
          latestLinkedWithTimestamp: { imageId: "delegated-linked", sidecarPath: "/tmp/img-linked.photogenic.json", updatedAt: "2025-07-20T00:00:01.000Z", sidecarLinkedAt: "2025-07-20T00:00:01.000Z" },
          latestLinkedWithoutTimestamp: null,
          latestInSync: null,
          latestSyncIssue: null,
          latestMatchedRevision: null,
          latestRevisionIssue: null,
          latestConflict: null,
          latestMissingSidecar: null,
          latestObservedSidecarFile: null,
          latestMissingObservedSidecarFile: null,
          largestObservedSidecarFile: null,
          latestCatalogNewerRevision: null,
          latestSidecarNewerRevision: null,
          latestUnknownRevisionDrift: null,
          latestUnchangedSinceLink: null,
          latestFreshnessIssue: null,
          latestModifiedAfterLink: null,
          latestMissingSinceLink: null,
          latestUnknownFreshness: null,
        };
      },
    },
  });

  const summary = await workflow.summarizeSavedSyncStates();

  assert.deepEqual(summary, {
    counts: { totalImages: 2, withLinkedTimestamp: 1, withoutLinkedTimestamp: 0, syncIssues: 0, withRevisionIssue: 0, withFreshnessIssue: 0 },
    savedSidecarFiles: { byteSizeTotal: 99, withKnownByteSize: 1, withKnownModifiedAt: 1, latestModifiedAt: "2025-07-20T00:00:01.000Z" },
    linkedTimeline: { withLinkedAt: 1, withoutLinkedAt: 0, earliestLinkedAt: "2025-07-20T00:00:01.000Z", latestLinkedAt: "2025-07-20T00:00:01.000Z", spanMs: 0, spanStatus: "single-point" },
    latestImageIds: ["delegated"],
    latestLinkedImageIds: ["delegated-linked"],
    earliestLinkedWithTimestamp: { imageId: "delegated-linked", sidecarPath: "/tmp/img-linked.photogenic.json", updatedAt: "2025-07-20T00:00:01.000Z", sidecarLinkedAt: "2025-07-20T00:00:01.000Z" },
    latestLinkedWithTimestamp: { imageId: "delegated-linked", sidecarPath: "/tmp/img-linked.photogenic.json", updatedAt: "2025-07-20T00:00:01.000Z", sidecarLinkedAt: "2025-07-20T00:00:01.000Z" },
    latestLinkedWithoutTimestamp: null,
    latestInSync: null,
    latestSyncIssue: null,
    latestMatchedRevision: null,
    latestRevisionIssue: null,
    latestConflict: null,
    latestMissingSidecar: null,
    latestObservedSidecarFile: null,
    latestMissingObservedSidecarFile: null,
    largestObservedSidecarFile: null,
    latestCatalogNewerRevision: null,
    latestSidecarNewerRevision: null,
    latestUnknownRevisionDrift: null,
    latestUnchangedSinceLink: null,
    latestFreshnessIssue: null,
    latestModifiedAfterLink: null,
    latestMissingSinceLink: null,
    latestUnknownFreshness: null,
  });
  assert.deepEqual(calls, [
    { type: "listImageIds" },
    { type: "get", imageId: "img-unsaved" },
    { type: "get", imageId: "img-linked" },
    { type: "inspectSync", imageId: "img-linked", sidecarPath: "/tmp/img-linked.photogenic.json" },
    {
      type: "foundation",
      input: {
        entries: [
          {
            imageId: "img-unsaved",
            updatedAt: "2025-07-20T00:00:00.000Z",
            sidecarPath: null,
            recipeFingerprint: "catalog-unsaved",
            revision: 1,
          },
          {
            imageId: "img-linked",
            updatedAt: "2025-07-20T00:00:01.000Z",
            sidecarPath: "/tmp/img-linked.photogenic.json",
            recipeFingerprint: "catalog-linked",
            revision: 2,
          },
        ],
        syncStates: [
          {
            imageId: "img-linked",
            sidecarPath: "/tmp/img-linked.photogenic.json",
            updatedAt: "2025-07-20T00:00:01.000Z",
            status: "in-sync",
            catalogFingerprint: "catalog-linked",
            sidecarFingerprint: "sidecar-linked",
            catalogRevision: 2,
            sidecarRevision: 2,
            sidecarFile: { path: "/tmp/img-linked.photogenic.json", status: "present", byteSize: 99, modifiedAt: "2025-07-20T00:00:01.000Z" },
            revisionDrift: { status: "matched", delta: 0 },
            sidecarFreshness: { status: "unknown", modifiedAfterLink: null },
            sidecarLinkedAt: null,
          },
        ],
      },
    },
  ]);
});


test("sidecar dashboard workflow summarizeSavedSyncStatesReport returns operation metadata with summary", async () => {
  const { dir, recipeStore, sidecarWorkflow, dashboardWorkflow } = await makeHarness();

  await recipeStore.save("img-unsaved", createRecipe({ operations: [{ type: "contrast", params: { amount: 2 } }] }));

  await recipeStore.save("img-sync", createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }));
  await sidecarWorkflow.exportRecipe("img-sync", path.join(dir, "img-sync.photogenic.json"));

  await recipeStore.save("img-conflict", createRecipe({ operations: [{ type: "exposure", params: { ev: 0.2 } }] }));
  const conflictPath = path.join(dir, "img-conflict.photogenic.json");
  await writeFile(
    conflictPath,
    JSON.stringify({
      sidecarVersion: 1,
      imageId: "img-conflict",
      exportedAt: "2025-07-20T01:00:00.000Z",
      catalogRevision: 1,
      recipe: {
        version: 1,
        operations: [{ type: "exposure", params: { ev: 1.1 } }],
        meta: {},
      },
    }, null, 2) + "\n",
  );
  await sidecarWorkflow.importRecipe("img-conflict", conflictPath);

  await recipeStore.save("img-missing", createRecipe({ operations: [{ type: "contrast", params: { amount: 9 } }] }));
  const missingPath = path.join(dir, "img-missing.photogenic.json");
  await sidecarWorkflow.exportRecipe("img-missing", missingPath);
  await rm(missingPath);

  await recipeStore.save("img-sidecar-newer", createRecipe({ operations: [{ type: "contrast", params: { amount: 7 } }] }));
  const sidecarNewerPath = path.join(dir, "img-sidecar-newer.photogenic.json");
  await writeFile(
    sidecarNewerPath,
    JSON.stringify({
      sidecarVersion: 1,
      imageId: "img-sidecar-newer",
      exportedAt: "2025-07-20T01:00:01.000Z",
      catalogRevision: 5,
      recipe: {
        version: 1,
        operations: [{ type: "contrast", params: { amount: 7 } }],
        meta: {},
      },
    }, null, 2) + "\n",
  );
  await sidecarWorkflow.importRecipe("img-sidecar-newer", sidecarNewerPath);

  const result = await dashboardWorkflow.summarizeSavedSyncStatesReport();

  assert.deepEqual(result.operation, {
    kind: "summarize-saved-sidecar-sync-states",
    requestedImageIds: ["img-conflict", "img-missing", "img-sidecar-newer", "img-sync"],
    processedImageIds: ["img-conflict", "img-missing", "img-sidecar-newer", "img-sync"],
    missingSidecarImageIds: ["img-missing"],
    skippedImageIds: ["img-unsaved"],
  });
  assert.equal(result.summary.counts.totalImages, 5);
  assert.equal(result.summary.counts.missingSidecars, 1);
});

test("sidecar dashboard workflow summarizeSavedSyncStatesReport preserves delegation inputs while returning operation metadata", async () => {
  const calls = [];
  const workflow = createSidecarDashboardWorkflow({
    recipeStore: {
      async listImageIds() {
        calls.push({ type: "listImageIds" });
        return ["img-unsaved", "img-linked"];
      },
      async get(imageId) {
        calls.push({ type: "get", imageId });
        if (imageId === "img-unsaved") {
          return {
            imageId,
            updatedAt: "2025-07-20T00:00:00.000Z",
            sidecarPath: null,
            recipeFingerprint: "catalog-unsaved",
            revision: 1,
          };
        }
        return {
          imageId,
          updatedAt: "2025-07-20T00:00:01.000Z",
          sidecarPath: "/tmp/img-linked.photogenic.json",
          recipeFingerprint: "catalog-linked",
          revision: 2,
        };
      },
    },
    sidecarWorkflow: {
      async inspectSync(imageId, sidecarPath) {
        calls.push({ type: "inspectSync", imageId, sidecarPath });
        return {
          imageId,
          status: "in-sync",
          catalogFingerprint: "catalog-linked",
          sidecarFingerprint: "sidecar-linked",
          catalogRevision: 2,
          sidecarRevision: 2,
          sidecarFile: { path: sidecarPath, status: "present", byteSize: 99, modifiedAt: "2025-07-20T00:00:01.000Z" },
          revisionDrift: { status: "matched", delta: 0 },
          sidecarFreshness: { status: "unknown", modifiedAfterLink: null },
        };
      },
    },
    dashboardFoundation: {
      summarizeSavedSyncStates(input) {
        calls.push({ type: "foundation", input });
        return {
          counts: { totalImages: input.entries.length, withLinkedTimestamp: 1, withoutLinkedTimestamp: 0, syncIssues: 0, withRevisionIssue: 0, withFreshnessIssue: 0 },
          savedSidecarFiles: { byteSizeTotal: 99, withKnownByteSize: 1, withKnownModifiedAt: 1, latestModifiedAt: "2025-07-20T00:00:01.000Z" },
          linkedTimeline: { withLinkedAt: 1, withoutLinkedAt: 0, earliestLinkedAt: "2025-07-20T00:00:01.000Z", latestLinkedAt: "2025-07-20T00:00:01.000Z", spanMs: 0, spanStatus: "single-point" },
          latestImageIds: ["delegated"],
          latestLinkedImageIds: ["delegated-linked"],
          earliestLinkedWithTimestamp: { imageId: "delegated-linked", sidecarPath: "/tmp/img-linked.photogenic.json", updatedAt: "2025-07-20T00:00:01.000Z", sidecarLinkedAt: "2025-07-20T00:00:01.000Z" },
          latestLinkedWithTimestamp: { imageId: "delegated-linked", sidecarPath: "/tmp/img-linked.photogenic.json", updatedAt: "2025-07-20T00:00:01.000Z", sidecarLinkedAt: "2025-07-20T00:00:01.000Z" },
          latestLinkedWithoutTimestamp: null,
          latestInSync: null,
          latestSyncIssue: null,
          latestMatchedRevision: null,
          latestRevisionIssue: null,
          latestConflict: null,
          latestMissingSidecar: null,
          latestObservedSidecarFile: null,
          latestMissingObservedSidecarFile: null,
          largestObservedSidecarFile: null,
          latestCatalogNewerRevision: null,
          latestSidecarNewerRevision: null,
          latestUnknownRevisionDrift: null,
          latestUnchangedSinceLink: null,
          latestFreshnessIssue: null,
          latestModifiedAfterLink: null,
          latestMissingSinceLink: null,
          latestUnknownFreshness: null,
        };
      },
    },
  });

  const result = await workflow.summarizeSavedSyncStatesReport();

  assert.deepEqual(result.operation, {
    kind: "summarize-saved-sidecar-sync-states",
    requestedImageIds: ["img-linked"],
    processedImageIds: ["img-linked"],
    missingSidecarImageIds: [],
    skippedImageIds: ["img-unsaved"],
  });
  assert.deepEqual(result.summary, {
    counts: { totalImages: 2, withLinkedTimestamp: 1, withoutLinkedTimestamp: 0, syncIssues: 0, withRevisionIssue: 0, withFreshnessIssue: 0 },
    savedSidecarFiles: { byteSizeTotal: 99, withKnownByteSize: 1, withKnownModifiedAt: 1, latestModifiedAt: "2025-07-20T00:00:01.000Z" },
    linkedTimeline: { withLinkedAt: 1, withoutLinkedAt: 0, earliestLinkedAt: "2025-07-20T00:00:01.000Z", latestLinkedAt: "2025-07-20T00:00:01.000Z", spanMs: 0, spanStatus: "single-point" },
    latestImageIds: ["delegated"],
    latestLinkedImageIds: ["delegated-linked"],
    earliestLinkedWithTimestamp: { imageId: "delegated-linked", sidecarPath: "/tmp/img-linked.photogenic.json", updatedAt: "2025-07-20T00:00:01.000Z", sidecarLinkedAt: "2025-07-20T00:00:01.000Z" },
    latestLinkedWithTimestamp: { imageId: "delegated-linked", sidecarPath: "/tmp/img-linked.photogenic.json", updatedAt: "2025-07-20T00:00:01.000Z", sidecarLinkedAt: "2025-07-20T00:00:01.000Z" },
    latestLinkedWithoutTimestamp: null,
    latestInSync: null,
    latestSyncIssue: null,
    latestMatchedRevision: null,
    latestRevisionIssue: null,
    latestConflict: null,
    latestMissingSidecar: null,
    latestObservedSidecarFile: null,
    latestMissingObservedSidecarFile: null,
    largestObservedSidecarFile: null,
    latestCatalogNewerRevision: null,
    latestSidecarNewerRevision: null,
    latestUnknownRevisionDrift: null,
    latestUnchangedSinceLink: null,
    latestFreshnessIssue: null,
    latestModifiedAfterLink: null,
    latestMissingSinceLink: null,
    latestUnknownFreshness: null,
  });
});
