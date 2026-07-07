import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLibraryStore } from "../src/catalog/library-store.js";
import { createWorkspaceSessionStore } from "../src/catalog/workspace-session-store.js";
import { createPresetStore } from "../src/catalog/preset-store.js";
import { createBatchSessionStore } from "../src/catalog/batch-session-store.js";
import { createCatalogDashboardWorkflow } from "../src/catalog/dashboard-workflow.js";
import { createRecipe } from "../src/edit-recipe/recipe.js";

async function makeHarness() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-dashboard-workflow-"));
  let tick = 0;
  const clock = () => `2025-07-16T00:00:0${Math.min(tick++, 9)}.000Z`;
  const libraryStore = await createLibraryStore({ path: path.join(dir, "library.json"), clock });
  const workspaceSessionStore = await createWorkspaceSessionStore({ path: path.join(dir, "workspace.json"), clock });
  const presetStore = await createPresetStore({ path: path.join(dir, "presets.json"), clock });
  const batchSessionStore = await createBatchSessionStore({ path: path.join(dir, "batch.json"), clock });

  await libraryStore.importImage({ imageId: "img-001", sourcePath: "/shoot/day1/img-001.CR3", rating: 5, flagged: true, byteSize: 1200, modifiedAt: "2025-07-16T00:00:00.000Z", observedFormat: "jpeg", pixelWidth: 4000, pixelHeight: 3000, orientation: 6, observedCaptureAt: "2025:07:16 09:00", cameraMake: "Canon", cameraModel: "EOS R6", lensModel: "RF24-70mm F2.8 L IS USM",
    focalLengthMm: 70,
    fNumber: 2.8,
    isoSpeed: 400,
    exposureTimeSeconds: 1 / 125,
    exposureProgram: null,
    exposureMode: null,
    flashFired: true,
    exposureBiasEv: 1 / 3, focalLengthMm: 70,
    fNumber: 2.8,
    isoSpeed: 400,
    exposureTimeSeconds: 1 / 125,
    exposureProgram: null,
    exposureMode: null,
    flashFired: true,
    exposureBiasEv: 1 / 3, fNumber: 2.8, isoSpeed: 400,
    exposureTimeSeconds: 1 / 125,
    exposureProgram: null,
    exposureMode: null,
    flashFired: true,
    exposureBiasEv: 1 / 3, exposureTimeSeconds: 1 / 125,
    flashFired: true,
    exposureBiasEv: 1 / 3, flashFired: true,
    exposureBiasEv: 1 / 3, exposureBiasEv: 1 / 3 });
  await libraryStore.importImage({ imageId: "img-002", sourcePath: "/shoot/day1/img-002.CR3", rejected: true, byteSize: 800, modifiedAt: "2025-07-16T00:00:01.000Z", observedFormat: "jpeg", pixelWidth: 2000, pixelHeight: 1000 });
  await libraryStore.importImage({ imageId: "img-003", sourcePath: "/shoot/day1/img-003.CR3", rating: 2, byteSize: 2300, modifiedAt: "2025-07-16T00:00:03.000Z", observedFormat: "tiff", pixelWidth: 6000, pixelHeight: 4000 });

  await presetStore.savePreset("warm-base", {
    name: "Warm Base",
    recipe: createRecipe({ operations: [{ type: "temperature", params: { kelvinDelta: 300 } }] }),
    includedTypes: ["temperature"],
  });

  await batchSessionStore.saveSession("session-hero", {
    sourceImageId: "img-001",
    includedTypes: ["temperature"],
    targetImageIds: ["img-002", "img-003"],
  });

  await workspaceSessionStore.saveSnapshot("workspace-main", {
    selectedImageId: "img-001",
    activeFilter: "keepers",
    activePresetId: "warm-base",
    activeBatchSessionId: "session-hero",
    expandedImageIds: ["img-003", "img-001"],
  });

  return createCatalogDashboardWorkflow({ libraryStore, workspaceSessionStore, presetStore, batchSessionStore });
}

test("catalog dashboard workflow summarizes visible counts and active references for a workspace snapshot", async () => {
  const workflow = await makeHarness();
  const summary = await workflow.summarizeWorkspace("workspace-main");

  assert.equal(summary.snapshot.snapshotId, "workspace-main");
  assert.equal(summary.counts.visible, 2);
  assert.equal(summary.counts.keepers, 2);
  assert.equal(summary.counts.rejected, 1);
  assert.equal(summary.visibleSourceFiles.byteSizeTotal, 3500);
  assert.equal(summary.visibleSourceFiles.withKnownByteSize, 2);
  assert.equal(summary.visibleSourceFiles.withMissingByteSize, 0);
  assert.equal(summary.visibleSourceFiles.withKnownModifiedAt, 2);
  assert.equal(summary.visibleSourceFiles.withMissingModifiedAt, 0);
  assert.equal(summary.visibleSourceFiles.withKnownDimensions, 2);
  assert.equal(summary.visibleSourceFiles.withMissingDimensions, 0);
  assert.equal(summary.visibleSourceFiles.withObservedOrientation, 1);
  assert.equal(summary.visibleSourceFiles.withObservedCaptureAt, 1);
  assert.equal(summary.visibleSourceFiles.withIncompleteMetadata, 0);
  assert.equal(summary.visibleSourceFiles.latestModifiedAt, "2025-07-16T00:00:03.000Z");
  assert.equal(summary.visibleSourceFiles.latestObservedCaptureAt, "2025:07:16 09:00");
  assert.deepEqual(summary.visibleSourceFiles.observedFormats, { jpeg: 1, tiff: 1 });
  assert.deepEqual(summary.visibleSourceFiles.observedCameras, { "Canon EOS R6": 1 });
  assert.deepEqual(summary.visibleSourceFiles.observedLenses, { "RF24-70mm F2.8 L IS USM": 1 });
  assert.deepEqual(summary.visibleSourceFiles.focalLengthMmRange, { min: 70, max: 70 });
  assert.deepEqual(summary.visibleSourceFiles.fNumberRange, { min: 2.8, max: 2.8 });
  assert.deepEqual(summary.visibleSourceFiles.isoSpeedRange, { min: 400, max: 400 });
  assert.deepEqual(summary.visibleSourceFiles.exposureTimeSecondsRange, { min: 1 / 125, max: 1 / 125 });
  assert.deepEqual(summary.visibleSourceFiles.flashUsage, { fired: 1, notFired: 0 });
  assert.deepEqual(summary.visibleSourceFiles.exposureBiasEvRange, { min: 1 / 3, max: 1 / 3 });
  assert.equal(summary.latestVisibleObservedCaptureSourceFile.imageId, "img-001");
  assert.equal(summary.latestVisibleObservedFormatSourceFile.imageId, "img-003");
  assert.equal(summary.visibleSourceFiles.largestPixelArea, 24000000);
  assert.equal(summary.latestVisibleSourceFile.imageId, "img-003");
  assert.equal(summary.latestVisibleSourceFileMissingMetadata, null);
  assert.equal(summary.largestVisibleSourceFile.imageId, "img-003");
  assert.equal(summary.selectedImage.imageId, "img-001");
  assert.deepEqual(summary.selectedImageSourceFile, {
    sourcePath: "/shoot/day1/img-001.CR3",
    fileName: "img-001.CR3",
    byteSize: 1200,
    modifiedAt: "2025-07-16T00:00:00.000Z",
    observedFormat: "jpeg",
    pixelWidth: 4000,
    pixelHeight: 3000,
    orientation: 6,
    observedCaptureAt: "2025:07:16 09:00",
    cameraMake: "Canon",
    cameraModel: "EOS R6",
    lensModel: "RF24-70mm F2.8 L IS USM",
    focalLengthMm: 70,
    fNumber: 2.8,
    isoSpeed: 400,
    exposureTimeSeconds: 1 / 125,
    exposureProgram: null,
    exposureMode: null,
    flashFired: true,
    exposureBiasEv: 1 / 3,
    meteringMode: null,
    whiteBalanceMode: null,
    exposureProgram: null,
    exposureMode: null,
    gpsLatitude: null,
    gpsLongitude: null,
    gpsAltitudeM: null,
  });
  assert.equal(summary.activePreset.presetId, "warm-base");
  assert.equal(summary.activeBatchSession.sessionId, "session-hero");
  assert.deepEqual(summary.expandedImageIds, ["img-001", "img-003"]);
});

test("catalog dashboard workflow returns null for missing workspace snapshots", async () => {
  const workflow = await makeHarness();
  assert.equal(await workflow.summarizeWorkspace("missing"), null);
});

test("catalog dashboard workflow delegates summary shaping to the catalog foundation seam", async () => {
  const calls = [];
  const workflow = createCatalogDashboardWorkflow({
    libraryStore: {
      async list(filter = {}) {
        calls.push({ type: "list", filter });
        if (filter.keepersOnly) return [{ imageId: "img-001" }, { imageId: "img-003" }];
        if (filter.rejected) return [{ imageId: "img-002" }];
        return [{ imageId: "img-001" }, { imageId: "img-003" }];
      },
      async get(imageId) {
        calls.push({ type: "get", imageId });
        return { imageId, sourcePath: `/library/${imageId}.CR3` };
      },
    },
    workspaceSessionStore: {
      async getSnapshot(snapshotId) {
        calls.push({ type: "snapshot", snapshotId });
        return {
          snapshotId,
          selectedImageId: "img-001",
          activeFilter: "keepers",
          activePresetId: null,
          activeBatchSessionId: null,
          expandedImageIds: ["img-001"],
        };
      },
    },
    foundation: {
      summarizeDashboardWorkspace(input) {
        calls.push({ type: "foundation", input });
        return { ok: true, counts: { visible: input.visibleImages.length }, visibleSourceFiles: { byteSizeTotal: input.visibleImages.reduce((sum, image) => sum + (image.byteSize ?? 0), 0), largestPixelArea: input.visibleImages.map((image) => (image.pixelWidth && image.pixelHeight ? image.pixelWidth * image.pixelHeight : 0)).sort((a, b) => b - a)[0] ?? null }, latestVisibleSourceFile: input.visibleImages.at(-1) ?? null, latestVisibleObservedCaptureSourceFile: null, latestVisibleObservedFormatSourceFile: null, latestVisibleSourceFileMissingMetadata: null, largestVisibleSourceFile: input.visibleImages.at(-1) ?? null, selectedImageSourceFile: input.selectedImage ? { sourcePath: input.selectedImage.sourcePath } : null };
      },
    },
  });

  const summary = await workflow.summarizeWorkspace("workspace-main");

  assert.deepEqual(summary, { ok: true, counts: { visible: 2 }, visibleSourceFiles: { byteSizeTotal: 0, largestPixelArea: 0 }, latestVisibleSourceFile: { imageId: "img-003" }, latestVisibleObservedCaptureSourceFile: null, latestVisibleObservedFormatSourceFile: null, latestVisibleSourceFileMissingMetadata: null, largestVisibleSourceFile: { imageId: "img-003" }, selectedImageSourceFile: { sourcePath: "/library/img-001.CR3" } });
  assert.deepEqual(calls, [
    { type: "snapshot", snapshotId: "workspace-main" },
    { type: "list", filter: { keepersOnly: true } },
    { type: "get", imageId: "img-001" },
    { type: "list", filter: { keepersOnly: true } },
    { type: "list", filter: { rejected: true } },
    {
      type: "foundation",
      input: {
        snapshot: {
          snapshotId: "workspace-main",
          selectedImageId: "img-001",
          activeFilter: "keepers",
          activePresetId: null,
          activeBatchSessionId: null,
          expandedImageIds: ["img-001"],
        },
        visibleImages: [{ imageId: "img-001" }, { imageId: "img-003" }],
        keeperImages: [{ imageId: "img-001" }, { imageId: "img-003" }],
        rejectedImages: [{ imageId: "img-002" }],
        selectedImage: { imageId: "img-001", sourcePath: "/library/img-001.CR3" },
        activePreset: null,
        activeBatchSession: null,
      },
    },
  ]);
});


test("catalog dashboard workflow can refresh visible source metadata before summarizing a workspace", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-dashboard-refresh-visible-"));
  let tick = 0;
  const clock = () => `2025-07-16T00:00:0${Math.min(tick++, 9)}.000Z`;
  const libraryStore = await createLibraryStore({ path: path.join(dir, "library.json"), clock });
  const workspaceSessionStore = await createWorkspaceSessionStore({ path: path.join(dir, "workspace.json"), clock });

  const sourceA = path.join(dir, "img-a.CR3");
  const sourceB = path.join(dir, "img-b.CR3");
  await (await import("node:fs/promises")).writeFile(sourceA, "aaaa");
  await (await import("node:fs/promises")).writeFile(sourceB, "bbbbbb");

  await libraryStore.importImage({ imageId: "img-a", sourcePath: sourceA, rating: 5, byteSize: 4, modifiedAt: "2025-07-16T00:00:00.000Z", observedFormat: "tiff-like" });
  await libraryStore.importImage({ imageId: "img-b", sourcePath: sourceB, rating: 1, byteSize: 6, modifiedAt: "2025-07-16T00:00:01.000Z", observedFormat: "tiff-like" });
  await workspaceSessionStore.saveSnapshot("workspace-refresh", {
    selectedImageId: "img-a",
    activeFilter: "all",
    expandedImageIds: ["img-a", "img-b"],
  });

  await (await import("node:fs/promises")).writeFile(sourceA, "aaaaaaaaaa");
  await (await import("node:fs/promises")).unlink(sourceB);

  const workflow = createCatalogDashboardWorkflow({ libraryStore, workspaceSessionStore });
  const summary = await workflow.summarizeWorkspace("workspace-refresh", { refreshSourceMetadata: true });

  assert.equal(summary.visibleSourceFiles.byteSizeTotal, 10);
  assert.equal(summary.visibleSourceFiles.withKnownByteSize, 1);
  assert.equal(summary.visibleSourceFiles.withMissingByteSize, 1);
  assert.equal(summary.visibleSourceFiles.withKnownModifiedAt, 1);
  assert.equal(summary.visibleSourceFiles.withMissingModifiedAt, 1);
  assert.equal(summary.visibleSourceFiles.withKnownDimensions, 0);
  assert.equal(summary.visibleSourceFiles.withMissingDimensions, 2);
  assert.equal(summary.visibleSourceFiles.withObservedOrientation, 0);
  assert.equal(summary.visibleSourceFiles.withObservedCaptureAt, 0);
  assert.equal(summary.latestVisibleObservedCaptureSourceFile, null);
  assert.deepEqual(summary.visibleSourceFiles.observedFormats, {});
  assert.equal(summary.latestVisibleObservedFormatSourceFile, null);
  assert.equal(summary.visibleSourceFiles.withIncompleteMetadata, 2);
  assert.equal(summary.latestVisibleSourceFile.imageId, "img-a");
  assert.equal(summary.latestVisibleSourceFileMissingMetadata.imageId, "img-a");
  assert.equal(summary.largestVisibleSourceFile.imageId, "img-a");
  assert.equal(summary.selectedImageSourceFile.byteSize, 10);
  assert.equal((await libraryStore.get("img-b")).byteSize, null);
});


test("catalog dashboard workflow summarizeWorkspaceReport returns operation metadata with summary", async () => {
  const workflow = await makeHarness();
  const result = await workflow.summarizeWorkspaceReport("workspace-main");

  assert.deepEqual(result.operation, {
    kind: "summarize-workspace",
    refreshSourceMetadata: false,
    snapshotId: "workspace-main",
    requestedRefreshImageIds: [],
    refreshedImageIds: [],
    skippedRefreshImageIds: [],
  });
  assert.equal(result.summary.snapshot.snapshotId, "workspace-main");
  assert.equal(result.summary.counts.visible, 2);
});

test("catalog dashboard workflow summarizeWorkspaceReport reports refreshed source metadata ids", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-dashboard-refresh-report-"));
  let tick = 0;
  const clock = () => `2025-07-16T01:00:0${Math.min(tick++, 9)}.000Z`;
  const libraryStore = await createLibraryStore({ path: path.join(dir, "library.json"), clock });
  const workspaceSessionStore = await createWorkspaceSessionStore({ path: path.join(dir, "workspace.json"), clock });

  const sourceA = path.join(dir, "img-a.CR3");
  const sourceB = path.join(dir, "img-b.CR3");
  await (await import("node:fs/promises")).writeFile(sourceA, "aaaa");
  await (await import("node:fs/promises")).writeFile(sourceB, "bbbbbb");

  await libraryStore.importImage({ imageId: "img-a", sourcePath: sourceA, rating: 5, byteSize: 4, modifiedAt: "2025-07-16T01:00:00.000Z", observedFormat: "tiff-like" });
  await libraryStore.importImage({ imageId: "img-b", sourcePath: sourceB, rating: 1, byteSize: 6, modifiedAt: "2025-07-16T01:00:01.000Z", observedFormat: "tiff-like" });
  await workspaceSessionStore.saveSnapshot("workspace-refresh", {
    selectedImageId: "img-a",
    activeFilter: "all",
    expandedImageIds: ["img-a", "img-b"],
  });

  await (await import("node:fs/promises")).writeFile(sourceA, "aaaaaaaaaa");
  await (await import("node:fs/promises")).unlink(sourceB);

  const workflow = createCatalogDashboardWorkflow({ libraryStore, workspaceSessionStore });
  const result = await workflow.summarizeWorkspaceReport("workspace-refresh", { refreshSourceMetadata: true });

  assert.deepEqual(result.operation, {
    kind: "refresh-source-metadata-and-summarize-workspace",
    refreshSourceMetadata: true,
    snapshotId: "workspace-refresh",
    requestedRefreshImageIds: ["img-a", "img-b"],
    refreshedImageIds: ["img-a", "img-b"],
    skippedRefreshImageIds: [],
  });
  assert.equal(result.summary.visibleSourceFiles.byteSizeTotal, 10);
  assert.equal(result.summary.latestVisibleSourceFileMissingMetadata.imageId, "img-a");
});

test("catalog dashboard workflow summarizeWorkspaceReport rejects refresh requests when library store cannot refresh", async () => {
  const workflow = createCatalogDashboardWorkflow({
    libraryStore: {
      async list() { return []; },
      async get() { return null; },
    },
    workspaceSessionStore: {
      async getSnapshot(snapshotId) {
        return { snapshotId, selectedImageId: null, activeFilter: "all", expandedImageIds: [] };
      },
    },
  });

  await assert.rejects(
    () => workflow.summarizeWorkspaceReport("workspace-main", { refreshSourceMetadata: true }),
    /libraryStore with refreshSourceMetadata\(\) is required when refreshSourceMetadata is true/,
  );
});


test("catalog dashboard workflow can bulk refresh workspace source metadata with summary coverage", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-dashboard-bulk-refresh-"));
  let tick = 0;
  const clock = () => `2025-07-16T02:00:0${Math.min(tick++, 9)}.000Z`;
  const libraryStore = await createLibraryStore({ path: path.join(dir, "library.json"), clock });
  const workspaceSessionStore = await createWorkspaceSessionStore({ path: path.join(dir, "workspace.json"), clock });

  const jpegPath = path.join(dir, "img-a.JPG");
  const tifPath = path.join(dir, "img-b.TIF");
  await (await import("node:fs/promises")).writeFile(jpegPath, Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x05, 0x00, 0x07, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]));
  const tiffPayload = Buffer.alloc(76);
  tiffPayload.write("II", 0, "ascii");
  tiffPayload.writeUInt16LE(42, 2);
  tiffPayload.writeUInt32LE(8, 4);
  tiffPayload.writeUInt16LE(4, 8);
  tiffPayload.writeUInt16LE(256, 10); tiffPayload.writeUInt16LE(4, 12); tiffPayload.writeUInt32LE(1, 14); tiffPayload.writeUInt32LE(320, 18);
  tiffPayload.writeUInt16LE(257, 22); tiffPayload.writeUInt16LE(4, 24); tiffPayload.writeUInt32LE(1, 26); tiffPayload.writeUInt32LE(180, 30);
  tiffPayload.writeUInt16LE(274, 34); tiffPayload.writeUInt16LE(3, 36); tiffPayload.writeUInt32LE(1, 38); tiffPayload.writeUInt16LE(8, 42);
  tiffPayload.writeUInt16LE(34665, 46); tiffPayload.writeUInt16LE(4, 48); tiffPayload.writeUInt32LE(1, 50); tiffPayload.writeUInt32LE(62, 54);
  tiffPayload.writeUInt32LE(0, 58);
  tiffPayload.writeUInt16LE(1, 62);
  tiffPayload.writeUInt16LE(36867, 64); tiffPayload.writeUInt16LE(2, 66); tiffPayload.writeUInt32LE(20, 68); tiffPayload.writeUInt32LE(76, 72);
  await (await import("node:fs/promises")).writeFile(tifPath, Buffer.concat([tiffPayload, Buffer.from("2025:07:16 12:34:56 ", "ascii")]));

  await libraryStore.importImage({ imageId: "img-a", sourcePath: jpegPath });
  await libraryStore.importImage({ imageId: "img-b", sourcePath: tifPath });
  await workspaceSessionStore.saveSnapshot("workspace-refresh", {
    selectedImageId: "img-a",
    activeFilter: "all",
    expandedImageIds: ["img-a", "img-b"],
  });

  const workflow = createCatalogDashboardWorkflow({ libraryStore, workspaceSessionStore });
  const result = await workflow.refreshWorkspaceSourceMetadataReport("workspace-refresh", { imageIds: ["img-a", "img-b", "missing-image"] });

  assert.deepEqual(result.operation, {
    kind: "refresh-workspace-source-metadata",
    snapshotId: "workspace-refresh",
    requestedImageIds: ["img-a", "img-b", "missing-image"],
    refreshedImageIds: ["img-a", "img-b"],
    skippedImageIds: ["missing-image"],
    selectedImageId: "img-a",
    visibleImageIds: ["img-a", "img-b"],
  });
  assert.deepEqual(result.metadataSummary, {
    total: 2,
    withKnownByteSize: 2,
    withKnownModifiedAt: 2,
    withKnownDimensions: 2,
    withObservedOrientation: 1,
    withObservedCaptureAt: 1,
    withObservedCamera: 0,
    withObservedLens: 0,
    withObservedFocalLength: 0,
    withObservedFNumber: 0,
    withObservedIsoSpeed: 0,
    withObservedExposureTime: 0,
    withObservedFlash: 0,
    withObservedExposureBias: 0,
    latestObservedCaptureAt: "2025:07:16 12:34:56",
    observedFormats: { jpeg: 1, tiff: 1 },
    observedCameras: {},
    observedLenses: {},
    focalLengthMmRange: null,
    fNumberRange: null,
    isoSpeedRange: null,
    exposureTimeSecondsRange: null,
    latestObservedExposureEntry: null,
    flashUsage: { fired: 0, notFired: 0 },
    exposureBiasEvRange: null,
    exposureBiasEvRange: null,
    exposureTimeSecondsRange: null,
    latestObservedExposureEntry: null,
    flashUsage: { fired: 0, notFired: 0 },
    exposureBiasEvRange: null,
    exposureBiasEvRange: null,
  });
  assert.equal(result.summary.visibleSourceFiles.withKnownDimensions, 2);
  assert.ok(["img-a", "img-b"].includes(result.summary.latestVisibleObservedFormatSourceFile.imageId));
  assert.ok(["jpeg", "tiff"].includes(result.summary.latestVisibleObservedFormatSourceFile.observedFormat));
});


test("catalog dashboard workflow summarizeWorkspaceReport can selectively refresh chosen image ids", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-dashboard-selective-refresh-"));
  let tick = 0;
  const clock = () => `2025-07-16T03:00:0${Math.min(tick++, 9)}.000Z`;
  const libraryStore = await createLibraryStore({ path: path.join(dir, "library.json"), clock });
  const workspaceSessionStore = await createWorkspaceSessionStore({ path: path.join(dir, "workspace.json"), clock });

  const sourceA = path.join(dir, "img-a.CR3");
  const sourceB = path.join(dir, "img-b.CR3");
  await (await import("node:fs/promises")).writeFile(sourceA, "aaaa");
  await (await import("node:fs/promises")).writeFile(sourceB, "bbbbbb");

  await libraryStore.importImage({ imageId: "img-a", sourcePath: sourceA, rating: 5, byteSize: 4, modifiedAt: "2025-07-16T03:00:00.000Z", observedFormat: "tiff-like" });
  await libraryStore.importImage({ imageId: "img-b", sourcePath: sourceB, rating: 1, byteSize: 6, modifiedAt: "2025-07-16T03:00:01.000Z", observedFormat: "tiff-like" });
  await workspaceSessionStore.saveSnapshot("workspace-selective", {
    selectedImageId: "img-a",
    activeFilter: "all",
    expandedImageIds: ["img-a", "img-b"],
  });

  await (await import("node:fs/promises")).writeFile(sourceA, "aaaaaaaaaa");
  await (await import("node:fs/promises")).writeFile(sourceB, "bbbbbbbbbbbb");

  const workflow = createCatalogDashboardWorkflow({ libraryStore, workspaceSessionStore });
  const result = await workflow.summarizeWorkspaceReport("workspace-selective", {
    refreshSourceMetadata: true,
    refreshImageIds: ["img-a", "missing-image"],
  });

  assert.deepEqual(result.operation, {
    kind: "refresh-source-metadata-and-summarize-workspace",
    refreshSourceMetadata: true,
    snapshotId: "workspace-selective",
    requestedRefreshImageIds: ["img-a", "missing-image"],
    refreshedImageIds: ["img-a"],
    skippedRefreshImageIds: ["missing-image"],
  });
  assert.equal(result.summary.selectedImageSourceFile.byteSize, 10);
  assert.equal(result.summary.latestVisibleSourceFile.imageId, "img-a");
  assert.equal((await libraryStore.get("img-a")).byteSize, 10);
  assert.equal((await libraryStore.get("img-b")).byteSize, 6);
});


test("catalog dashboard workflow refreshWorkspaceSourceMetadata returns summary convenience shape", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-dashboard-refresh-helper-"));
  let tick = 0;
  const clock = () => `2025-07-16T04:00:0${Math.min(tick++, 9)}.000Z`;
  const libraryStore = await createLibraryStore({ path: path.join(dir, "library.json"), clock });
  const workspaceSessionStore = await createWorkspaceSessionStore({ path: path.join(dir, "workspace.json"), clock });

  const sourcePath = path.join(dir, "img-a.JPG");
  await (await import("node:fs/promises")).writeFile(sourcePath, Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x02, 0x00, 0x03, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]));
  await libraryStore.importImage({ imageId: "img-a", sourcePath });
  await workspaceSessionStore.saveSnapshot("workspace-helper", {
    selectedImageId: "img-a",
    activeFilter: "all",
    expandedImageIds: ["img-a"],
  });

  const workflow = createCatalogDashboardWorkflow({ libraryStore, workspaceSessionStore });
  const result = await workflow.refreshWorkspaceSourceMetadata("workspace-helper");

  assert.deepEqual(result.metadataSummary, {
    total: 1,
    withKnownByteSize: 1,
    withKnownModifiedAt: 1,
    withKnownDimensions: 1,
    withObservedOrientation: 0,
    withObservedCaptureAt: 0,
    withObservedCamera: 0,
    withObservedLens: 0,
    withObservedFocalLength: 0,
    withObservedFNumber: 0,
    withObservedIsoSpeed: 0,
    withObservedExposureTime: 0,
    withObservedFlash: 0,
    withObservedExposureBias: 0,
    latestObservedCaptureAt: null,
    observedFormats: { jpeg: 1 },
    observedCameras: {},
    observedLenses: {},
    focalLengthMmRange: null,
    fNumberRange: null,
    isoSpeedRange: null,
    exposureTimeSecondsRange: null,
    latestObservedExposureEntry: null,
    flashUsage: { fired: 0, notFired: 0 },
    exposureBiasEvRange: null,
    exposureBiasEvRange: null,
    exposureTimeSecondsRange: null,
    latestObservedExposureEntry: null,
    flashUsage: { fired: 0, notFired: 0 },
    exposureBiasEvRange: null,
    exposureBiasEvRange: null,
  });
  assert.equal(result.summary.visibleSourceFiles.withKnownDimensions, 1);
  assert.ok(["img-a", "img-b"].includes(result.summary.latestVisibleObservedFormatSourceFile.imageId));
  assert.ok(["jpeg", "tiff"].includes(result.summary.latestVisibleObservedFormatSourceFile.observedFormat));
});


test("catalog dashboard workflow can list visible library entries for a workspace snapshot", async () => {
  const workflow = await makeHarness();
  const report = await workflow.listVisibleLibraryReport("workspace-main", {
    query: "canon tiff",
    queryMode: "any",
    sortBy: "isoSpeed",
    sortDirection: "desc",
    offset: 0,
    limit: 1,
  });

  assert.equal(report.operation.kind, "list-visible-library");
  assert.equal(report.operation.snapshotId, "workspace-main");
  assert.equal(report.operation.activeFilter, "keepers");
  assert.equal(report.operation.selectedImageId, "img-001");
  assert.equal(report.operation.selectedImageExists, true);
  assert.equal(report.operation.selectedImageVisible, true);
  assert.equal(report.operation.currentPageContainsSelectedImage, true);
  assert.equal(report.operation.currentPageSelectedImageId, "img-001");
  assert.equal(report.operation.currentPageSelectedImageIndex, 0);
  assert.equal(report.operation.currentPageSelectedImagePosition, 1);
  assert.equal(report.operation.currentPageSelectionState, "selected-on-page");
  assert.deepEqual(report.operation.currentPageSelection, {
    hasSelection: true,
    hasMatchedSelection: true,
    snapshotSelectedImageId: "img-001",
    matchedPosition: 1,
    matchedPageOffset: 0,
    matchedPageLimit: 1,
    matchedPageSize: 1,
    matchedHasResults: true,
    matchedIsPaged: true,
    matchedPageIndex: 0,
    matchedPageNumber: 1,
    matchedTotalPages: 2,
    matchedHasPreviousPage: false,
    matchedPreviousPageNumber: null,
    matchedPreviousOffset: null,
    matchedHasNextPage: true,
    matchedNextPageNumber: 2,
    matchedNextOffset: 1,
    matchedPageStartPosition: 1,
    matchedPageEndPosition: 1,
    matchedPageCount: 1,
    matchedPageHasSingleImage: true,
    matchedPageFirstImageId: "img-001",
    matchedPageLastImageId: "img-001",
    matchedPageImageIds: ["img-001"],
    currentPageOffset: 0,
    currentPageLimit: 1,
    currentPagePageSize: 1,
    currentPageIsPaged: true,
    currentPageIndex: 0,
    currentPageNumber: 1,
    currentPageTotalPages: 2,
    currentPageStartPosition: 1,
    currentPageEndPosition: 1,
    currentPageTotalMatchedCount: 2,
    currentPageResultCount: 1,
    currentPageHasResults: true,
    currentPageHasPreviousPage: false,
    currentPagePreviousPageNumber: null,
    currentPagePreviousOffset: null,
    currentPageHasNextPage: true,
    currentPageNextPageNumber: 2,
    currentPageNextOffset: 1,
    currentPageHasSingleImage: true,
    currentPageImageIds: ["img-001"],
    currentPageFirstImageId: "img-001",
    currentPageLastImageId: "img-001",
    currentPagePreviousImageId: "img-001",
    currentPageNextImageId: "img-001",
    selectedImageId: "img-001",
    selectedImageIndex: 0,
    selectedImagePosition: 1,
    containsSelectedImage: true,
    state: "selected-on-page",
  });
  assert.equal(report.operation.selectedImageMatched, true);
  assert.equal(report.operation.selectedImageState, "visible");
  assert.equal(report.operation.selectedImageOffset, 0);
  assert.equal(report.operation.selectedImageMatchedPosition, 1);
  assert.equal(report.operation.selectedImagePageIndex, 0);
  assert.equal(report.operation.selectedImagePageNumber, 1);
  assert.equal(report.operation.selectedImagePageStartPosition, 1);
  assert.equal(report.operation.selectedImagePageEndPosition, 1);
  assert.equal(report.operation.selectedImagePageCount, 1);
  assert.equal(report.operation.selectedImagePageFirstImageId, "img-001");
  assert.equal(report.operation.selectedImagePageLastImageId, "img-001");
  assert.deepEqual(report.operation.selectedImagePageImageIds, ["img-001"]);
  assert.equal(report.operation.selectedImageIndexOnPage, 0);
  assert.equal(report.operation.selectedImagePositionOnPage, 1);
  assert.equal(report.operation.selectedImagesBeforeOnPage, 0);
  assert.equal(report.operation.selectedImagesAfterOnPage, 0);
  assert.equal(report.operation.selectedImagesBeforeMatched, 0);
  assert.equal(report.operation.selectedImagesAfterMatched, 1);
  assert.equal(report.operation.selectedPreviousImageIdOnPage, null);
  assert.equal(report.operation.selectedNextImageIdOnPage, null);
  assert.equal(report.operation.selectedPreviousImageId, null);
  assert.equal(report.operation.selectedNextImageId, "img-003");
  assert.deepEqual(report.operation.effectiveFilter, {
    keepersOnly: true,
    query: "canon tiff",
    queryMode: "any",
    sortBy: "isoSpeed",
    sortDirection: "desc",
    offset: 0,
    limit: 1,
  });
  assert.equal(report.operation.currentPageIndex, 0);
  assert.equal(report.operation.currentPageNumber, 1);
  assert.deepEqual(report.operation.currentPageImageIds, ["img-001"]);
  assert.equal(report.operation.currentPageFirstImageId, "img-001");
  assert.equal(report.operation.currentPageLastImageId, "img-001");
  assert.equal(report.operation.currentPageStartPosition, 1);
  assert.equal(report.operation.currentPageEndPosition, 1);
  assert.equal(report.pageInfo.currentPageIndex, 0);
  assert.equal(report.pageInfo.currentPageNumber, 1);
  assert.deepEqual(report.pageInfo.currentPageImageIds, ["img-001"]);
  assert.equal(report.pageInfo.currentPageFirstImageId, "img-001");
  assert.equal(report.pageInfo.currentPageLastImageId, "img-001");
  assert.equal(report.pageInfo.currentPageStartPosition, 1);
  assert.equal(report.pageInfo.currentPageEndPosition, 1);
  assert.deepEqual(report.entries.map((entry) => entry.imageId), ["img-001"]);
  assert.deepEqual(report.visibleImageIds, ["img-001"]);
  assert.deepEqual(report.matchedImageIds, ["img-001", "img-003"]);
  assert.equal(report.totalMatchedCount, 2);
  assert.deepEqual(report.metadataSummary.observedFormats, { jpeg: 1 });
  assert.deepEqual(report.matchedMetadataSummary.observedFormats, { jpeg: 1, tiff: 1 });
  assert.deepEqual(report.facetSummary.ratingCounts, { 5: 1 });
  assert.deepEqual(report.matchedFacetSummary.ratingCounts, { 2: 1, 5: 1 });
  assert.equal(report.pageInfo.hasNextPage, true);
  assert.equal(report.pageInfo.nextOffset, 1);
  assert.deepEqual(report.pageInfo.visibleImageIds, ["img-001"]);
  assert.deepEqual(report.pageInfo.matchedImageIds, ["img-001", "img-003"]);
  assert.equal(report.pageInfo.selectedImageId, "img-001");
  assert.equal(report.pageInfo.selectedImageExists, true);
  assert.equal(report.pageInfo.selectedImageVisible, true);
  assert.equal(report.pageInfo.currentPageContainsSelectedImage, true);
  assert.equal(report.pageInfo.currentPageSelectedImageId, "img-001");
  assert.equal(report.pageInfo.currentPageSelectedImageIndex, 0);
  assert.equal(report.pageInfo.currentPageSelectedImagePosition, 1);
  assert.equal(report.pageInfo.currentPageSelectionState, "selected-on-page");
  assert.deepEqual(report.pageInfo.currentPageSelection, {
    hasSelection: true,
    hasMatchedSelection: true,
    snapshotSelectedImageId: "img-001",
    matchedPosition: 1,
    matchedPageOffset: 0,
    matchedPageLimit: 1,
    matchedPageSize: 1,
    matchedHasResults: true,
    matchedIsPaged: true,
    matchedPageIndex: 0,
    matchedPageNumber: 1,
    matchedTotalPages: 2,
    matchedHasPreviousPage: false,
    matchedPreviousPageNumber: null,
    matchedPreviousOffset: null,
    matchedHasNextPage: true,
    matchedNextPageNumber: 2,
    matchedNextOffset: 1,
    matchedPageStartPosition: 1,
    matchedPageEndPosition: 1,
    matchedPageCount: 1,
    matchedPageHasSingleImage: true,
    matchedPageFirstImageId: "img-001",
    matchedPageLastImageId: "img-001",
    matchedPageImageIds: ["img-001"],
    currentPageOffset: 0,
    currentPageLimit: 1,
    currentPagePageSize: 1,
    currentPageIsPaged: true,
    currentPageIndex: 0,
    currentPageNumber: 1,
    currentPageTotalPages: 2,
    currentPageStartPosition: 1,
    currentPageEndPosition: 1,
    currentPageTotalMatchedCount: 2,
    currentPageResultCount: 1,
    currentPageHasResults: true,
    currentPageHasPreviousPage: false,
    currentPagePreviousPageNumber: null,
    currentPagePreviousOffset: null,
    currentPageHasNextPage: true,
    currentPageNextPageNumber: 2,
    currentPageNextOffset: 1,
    currentPageHasSingleImage: true,
    currentPageImageIds: ["img-001"],
    currentPageFirstImageId: "img-001",
    currentPageLastImageId: "img-001",
    currentPagePreviousImageId: "img-001",
    currentPageNextImageId: "img-001",
    selectedImageId: "img-001",
    selectedImageIndex: 0,
    selectedImagePosition: 1,
    containsSelectedImage: true,
    state: "selected-on-page",
  });
  assert.equal(report.pageInfo.selectedImageMatched, true);
  assert.equal(report.pageInfo.selectedImageState, "visible");
  assert.equal(report.pageInfo.selectedImageOffset, 0);
  assert.equal(report.pageInfo.selectedImageMatchedPosition, 1);
  assert.equal(report.pageInfo.selectedImagePageIndex, 0);
  assert.equal(report.pageInfo.selectedImagePageNumber, 1);
  assert.equal(report.pageInfo.selectedImagePageStartPosition, 1);
  assert.equal(report.pageInfo.selectedImagePageEndPosition, 1);
  assert.equal(report.pageInfo.selectedImagePageCount, 1);
  assert.equal(report.pageInfo.selectedImagePageFirstImageId, "img-001");
  assert.equal(report.pageInfo.selectedImagePageLastImageId, "img-001");
  assert.deepEqual(report.pageInfo.selectedImagePageImageIds, ["img-001"]);
  assert.equal(report.pageInfo.selectedImageIndexOnPage, 0);
  assert.equal(report.pageInfo.selectedImagePositionOnPage, 1);
  assert.equal(report.pageInfo.selectedImagesBeforeOnPage, 0);
  assert.equal(report.pageInfo.selectedImagesAfterOnPage, 0);
  assert.equal(report.pageInfo.selectedImagesBeforeMatched, 0);
  assert.equal(report.pageInfo.selectedImagesAfterMatched, 1);
  assert.equal(report.pageInfo.selectedPreviousImageIdOnPage, null);
  assert.equal(report.pageInfo.selectedNextImageIdOnPage, null);
  assert.equal(report.pageInfo.selectedPreviousImageId, null);
  assert.equal(report.pageInfo.selectedNextImageId, "img-003");
  assert.deepEqual(report.operation.queryTerms, ["canon", "tiff"]);
  assert.equal(report.operation.queryMode, "any");
});

test("catalog dashboard workflow can return a visible-library summary without entries", async () => {
  const workflow = await makeHarness();
  const summary = await workflow.listVisibleLibrarySummary("workspace-main", {
    query: "canon tiff",
    queryMode: "any",
    sortBy: "isoSpeed",
    sortDirection: "desc",
    offset: 1,
    limit: 1,
  });

  assert.equal(summary.operation.kind, "list-visible-library");
  assert.deepEqual(summary.visibleImageIds, ["img-003"]);
  assert.deepEqual(summary.matchedImageIds, ["img-001", "img-003"]);
  assert.equal(summary.operation.selectedImageExists, true);
  assert.equal(summary.operation.selectedImageVisible, false);
  assert.equal(summary.operation.currentPageContainsSelectedImage, false);
  assert.equal(summary.operation.currentPageSelectedImageId, null);
  assert.equal(summary.operation.currentPageSelectedImageIndex, null);
  assert.equal(summary.operation.currentPageSelectedImagePosition, null);
  assert.equal(summary.operation.currentPageSelectionState, "selected-off-page");
  assert.deepEqual(summary.operation.currentPageSelection, {
    hasSelection: true,
    hasMatchedSelection: true,
    snapshotSelectedImageId: "img-001",
    matchedPosition: 1,
    matchedPageOffset: 0,
    matchedPageLimit: 1,
    matchedPageSize: 1,
    matchedHasResults: true,
    matchedIsPaged: true,
    matchedPageIndex: 0,
    matchedPageNumber: 1,
    matchedTotalPages: 2,
    matchedHasPreviousPage: false,
    matchedPreviousPageNumber: null,
    matchedPreviousOffset: null,
    matchedHasNextPage: true,
    matchedNextPageNumber: 2,
    matchedNextOffset: 1,
    matchedPageStartPosition: 1,
    matchedPageEndPosition: 1,
    matchedPageCount: 1,
    matchedPageHasSingleImage: true,
    matchedPageFirstImageId: "img-001",
    matchedPageLastImageId: "img-001",
    matchedPageImageIds: ["img-001"],
    currentPageOffset: 1,
    currentPageLimit: 1,
    currentPagePageSize: 1,
    currentPageIsPaged: true,
    currentPageIndex: 1,
    currentPageNumber: 2,
    currentPageTotalPages: 2,
    currentPageStartPosition: 2,
    currentPageEndPosition: 2,
    currentPageTotalMatchedCount: 2,
    currentPageResultCount: 1,
    currentPageHasResults: true,
    currentPageHasPreviousPage: true,
    currentPagePreviousPageNumber: 1,
    currentPagePreviousOffset: 0,
    currentPageHasNextPage: false,
    currentPageNextPageNumber: null,
    currentPageNextOffset: null,
    currentPageHasSingleImage: true,
    currentPageImageIds: ["img-003"],
    currentPageFirstImageId: "img-003",
    currentPageLastImageId: "img-003",
    currentPagePreviousImageId: "img-003",
    currentPageNextImageId: "img-003",
    selectedImageId: null,
    selectedImageIndex: null,
    selectedImagePosition: null,
    containsSelectedImage: false,
    state: "selected-off-page",
  });
  assert.equal(summary.operation.selectedImageMatched, true);
  assert.equal(summary.operation.selectedImageState, "matched-not-visible");
  assert.equal(summary.operation.selectedImageOffset, 0);
  assert.equal(summary.operation.selectedImageMatchedPosition, 1);
  assert.equal(summary.operation.selectedImagePageIndex, 0);
  assert.equal(summary.operation.selectedImagePageNumber, 1);
  assert.equal(summary.operation.selectedImagePageStartPosition, 1);
  assert.equal(summary.operation.selectedImagePageEndPosition, 1);
  assert.equal(summary.operation.selectedImagePageCount, 1);
  assert.equal(summary.operation.selectedImagePageFirstImageId, "img-001");
  assert.equal(summary.operation.selectedImagePageLastImageId, "img-001");
  assert.deepEqual(summary.operation.selectedImagePageImageIds, ["img-001"]);
  assert.equal(summary.operation.selectedImageIndexOnPage, null);
  assert.equal(summary.operation.selectedImagePositionOnPage, null);
  assert.equal(summary.operation.selectedImagesBeforeOnPage, null);
  assert.equal(summary.operation.selectedImagesAfterOnPage, null);
  assert.equal(summary.operation.selectedImagesBeforeMatched, 0);
  assert.equal(summary.operation.selectedImagesAfterMatched, 1);
  assert.equal(summary.operation.selectedPreviousImageIdOnPage, null);
  assert.equal(summary.operation.selectedNextImageIdOnPage, null);
  assert.equal(summary.operation.selectedPreviousImageId, null);
  assert.equal(summary.operation.selectedNextImageId, "img-003");
  assert.equal(summary.pageInfo.selectedImageExists, true);
  assert.equal(summary.pageInfo.selectedImageVisible, false);
  assert.equal(summary.pageInfo.currentPageContainsSelectedImage, false);
  assert.equal(summary.pageInfo.currentPageSelectedImageId, null);
  assert.equal(summary.pageInfo.currentPageSelectedImageIndex, null);
  assert.equal(summary.pageInfo.currentPageSelectedImagePosition, null);
  assert.equal(summary.pageInfo.currentPageSelectionState, "selected-off-page");
  assert.deepEqual(summary.pageInfo.currentPageSelection, {
    hasSelection: true,
    hasMatchedSelection: true,
    snapshotSelectedImageId: "img-001",
    matchedPosition: 1,
    matchedPageOffset: 0,
    matchedPageLimit: 1,
    matchedPageSize: 1,
    matchedHasResults: true,
    matchedIsPaged: true,
    matchedPageIndex: 0,
    matchedPageNumber: 1,
    matchedTotalPages: 2,
    matchedHasPreviousPage: false,
    matchedPreviousPageNumber: null,
    matchedPreviousOffset: null,
    matchedHasNextPage: true,
    matchedNextPageNumber: 2,
    matchedNextOffset: 1,
    matchedPageStartPosition: 1,
    matchedPageEndPosition: 1,
    matchedPageCount: 1,
    matchedPageHasSingleImage: true,
    matchedPageFirstImageId: "img-001",
    matchedPageLastImageId: "img-001",
    matchedPageImageIds: ["img-001"],
    currentPageOffset: 1,
    currentPageLimit: 1,
    currentPagePageSize: 1,
    currentPageIsPaged: true,
    currentPageIndex: 1,
    currentPageNumber: 2,
    currentPageTotalPages: 2,
    currentPageStartPosition: 2,
    currentPageEndPosition: 2,
    currentPageTotalMatchedCount: 2,
    currentPageResultCount: 1,
    currentPageHasResults: true,
    currentPageHasPreviousPage: true,
    currentPagePreviousPageNumber: 1,
    currentPagePreviousOffset: 0,
    currentPageHasNextPage: false,
    currentPageNextPageNumber: null,
    currentPageNextOffset: null,
    currentPageHasSingleImage: true,
    currentPageImageIds: ["img-003"],
    currentPageFirstImageId: "img-003",
    currentPageLastImageId: "img-003",
    currentPagePreviousImageId: "img-003",
    currentPageNextImageId: "img-003",
    selectedImageId: null,
    selectedImageIndex: null,
    selectedImagePosition: null,
    containsSelectedImage: false,
    state: "selected-off-page",
  });
  assert.equal(summary.pageInfo.selectedImageMatched, true);
  assert.equal(summary.pageInfo.selectedImageState, "matched-not-visible");
  assert.equal(summary.pageInfo.selectedImageOffset, 0);
  assert.equal(summary.pageInfo.selectedImageMatchedPosition, 1);
  assert.equal(summary.pageInfo.selectedImagePageIndex, 0);
  assert.equal(summary.pageInfo.selectedImagePageNumber, 1);
  assert.equal(summary.pageInfo.selectedImagePageStartPosition, 1);
  assert.equal(summary.pageInfo.selectedImagePageEndPosition, 1);
  assert.equal(summary.pageInfo.selectedImagePageCount, 1);
  assert.equal(summary.pageInfo.selectedImagePageFirstImageId, "img-001");
  assert.equal(summary.pageInfo.selectedImagePageLastImageId, "img-001");
  assert.deepEqual(summary.pageInfo.selectedImagePageImageIds, ["img-001"]);
  assert.equal(summary.pageInfo.selectedImageIndexOnPage, null);
  assert.equal(summary.pageInfo.selectedImagePositionOnPage, null);
  assert.equal(summary.pageInfo.selectedImagesBeforeOnPage, null);
  assert.equal(summary.pageInfo.selectedImagesAfterOnPage, null);
  assert.equal(summary.pageInfo.selectedImagesBeforeMatched, 0);
  assert.equal(summary.pageInfo.selectedImagesAfterMatched, 1);
  assert.equal(summary.pageInfo.selectedPreviousImageIdOnPage, null);
  assert.equal(summary.pageInfo.selectedNextImageIdOnPage, null);
  assert.equal(summary.pageInfo.selectedPreviousImageId, null);
  assert.equal(summary.pageInfo.selectedNextImageId, "img-003");
  assert.equal(summary.pageInfo.hasPreviousPage, true);
  assert.equal(summary.pageInfo.hasNextPage, false);
  assert.equal(summary.pageInfo.previousOffset, 0);
  assert.equal(summary.pageInfo.nextOffset, null);
  assert.equal(summary.operation.currentPageIndex, 1);
  assert.equal(summary.operation.currentPageNumber, 2);
  assert.deepEqual(summary.operation.currentPageImageIds, ["img-003"]);
  assert.equal(summary.operation.currentPageFirstImageId, "img-003");
  assert.equal(summary.operation.currentPageLastImageId, "img-003");
  assert.equal(summary.operation.currentPageStartPosition, 2);
  assert.equal(summary.operation.currentPageEndPosition, 2);
  assert.equal(summary.pageInfo.currentPageIndex, 1);
  assert.equal(summary.pageInfo.currentPageNumber, 2);
  assert.deepEqual(summary.pageInfo.currentPageImageIds, ["img-003"]);
  assert.equal(summary.pageInfo.currentPageFirstImageId, "img-003");
  assert.equal(summary.pageInfo.currentPageLastImageId, "img-003");
  assert.equal(summary.pageInfo.currentPageStartPosition, 2);
  assert.equal(summary.pageInfo.currentPageEndPosition, 2);
  assert.deepEqual(summary.metadataSummary.observedFormats, { tiff: 1 });
  assert.deepEqual(summary.matchedMetadataSummary.observedFormats, { jpeg: 1, tiff: 1 });
  assert.deepEqual(summary.facetSummary.ratingCounts, { 2: 1 });
  assert.deepEqual(summary.matchedFacetSummary.ratingCounts, { 2: 1, 5: 1 });
  assert.equal("entries" in summary, false);
});


test("catalog dashboard workflow can jump to the page containing the selected image", async () => {
  const workflow = await makeHarness();
  const report = await workflow.listVisibleLibraryAtSelectionReport("workspace-main", {
    query: "canon tiff",
    queryMode: "any",
    sortBy: "isoSpeed",
    sortDirection: "desc",
    limit: 1,
    offset: 99,
  });

  assert.equal(report.operation.kind, "list-visible-library-at-selection");
  assert.equal(report.operation.selectedImageMatched, true);
  assert.equal(report.operation.selectedImageVisible, true);
  assert.equal(report.operation.requestedOffset, 99);
  assert.equal(report.operation.selectionAnchorApplied, true);
  assert.equal(report.operation.selectionAnchorReason, "adjusted-to-selected-page");
  assert.equal(report.operation.selectedPageOffset, 0);
  assert.equal(report.operation.selectedPageIndex, 0);
  assert.equal(report.operation.selectedPageNumber, 1);
  assert.equal(report.operation.selectedPageStartPosition, 1);
  assert.equal(report.operation.selectedPageEndPosition, 1);
  assert.deepEqual(report.operation.selectedPageImageIds, ["img-001"]);
  assert.equal(report.operation.selectedPageCount, 1);
  assert.equal(report.operation.selectedPageFirstImageId, "img-001");
  assert.equal(report.operation.selectedPageLastImageId, "img-001");
  assert.equal(report.operation.selectedImageIndexOnPage, 0);
  assert.equal(report.operation.selectedImagePositionOnPage, 1);
  assert.deepEqual(report.entries.map((entry) => entry.imageId), ["img-001"]);
  assert.deepEqual(report.visibleImageIds, ["img-001"]);
  assert.deepEqual(report.matchedImageIds, ["img-001", "img-003"]);
  assert.equal(report.pageInfo.requestedOffset, 99);
  assert.equal(report.pageInfo.selectionAnchorApplied, true);
  assert.equal(report.pageInfo.selectionAnchorReason, "adjusted-to-selected-page");
  assert.equal(report.pageInfo.selectedPageOffset, 0);
  assert.equal(report.pageInfo.selectedPageIndex, 0);
  assert.equal(report.pageInfo.selectedPageNumber, 1);
  assert.equal(report.pageInfo.selectedPageStartPosition, 1);
  assert.equal(report.pageInfo.selectedPageEndPosition, 1);
  assert.deepEqual(report.pageInfo.selectedPageImageIds, ["img-001"]);
  assert.equal(report.pageInfo.selectedPageCount, 1);
  assert.equal(report.pageInfo.selectedPageFirstImageId, "img-001");
  assert.equal(report.pageInfo.selectedPageLastImageId, "img-001");
  assert.equal(report.pageInfo.selectedImageIndexOnPage, 0);
  assert.equal(report.pageInfo.selectedImagePositionOnPage, 1);
  assert.equal(report.pageInfo.offset, 0);
});

test("catalog dashboard workflow can summarize the selected image page without entries", async () => {
  const workflow = await makeHarness();
  const summary = await workflow.listVisibleLibraryAtSelectionSummary("workspace-main", {
    query: "canon tiff",
    queryMode: "any",
    sortBy: "isoSpeed",
    sortDirection: "desc",
    limit: 1,
  });

  assert.equal(summary.operation.kind, "list-visible-library-at-selection");
  assert.equal(summary.operation.requestedOffset, 0);
  assert.equal(summary.operation.selectionAnchorApplied, false);
  assert.equal(summary.operation.selectionAnchorReason, "already-on-selected-page");
  assert.equal(summary.operation.selectedPageOffset, 0);
  assert.equal(summary.operation.selectedPageIndex, 0);
  assert.equal(summary.operation.selectedPageNumber, 1);
  assert.equal(summary.operation.selectedPageStartPosition, 1);
  assert.equal(summary.operation.selectedPageEndPosition, 1);
  assert.deepEqual(summary.operation.selectedPageImageIds, ["img-001"]);
  assert.equal(summary.operation.selectedPageCount, 1);
  assert.equal(summary.operation.selectedPageFirstImageId, "img-001");
  assert.equal(summary.operation.selectedPageLastImageId, "img-001");
  assert.equal(summary.operation.selectedImageIndexOnPage, 0);
  assert.equal(summary.operation.selectedImagePositionOnPage, 1);
  assert.deepEqual(summary.visibleImageIds, ["img-001"]);
  assert.deepEqual(summary.matchedImageIds, ["img-001", "img-003"]);
  assert.equal(summary.pageInfo.requestedOffset, 0);
  assert.equal(summary.pageInfo.selectionAnchorApplied, false);
  assert.equal(summary.pageInfo.selectionAnchorReason, "already-on-selected-page");
  assert.equal(summary.pageInfo.selectedPageOffset, 0);
  assert.equal(summary.pageInfo.selectedPageIndex, 0);
  assert.equal(summary.pageInfo.selectedPageNumber, 1);
  assert.equal(summary.pageInfo.selectedPageStartPosition, 1);
  assert.equal(summary.pageInfo.selectedPageEndPosition, 1);
  assert.deepEqual(summary.pageInfo.selectedPageImageIds, ["img-001"]);
  assert.equal(summary.pageInfo.selectedPageCount, 1);
  assert.equal(summary.pageInfo.selectedPageFirstImageId, "img-001");
  assert.equal(summary.pageInfo.selectedPageLastImageId, "img-001");
  assert.equal(summary.pageInfo.selectedImageIndexOnPage, 0);
  assert.equal(summary.pageInfo.selectedImagePositionOnPage, 1);
  assert.equal("entries" in summary, false);
});


test("catalog dashboard workflow reports why selection anchoring was skipped or unnecessary", async () => {
  const workflow = await makeHarness();

  const unpaged = await workflow.listVisibleLibraryAtSelectionReport("workspace-main", {
    query: "canon tiff",
    queryMode: "any",
    sortBy: "isoSpeed",
    sortDirection: "desc",
  });
  assert.equal(unpaged.operation.selectionAnchorApplied, false);
  assert.equal(unpaged.operation.selectionAnchorReason, "unpaged");
  assert.equal(unpaged.operation.selectedPageNumber, 1);
  assert.equal(unpaged.operation.selectedPageStartPosition, 1);
  assert.equal(unpaged.operation.selectedPageEndPosition, 2);
  assert.deepEqual(unpaged.operation.selectedPageImageIds, ["img-001", "img-003"]);
  assert.equal(unpaged.operation.selectedPageCount, 2);
  assert.equal(unpaged.operation.selectedPageFirstImageId, "img-001");
  assert.equal(unpaged.operation.selectedPageLastImageId, "img-003");
  assert.equal(unpaged.pageInfo.selectionAnchorReason, "unpaged");
  assert.equal(unpaged.pageInfo.selectedPageNumber, 1);
  assert.equal(unpaged.pageInfo.selectedPageStartPosition, 1);
  assert.equal(unpaged.pageInfo.selectedPageEndPosition, 2);
  assert.deepEqual(unpaged.pageInfo.selectedPageImageIds, ["img-001", "img-003"]);
  assert.equal(unpaged.pageInfo.selectedPageCount, 2);
  assert.equal(unpaged.pageInfo.selectedPageFirstImageId, "img-001");
  assert.equal(unpaged.pageInfo.selectedPageLastImageId, "img-003");

  const nonMatch = await workflow.listVisibleLibraryAtSelectionReport("workspace-main", {
    query: "tiff",
    sortBy: "isoSpeed",
    sortDirection: "desc",
    limit: 1,
  });
  assert.equal(nonMatch.operation.selectedImageMatched, false);
  assert.equal(nonMatch.operation.selectedImagePageStartPosition, null);
  assert.equal(nonMatch.operation.selectedImagePageEndPosition, null);
  assert.equal(nonMatch.operation.selectedImagePageCount, null);
  assert.equal(nonMatch.operation.selectedImagePageFirstImageId, null);
  assert.equal(nonMatch.operation.selectedImagePageLastImageId, null);
  assert.equal(nonMatch.operation.selectedImagePageImageIds, null);
  assert.equal(nonMatch.pageInfo.selectedImagePageStartPosition, null);
  assert.equal(nonMatch.pageInfo.selectedImagePageEndPosition, null);
  assert.equal(nonMatch.pageInfo.selectedImagePageCount, null);
  assert.equal(nonMatch.pageInfo.selectedImagePageFirstImageId, null);
  assert.equal(nonMatch.pageInfo.selectedImagePageLastImageId, null);
  assert.equal(nonMatch.pageInfo.selectedImagePageImageIds, null);
  assert.equal(nonMatch.operation.selectionAnchorApplied, false);
  assert.equal(nonMatch.operation.selectionAnchorReason, "selected-not-matched");
  assert.equal(nonMatch.pageInfo.selectionAnchorReason, "selected-not-matched");
});


test("catalog dashboard workflow reports missing selected images honestly in visible-library helpers", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-dashboard-missing-selected-"));
  let tick = 0;
  const clock = () => `2025-07-16T05:00:0${Math.min(tick++, 9)}.000Z`;
  const libraryStore = await createLibraryStore({ path: path.join(dir, "library.json"), clock });
  const workspaceSessionStore = await createWorkspaceSessionStore({ path: path.join(dir, "workspace.json"), clock });

  await libraryStore.importImage({ imageId: "img-a", sourcePath: "/shoot/day1/img-a.CR3", rating: 1, observedFormat: "jpeg" });
  await workspaceSessionStore.saveSnapshot("workspace-missing-selected", {
    selectedImageId: "missing-image",
    activeFilter: "all",
    expandedImageIds: ["img-a"],
  });

  const workflow = createCatalogDashboardWorkflow({ libraryStore, workspaceSessionStore });
  const report = await workflow.listVisibleLibraryReport("workspace-missing-selected", { limit: 1 });

  assert.equal(report.operation.selectedImageId, "missing-image");
  assert.equal(report.operation.selectedImageExists, false);
  assert.equal(report.operation.selectedImageVisible, false);
  assert.equal(report.operation.currentPageContainsSelectedImage, false);
  assert.equal(report.operation.currentPageSelectedImageId, null);
  assert.equal(report.operation.currentPageSelectedImageIndex, null);
  assert.equal(report.operation.currentPageSelectedImagePosition, null);
  assert.equal(report.operation.currentPageSelectionState, "selection-missing");
  assert.deepEqual(report.operation.currentPageSelection, {
    hasSelection: true,
    hasMatchedSelection: false,
    snapshotSelectedImageId: "missing-image",
    matchedPosition: null,
    matchedPageOffset: null,
    matchedPageLimit: null,
    matchedPageSize: null,
    matchedHasResults: false,
    matchedIsPaged: false,
    matchedPageIndex: null,
    matchedPageNumber: null,
    matchedTotalPages: null,
    matchedHasPreviousPage: false,
    matchedPreviousPageNumber: null,
    matchedPreviousOffset: null,
    matchedHasNextPage: false,
    matchedNextPageNumber: null,
    matchedNextOffset: null,
    matchedPageStartPosition: null,
    matchedPageEndPosition: null,
    matchedPageCount: null,
    matchedPageHasSingleImage: false,
    matchedPageFirstImageId: null,
    matchedPageLastImageId: null,
    matchedPageImageIds: null,
    currentPageOffset: 0,
    currentPageLimit: 1,
    currentPagePageSize: 1,
    currentPageIsPaged: true,
    currentPageIndex: 0,
    currentPageNumber: 1,
    currentPageTotalPages: 1,
    currentPageStartPosition: 1,
    currentPageEndPosition: 1,
    currentPageTotalMatchedCount: 1,
    currentPageResultCount: 1,
    currentPageHasResults: true,
    currentPageHasPreviousPage: false,
    currentPagePreviousPageNumber: null,
    currentPagePreviousOffset: null,
    currentPageHasNextPage: false,
    currentPageNextPageNumber: null,
    currentPageNextOffset: null,
    currentPageHasSingleImage: true,
    currentPageImageIds: ["img-a"],
    currentPageFirstImageId: "img-a",
    currentPageLastImageId: "img-a",
    currentPagePreviousImageId: "img-a",
    currentPageNextImageId: "img-a",
    selectedImageId: null,
    selectedImageIndex: null,
    selectedImagePosition: null,
    containsSelectedImage: false,
    state: "selection-missing",
  });
  assert.equal(report.operation.selectedImageMatched, false);
  assert.equal(report.operation.selectedImageState, "missing");
  assert.equal(report.pageInfo.selectedImageExists, false);
  assert.equal(report.pageInfo.selectedImageVisible, false);
  assert.equal(report.pageInfo.currentPageContainsSelectedImage, false);
  assert.equal(report.pageInfo.currentPageSelectedImageId, null);
  assert.equal(report.pageInfo.currentPageSelectedImageIndex, null);
  assert.equal(report.pageInfo.currentPageSelectedImagePosition, null);
  assert.equal(report.pageInfo.currentPageSelectionState, "selection-missing");
  assert.deepEqual(report.pageInfo.currentPageSelection, {
    hasSelection: true,
    hasMatchedSelection: false,
    snapshotSelectedImageId: "missing-image",
    matchedPosition: null,
    matchedPageOffset: null,
    matchedPageLimit: null,
    matchedPageSize: null,
    matchedHasResults: false,
    matchedIsPaged: false,
    matchedPageIndex: null,
    matchedPageNumber: null,
    matchedTotalPages: null,
    matchedHasPreviousPage: false,
    matchedPreviousPageNumber: null,
    matchedPreviousOffset: null,
    matchedHasNextPage: false,
    matchedNextPageNumber: null,
    matchedNextOffset: null,
    matchedPageStartPosition: null,
    matchedPageEndPosition: null,
    matchedPageCount: null,
    matchedPageHasSingleImage: false,
    matchedPageFirstImageId: null,
    matchedPageLastImageId: null,
    matchedPageImageIds: null,
    currentPageOffset: 0,
    currentPageLimit: 1,
    currentPagePageSize: 1,
    currentPageIsPaged: true,
    currentPageIndex: 0,
    currentPageNumber: 1,
    currentPageTotalPages: 1,
    currentPageStartPosition: 1,
    currentPageEndPosition: 1,
    currentPageTotalMatchedCount: 1,
    currentPageResultCount: 1,
    currentPageHasResults: true,
    currentPageHasPreviousPage: false,
    currentPagePreviousPageNumber: null,
    currentPagePreviousOffset: null,
    currentPageHasNextPage: false,
    currentPageNextPageNumber: null,
    currentPageNextOffset: null,
    currentPageHasSingleImage: true,
    currentPageImageIds: ["img-a"],
    currentPageFirstImageId: "img-a",
    currentPageLastImageId: "img-a",
    currentPagePreviousImageId: "img-a",
    currentPageNextImageId: "img-a",
    selectedImageId: null,
    selectedImageIndex: null,
    selectedImagePosition: null,
    containsSelectedImage: false,
    state: "selection-missing",
  });
  assert.equal(report.pageInfo.selectedImageMatched, false);
  assert.equal(report.pageInfo.selectedImageState, "missing");
});

test("catalog dashboard workflow visible-library helpers surface selected-image GPS presence", async () => {
  const workflow = await makeHarness();
  const report = await workflow.listVisibleLibraryReport("workspace-main", { hasGps: false });
  assert.equal(report.operation.selectedImageHasGps, false);
  assert.equal(report.pageInfo.selectedImageHasGps, false);
});

test("catalog dashboard workflow visible-library helpers surface selected-image GPS altitude presence", async () => {
  const workflow = await makeHarness();
  const report = await workflow.listVisibleLibraryReport("workspace-main", { hasGps: false });
  assert.equal(report.operation.selectedImageHasGpsAltitude, false);
  assert.equal(report.pageInfo.selectedImageHasGpsAltitude, false);
});

test("catalog dashboard workflow visible-library helpers surface selected-image metering and white-balance presence", async () => {
  const workflow = await makeHarness();
  const report = await workflow.listVisibleLibraryReport("workspace-main", { hasGps: false });
  assert.equal(report.operation.selectedImageHasMeteringMode, false);
  assert.equal(report.operation.selectedImageHasWhiteBalanceMode, false);
  assert.equal(report.pageInfo.selectedImageHasMeteringMode, false);
  assert.equal(report.pageInfo.selectedImageHasWhiteBalanceMode, false);
});

test("catalog dashboard workflow visible-library helpers surface selected-image exposure-program presence", async () => {
  const workflow = await makeHarness();
  const report = await workflow.listVisibleLibraryReport("workspace-main", { hasGps: false });
  assert.equal(report.operation.selectedImageHasExposureProgram, false);
  assert.equal(report.pageInfo.selectedImageHasExposureProgram, false);
});
