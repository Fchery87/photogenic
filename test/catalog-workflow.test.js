import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createLibraryStore } from "../src/catalog/library-store.js";
import { createCatalogRecipeStore } from "../src/catalog/recipe-store.js";
import { createCatalogWorkflow } from "../src/catalog/workflow.js";

async function makeWorkflow() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-catalog-workflow-"));
  const clockValues = [
    "2025-07-06T00:00:00.000Z",
    "2025-07-06T00:00:01.000Z",
    "2025-07-06T00:00:02.000Z",
    "2025-07-06T00:00:03.000Z",
    "2025-07-06T00:00:04.000Z",
    "2025-07-06T00:00:05.000Z",
  ];
  let i = 0;
  const clock = () => clockValues[i++] ?? clockValues.at(-1);
  const libraryStore = await createLibraryStore({ path: path.join(dir, "library.json"), clock });
  const recipeStore = await createCatalogRecipeStore({ path: path.join(dir, "catalog.json"), clock });
  const workflow = createCatalogWorkflow({
    libraryStore,
    recipeStore,
    defaultRecipeFactory: (image) => createRecipe({ meta: { importedFrom: image.sourcePath } }),
  });
  return { workflow, libraryStore, recipeStore };
}

test("catalog workflow imports supported files into both library and recipe stores", async () => {
  const { workflow, libraryStore, recipeStore } = await makeWorkflow();
  const result = await workflow.importShoot([
    { sourcePath: "/shoot/day1/img-001.CR3", captureAt: "2025-07-01T10:00:00.000Z" },
    { sourcePath: "/shoot/day1/img-002.JPG", captureAt: "2025-07-01T10:00:01.000Z" },
    { sourcePath: "/shoot/day1/readme.txt" },
  ]);

  assert.deepEqual(result.counts, { imported: 2, skipped: 1, total: 3, importedWithKnownByteSize: 0, importedWithKnownModifiedAt: 0, importedWithKnownDimensions: 0, importedWithObservedOrientation: 0, importedWithObservedCaptureAt: 0, importedWithObservedCamera: 0, importedWithObservedLens: 0, importedWithObservedFocalLength: 0, importedWithObservedFNumber: 0, importedWithObservedIsoSpeed: 0, importedWithObservedExposureTime: 0, importedWithObservedExposureProgram: 0, importedWithObservedExposureMode: 0, importedWithObservedFlash: 0, importedWithObservedExposureBias: 0, importedWithObservedGps: 0, importedWithObservedGpsAltitude: 0, importedWithObservedMeteringMode: 0, importedWithObservedWhiteBalanceMode: 0 });
  assert.deepEqual(result.sourceFiles, { byteSizeTotal: 0, latestModifiedAt: null, latestObservedCaptureAt: null, observedFormats: {}, observedCameras: {}, observedLenses: {}, focalLengthMmRange: null, fNumberRange: null, isoSpeedRange: null, exposureTimeSecondsRange: null,
    flashUsage: { fired: 0, notFired: 0 },
    exposureBiasEvRange: null, latestObservedExposureEntry: null, latestObservedGpsEntry: null, gpsAltitudeRange: null, meteringModes: {}, whiteBalanceModes: {}, exposurePrograms: {}, exposureModes: {}, largestPixelArea: null });
  assert.equal(result.catalogEntries.length, 2);
  assert.equal(result.catalogEntries[0].recipe.revision, 1);

  const libraryEntries = await libraryStore.list();
  const recipeIds = await recipeStore.listImageIds();
  assert.equal(libraryEntries.length, 2);
  assert.equal(recipeIds.length, 2);
  assert.deepEqual((await recipeStore.get(result.catalogEntries[0].imageId)).recipe.meta, {
    importedFrom: "/shoot/day1/img-001.CR3",
  });
});

test("catalog workflow delegates culling metadata mutations to the library store", async () => {
  const { workflow, libraryStore } = await makeWorkflow();
  const imported = await workflow.importShoot([{ sourcePath: "/shoot/day1/img-009.CR3" }]);
  const imageId = imported.imported[0].imageId;

  await workflow.applyRating(imageId, 5);
  await workflow.applyFlag(imageId, true);
  await workflow.applyRejected(imageId, false);
  await workflow.applyColorLabel(imageId, "green");

  const loaded = await libraryStore.get(imageId);
  assert.equal(loaded.rating, 5);
  assert.equal(loaded.flagged, true);
  assert.equal(loaded.rejected, false);
  assert.equal(loaded.colorLabel, "green");
});


test("catalog workflow can refresh observable source metadata for an imported image", async () => {
  const { workflow, libraryStore } = await makeWorkflow();
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-catalog-refresh-source-"));
  const sourcePath = path.join(dir, "img-010.CR3");
  await (await import("node:fs/promises")).writeFile(sourcePath, "abc");
  const imported = await workflow.importShoot([{ sourcePath }]);
  const imageId = imported.imported[0].imageId;
  await (await import("node:fs/promises")).writeFile(sourcePath, "abcdefghijk");

  const refreshed = await workflow.refreshSourceMetadata(imageId);
  assert.equal(refreshed.byteSize, 11);
  assert.match(refreshed.modifiedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal((await libraryStore.get(imageId)).byteSize, 11);
});


test("catalog workflow importShootReport returns operation metadata with imported entries", async () => {
  const { workflow } = await makeWorkflow();
  const result = await workflow.importShootReport([
    { sourcePath: "/shoot/day1/img-101.CR3", captureAt: "2025-07-01T10:00:00.000Z" },
    { sourcePath: "/shoot/day1/readme.txt" },
  ]);

  assert.equal(result.operation.kind, "import-shoot");
  assert.equal(result.operation.requestedFileCount, 2);
  assert.deepEqual(result.operation.importedImageIds, [result.catalogEntries[0].imageId]);
  assert.deepEqual(result.operation.skippedSourcePaths, ["/shoot/day1/readme.txt"]);
  assert.deepEqual(result.imported.counts, {
    imported: 1,
    skipped: 1,
    total: 2,
    importedWithKnownByteSize: 0,
    importedWithKnownModifiedAt: 0,
    importedWithKnownDimensions: 0,
    importedWithObservedOrientation: 0,
    importedWithObservedCaptureAt: 0,
    importedWithObservedCamera: 0,
    importedWithObservedLens: 0,
    importedWithObservedFocalLength: 0,
    importedWithObservedFNumber: 0,
    importedWithObservedIsoSpeed: 0,
    importedWithObservedExposureTime: 0,
    importedWithObservedExposureProgram: 0,
    importedWithObservedFlash: 0,
    importedWithObservedExposureBias: 0,
    importedWithObservedMeteringMode: 0,
    importedWithObservedWhiteBalanceMode: 0,
    importedWithObservedExposureMode: 0,
    importedWithObservedGps: 0,
    importedWithObservedGpsAltitude: 0,
  });
  assert.equal(result.catalogEntries.length, 1);
});


test("catalog workflow refreshSourceMetadataReport returns operation metadata", async () => {
  const { workflow } = await makeWorkflow();
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-catalog-refresh-report-"));
  const sourcePath = path.join(dir, "img-011.JPG");
  await (await import("node:fs/promises")).writeFile(sourcePath, Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x04, 0x00, 0x06, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]));
  const imported = await workflow.importShoot([{ sourcePath }]);
  const imageId = imported.imported[0].imageId;

  const result = await workflow.refreshSourceMetadataReport(imageId);
  assert.deepEqual(result.operation, {
    kind: "refresh-source-metadata",
    imageId,
    observedFormat: "jpeg",
    observedCaptureAt: null,
    cameraMake: null,
    cameraModel: null,
    lensModel: null,
    focalLengthMm: null,
    fNumber: null,
    isoSpeed: null,
    exposureTimeSeconds: null,
    exposureProgram: null,
    exposureMode: null,
    flashFired: null,
    exposureBiasEv: null,
    gpsLatitude: null,
    gpsLongitude: null,
    gpsAltitudeM: null,
    meteringMode: null,
    whiteBalanceMode: null,
  });
  assert.equal(result.refreshed.pixelWidth, 6);
  assert.equal(result.refreshed.pixelHeight, 4);
});

test("catalog workflow can bulk refresh selected source metadata and summarize coverage", async () => {
  const { workflow } = await makeWorkflow();
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-catalog-bulk-refresh-"));
  const jpegPath = path.join(dir, "img-012.JPG");
  const tifPath = path.join(dir, "img-013.TIF");
  await (await import("node:fs/promises")).writeFile(jpegPath, Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x03, 0x00, 0x05, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]));
  const tiffPayload = Buffer.alloc(76);
  tiffPayload.write("II", 0, "ascii");
  tiffPayload.writeUInt16LE(42, 2);
  tiffPayload.writeUInt32LE(8, 4);
  tiffPayload.writeUInt16LE(4, 8);
  tiffPayload.writeUInt16LE(256, 10); tiffPayload.writeUInt16LE(4, 12); tiffPayload.writeUInt32LE(1, 14); tiffPayload.writeUInt32LE(120, 18);
  tiffPayload.writeUInt16LE(257, 22); tiffPayload.writeUInt16LE(4, 24); tiffPayload.writeUInt32LE(1, 26); tiffPayload.writeUInt32LE(80, 30);
  tiffPayload.writeUInt16LE(274, 34); tiffPayload.writeUInt16LE(3, 36); tiffPayload.writeUInt32LE(1, 38); tiffPayload.writeUInt16LE(8, 42);
  tiffPayload.writeUInt16LE(34665, 46); tiffPayload.writeUInt16LE(4, 48); tiffPayload.writeUInt32LE(1, 50); tiffPayload.writeUInt32LE(62, 54);
  tiffPayload.writeUInt32LE(0, 58);
  tiffPayload.writeUInt16LE(1, 62);
  tiffPayload.writeUInt16LE(36867, 64); tiffPayload.writeUInt16LE(2, 66); tiffPayload.writeUInt32LE(20, 68); tiffPayload.writeUInt32LE(76, 72);
  await (await import("node:fs/promises")).writeFile(tifPath, Buffer.concat([tiffPayload, Buffer.from("2024:01:02 03:04:05 ", "ascii")]));

  const imported = await workflow.importShoot([{ sourcePath: jpegPath }, { sourcePath: tifPath }]);
  const imageIds = imported.imported.map((entry) => entry.imageId);
  const result = await workflow.refreshAllSourceMetadataReport({ imageIds: [...imageIds, "missing-image"] });

  assert.deepEqual(result.operation, {
    kind: "refresh-all-source-metadata",
    requestedImageIds: [...imageIds, "missing-image"],
    refreshedImageIds: imageIds,
    skippedImageIds: ["missing-image"],
  });
  assert.equal(result.summary.total, 2);
  assert.equal(result.summary.withKnownDimensions, 2);
  assert.equal(result.summary.withObservedOrientation, 1);
  assert.equal(result.summary.withObservedCaptureAt, 1);
  assert.equal(result.summary.withObservedCamera, 0);
  assert.equal(result.summary.withObservedLens, 0);
  assert.equal(result.summary.withObservedFocalLength, 0);
  assert.equal(result.summary.withObservedFNumber, 0);
  assert.equal(result.summary.withObservedIsoSpeed, 0);
  assert.equal(result.summary.withObservedExposureTime, 0);
  assert.equal(result.summary.withObservedFlash, 0);
  assert.equal(result.summary.withObservedExposureBias, 0);
  assert.equal(result.summary.latestObservedCaptureAt, "2024:01:02 03:04:05");
  assert.deepEqual(result.summary.observedFormats, { jpeg: 1, tiff: 1 });
  assert.deepEqual(result.summary.observedCameras, {});
  assert.deepEqual(result.summary.observedLenses, {});
  assert.equal(result.summary.focalLengthMmRange, null);
  assert.equal(result.summary.fNumberRange, null);
  assert.equal(result.summary.isoSpeedRange, null);
  assert.equal(result.summary.exposureTimeSecondsRange, null);
  assert.deepEqual(result.summary.flashUsage, { fired: 0, notFired: 0 });
  assert.equal(result.summary.exposureBiasEvRange, null);
  assert.equal(result.summary.latestObservedExposureEntry, null);
});


test("catalog workflow can inspect arbitrary source paths without importing them", async () => {
  const { workflow } = await makeWorkflow();
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-catalog-inspect-paths-"));
  const pngPath = path.join(dir, "preview.png");
  const missingPath = path.join(dir, "missing.cr3");
  await (await import("node:fs/promises")).writeFile(pngPath, Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x05,
    0x00, 0x00, 0x00, 0x03,
    0x08, 0x02, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]));

  const summary = await workflow.inspectSourcePaths([pngPath, missingPath]);
  assert.deepEqual(summary.counts, {
    total: 2,
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
    withObservedExposureProgram: 0,
    withObservedExposureMode: 0,
    withObservedFlash: 0,
    withObservedExposureBias: 0,
    withObservedGps: 0,
    withObservedGpsAltitude: 0,
    withObservedMeteringMode: 0,
    withObservedWhiteBalanceMode: 0,
  });
  assert.deepEqual(summary.observedFormats, { png: 1 });
  assert.deepEqual(summary.observedCameras, {});
  assert.deepEqual(summary.observedLenses, {});
  assert.equal(summary.focalLengthMmRange, null);
  assert.equal(summary.fNumberRange, null);
  assert.equal(summary.isoSpeedRange, null);
  assert.equal(summary.exposureTimeSecondsRange, null);
  assert.deepEqual(summary.flashUsage, { fired: 0, notFired: 0 });
  assert.equal(summary.exposureBiasEvRange, null);
  assert.equal(summary.latestObservedFormatEntry.sourcePath, pngPath);
  assert.equal(summary.largestPixelArea, 15);
});

test("catalog workflow inspectSourcePathsReport returns operation metadata and missing path tracking", async () => {
  const { workflow } = await makeWorkflow();
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-catalog-inspect-report-"));
  const jpgPath = path.join(dir, "frame.jpg");
  const missingPath = path.join(dir, "missing.nef");
  await (await import("node:fs/promises")).writeFile(jpgPath, Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x04, 0x00, 0x06, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]));

  const report = await workflow.inspectSourcePathsReport([jpgPath, missingPath]);
  assert.deepEqual(report.operation, {
    kind: "summarize-observed-source-files",
    requestedSourcePaths: [jpgPath, missingPath],
    missingSourcePaths: [missingPath],
    observedSourcePaths: [jpgPath],
  });
  assert.equal(report.counts.withKnownDimensions, 1);
  assert.equal(report.counts.withObservedCamera, 0);
  assert.deepEqual(report.observedFormats, { jpeg: 1 });
  assert.equal(report.latestObservedFormatEntry.sourcePath, jpgPath);
});


test("catalog workflow can list library entries using observed source metadata filters", async () => {
  const { workflow, libraryStore } = await makeWorkflow();
  await libraryStore.importImage({
    imageId: "jpeg-canon",
    sourcePath: "/shoot/jpeg-canon.CR3",
    observedFormat: "jpeg",
    cameraMake: "Canon",
    cameraModel: "EOS R6",
    lensModel: "RF24-70mm F2.8 L IS USM",
    focalLengthMm: 70,
    isoSpeed: 400,
    flashFired: true,
  });
  await libraryStore.importImage({
    imageId: "tiff-nikon",
    sourcePath: "/shoot/tiff-nikon.CR3",
    observedFormat: "tiff",
    cameraMake: "Nikon",
    cameraModel: "Zf II",
    lensModel: "NIKKOR Z 24-70mm f/2.8 S",
    focalLengthMm: 35,
    isoSpeed: 100,
    flashFired: false,
  });
  await workflow.applyFlag("jpeg-canon", true);

  const flagged = await workflow.listLibrary({ flagged: true });
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].imageId, "jpeg-canon");

  const report = await workflow.listLibraryReport({ observedFormat: "jpeg" });
  assert.equal(report.operation.kind, "list-library");
  assert.deepEqual(report.operation.filter, { observedFormat: "jpeg" });
  assert.equal(report.operation.resultCount, 1);
  assert.equal(report.entries[0].imageId, "jpeg-canon");
  assert.equal(report.metadataSummary.total, 1);
  assert.equal(report.metadataSummary.withObservedCamera, 1);
  assert.deepEqual(report.metadataSummary.observedFormats, { jpeg: 1 });
  assert.deepEqual(report.metadataSummary.observedCameras, { "Canon EOS R6": 1 });
  assert.deepEqual(report.metadataSummary.observedLenses, { "RF24-70mm F2.8 L IS USM": 1 });
  assert.deepEqual(report.metadataSummary.isoSpeedRange, { min: 400, max: 400 });
  assert.deepEqual(report.metadataSummary.focalLengthMmRange, { min: 70, max: 70 });
  assert.deepEqual(report.metadataSummary.flashUsage, { fired: 1, notFired: 0 });
  assert.equal(report.matchedMetadataSummary.total, 1);
  assert.deepEqual(report.matchedMetadataSummary.observedFormats, { jpeg: 1 });
  assert.deepEqual(report.facetSummary, {
    total: 1,
    flaggedCount: 1,
    rejectedCount: 0,
    keeperCount: 1,
    unratedCount: 1,
    colorLabelCounts: {},
    ratingCounts: { 0: 1 },
  });
  assert.deepEqual(report.matchedFacetSummary, {
    total: 1,
    flaggedCount: 1,
    rejectedCount: 0,
    keeperCount: 1,
    unratedCount: 1,
    colorLabelCounts: {},
    ratingCounts: { 0: 1 },
  });

  const flashFiltered = await workflow.listLibraryReport({ flashFired: true });
  assert.equal(flashFiltered.operation.resultCount, 1);
  assert.equal(flashFiltered.entries[0].imageId, "jpeg-canon");
  assert.equal(flashFiltered.metadataSummary.total, 1);

  const sorted = await workflow.listLibraryReport({ sortBy: "isoSpeed", sortDirection: "desc" });
  assert.deepEqual(sorted.operation.filter, { sortBy: "isoSpeed", sortDirection: "desc" });
  assert.deepEqual(sorted.entries.map((entry) => entry.imageId), ["jpeg-canon", "tiff-nikon"]);
  assert.deepEqual(sorted.visibleImageIds, ["jpeg-canon", "tiff-nikon"]);
  assert.deepEqual(sorted.matchedImageIds, ["jpeg-canon", "tiff-nikon"]);
  assert.deepEqual(sorted.operation.visibleImageIds, ["jpeg-canon", "tiff-nikon"]);
  assert.deepEqual(sorted.operation.matchedImageIds, ["jpeg-canon", "tiff-nikon"]);

  const searched = await workflow.listLibraryReport({ query: "canon" });
  assert.deepEqual(searched.operation.filter, { query: "canon" });
  assert.deepEqual(searched.entries.map((entry) => entry.imageId), ["jpeg-canon"]);
  assert.equal(searched.metadataSummary.total, 1);
  assert.equal(searched.matchedMetadataSummary.total, 1);

  const multiTermSearch = await workflow.listLibraryReport({ query: "canon 70" });
  assert.deepEqual(multiTermSearch.entries.map((entry) => entry.imageId), ["jpeg-canon"]);
  assert.equal(multiTermSearch.operation.resultCount, 1);
  assert.deepEqual(multiTermSearch.operation.queryTerms, ["canon", "70"]);
  assert.equal(multiTermSearch.operation.queryMode, "all");

  const anyTermSearch = await workflow.listLibraryReport({ query: "canon nikon", queryMode: "any" });
  assert.deepEqual(anyTermSearch.entries.map((entry) => entry.imageId), ["jpeg-canon", "tiff-nikon"]);
  assert.deepEqual(anyTermSearch.operation.queryTerms, ["canon", "nikon"]);
  assert.equal(anyTermSearch.operation.queryMode, "any");
  assert.deepEqual(anyTermSearch.pageInfo.queryTerms, ["canon", "nikon"]);
  assert.equal(anyTermSearch.pageInfo.queryMode, "any");

  const fieldScopedSearch = await workflow.listLibraryReport({ query: "canon eos", queryFields: ["cameraMake", "cameraModel"] });
  assert.deepEqual(fieldScopedSearch.entries.map((entry) => entry.imageId), ["jpeg-canon"]);
  assert.deepEqual(fieldScopedSearch.operation.queryFields, ["cameraMake", "cameraModel"]);
  assert.deepEqual(fieldScopedSearch.pageInfo.queryFields, ["cameraMake", "cameraModel"]);

  const paged = await workflow.listLibraryReport({ sortBy: "isoSpeed", sortDirection: "desc", offset: 1, limit: 1 });
  assert.deepEqual(paged.operation.filter, { sortBy: "isoSpeed", sortDirection: "desc", offset: 1, limit: 1 });
  assert.equal(paged.operation.resultCount, 1);
  assert.equal(paged.operation.totalMatchedCount, 2);
  assert.equal(paged.operation.offset, 1);
  assert.equal(paged.operation.limit, 1);
  assert.equal(paged.operation.hasPreviousPage, true);
  assert.equal(paged.operation.hasNextPage, false);
  assert.equal(paged.operation.previousOffset, 0);
  assert.equal(paged.operation.nextOffset, null);
  assert.equal(paged.operation.pageSize, 1);
  assert.equal(paged.operation.totalPages, 2);
  assert.equal(paged.operation.currentPageIndex, 1);
  assert.equal(paged.totalMatchedCount, 2);
  assert.deepEqual(paged.entries.map((entry) => entry.imageId), ["tiff-nikon"]);
  assert.equal(paged.metadataSummary.total, 1);
  assert.deepEqual(paged.metadataSummary.observedFormats, { tiff: 1 });
  assert.deepEqual(paged.facetSummary, {
    total: 1,
    flaggedCount: 0,
    rejectedCount: 0,
    keeperCount: 0,
    unratedCount: 1,
    colorLabelCounts: {},
    ratingCounts: { 0: 1 },
  });
  assert.equal(paged.matchedMetadataSummary.total, 2);
  assert.deepEqual(paged.matchedMetadataSummary.observedFormats, { jpeg: 1, tiff: 1 });
  assert.deepEqual(paged.matchedMetadataSummary.flashUsage, { fired: 1, notFired: 1 });
  assert.deepEqual(paged.matchedFacetSummary, {
    total: 2,
    flaggedCount: 1,
    rejectedCount: 0,
    keeperCount: 1,
    unratedCount: 2,
    colorLabelCounts: {},
    ratingCounts: { 0: 2 },
  });
  assert.deepEqual(paged.pageInfo, {
    offset: 1,
    limit: 1,
    resultCount: 1,
    totalMatchedCount: 2,
    hasPreviousPage: true,
    hasNextPage: false,
    previousOffset: 0,
    nextOffset: null,
    pageSize: 1,
    totalPages: 2,
    currentPageIndex: 1,
    sortBy: "isoSpeed",
    sortDirection: "desc",
    queryTerms: [],
    queryMode: "all",
    queryFields: [],
    visibleImageIds: ["tiff-nikon"],
    matchedImageIds: ["jpeg-canon", "tiff-nikon"],
  });

  const firstPage = await workflow.listLibraryReport({ sortBy: "isoSpeed", sortDirection: "desc", offset: 0, limit: 1 });
  assert.equal(firstPage.operation.hasPreviousPage, false);
  assert.equal(firstPage.operation.hasNextPage, true);
  assert.equal(firstPage.operation.previousOffset, null);
  assert.equal(firstPage.operation.nextOffset, 1);
  assert.equal(firstPage.operation.pageSize, 1);
  assert.equal(firstPage.operation.totalPages, 2);
  assert.equal(firstPage.operation.currentPageIndex, 0);

  const unpaged = await workflow.listLibraryReport({ query: "nikon" });
  assert.equal(unpaged.operation.limit, null);
  assert.equal(unpaged.operation.pageSize, 1);
  assert.equal(unpaged.operation.totalPages, 1);
  assert.equal(unpaged.operation.currentPageIndex, 0);
});


test("catalog workflow can return a list-library summary without entries", async () => {
  const { workflow, libraryStore } = await makeWorkflow();
  await libraryStore.importImage({
    imageId: "jpeg-canon",
    sourcePath: "/shoot/jpeg-canon.CR3",
    observedFormat: "jpeg",
    cameraMake: "Canon",
    cameraModel: "EOS R6",
    lensModel: "RF24-70mm F2.8 L IS USM",
    focalLengthMm: 70,
    isoSpeed: 400,
    flashFired: true,
    flagged: true,
    colorLabel: "blue",
  });
  await libraryStore.importImage({
    imageId: "tiff-nikon",
    sourcePath: "/shoot/tiff-nikon.CR3",
    observedFormat: "tiff",
    cameraMake: "Nikon",
    cameraModel: "Zf II",
    lensModel: "NIKKOR Z 24-70mm f/2.8 S",
    focalLengthMm: 35,
    isoSpeed: 100,
    flashFired: false,
    colorLabel: "green",
  });

  const summary = await workflow.listLibrarySummary({ query: "canon nikon", queryMode: "any", sortBy: "isoSpeed", sortDirection: "desc", offset: 0, limit: 1 });
  assert.equal(summary.totalMatchedCount, 2);
  assert.equal(summary.operation.resultCount, 1);
  assert.equal(summary.operation.totalMatchedCount, 2);
  assert.equal(summary.operation.queryMode, "any");
  assert.deepEqual(summary.operation.queryTerms, ["canon", "nikon"]);
  assert.equal(summary.pageInfo.hasNextPage, true);
  assert.equal(summary.pageInfo.nextOffset, 1);
  assert.deepEqual(summary.visibleImageIds, ["jpeg-canon"]);
  assert.deepEqual(summary.matchedImageIds, ["jpeg-canon", "tiff-nikon"]);
  assert.equal(summary.metadataSummary.total, 1);
  assert.deepEqual(summary.metadataSummary.observedFormats, { jpeg: 1 });
  assert.deepEqual(summary.facetSummary.colorLabelCounts, { blue: 1 });
  assert.equal(summary.matchedMetadataSummary.total, 2);
  assert.deepEqual(summary.matchedMetadataSummary.observedFormats, { jpeg: 1, tiff: 1 });
  assert.deepEqual(summary.matchedFacetSummary.colorLabelCounts, { blue: 1, green: 1 });
  assert.equal("entries" in summary, false);
});


test("catalog workflow listLibraryReport summarizes GPS presence for matched entries", async () => {
  const { libraryStore, workflow } = await makeWorkflow();
  await libraryStore.importImage({ imageId: "img-gps", sourcePath: "/shoots/gps.CR3", gpsLatitude: 37.7749, gpsLongitude: 122.4194 });
  await libraryStore.importImage({ imageId: "img-nogps", sourcePath: "/shoots/nogps.CR3" });

  const report = await workflow.listLibraryReport({ hasGps: true });
  assert.deepEqual(report.visibleImageIds, ["img-gps"]);
  assert.equal(report.metadataSummary.withObservedGps, 1);
  assert.deepEqual(report.metadataSummary.gpsUsage, { withGps: 1, withoutGps: 0 });
  assert.equal(report.matchedMetadataSummary.withObservedGps, 1);
});

test("catalog workflow listLibraryReport summarizes GPS altitude for matched entries", async () => {
  const { libraryStore, workflow } = await makeWorkflow();
  await libraryStore.importImage({ imageId: "img-alt", sourcePath: "/shoots/alt.CR3", gpsLatitude: 37.7, gpsLongitude: 122.4, gpsAltitudeM: 15.25 });
  await libraryStore.importImage({ imageId: "img-none", sourcePath: "/shoots/none.CR3" });

  const report = await workflow.listLibraryReport({ gpsAltitudeAtLeast: 10 });
  assert.deepEqual(report.visibleImageIds, ["img-alt"]);
  assert.equal(report.metadataSummary.withObservedGpsAltitude, 1);
  assert.deepEqual(report.metadataSummary.gpsAltitudeRange, { min: 15.25, max: 15.25 });
  assert.deepEqual(report.metadataSummary.meteringModes, {});
  assert.deepEqual(report.metadataSummary.whiteBalanceModes, {});
  assert.equal(report.matchedMetadataSummary.withObservedGpsAltitude, 1);
});

test("catalog workflow listLibraryReport preserves GPS altitude sort metadata", async () => {
  const { libraryStore, workflow } = await makeWorkflow();
  await libraryStore.importImage({ imageId: "img-high", sourcePath: "/shoots/high.CR3", gpsAltitudeM: 120.5 });
  await libraryStore.importImage({ imageId: "img-low", sourcePath: "/shoots/low.CR3", gpsAltitudeM: -10 });

  const report = await workflow.listLibraryReport({ sortBy: "gpsAltitudeM", sortDirection: "desc" });
  assert.deepEqual(report.visibleImageIds.slice(0, 2), ["img-high", "img-low"]);
  assert.equal(report.pageInfo.sortBy, "gpsAltitudeM");
  assert.equal(report.pageInfo.sortDirection, "desc");
  assert.deepEqual(report.metadataSummary.gpsAltitudeRange, { min: -10, max: 120.5 });
});

test("catalog workflow listLibraryReport summarizes metering and white-balance modes for matched entries", async () => {
  const { libraryStore, workflow } = await makeWorkflow();
  await libraryStore.importImage({ imageId: "img-a", sourcePath: "/shoots/a.CR3", meteringMode: 5, whiteBalanceMode: 0 });
  await libraryStore.importImage({ imageId: "img-b", sourcePath: "/shoots/b.CR3", meteringMode: 3, whiteBalanceMode: 1 });

  const report = await workflow.listLibraryReport({ meteringMode: 5 });
  assert.deepEqual(report.visibleImageIds, ["img-a"]);
  assert.equal(report.metadataSummary.withObservedMeteringMode, 1);
  assert.equal(report.metadataSummary.withObservedWhiteBalanceMode, 1);
  assert.deepEqual(report.metadataSummary.meteringModes, { 5: 1 });
  assert.deepEqual(report.metadataSummary.whiteBalanceModes, { 0: 1 });
  assert.deepEqual(report.metadataSummary.exposurePrograms, {});
  assert.deepEqual(report.metadataSummary.exposureModes, {});
  assert.deepEqual(report.metadataSummary.exposureModes, {});
});

test("catalog workflow listLibraryReport preserves metering and white-balance sort metadata", async () => {
  const { libraryStore, workflow } = await makeWorkflow();
  await libraryStore.importImage({ imageId: "img-a", sourcePath: "/shoots/a.CR3", meteringMode: 5, whiteBalanceMode: 0 });
  await libraryStore.importImage({ imageId: "img-b", sourcePath: "/shoots/b.CR3", meteringMode: 3, whiteBalanceMode: 1 });

  const report = await workflow.listLibraryReport({ sortBy: "meteringMode", sortDirection: "asc" });
  assert.deepEqual(report.visibleImageIds.slice(0, 2), ["img-b", "img-a"]);
  assert.equal(report.pageInfo.sortBy, "meteringMode");
  assert.equal(report.pageInfo.sortDirection, "asc");
  assert.deepEqual(report.metadataSummary.meteringModes, { 3: 1, 5: 1 });
  assert.deepEqual(report.metadataSummary.whiteBalanceModes, { 0: 1, 1: 1 });
  assert.deepEqual(report.metadataSummary.exposurePrograms, {});
});

test("catalog workflow listLibraryReport summarizes exposure programs for matched entries", async () => {
  const { libraryStore, workflow } = await makeWorkflow();
  await libraryStore.importImage({ imageId: "img-a", sourcePath: "/shoots/a.CR3", exposureProgram: 2 });
  await libraryStore.importImage({ imageId: "img-b", sourcePath: "/shoots/b.CR3", exposureProgram: 4 });

  const report = await workflow.listLibraryReport({ exposureProgram: 2 });
  assert.deepEqual(report.visibleImageIds, ["img-a"]);
  assert.equal(report.metadataSummary.withObservedExposureProgram, 1);
  assert.deepEqual(report.metadataSummary.exposurePrograms, { 2: 1 });
});

test("catalog workflow listLibraryReport preserves exposure-program sort metadata", async () => {
  const { libraryStore, workflow } = await makeWorkflow();
  await libraryStore.importImage({ imageId: "img-p4", sourcePath: "/shoots/p4.CR3", exposureProgram: 4 });
  await libraryStore.importImage({ imageId: "img-p2", sourcePath: "/shoots/p2.CR3", exposureProgram: 2 });

  const report = await workflow.listLibraryReport({ sortBy: "exposureProgram", sortDirection: "asc" });
  assert.deepEqual(report.visibleImageIds.slice(0, 2), ["img-p2", "img-p4"]);
  assert.equal(report.pageInfo.sortBy, "exposureProgram");
  assert.equal(report.pageInfo.sortDirection, "asc");
  assert.deepEqual(report.metadataSummary.exposurePrograms, { 2: 1, 4: 1 });
});
