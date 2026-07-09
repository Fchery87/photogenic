import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { readObservedSourceFileMetadata, summarizeObservedSourceFiles, summarizeObservedSourceFilesReport } from "../src/catalog/source-file-insights.js";

function createLittleEndianAsciiTag(tag, value, dataOffset) {
  const entry = Buffer.alloc(12);
  const ascii = Buffer.from(`${value}\x00`, "ascii");
  entry.writeUInt16LE(tag, 0);
  entry.writeUInt16LE(2, 2);
  entry.writeUInt32LE(ascii.length, 4);
  entry.writeUInt32LE(dataOffset, 8);
  return { entry, ascii };
}

function createLittleEndianRationalTag(tag, numerator, denominator, dataOffset) {
  const entry = Buffer.alloc(12);
  const rational = Buffer.alloc(8);
  rational.writeUInt32LE(numerator, 0);
  rational.writeUInt32LE(denominator, 4);
  entry.writeUInt16LE(tag, 0);
  entry.writeUInt16LE(5, 2);
  entry.writeUInt32LE(1, 4);
  entry.writeUInt32LE(dataOffset, 8);
  return { entry, rational };
}

function createLittleEndianByteTag(tag, value) {
  const entry = Buffer.alloc(12);
  entry.writeUInt16LE(tag, 0);
  entry.writeUInt16LE(1, 2);
  entry.writeUInt32LE(1, 4);
  entry.writeUInt8(value, 8);
  return entry;
}

function createLittleEndianShortTag(tag, value) {
  const entry = Buffer.alloc(12);
  entry.writeUInt16LE(tag, 0);
  entry.writeUInt16LE(3, 2);
  entry.writeUInt32LE(1, 4);
  entry.writeUInt16LE(value, 8);
  return entry;
}

  function createGpsAsciiTag(tag, value, dataOffset) {
    const entry = Buffer.alloc(12);
    const ascii = Buffer.from(`${value}\x00`, "ascii");
    entry.writeUInt16LE(tag, 0);
    entry.writeUInt16LE(2, 2);
    entry.writeUInt32LE(ascii.length, 4);
    entry.writeUInt32LE(dataOffset, 8);
    return { entry, ascii };
  }

  function createGpsCoordinateTag(tag, coordinate, dataOffset) {
    const entry = Buffer.alloc(12);
    const rational = Buffer.alloc(24);
    const absolute = Math.abs(coordinate);
    const degrees = Math.floor(absolute);
    const minutesFloat = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = Math.round((minutesFloat - minutes) * 60 * 10000);
    rational.writeUInt32LE(degrees, 0); rational.writeUInt32LE(1, 4);
    rational.writeUInt32LE(minutes, 8); rational.writeUInt32LE(1, 12);
    rational.writeUInt32LE(seconds, 16); rational.writeUInt32LE(10000, 20);
    entry.writeUInt16LE(tag, 0);
    entry.writeUInt16LE(5, 2);
    entry.writeUInt32LE(3, 4);
    entry.writeUInt32LE(dataOffset, 8);
    return { entry, rational };
  }

function createExifTiffPayload({ width, height, orientation, captureAt, cameraMake, cameraModel, lensModel, gpsLatitude = null, gpsLongitude = null, gpsAltitudeM = null, exposureProgram = 2, meteringMode = 5, whiteBalanceMode = 1, exposureMode = 0 }) {
  const rootIfdOffset = 8;
  const includeGps = typeof gpsLatitude === "number" && typeof gpsLongitude === "number";
  const includeGpsAltitude = includeGps && typeof gpsAltitudeM === "number" && Number.isFinite(gpsAltitudeM);
  const rootEntryCount = includeGps ? 7 : 6;
  const rootEntriesOffset = rootIfdOffset + 2;
  const rootNextOffset = rootEntriesOffset + rootEntryCount * 12;
  const exifIfdOffset = rootNextOffset + 4;
  const exifEntryCount = 12;
  const exifEntriesOffset = exifIfdOffset + 2;
  const exifNextOffset = exifEntriesOffset + exifEntryCount * 12;
  const gpsIfdOffset = exifNextOffset + 4;
  const gpsEntryCount = includeGps ? (includeGpsAltitude ? 6 : 4) : 0;
  const gpsEntriesOffset = gpsIfdOffset + 2;
  const gpsNextOffset = gpsEntriesOffset + gpsEntryCount * 12;
  let dataOffset = includeGps ? gpsNextOffset + 4 : exifNextOffset + 4;

  const makeTag = createLittleEndianAsciiTag(271, cameraMake, dataOffset);
  dataOffset += makeTag.ascii.length;
  const modelTag = createLittleEndianAsciiTag(272, cameraModel, dataOffset);
  dataOffset += modelTag.ascii.length;
  const dateTag = createLittleEndianAsciiTag(36867, captureAt, dataOffset);
  dataOffset += dateTag.ascii.length;
  const exposureBiasTag = createLittleEndianRationalTag(37380, 1, 3, dataOffset);
  dataOffset += exposureBiasTag.rational.length;
  const exposureTag = createLittleEndianRationalTag(33434, 1, 125, dataOffset);
  dataOffset += exposureTag.rational.length;
  const exposureProgramTag = createLittleEndianShortTag(34850, exposureProgram);
  const fNumberTag = createLittleEndianRationalTag(33437, 28, 10, dataOffset);
  dataOffset += fNumberTag.rational.length;
  const flashTag = createLittleEndianShortTag(37385, 1);
  dataOffset += fNumberTag.rational.length;
  const isoTag = createLittleEndianShortTag(34855, 400);
  const focalTag = createLittleEndianRationalTag(37386, 70, 1, dataOffset);
  dataOffset += focalTag.rational.length;
  const meteringTag = createLittleEndianShortTag(37383, meteringMode);
  const whiteBalanceTag = createLittleEndianShortTag(41987, whiteBalanceMode);
  const exposureModeTag = createLittleEndianShortTag(41986, exposureMode);
  const lensTag = createLittleEndianAsciiTag(42036, lensModel, dataOffset);
  dataOffset += lensTag.ascii.length;
  const gpsLatRefTag = includeGps ? createGpsAsciiTag(1, gpsLatitude >= 0 ? "N" : "S", dataOffset) : null;
  if (includeGps) dataOffset += gpsLatRefTag.ascii.length;
  const gpsLatTag = includeGps ? createGpsCoordinateTag(2, gpsLatitude, dataOffset) : null;
  if (includeGps) dataOffset += gpsLatTag.rational.length;
  const gpsLonRefTag = includeGps ? createGpsAsciiTag(3, gpsLongitude >= 0 ? "E" : "W", dataOffset) : null;
  if (includeGps) dataOffset += gpsLonRefTag.ascii.length;
  const gpsLonTag = includeGps ? createGpsCoordinateTag(4, gpsLongitude, dataOffset) : null;
  if (includeGps) dataOffset += gpsLonTag.rational.length;
  const gpsAltitudeRefTag = includeGpsAltitude ? createLittleEndianByteTag(5, gpsAltitudeM < 0 ? 1 : 0) : null;
  const gpsAltitudeTag = includeGpsAltitude ? createLittleEndianRationalTag(6, Math.round(Math.abs(gpsAltitudeM) * 100), 100, dataOffset) : null;
  if (includeGpsAltitude) dataOffset += gpsAltitudeTag.rational.length;

  const payload = Buffer.alloc(dataOffset);
  payload.write("II", 0, "ascii");
  payload.writeUInt16LE(42, 2);
  payload.writeUInt32LE(rootIfdOffset, 4);
  payload.writeUInt16LE(rootEntryCount, rootIfdOffset);

  payload.writeUInt16LE(256, 10); payload.writeUInt16LE(4, 12); payload.writeUInt32LE(1, 14); payload.writeUInt32LE(width, 18);
  payload.writeUInt16LE(257, 22); payload.writeUInt16LE(4, 24); payload.writeUInt32LE(1, 26); payload.writeUInt32LE(height, 30);
  makeTag.entry.copy(payload, 34);
  modelTag.entry.copy(payload, 46);
  payload.writeUInt16LE(274, 58); payload.writeUInt16LE(3, 60); payload.writeUInt32LE(1, 62); payload.writeUInt16LE(orientation, 66);
  payload.writeUInt16LE(34665, 70); payload.writeUInt16LE(4, 72); payload.writeUInt32LE(1, 74); payload.writeUInt32LE(exifIfdOffset, 78);
  if (includeGps) { payload.writeUInt16LE(34853, 82); payload.writeUInt16LE(4, 84); payload.writeUInt32LE(1, 86); payload.writeUInt32LE(gpsIfdOffset, 90); }
  payload.writeUInt32LE(0, rootNextOffset);

  payload.writeUInt16LE(exifEntryCount, exifIfdOffset);
  dateTag.entry.copy(payload, exifEntriesOffset);
  exposureBiasTag.entry.copy(payload, exifEntriesOffset + 12);
  exposureTag.entry.copy(payload, exifEntriesOffset + 24);
  exposureProgramTag.copy(payload, exifEntriesOffset + 36);
  fNumberTag.entry.copy(payload, exifEntriesOffset + 48);
  flashTag.copy(payload, exifEntriesOffset + 60);
  isoTag.copy(payload, exifEntriesOffset + 72);
  focalTag.entry.copy(payload, exifEntriesOffset + 84);
  meteringTag.copy(payload, exifEntriesOffset + 96);
  whiteBalanceTag.copy(payload, exifEntriesOffset + 108);
  exposureModeTag.copy(payload, exifEntriesOffset + 120);
  lensTag.entry.copy(payload, exifEntriesOffset + 132);
  payload.writeUInt32LE(0, exifNextOffset);
  if (includeGps) {
    payload.writeUInt16LE(gpsEntryCount, gpsIfdOffset);
    gpsLatRefTag.entry.copy(payload, gpsEntriesOffset);
    gpsLatTag.entry.copy(payload, gpsEntriesOffset + 12);
    gpsLonRefTag.entry.copy(payload, gpsEntriesOffset + 24);
    gpsLonTag.entry.copy(payload, gpsEntriesOffset + 36);
    if (includeGpsAltitude) {
      gpsAltitudeRefTag.copy(payload, gpsEntriesOffset + 48);
      gpsAltitudeTag.entry.copy(payload, gpsEntriesOffset + 60);
    }
    payload.writeUInt32LE(0, gpsNextOffset);
  }

  makeTag.ascii.copy(payload, makeTag.entry.readUInt32LE(8));
  modelTag.ascii.copy(payload, modelTag.entry.readUInt32LE(8));
  dateTag.ascii.copy(payload, dateTag.entry.readUInt32LE(8));
  exposureBiasTag.rational.copy(payload, exposureBiasTag.entry.readUInt32LE(8));
  exposureTag.rational.copy(payload, exposureTag.entry.readUInt32LE(8));
  fNumberTag.rational.copy(payload, fNumberTag.entry.readUInt32LE(8));
  focalTag.rational.copy(payload, focalTag.entry.readUInt32LE(8));
  lensTag.ascii.copy(payload, lensTag.entry.readUInt32LE(8));
  if (includeGps) {
    if (gpsLatRefTag.ascii.length > 4) gpsLatRefTag.ascii.copy(payload, gpsLatRefTag.entry.readUInt32LE(8));
    gpsLatTag.rational.copy(payload, gpsLatTag.entry.readUInt32LE(8));
    if (gpsLonRefTag.ascii.length > 4) gpsLonRefTag.ascii.copy(payload, gpsLonRefTag.entry.readUInt32LE(8));
    gpsLonTag.rational.copy(payload, gpsLonTag.entry.readUInt32LE(8));
    if (includeGpsAltitude) gpsAltitudeTag.rational.copy(payload, gpsAltitudeTag.entry.readUInt32LE(8));
  }
  return payload;
}

function createJpegExifBuffer() {
  const exifPayload = createExifTiffPayload({
    width: 12,
    height: 8,
    orientation: 6,
    captureAt: "2025:07:06 11:22:33",
    cameraMake: "Canon",
    cameraModel: "EOS R6",
    lensModel: "RF24-70mm F2.8 L IS USM",
    gpsLatitude: 37.7749,
    gpsLongitude: 122.4194,
    gpsAltitudeM: 15.25,
    focalLengthMm: 70,
    fNumber: 2.8,
    isoSpeed: 400,
    exposureTimeSeconds: 1 / 125,
    exposureProgram: 2,
    flashFired: true,
    exposureBiasEv: 1 / 3,
  });
  const app1Length = exifPayload.length + 8;
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    Buffer.from([0xff, 0xe1, (app1Length >> 8) & 0xff, app1Length & 0xff]),
    Buffer.from("Exif\x00\x00", "binary"),
    exifPayload,
    Buffer.from([0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x08, 0x00, 0x0c, 0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00]),
    Buffer.from([0xff, 0xd9]),
  ]);
}

function createTiffExifBuffer() {
  return createExifTiffPayload({
    width: 320,
    height: 180,
    orientation: 8,
    captureAt: "2024:12:31 23:59:58",
    cameraMake: "Nikon",
    cameraModel: "Zf II",
    lensModel: "NIKKOR Z 24-70mm f/2.8 S",
    gpsLatitude: 35.6895,
    gpsLongitude: 139.6917,
    gpsAltitudeM: -42.5,
  });
}

test("source-file insights reads PNG dimensions from IHDR", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-source-insights-png-"));
  const sourcePath = path.join(dir, "preview.png");
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x10,
    0x00, 0x00, 0x00, 0x08,
    0x08, 0x02, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  await writeFile(sourcePath, png);

  const metadata = await readObservedSourceFileMetadata(sourcePath);
  assert.equal(metadata.observedFormat, "png");
  assert.equal(metadata.pixelWidth, 16);
  assert.equal(metadata.pixelHeight, 8);
  assert.equal(metadata.orientation, null);
  assert.equal(metadata.capturedAt, null);
  assert.equal(metadata.cameraMake, null);
  assert.equal(metadata.cameraModel, null);
});

test("source-file insights classifies readable RAW files from extension when headers are opaque", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-source-insights-raw-"));
  const sourcePath = path.join(dir, "frame.CR3");
  await writeFile(sourcePath, Buffer.from("opaque raw bytes"));

  const metadata = await readObservedSourceFileMetadata(sourcePath);
  assert.equal(metadata.observedFormat, "raw");
  assert.equal(metadata.pixelWidth, null);
  assert.equal(metadata.pixelHeight, null);
});

test("source-file insights reads JPEG dimensions plus EXIF-lite orientation/capture time and camera metadata", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-source-insights-jpeg-"));
  const sourcePath = path.join(dir, "frame.jpg");
  await writeFile(sourcePath, createJpegExifBuffer());

  const metadata = await readObservedSourceFileMetadata(sourcePath);
  assert.equal(metadata.observedFormat, "jpeg");
  assert.equal(metadata.pixelWidth, 12);
  assert.equal(metadata.pixelHeight, 8);
  assert.equal(metadata.orientation, 6);
  assert.equal(metadata.capturedAt, "2025:07:06 11:22:33");
  assert.equal(metadata.cameraMake, "Canon");
  assert.equal(metadata.cameraModel, "EOS R6");
  assert.equal(metadata.lensModel, "RF24-70mm F2.8 L IS USM");
  assert.equal(metadata.exposureProgram, 2);
  assert.equal(metadata.exposureProgram, 2);
  assert.equal(metadata.meteringMode, 5);
  assert.equal(metadata.whiteBalanceMode, 1);
  assert.equal(metadata.exposureMode, 0);
  assert.equal(metadata.exposureMode, 0);
  assert.equal(metadata.focalLengthMm, 70);
  assert.equal(metadata.fNumber, 2.8);
  assert.equal(metadata.isoSpeed, 400);
  assert.equal(metadata.exposureTimeSeconds, 1 / 125);
  assert.equal(metadata.flashFired, true);
  assert.equal(metadata.exposureBiasEv, 1 / 3);
  assert.ok(Math.abs(metadata.gpsLatitude - 37.7749) < 0.0001);
  assert.ok(Math.abs(metadata.gpsLongitude - 122.4194) < 0.0001);
  assert.ok(Math.abs(metadata.gpsAltitudeM - 15.25) < 0.0001);
});

test("source-file insights reads TIFF-like dimensions plus EXIF-lite orientation/capture time and camera metadata", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-source-insights-tiff-"));
  const sourcePath = path.join(dir, "frame.tif");
  await writeFile(sourcePath, createTiffExifBuffer());

  const metadata = await readObservedSourceFileMetadata(sourcePath);
  assert.equal(metadata.observedFormat, "tiff");
  assert.equal(metadata.pixelWidth, 320);
  assert.equal(metadata.pixelHeight, 180);
  assert.equal(metadata.orientation, 8);
  assert.equal(metadata.capturedAt, "2024:12:31 23:59:58");
  assert.equal(metadata.cameraMake, "Nikon");
  assert.equal(metadata.cameraModel, "Zf II");
  assert.equal(metadata.lensModel, "NIKKOR Z 24-70mm f/2.8 S");
  assert.equal(metadata.exposureProgram, 2);
  assert.equal(metadata.meteringMode, 5);
  assert.equal(metadata.whiteBalanceMode, 1);
  assert.equal(metadata.exposureMode, 0);
  assert.equal(metadata.focalLengthMm, 70);
  assert.equal(metadata.fNumber, 2.8);
  assert.equal(metadata.isoSpeed, 400);
  assert.equal(metadata.exposureTimeSeconds, 1 / 125);
  assert.equal(metadata.flashFired, true);
  assert.equal(metadata.exposureBiasEv, 1 / 3);
  assert.ok(Math.abs(metadata.gpsLatitude - 35.6895) < 0.0001);
  assert.ok(Math.abs(metadata.gpsLongitude - 139.6917) < 0.0001);
  assert.ok(Math.abs(metadata.gpsAltitudeM - (-42.5)) < 0.0001);
});

test("source-file insights returns null observations honestly when the file is missing", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-source-insights-missing-"));
  const sourcePath = path.join(dir, "missing.cr3");

  const metadata = await readObservedSourceFileMetadata(sourcePath);
  assert.deepEqual(metadata, {
    byteSize: null,
    modifiedAt: null,
    observedFormat: null,
    pixelWidth: null,
    pixelHeight: null,
    orientation: null,
    capturedAt: null,
    cameraMake: null,
    cameraModel: null,
    lensModel: null,
    focalLengthMm: null,
    fNumber: null,
    isoSpeed: null,
    exposureTimeSeconds: null,
    flashFired: null,
    exposureBiasEv: null,
    gpsLatitude: null,
    gpsLongitude: null,
    gpsAltitudeM: null,
  });
});

test("source-file insights can summarize mixed observed source metadata across paths", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-source-insights-summary-"));
  const pngPath = path.join(dir, "preview.png");
  const jpgPath = path.join(dir, "frame.jpg");
  const missingPath = path.join(dir, "missing.cr3");

  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x10,
    0x00, 0x00, 0x00, 0x08,
    0x08, 0x02, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  await writeFile(pngPath, png);
  await writeFile(jpgPath, createJpegExifBuffer());

  const summary = await summarizeObservedSourceFiles([pngPath, jpgPath, missingPath]);
  assert.equal(summary.entries.length, 3);
  assert.deepEqual(summary.counts, {
    total: 3,
    withKnownByteSize: 2,
    withKnownModifiedAt: 2,
    withKnownDimensions: 2,
    withObservedOrientation: 1,
    withObservedCaptureAt: 1,
    withObservedCamera: 1,
    withObservedLens: 1,
    withObservedFocalLength: 1,
    withObservedFNumber: 1,
    withObservedIsoSpeed: 1,
    withObservedExposureTime: 1,
    withObservedExposureProgram: 1,
    withObservedFlash: 1,
    withObservedExposureBias: 1,
    withObservedMeteringMode: 1,
    withObservedWhiteBalanceMode: 1,
    withObservedExposureMode: 1,
    withObservedGps: 1,
    withObservedGpsAltitude: 1,
  });
  assert.equal(summary.latestObservedCaptureAt, "2025:07:06 11:22:33");
  assert.deepEqual(summary.latestObservedCaptureEntry, {
    sourcePath: jpgPath,
    byteSize: summary.latestObservedCaptureEntry.byteSize,
    modifiedAt: summary.latestObservedCaptureEntry.modifiedAt,
    observedFormat: "jpeg",
    pixelWidth: 12,
    pixelHeight: 8,
    orientation: 6,
    capturedAt: "2025:07:06 11:22:33",
    cameraMake: "Canon",
    cameraModel: "EOS R6",
    lensModel: "RF24-70mm F2.8 L IS USM",
    gpsLatitude: 37.7749,
    gpsLongitude: -122.4194,
    focalLengthMm: 70,
    fNumber: 2.8,
    isoSpeed: 400,
    exposureTimeSeconds: 1 / 125,
    exposureProgram: 2,
    flashFired: true,
    exposureBiasEv: 1 / 3,
    meteringMode: 5,
    whiteBalanceMode: 1,
    exposureMode: 0,
    gpsLatitude: summary.latestObservedCaptureEntry.gpsLatitude,
    gpsLongitude: summary.latestObservedCaptureEntry.gpsLongitude,
    gpsAltitudeM: 15.25,
  });
  assert.deepEqual(summary.observedFormats, { png: 1, jpeg: 1 });
  assert.deepEqual(summary.observedCameras, { "Canon EOS R6": 1 });
  assert.deepEqual(summary.observedLenses, { "RF24-70mm F2.8 L IS USM": 1 });
  assert.deepEqual(summary.focalLengthMmRange, { min: 70, max: 70 });
  assert.deepEqual(summary.fNumberRange, { min: 2.8, max: 2.8 });
  assert.deepEqual(summary.isoSpeedRange, { min: 400, max: 400 });
  assert.deepEqual(summary.exposureTimeSecondsRange, { min: 1 / 125, max: 1 / 125 });
  assert.deepEqual(summary.flashUsage, { fired: 1, notFired: 0 });
  assert.deepEqual(summary.exposureBiasEvRange, { min: 1 / 3, max: 1 / 3 });
  assert.ok([pngPath, jpgPath].includes(summary.latestObservedFormatEntry.sourcePath));
  assert.equal(summary.latestObservedCameraEntry.sourcePath, jpgPath);
  assert.equal(summary.latestObservedCameraEntry.cameraMake, "Canon");
  assert.equal(summary.latestObservedCameraEntry.cameraModel, "EOS R6");
  assert.equal(summary.latestObservedLensEntry.sourcePath, jpgPath);
  assert.equal(summary.latestObservedLensEntry.lensModel, "RF24-70mm F2.8 L IS USM");
  assert.equal(summary.latestObservedFocalLengthEntry.sourcePath, jpgPath);
  assert.equal(summary.latestObservedFocalLengthEntry.focalLengthMm, 70);
  assert.equal(summary.latestObservedExposureEntry.sourcePath, jpgPath);
  assert.equal(summary.latestObservedExposureEntry.fNumber, 2.8);
  assert.equal(summary.latestObservedExposureEntry.isoSpeed, 400);
  assert.equal(summary.latestObservedExposureEntry.exposureTimeSeconds, 1 / 125);
  assert.equal(summary.latestObservedExposureEntry.flashFired, true);
  assert.equal(summary.latestObservedExposureEntry.exposureBiasEv, 1 / 3);
  assert.equal(summary.latestObservedGpsEntry.sourcePath, jpgPath);
  assert.ok(Math.abs(summary.latestObservedGpsEntry.gpsLatitude - 37.7749) < 0.0001);
  assert.ok(Math.abs(summary.latestObservedGpsEntry.gpsLongitude - 122.4194) < 0.0001);
  assert.equal(summary.latestObservedGpsAltitudeEntry.sourcePath, jpgPath);
  assert.ok(Math.abs(summary.latestObservedGpsAltitudeEntry.gpsAltitudeM - 15.25) < 0.0001);
  assert.deepEqual(summary.gpsAltitudeRange, { min: 15.25, max: 15.25 });
  assert.deepEqual(summary.meteringModes, { 5: 1 });
  assert.deepEqual(summary.whiteBalanceModes, { 1: 1 });
  assert.deepEqual(summary.exposurePrograms, { 2: 1 });
  assert.deepEqual(summary.exposureModes, { 0: 1 });
  assert.equal(summary.largestPixelArea, 128);
  assert.equal(summary.entries[2].sourcePath, missingPath);
  assert.equal(summary.entries[2].observedFormat, null);
});

test("source-file insights report helper returns operation metadata and missing-path tracking", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-source-insights-report-"));
  const pngPath = path.join(dir, "preview.png");
  const missingPath = path.join(dir, "missing.cr3");
  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x04,
    0x00, 0x00, 0x00, 0x02,
    0x08, 0x02, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
  await writeFile(pngPath, png);

  const report = await summarizeObservedSourceFilesReport([pngPath, missingPath]);
  assert.deepEqual(report.operation, {
    kind: "summarize-observed-source-files",
    requestedSourcePaths: [pngPath, missingPath],
    missingSourcePaths: [missingPath],
    observedSourcePaths: [pngPath],
  });
  assert.equal(report.counts.total, 2);
  assert.equal(report.counts.withObservedCamera, 0);
  assert.equal(report.counts.withObservedGps, 0);
  assert.equal(report.counts.withObservedGpsAltitude, 0);
  assert.equal(report.counts.withObservedMeteringMode, 0);
  assert.equal(report.counts.withObservedWhiteBalanceMode, 0);
  assert.equal(report.counts.withObservedExposureProgram, 0);
  assert.equal(report.counts.withObservedExposureMode, 0);
  assert.deepEqual(report.observedFormats, { png: 1 });
  assert.deepEqual(report.observedCameras, {});
  assert.deepEqual(report.observedLenses, {});
  assert.equal(report.focalLengthMmRange, null);
  assert.equal(report.fNumberRange, null);
  assert.equal(report.isoSpeedRange, null);
  assert.equal(report.exposureTimeSecondsRange, null);
  assert.deepEqual(report.flashUsage, { fired: 0, notFired: 0 });
  assert.equal(report.exposureBiasEvRange, null);
  assert.equal(report.latestObservedFormatEntry.sourcePath, pngPath);
});
