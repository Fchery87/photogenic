import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLibraryStore } from "../src/catalog/library-store.js";

async function makeTempLibraryStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-library-"));
  const clockValues = [
    "2025-07-02T00:00:00.000Z",
    "2025-07-02T00:00:01.000Z",
    "2025-07-02T00:00:02.000Z",
    "2025-07-02T00:00:03.000Z",
    "2025-07-02T00:00:04.000Z",
    "2025-07-02T00:00:05.000Z",
  ];
  let index = 0;
  const store = await createLibraryStore({
    path: path.join(dir, "library.json"),
    clock: () => clockValues[index++] ?? clockValues.at(-1),
  });
  return { dir, store };
}

test("importImage persists a library entry with stable culling metadata defaults", async () => {
  const { store } = await makeTempLibraryStore();
  const entry = await store.importImage({
    imageId: "img-001",
    sourcePath: "/shoot/day1/img-001.CR3",
    captureAt: "2025-06-30T10:00:00.000Z",
  });
  assert.equal(entry.fileName, "img-001.CR3");
  assert.equal(entry.byteSize, null);
  assert.equal(entry.modifiedAt, null);
  assert.equal(entry.orientation, null);
  assert.equal(entry.observedCaptureAt, null);
  assert.equal(entry.rating, 0);
  assert.equal(entry.flagged, false);
  assert.equal(entry.rejected, false);
  assert.equal(entry.colorLabel, null);
});

test("list filters by rating, flagged, rejected, color label, and keepersOnly", async () => {
  const { store } = await makeTempLibraryStore();
  await store.importImage({ imageId: "a", sourcePath: "/shoot/a.CR3", rating: 5, flagged: true });
  await store.importImage({ imageId: "b", sourcePath: "/shoot/b.CR3", rejected: true, colorLabel: "red" });
  await store.importImage({ imageId: "c", sourcePath: "/shoot/c.CR3", rating: 2, colorLabel: "green" });
  assert.deepEqual((await store.list({ ratingAtLeast: 3 })).map((entry) => entry.imageId), ["a"]);
  assert.deepEqual((await store.list({ keepersOnly: true })).map((entry) => entry.imageId), ["a", "c"]);
});

test("loading a persisted library with unsupported version fails validation", async () => {
  const { dir } = await makeTempLibraryStore();
  const libraryPath = path.join(dir, "library.json");
  await writeFile(libraryPath, JSON.stringify({ version: 999, images: {} }, null, 2) + "\n");
  const store = await createLibraryStore({ path: libraryPath });
  await assert.rejects(() => store.list(), /unsupported library store version/i);
});


test("importImage persists observable source file metadata when provided", async () => {
  const { store } = await makeTempLibraryStore();
  const entry = await store.importImage({
    imageId: "img-002",
    sourcePath: "/shoot/day1/img-002.CR3",
    byteSize: 123456,
    modifiedAt: "2025-07-01T10:00:00.000Z",
    orientation: 6,
    observedCaptureAt: "2025:07:06 11",
  });
  assert.equal(entry.byteSize, 123456);
  assert.equal(entry.modifiedAt, "2025-07-01T10:00:00.000Z");
  assert.equal(entry.orientation, 6);
  assert.equal(entry.observedCaptureAt, "2025:07:06 11");
});


test("refreshSourceMetadata re-reads observable source file metadata from disk", async () => {
  const { dir, store } = await makeTempLibraryStore();
  const sourcePath = path.join(dir, "img-003.CR3");
  await writeFile(sourcePath, "abc");
  await store.importImage({
    imageId: "img-003",
    sourcePath,
    byteSize: 1,
    modifiedAt: "2025-07-01T00:00:00.000Z",
  });
  await writeFile(sourcePath, "abcdefghi");

  const refreshed = await store.refreshSourceMetadata("img-003");
  assert.equal(refreshed.byteSize, 9);
  assert.match(refreshed.modifiedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(refreshed.orientation, null);
  assert.equal(refreshed.observedCaptureAt, null);
  assert.equal(refreshed.cameraMake, null);
  assert.equal(refreshed.cameraModel, null);
  assert.equal(refreshed.lensModel, null);
  assert.equal(refreshed.focalLengthMm, null);
  assert.equal(refreshed.fNumber, null);
  assert.equal(refreshed.isoSpeed, null);
  assert.equal(refreshed.exposureTimeSeconds, null);
  assert.equal(refreshed.flashFired, null);
  assert.equal(refreshed.exposureBiasEv, null);
});

test("refreshSourceMetadata records null metadata when the source file disappears", async () => {
  const { dir, store } = await makeTempLibraryStore();
  const sourcePath = path.join(dir, "img-004.CR3");
  await writeFile(sourcePath, "abcdef");
  await store.importImage({
    imageId: "img-004",
    sourcePath,
    byteSize: 6,
    modifiedAt: "2025-07-01T00:00:00.000Z",
  });
  await (await import("node:fs/promises")).unlink(sourcePath);

  const refreshed = await store.refreshSourceMetadata("img-004");
  assert.equal(refreshed.byteSize, null);
  assert.equal(refreshed.modifiedAt, null);
  assert.equal(refreshed.orientation, null);
  assert.equal(refreshed.observedCaptureAt, null);
  assert.equal(refreshed.cameraMake, null);
  assert.equal(refreshed.cameraModel, null);
  assert.equal(refreshed.lensModel, null);
  assert.equal(refreshed.focalLengthMm, null);
  assert.equal(refreshed.fNumber, null);
  assert.equal(refreshed.isoSpeed, null);
  assert.equal(refreshed.exposureTimeSeconds, null);
  assert.equal(refreshed.flashFired, null);
  assert.equal(refreshed.exposureBiasEv, null);
});


test("list filters by observed source metadata such as format, camera, lens, flash, iso, and focal length", async () => {
  const { store } = await makeTempLibraryStore();
  await store.importImage({
    imageId: "jpeg-canon",
    sourcePath: "/shoot/jpeg-canon.CR3",
    observedFormat: "jpeg",
    cameraMake: "Canon",
    cameraModel: "EOS R6",
    lensModel: "RF24-70mm F2.8 L IS USM",
    focalLengthMm: 70,
    isoSpeed: 400,
    flashFired: true,
    fNumber: 2.8,
    exposureTimeSeconds: 1 / 125,
    exposureBiasEv: 1 / 3,
  });
  await store.importImage({
    imageId: "tiff-nikon",
    sourcePath: "/shoot/tiff-nikon.CR3",
    observedFormat: "tiff",
    cameraMake: "Nikon",
    cameraModel: "Zf II",
    lensModel: "NIKKOR Z 24-70mm f/2.8 S",
    focalLengthMm: 35,
    isoSpeed: 100,
    flashFired: false,
    fNumber: 2.8,
    exposureTimeSeconds: 1 / 60,
    exposureBiasEv: -1 / 3,
  });
  await store.importImage({ imageId: "raw-unknown", sourcePath: "/shoot/raw-unknown.CR3" });

  assert.deepEqual((await store.list({ observedFormat: "jpeg" })).map((entry) => entry.imageId), ["jpeg-canon"]);
  assert.deepEqual((await store.list({ cameraMake: "Canon" })).map((entry) => entry.imageId), ["jpeg-canon"]);
  assert.deepEqual((await store.list({ cameraModel: "Zf II" })).map((entry) => entry.imageId), ["tiff-nikon"]);
  assert.deepEqual((await store.list({ lensModel: "RF24-70mm F2.8 L IS USM" })).map((entry) => entry.imageId), ["jpeg-canon"]);
  assert.deepEqual((await store.list({ flashFired: true })).map((entry) => entry.imageId), ["jpeg-canon"]);
  assert.deepEqual((await store.list({ flashFired: false })).map((entry) => entry.imageId), ["tiff-nikon"]);
  assert.deepEqual((await store.list({ isoSpeedAtLeast: 200 })).map((entry) => entry.imageId), ["jpeg-canon"]);
  assert.deepEqual((await store.list({ isoSpeedAtMost: 200 })).map((entry) => entry.imageId), ["tiff-nikon"]);
  assert.deepEqual((await store.list({ focalLengthAtLeast: 50 })).map((entry) => entry.imageId), ["jpeg-canon"]);
  assert.deepEqual((await store.list({ focalLengthAtMost: 50 })).map((entry) => entry.imageId), ["tiff-nikon"]);
  assert.deepEqual((await store.list({ fNumberAtMost: 2.8 })).map((entry) => entry.imageId), ["jpeg-canon", "tiff-nikon"]);
  assert.deepEqual((await store.list({ exposureTimeAtMost: 1 / 100 })).map((entry) => entry.imageId), ["jpeg-canon"]);
  assert.deepEqual((await store.list({ exposureBiasAtLeast: 0.3 })).map((entry) => entry.imageId), ["jpeg-canon"]);
  assert.deepEqual((await store.list({ exposureBiasAtMost: 0 })).map((entry) => entry.imageId), ["tiff-nikon"]);
});


test("list supports metadata-aware sort ordering", async () => {
  const { store } = await makeTempLibraryStore();
  await store.importImage({
    imageId: "img-a",
    sourcePath: "/shoot/a.CR3",
    rating: 1,
    isoSpeed: 400,
    focalLengthMm: 85,
    pixelWidth: 100,
    pixelHeight: 100,
    importedAt: "2025-07-01T10:00:00.000Z",
    updatedAt: "2025-07-01T10:00:02.000Z",
  });
  await store.importImage({
    imageId: "img-b",
    sourcePath: "/shoot/b.CR3",
    rating: 5,
    isoSpeed: 100,
    focalLengthMm: 35,
    pixelWidth: 200,
    pixelHeight: 200,
    importedAt: "2025-07-01T10:00:01.000Z",
    updatedAt: "2025-07-01T10:00:01.000Z",
  });
  await store.importImage({
    imageId: "img-c",
    sourcePath: "/shoot/c.CR3",
    rating: 3,
    pixelWidth: 50,
    pixelHeight: 50,
    importedAt: "2025-07-01T10:00:02.000Z",
    updatedAt: "2025-07-01T10:00:00.000Z",
  });

  assert.deepEqual((await store.list({ sortBy: "rating", sortDirection: "desc" })).map((entry) => entry.imageId), ["img-b", "img-c", "img-a"]);
  assert.deepEqual((await store.list({ sortBy: "isoSpeed", sortDirection: "asc" })).map((entry) => entry.imageId), ["img-b", "img-a", "img-c"]);
  assert.deepEqual((await store.list({ sortBy: "pixelArea", sortDirection: "desc" })).map((entry) => entry.imageId), ["img-b", "img-a", "img-c"]);
  assert.deepEqual((await store.list({ sortBy: "importedAt", sortDirection: "asc" })).map((entry) => entry.imageId), ["img-a", "img-b", "img-c"]);
});


test("list supports offset/limit pagination after filtering and sorting", async () => {
  const { store } = await makeTempLibraryStore();
  await store.importImage({ imageId: "img-a", sourcePath: "/shoot/a.CR3", rating: 1, isoSpeed: 100 });
  await store.importImage({ imageId: "img-b", sourcePath: "/shoot/b.CR3", rating: 2, isoSpeed: 200 });
  await store.importImage({ imageId: "img-c", sourcePath: "/shoot/c.CR3", rating: 3, isoSpeed: 400 });
  await store.importImage({ imageId: "img-d", sourcePath: "/shoot/d.CR3", rating: 4, isoSpeed: 800 });

  assert.deepEqual(
    (await store.list({ sortBy: "isoSpeed", sortDirection: "desc", offset: 1, limit: 2 })).map((entry) => entry.imageId),
    ["img-c", "img-b"],
  );
  assert.deepEqual(
    (await store.list({ ratingAtLeast: 2, sortBy: "rating", sortDirection: "asc", offset: 1, limit: 2 })).map((entry) => entry.imageId),
    ["img-c", "img-d"],
  );
});


test("list supports free-text query across persisted catalog metadata", async () => {
  const { store } = await makeTempLibraryStore();
  await store.importImage({
    imageId: "img-canon-hero",
    sourcePath: "/shoot/day1/hero-canon.CR3",
    observedFormat: "jpeg",
    cameraMake: "Canon",
    cameraModel: "EOS R6",
    lensModel: "RF24-70mm F2.8 L IS USM",
    colorLabel: "blue",
  });
  await store.importImage({
    imageId: "img-nikon-alt",
    sourcePath: "/shoot/day1/alt-nikon.NEF",
    observedFormat: "tiff",
    cameraMake: "Nikon",
    cameraModel: "Zf II",
    lensModel: "NIKKOR Z 24-70mm f/2.8 S",
    colorLabel: "green",
  });

  assert.deepEqual((await store.list({ query: "canon" })).map((entry) => entry.imageId), ["img-canon-hero"]);
  assert.deepEqual((await store.list({ query: "zf ii" })).map((entry) => entry.imageId), ["img-nikon-alt"]);
  assert.deepEqual((await store.list({ query: "24-70mm" })).map((entry) => entry.imageId), ["img-nikon-alt", "img-canon-hero"]);
  assert.deepEqual((await store.list({ query: "canon 24-70mm" })).map((entry) => entry.imageId), ["img-canon-hero"]);
  assert.deepEqual((await store.list({ query: "nikon green" })).map((entry) => entry.imageId), ["img-nikon-alt"]);
  assert.deepEqual((await store.list({ query: "canon green", queryMode: "any" })).map((entry) => entry.imageId), ["img-nikon-alt", "img-canon-hero"]);
  assert.deepEqual((await store.list({ query: "canon green", queryMode: "all" })).map((entry) => entry.imageId), []);
  assert.deepEqual((await store.list({ query: "canon blue", queryFields: ["cameraMake", "colorLabel"] })).map((entry) => entry.imageId), ["img-canon-hero"]);
  assert.deepEqual((await store.list({ query: "canon blue", queryFields: ["cameraMake"] })).map((entry) => entry.imageId), []);
  assert.deepEqual((await store.list({ query: "blue" })).map((entry) => entry.imageId), ["img-canon-hero"]);
  assert.deepEqual((await store.list({ query: "missing" })).map((entry) => entry.imageId), []);
});

test("library store can filter entries by GPS presence", async () => {
  const { store } = await makeTempLibraryStore();
  await store.importImage({ imageId: "img-gps", sourcePath: "/shoots/gps.CR3", gpsLatitude: 37.7749, gpsLongitude: 122.4194 });
  await store.importImage({ imageId: "img-nogps", sourcePath: "/shoots/nogps.CR3" });

  assert.deepEqual((await store.list({ hasGps: true })).map((entry) => entry.imageId), ["img-gps"]);
  assert.deepEqual((await store.list({ hasGps: false })).map((entry) => entry.imageId), ["img-nogps"]);
});

test("library store can filter entries by GPS altitude range", async () => {
  const { store } = await makeTempLibraryStore();
  await store.importImage({ imageId: "img-low", sourcePath: "/shoots/low.CR3", gpsLatitude: 1, gpsLongitude: 2, gpsAltitudeM: -10 });
  await store.importImage({ imageId: "img-mid", sourcePath: "/shoots/mid.CR3", gpsLatitude: 1, gpsLongitude: 2, gpsAltitudeM: 15.25 });
  await store.importImage({ imageId: "img-none", sourcePath: "/shoots/none.CR3" });

  assert.deepEqual((await store.list({ gpsAltitudeAtLeast: 0 })).map((entry) => entry.imageId), ["img-mid"]);
  assert.deepEqual((await store.list({ gpsAltitudeAtMost: 0 })).map((entry) => entry.imageId), ["img-low"]);
});

test("list supports GPS altitude sort ordering", async () => {
  const { store } = await makeTempLibraryStore();
  await store.importImage({ imageId: "img-high", sourcePath: "/shoots/high.CR3", gpsAltitudeM: 120.5 });
  await store.importImage({ imageId: "img-low", sourcePath: "/shoots/low.CR3", gpsAltitudeM: -10 });
  await store.importImage({ imageId: "img-none", sourcePath: "/shoots/none.CR3" });

  assert.deepEqual((await store.list({ sortBy: "gpsAltitudeM", sortDirection: "asc" })).map((entry) => entry.imageId), ["img-low", "img-high", "img-none"]);
  assert.deepEqual((await store.list({ sortBy: "gpsAltitudeM", sortDirection: "desc" })).map((entry) => entry.imageId), ["img-high", "img-low", "img-none"]);
});

test("library store can filter entries by metering and white-balance mode", async () => {
  const { store } = await makeTempLibraryStore();
  await store.importImage({ imageId: "img-evaluative-auto", sourcePath: "/shoots/a.CR3", meteringMode: 5, whiteBalanceMode: 0 });
  await store.importImage({ imageId: "img-spot-manual", sourcePath: "/shoots/b.CR3", meteringMode: 3, whiteBalanceMode: 1 });
  await store.importImage({ imageId: "img-none", sourcePath: "/shoots/c.CR3" });

  assert.deepEqual((await store.list({ meteringMode: 5 })).map((entry) => entry.imageId), ["img-evaluative-auto"]);
  assert.deepEqual((await store.list({ whiteBalanceMode: 1 })).map((entry) => entry.imageId), ["img-spot-manual"]);
});

test("list supports metering and white-balance sort ordering", async () => {
  const { store } = await makeTempLibraryStore();
  await store.importImage({ imageId: "img-spot-manual", sourcePath: "/shoots/spot.CR3", meteringMode: 3, whiteBalanceMode: 1 });
  await store.importImage({ imageId: "img-evaluative-auto", sourcePath: "/shoots/eval.CR3", meteringMode: 5, whiteBalanceMode: 0 });
  await store.importImage({ imageId: "img-none", sourcePath: "/shoots/none.CR3" });

  assert.deepEqual((await store.list({ sortBy: "meteringMode", sortDirection: "asc" })).map((entry) => entry.imageId), ["img-spot-manual", "img-evaluative-auto", "img-none"]);
  assert.deepEqual((await store.list({ sortBy: "whiteBalanceMode", sortDirection: "asc" })).map((entry) => entry.imageId), ["img-evaluative-auto", "img-spot-manual", "img-none"]);
});

test("library store can filter entries by exposure program", async () => {
  const { store } = await makeTempLibraryStore();
  await store.importImage({ imageId: "img-program-2", sourcePath: "/shoots/p2.CR3", exposureProgram: 2 });
  await store.importImage({ imageId: "img-program-4", sourcePath: "/shoots/p4.CR3", exposureProgram: 4 });
  await store.importImage({ imageId: "img-none", sourcePath: "/shoots/none.CR3" });

  assert.deepEqual((await store.list({ exposureProgram: 2 })).map((entry) => entry.imageId), ["img-program-2"]);
});

test("list supports exposure-program sort ordering", async () => {
  const { store } = await makeTempLibraryStore();
  await store.importImage({ imageId: "img-p4", sourcePath: "/shoots/p4.CR3", exposureProgram: 4 });
  await store.importImage({ imageId: "img-p2", sourcePath: "/shoots/p2.CR3", exposureProgram: 2 });
  await store.importImage({ imageId: "img-none", sourcePath: "/shoots/none.CR3" });

  assert.deepEqual((await store.list({ sortBy: "exposureProgram", sortDirection: "asc" })).map((entry) => entry.imageId), ["img-p2", "img-p4", "img-none"]);
});
