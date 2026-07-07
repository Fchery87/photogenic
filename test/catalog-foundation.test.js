import { test } from "node:test";
import assert from "node:assert/strict";
import { createCatalogFoundation } from "../src/catalog/foundation.js";

test("catalog foundation summarizes dashboard metadata without mutating inputs", () => {
  const foundation = createCatalogFoundation();
  const snapshot = {
    snapshotId: "workspace-main",
    activeFilter: "keepers",
    expandedImageIds: ["img-001", "img-003"],
  };
  const visibleImages = [
    { imageId: "img-001", byteSize: 1200, modifiedAt: "2025-07-16T00:00:00.000Z", observedFormat: "jpeg", pixelWidth: 4000, pixelHeight: 3000, cameraMake: "Canon", cameraModel: "EOS R6", lensModel: "RF24-70mm F2.8 L IS USM", focalLengthMm: 70, fNumber: 2.8, isoSpeed: 400, exposureTimeSeconds: 1 / 125, flashFired: true, exposureBiasEv: 1 / 3 },
    { imageId: "img-003", byteSize: 2300, modifiedAt: "2025-07-16T00:00:03.000Z", observedFormat: "tiff", pixelWidth: 6000, pixelHeight: 4000 },
  ];
  const keeperImages = [{ imageId: "img-001" }, { imageId: "img-003" }];
  const rejectedImages = [{ imageId: "img-002" }];
  const selectedImage = { imageId: "img-001", sourcePath: "/shoot/day1/img-001.CR3", fileName: "img-001.CR3", byteSize: 1200, modifiedAt: "2025-07-16T00:00:00.000Z", observedFormat: "jpeg", pixelWidth: 4000, pixelHeight: 3000, orientation: 6, observedCaptureAt: "2025:07:16 09:00", cameraMake: "Canon", cameraModel: "EOS R6", lensModel: "RF24-70mm F2.8 L IS USM", focalLengthMm: 70, fNumber: 2.8, isoSpeed: 400, exposureTimeSeconds: 1 / 125, flashFired: true, exposureBiasEv: 1 / 3, meta: { rating: 5 } };
  const activePreset = { presetId: "warm-base" };
  const activeBatchSession = { sessionId: "session-hero" };

  const summary = foundation.summarizeDashboardWorkspace({ snapshot, visibleImages, keeperImages, rejectedImages, selectedImage, activePreset, activeBatchSession });

  assert.equal(summary.visibleSourceFiles.withObservedCamera, 1);
  assert.equal(summary.visibleSourceFiles.withObservedLens, 1);
  assert.equal(summary.visibleSourceFiles.withObservedFocalLength, 1);
  assert.equal(summary.visibleSourceFiles.withObservedFNumber, 1);
  assert.equal(summary.visibleSourceFiles.withObservedIsoSpeed, 1);
  assert.equal(summary.visibleSourceFiles.withObservedExposureTime, 1);
  assert.equal(summary.visibleSourceFiles.withObservedFlash, 1);
  assert.equal(summary.visibleSourceFiles.withObservedExposureBias, 1);
  assert.equal(summary.visibleSourceFiles.withObservedFNumber, 1);
  assert.equal(summary.visibleSourceFiles.withObservedIsoSpeed, 1);
  assert.equal(summary.visibleSourceFiles.withObservedExposureTime, 1);
  assert.equal(summary.visibleSourceFiles.withObservedFlash, 1);
  assert.equal(summary.visibleSourceFiles.withObservedExposureBias, 1);
  assert.equal(summary.visibleSourceFiles.withObservedFocalLength, 1);
  assert.equal(summary.visibleSourceFiles.withObservedFNumber, 1);
  assert.equal(summary.visibleSourceFiles.withObservedIsoSpeed, 1);
  assert.equal(summary.visibleSourceFiles.withObservedExposureTime, 1);
  assert.equal(summary.visibleSourceFiles.withObservedFlash, 1);
  assert.equal(summary.visibleSourceFiles.withObservedExposureBias, 1);
  assert.equal(summary.visibleSourceFiles.withObservedLens, 1);
  assert.equal(summary.visibleSourceFiles.withObservedFocalLength, 1);
  assert.equal(summary.visibleSourceFiles.withObservedFNumber, 1);
  assert.equal(summary.visibleSourceFiles.withObservedIsoSpeed, 1);
  assert.equal(summary.visibleSourceFiles.withObservedExposureTime, 1);
  assert.equal(summary.visibleSourceFiles.withObservedFlash, 1);
  assert.equal(summary.visibleSourceFiles.withObservedExposureBias, 1);
  assert.deepEqual(summary.visibleSourceFiles.observedCameras, { "Canon EOS R6": 1 });
  assert.deepEqual(summary.visibleSourceFiles.observedLenses, { "RF24-70mm F2.8 L IS USM": 1 });
  assert.deepEqual(summary.visibleSourceFiles.focalLengthMmRange, { min: 70, max: 70 });
  assert.deepEqual(summary.visibleSourceFiles.fNumberRange, { min: 2.8, max: 2.8 });
  assert.deepEqual(summary.visibleSourceFiles.isoSpeedRange, { min: 400, max: 400 });
  assert.deepEqual(summary.visibleSourceFiles.exposureTimeSecondsRange, { min: 1 / 125, max: 1 / 125 });
  assert.deepEqual(summary.visibleSourceFiles.flashUsage, { fired: 1, notFired: 0 });
  assert.deepEqual(summary.visibleSourceFiles.exposureBiasEvRange, { min: 1 / 3, max: 1 / 3 });
  assert.deepEqual(summary.visibleSourceFiles.fNumberRange, { min: 2.8, max: 2.8 });
  assert.deepEqual(summary.visibleSourceFiles.isoSpeedRange, { min: 400, max: 400 });
  assert.deepEqual(summary.visibleSourceFiles.exposureTimeSecondsRange, { min: 1 / 125, max: 1 / 125 });
  assert.deepEqual(summary.visibleSourceFiles.flashUsage, { fired: 1, notFired: 0 });
  assert.deepEqual(summary.visibleSourceFiles.exposureBiasEvRange, { min: 1 / 3, max: 1 / 3 });
  assert.deepEqual(summary.visibleSourceFiles.focalLengthMmRange, { min: 70, max: 70 });
  assert.deepEqual(summary.visibleSourceFiles.fNumberRange, { min: 2.8, max: 2.8 });
  assert.deepEqual(summary.visibleSourceFiles.isoSpeedRange, { min: 400, max: 400 });
  assert.deepEqual(summary.visibleSourceFiles.exposureTimeSecondsRange, { min: 1 / 125, max: 1 / 125 });
  assert.deepEqual(summary.visibleSourceFiles.flashUsage, { fired: 1, notFired: 0 });
  assert.deepEqual(summary.visibleSourceFiles.exposureBiasEvRange, { min: 1 / 3, max: 1 / 3 });
  assert.deepEqual(summary.visibleSourceFiles.observedLenses, { "RF24-70mm F2.8 L IS USM": 1 });
  assert.deepEqual(summary.visibleSourceFiles.focalLengthMmRange, { min: 70, max: 70 });
  assert.deepEqual(summary.visibleSourceFiles.fNumberRange, { min: 2.8, max: 2.8 });
  assert.deepEqual(summary.visibleSourceFiles.isoSpeedRange, { min: 400, max: 400 });
  assert.deepEqual(summary.visibleSourceFiles.exposureTimeSecondsRange, { min: 1 / 125, max: 1 / 125 });
  assert.deepEqual(summary.visibleSourceFiles.flashUsage, { fired: 1, notFired: 0 });
  assert.deepEqual(summary.visibleSourceFiles.exposureBiasEvRange, { min: 1 / 3, max: 1 / 3 });
  assert.equal(summary.latestVisibleObservedCameraSourceFile.imageId, "img-001");
  assert.equal(summary.latestVisibleObservedLensSourceFile.imageId, "img-001");
  assert.equal(summary.latestVisibleObservedFocalLengthSourceFile.imageId, "img-001");
  assert.equal(summary.latestVisibleObservedExposureSourceFile.imageId, "img-001");
  assert.equal(summary.selectedImageSourceFile.cameraMake, "Canon");
  assert.equal(summary.selectedImageSourceFile.cameraModel, "EOS R6");
  assert.equal(summary.selectedImageSourceFile.lensModel, "RF24-70mm F2.8 L IS USM");
  assert.equal(summary.selectedImageSourceFile.focalLengthMm, 70);
  assert.equal(summary.selectedImageSourceFile.fNumber, 2.8);
  assert.equal(summary.selectedImageSourceFile.isoSpeed, 400);
  assert.equal(summary.selectedImageSourceFile.exposureTimeSeconds, 1 / 125);
  assert.equal(summary.selectedImageSourceFile.flashFired, true);
  assert.equal(summary.selectedImageSourceFile.exposureBiasEv, 1 / 3);
  assert.equal(summary.selectedImageSourceFile.gpsAltitudeM, null);
  assert.equal(summary.selectedImageSourceFile.meteringMode, null);
  assert.equal(summary.selectedImageSourceFile.whiteBalanceMode, null);
  assert.equal(summary.selectedImageSourceFile.exposureProgram, null);
  assert.equal(summary.selectedImageSourceFile.exposureMode, null);
  snapshot.expandedImageIds.push("img-999");
  selectedImage.meta.rating = 0;
  assert.deepEqual(summary.expandedImageIds, ["img-001", "img-003"]);
  assert.equal(summary.selectedImage.meta.rating, 5);
});

test("catalog foundation normalizes optional dashboard references", () => {
  const foundation = createCatalogFoundation();
  const summary = foundation.summarizeDashboardWorkspace({ snapshot: { snapshotId: "workspace-empty" } });

  assert.deepEqual(summary.visibleSourceFiles, {
    byteSizeTotal: 0,
    withKnownByteSize: 0,
    withMissingByteSize: 0,
    withKnownModifiedAt: 0,
    withMissingModifiedAt: 0,
    withKnownDimensions: 0,
    withMissingDimensions: 0,
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
    withIncompleteMetadata: 0,
    latestModifiedAt: null,
    latestObservedCaptureAt: null,
    observedFormats: {},
    observedCameras: {},
    observedLenses: {},
    focalLengthMmRange: null,
    fNumberRange: null,
    isoSpeedRange: null,
    exposureTimeSecondsRange: null,
    flashUsage: { fired: 0, notFired: 0 },
    exposureBiasEvRange: null,
    gpsAltitudeRange: null,
    meteringModes: {},
    whiteBalanceModes: {},
    exposurePrograms: {},
    exposureModes: {},
    largestPixelArea: null,
  });
  assert.equal(summary.latestVisibleObservedCameraSourceFile, null);
  assert.equal(summary.latestVisibleObservedLensSourceFile, null);
  assert.equal(summary.latestVisibleObservedFocalLengthSourceFile, null);
  assert.equal(summary.latestVisibleObservedGpsSourceFile, null);
  assert.equal(summary.latestVisibleObservedExposureSourceFile, null);
  assert.equal(summary.selectedImageSourceFile, null);
});

test("catalog foundation surfaces latest visible source file with incomplete metadata", () => {
  const foundation = createCatalogFoundation();
  const summary = foundation.summarizeDashboardWorkspace({
    snapshot: { snapshotId: "workspace-metadata-gap" },
    visibleImages: [
      { imageId: "img-a", byteSize: 10, modifiedAt: "2025-07-16T00:00:00.000Z", pixelWidth: 10, pixelHeight: 10 },
      { imageId: "img-b", byteSize: null, modifiedAt: "2025-07-16T00:00:02.000Z", pixelWidth: null, pixelHeight: null },
      { imageId: "img-c", byteSize: 20, modifiedAt: null, pixelWidth: 12, pixelHeight: null },
    ],
  });

  assert.equal(summary.visibleSourceFiles.withObservedCamera, 0);
  assert.equal(summary.visibleSourceFiles.withObservedLens, 0);
  assert.equal(summary.visibleSourceFiles.withObservedFocalLength, 0);
  assert.equal(summary.visibleSourceFiles.withObservedFNumber, 0);
  assert.equal(summary.visibleSourceFiles.withObservedIsoSpeed, 0);
  assert.equal(summary.visibleSourceFiles.withObservedExposureTime, 0);
  assert.equal(summary.visibleSourceFiles.withObservedFlash, 0);
  assert.equal(summary.visibleSourceFiles.withObservedExposureBias, 0);
  assert.deepEqual(summary.visibleSourceFiles.observedCameras, {});
  assert.deepEqual(summary.visibleSourceFiles.observedLenses, {});
  assert.deepEqual(summary.latestVisibleSourceFileMissingMetadata, {
    imageId: "img-b",
    byteSize: null,
    modifiedAt: "2025-07-16T00:00:02.000Z",
    pixelWidth: null,
    pixelHeight: null,
  });
});

test("catalog foundation surfaces latest visible observed capture source file", () => {
  const foundation = createCatalogFoundation();
  const summary = foundation.summarizeDashboardWorkspace({
    snapshot: { snapshotId: "workspace-capture-times" },
    visibleImages: [
      { imageId: "img-a", observedCaptureAt: "2025:07:06 09:00:00", pixelWidth: 10, pixelHeight: 10, byteSize: 10, modifiedAt: "2025-07-16T00:00:00.000Z", cameraMake: "Canon", cameraModel: "EOS R6", lensModel: "RF24-70mm F2.8 L IS USM", focalLengthMm: 70, fNumber: 2.8, isoSpeed: 400, exposureTimeSeconds: 1 / 125, flashFired: true, exposureBiasEv: 1 / 3 },
      { imageId: "img-b", observedCaptureAt: "2025:07:06 11:22:33", pixelWidth: 12, pixelHeight: 12, byteSize: 20, modifiedAt: "2025-07-16T00:00:01.000Z" },
    ],
  });

  assert.equal(summary.visibleSourceFiles.withObservedCaptureAt, 2);
  assert.equal(summary.visibleSourceFiles.withObservedCamera, 1);
  assert.equal(summary.visibleSourceFiles.withObservedLens, 1);
  assert.equal(summary.visibleSourceFiles.withObservedFocalLength, 1);
  assert.equal(summary.visibleSourceFiles.withObservedFNumber, 1);
  assert.equal(summary.visibleSourceFiles.withObservedIsoSpeed, 1);
  assert.equal(summary.visibleSourceFiles.withObservedExposureTime, 1);
  assert.equal(summary.visibleSourceFiles.withObservedFlash, 1);
  assert.equal(summary.visibleSourceFiles.withObservedExposureBias, 1);
  assert.equal(summary.visibleSourceFiles.latestObservedCaptureAt, "2025:07:06 11:22:33");
  assert.equal(summary.latestVisibleObservedCaptureSourceFile.imageId, "img-b");
  assert.equal(summary.latestVisibleObservedCameraSourceFile.imageId, "img-a");
  assert.equal(summary.latestVisibleObservedLensSourceFile.imageId, "img-a");
  assert.equal(summary.latestVisibleObservedFocalLengthSourceFile.imageId, "img-a");
  assert.equal(summary.latestVisibleObservedExposureSourceFile.imageId, "img-a");
});

test("catalog foundation surfaces latest visible observed-format source file", () => {
  const foundation = createCatalogFoundation();
  const summary = foundation.summarizeDashboardWorkspace({
    snapshot: { snapshotId: "workspace-observed-formats" },
    visibleImages: [
      { imageId: "img-a", observedFormat: "jpeg", byteSize: 10, modifiedAt: "2025-07-16T00:00:00.000Z", pixelWidth: 10, pixelHeight: 10, cameraMake: "Canon", cameraModel: "EOS R6", lensModel: "RF24-70mm F2.8 L IS USM", focalLengthMm: 70, fNumber: 2.8, isoSpeed: 400, exposureTimeSeconds: 1 / 125, flashFired: true, exposureBiasEv: 1 / 3 },
      { imageId: "img-b", observedFormat: "tiff", byteSize: 20, modifiedAt: "2025-07-16T00:00:02.000Z", pixelWidth: 12, pixelHeight: 12 },
    ],
  });

  assert.deepEqual(summary.visibleSourceFiles.observedFormats, { jpeg: 1, tiff: 1 });
  assert.deepEqual(summary.visibleSourceFiles.observedCameras, { "Canon EOS R6": 1 });
  assert.deepEqual(summary.visibleSourceFiles.observedLenses, { "RF24-70mm F2.8 L IS USM": 1 });
  assert.deepEqual(summary.visibleSourceFiles.focalLengthMmRange, { min: 70, max: 70 });
  assert.deepEqual(summary.visibleSourceFiles.fNumberRange, { min: 2.8, max: 2.8 });
  assert.deepEqual(summary.visibleSourceFiles.isoSpeedRange, { min: 400, max: 400 });
  assert.deepEqual(summary.visibleSourceFiles.exposureTimeSecondsRange, { min: 1 / 125, max: 1 / 125 });
  assert.deepEqual(summary.visibleSourceFiles.flashUsage, { fired: 1, notFired: 0 });
  assert.deepEqual(summary.visibleSourceFiles.exposureBiasEvRange, { min: 1 / 3, max: 1 / 3 });
  assert.equal(summary.latestVisibleObservedFormatSourceFile.imageId, "img-b");
});

test("catalog foundation surfaces latest visible observed GPS source file", () => {
  const foundation = createCatalogFoundation();
  const summary = foundation.summarizeDashboardWorkspace({
    snapshot: { snapshotId: "workspace-gps" },
    visibleImages: [
      { imageId: "img-a", modifiedAt: "2025-07-16T00:00:00.000Z", gpsLatitude: 37.7749, gpsLongitude: 122.4194, gpsAltitudeM: 15.25, exposureProgram: 2, exposureMode: 0, meteringMode: 5, whiteBalanceMode: 1, byteSize: 10, pixelWidth: 10, pixelHeight: 10 },
      { imageId: "img-b", modifiedAt: "2025-07-16T00:00:01.000Z", byteSize: 12, pixelWidth: 12, pixelHeight: 12 },
    ],
    selectedImage: { imageId: "img-a", sourcePath: "/shoot/a.jpg", gpsLatitude: 37.7749, gpsLongitude: 122.4194, gpsAltitudeM: 15.25, exposureProgram: 2, exposureMode: 0, meteringMode: 5, whiteBalanceMode: 1 },
  });

  assert.equal(summary.visibleSourceFiles.withObservedGps, 1);
  assert.equal(summary.visibleSourceFiles.withObservedGpsAltitude, 1);
  assert.deepEqual(summary.visibleSourceFiles.gpsAltitudeRange, { min: 15.25, max: 15.25 });
  assert.equal(summary.visibleSourceFiles.withObservedMeteringMode, 1);
  assert.equal(summary.visibleSourceFiles.withObservedWhiteBalanceMode, 1);
  assert.equal(summary.visibleSourceFiles.withObservedExposureProgram, 1);
  assert.deepEqual(summary.visibleSourceFiles.meteringModes, { 5: 1 });
  assert.deepEqual(summary.visibleSourceFiles.whiteBalanceModes, { 1: 1 });
  assert.deepEqual(summary.visibleSourceFiles.exposurePrograms, { 2: 1 });
  assert.equal(summary.visibleSourceFiles.withObservedExposureMode, 1);
  assert.deepEqual(summary.visibleSourceFiles.exposureModes, { 0: 1 });
  assert.equal(summary.latestVisibleObservedGpsSourceFile.imageId, "img-a");
  assert.ok(Math.abs(summary.selectedImageSourceFile.gpsLatitude - 37.7749) < 0.0001);
  assert.ok(Math.abs(summary.selectedImageSourceFile.gpsLongitude - 122.4194) < 0.0001);
  assert.ok(Math.abs(summary.selectedImageSourceFile.gpsAltitudeM - 15.25) < 0.0001);
  assert.equal(summary.selectedImageSourceFile.meteringMode, 5);
  assert.equal(summary.selectedImageSourceFile.exposureProgram, 2);
  assert.equal(summary.selectedImageSourceFile.exposureMode, 0);
  assert.equal(summary.selectedImageSourceFile.whiteBalanceMode, 1);
  assert.equal(summary.visibleSourceFiles.withObservedGpsAltitude, 1);
});
