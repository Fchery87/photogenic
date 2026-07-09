import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";

const TIFF_WIDTH_TAG = 256;
const TIFF_HEIGHT_TAG = 257;
const TIFF_MAKE_TAG = 271;
const TIFF_MODEL_TAG = 272;
const TIFF_ORIENTATION_TAG = 274;
const TIFF_GPS_IFD_TAG = 34853;
const TIFF_EXIF_IFD_TAG = 34665;
const EXIF_DATE_TIME_ORIGINAL_TAG = 36867;
const EXIF_EXPOSURE_BIAS_TAG = 37380;
const EXIF_EXPOSURE_TIME_TAG = 33434;
const EXIF_EXPOSURE_PROGRAM_TAG = 34850;
const EXIF_FNUMBER_TAG = 33437;
const EXIF_FLASH_TAG = 37385;
const EXIF_ISO_SPEED_TAG = 34855;
const EXIF_METERING_MODE_TAG = 37383;
const EXIF_EXPOSURE_MODE_TAG = 41986;
const EXIF_FOCAL_LENGTH_TAG = 37386;
const EXIF_LENS_MODEL_TAG = 42036;
const EXIF_WHITE_BALANCE_TAG = 41987;
const GPS_LATITUDE_REF_TAG = 1;
const GPS_LATITUDE_TAG = 2;
const GPS_LONGITUDE_REF_TAG = 3;
const GPS_LONGITUDE_TAG = 4;
const GPS_ALTITUDE_REF_TAG = 5;
const GPS_ALTITUDE_TAG = 6;

function readUInt16(buffer, offset, littleEndian) {
  return littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
}

function readUInt32(buffer, offset, littleEndian) {
  return littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
}

function canRead(buffer, offset, size) {
  return Number.isInteger(offset) && Number.isInteger(size) && offset >= 0 && size >= 0 && offset + size <= buffer.length;
}

function readAscii(buffer, offset, length) {
  if (!canRead(buffer, offset, length) || length <= 0) return null;
  return buffer.toString("ascii", offset, offset + length).replace(/\0+$/g, "") || null;
}

function getInlineValueOffset(entryOffset, bigTiff = false) {
  return bigTiff ? entryOffset + 12 : entryOffset + 8;
}

function getTypeSize(type) {
  switch (type) {
    case 1:
    case 2:
    case 7:
      return 1;
    case 3:
      return 2;
    case 4:
    case 9:
      return 4;
    case 5:
    case 10:
      return 8;
    case 16:
    case 17:
    case 18:
      return 8;
    default:
      return null;
  }
}

function resolveIfdValueOffset(buffer, tiffStart, entryOffset, type, count, littleEndian, bigTiff = false) {
  const typeSize = getTypeSize(type);
  if (!typeSize || !Number.isInteger(count) || count < 1) return null;
  const byteLength = typeSize * count;
  const inlineOffset = getInlineValueOffset(entryOffset, bigTiff);
  const valueOffset = byteLength <= (bigTiff ? 8 : 4)
    ? inlineOffset
    : tiffStart + (bigTiff
      ? Number(littleEndian ? buffer.readBigUInt64LE(entryOffset + 12) : buffer.readBigUInt64BE(entryOffset + 12))
      : readUInt32(buffer, entryOffset + 8, littleEndian));
  return canRead(buffer, valueOffset, byteLength) ? { valueOffset, byteLength, typeSize } : null;
}

function readIfdValue(buffer, tiffStart, entryOffset, type, count, littleEndian, bigTiff = false) {
  const resolved = resolveIfdValueOffset(buffer, tiffStart, entryOffset, type, count, littleEndian, bigTiff);
  if (!resolved) return null;
  const { valueOffset, byteLength } = resolved;

  if (type === 2) return readAscii(buffer, valueOffset, byteLength);
  if (count !== 1) return null;

  switch (type) {
    case 1:
      return buffer[valueOffset];
    case 3:
      return readUInt16(buffer, valueOffset, littleEndian);
    case 4:
      return readUInt32(buffer, valueOffset, littleEndian);
    case 5: {
      if (!canRead(buffer, valueOffset, 8)) return null;
      const numerator = readUInt32(buffer, valueOffset, littleEndian);
      const denominator = readUInt32(buffer, valueOffset + 4, littleEndian);
      if (!denominator) return null;
      return numerator / denominator;
    }
    default:
      return null;
  }
}


function readIfdRationalArray(buffer, tiffStart, entryOffset, count, littleEndian, bigTiff = false) {
  const resolved = resolveIfdValueOffset(buffer, tiffStart, entryOffset, 5, count, littleEndian, bigTiff);
  if (!resolved) return null;
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const offset = resolved.valueOffset + index * 8;
    if (!canRead(buffer, offset, 8)) return null;
    const numerator = readUInt32(buffer, offset, littleEndian);
    const denominator = readUInt32(buffer, offset + 4, littleEndian);
    if (!denominator) return null;
    values.push(numerator / denominator);
  }
  return values;
}

function readGpsCoordinate(values = [], ref = null) {
  if (!Array.isArray(values) || values.length !== 3 || !values.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  const decimal = values[0] + (values[1] / 60) + (values[2] / 3600);
  if (!Number.isFinite(decimal)) return null;
  const hemisphere = typeof ref === "string" ? ref.toUpperCase() : null;
  return hemisphere === "S" || hemisphere === "W" ? -decimal : decimal;
}
function parseTiffMetadata(buffer, { observedFormat = "tiff" } = {}) {
  if (buffer.length < 8) return null;
  const byteOrder = buffer.toString("ascii", 0, 2);
  const littleEndian = byteOrder === "II" ? true : byteOrder === "MM" ? false : null;
  if (littleEndian === null) return null;

  const magic = readUInt16(buffer, 2, littleEndian);
  if (magic !== 42 && magic !== 43) return null;

  const bigTiff = magic === 43;
  const firstIfdOffset = bigTiff
    ? Number(littleEndian ? buffer.readBigUInt64LE(8) : buffer.readBigUInt64BE(8))
    : readUInt32(buffer, 4, littleEndian);
  const metadata = {
    observedFormat,
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
    exposureProgram: null,
    flashFired: null,
    exposureBiasEv: null,
    meteringMode: null,
    whiteBalanceMode: null,
    exposureMode: null,
    gpsLatitude: null,
    gpsLongitude: null,
    gpsAltitudeM: null,
  };

  function visitGpsIfd(ifdOffset) {
    if (!Number.isInteger(ifdOffset) || ifdOffset <= 0 || !canRead(buffer, ifdOffset, bigTiff ? 8 : 2)) return;
    const entryCount = bigTiff
      ? Number(littleEndian ? buffer.readBigUInt64LE(ifdOffset) : buffer.readBigUInt64BE(ifdOffset))
      : readUInt16(buffer, ifdOffset, littleEndian);
    const entrySize = bigTiff ? 20 : 12;
    const entryStart = ifdOffset + (bigTiff ? 8 : 2);
    let latitudeRef = null;
    let longitudeRef = null;
    let altitudeRef = 0;
    let latitudeValues = null;
    let longitudeValues = null;
    let altitudeValue = null;
    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = entryStart + index * entrySize;
      if (!canRead(buffer, entryOffset, entrySize)) break;
      const tag = readUInt16(buffer, entryOffset, littleEndian);
      const type = readUInt16(buffer, entryOffset + 2, littleEndian);
      const count = bigTiff
        ? Number(littleEndian ? buffer.readBigUInt64LE(entryOffset + 4) : buffer.readBigUInt64BE(entryOffset + 4))
        : readUInt32(buffer, entryOffset + 4, littleEndian);
      if (tag === GPS_LATITUDE_REF_TAG && type === 2) latitudeRef = readIfdValue(buffer, 0, entryOffset, type, count, littleEndian, bigTiff);
      if (tag === GPS_LONGITUDE_REF_TAG && type === 2) longitudeRef = readIfdValue(buffer, 0, entryOffset, type, count, littleEndian, bigTiff);
      if (tag === GPS_LATITUDE_TAG && type === 5 && count === 3) latitudeValues = readIfdRationalArray(buffer, 0, entryOffset, count, littleEndian, bigTiff);
      if (tag === GPS_LONGITUDE_TAG && type === 5 && count === 3) longitudeValues = readIfdRationalArray(buffer, 0, entryOffset, count, littleEndian, bigTiff);
      if (tag === GPS_ALTITUDE_REF_TAG && type === 1 && count === 1) altitudeRef = readIfdValue(buffer, 0, entryOffset, type, count, littleEndian, bigTiff) ?? 0;
      if (tag === GPS_ALTITUDE_TAG && type === 5 && count === 1) altitudeValue = readIfdValue(buffer, 0, entryOffset, type, count, littleEndian, bigTiff);
    }
    metadata.gpsLatitude = readGpsCoordinate(latitudeValues, latitudeRef);
    metadata.gpsLongitude = readGpsCoordinate(longitudeValues, longitudeRef);
    metadata.gpsAltitudeM = typeof altitudeValue === "number" && Number.isFinite(altitudeValue) ? (altitudeRef === 1 ? -altitudeValue : altitudeValue) : null;
  }

  function visitIfd(ifdOffset) {
    if (!Number.isInteger(ifdOffset) || ifdOffset <= 0 || !canRead(buffer, ifdOffset, bigTiff ? 8 : 2)) return;
    const entryCount = bigTiff
      ? Number(littleEndian ? buffer.readBigUInt64LE(ifdOffset) : buffer.readBigUInt64BE(ifdOffset))
      : readUInt16(buffer, ifdOffset, littleEndian);
    const entrySize = bigTiff ? 20 : 12;
    const entryStart = ifdOffset + (bigTiff ? 8 : 2);

    for (let index = 0; index < entryCount; index += 1) {
      const entryOffset = entryStart + index * entrySize;
      if (!canRead(buffer, entryOffset, entrySize)) break;
      const tag = readUInt16(buffer, entryOffset, littleEndian);
      const type = readUInt16(buffer, entryOffset + 2, littleEndian);
      const count = bigTiff
        ? Number(littleEndian ? buffer.readBigUInt64LE(entryOffset + 4) : buffer.readBigUInt64BE(entryOffset + 4))
        : readUInt32(buffer, entryOffset + 4, littleEndian);
      const value = readIfdValue(buffer, 0, entryOffset, type, count, littleEndian, bigTiff);
      if (tag === TIFF_WIDTH_TAG && Number.isInteger(value) && value > 0) metadata.pixelWidth = value;
      if (tag === TIFF_HEIGHT_TAG && Number.isInteger(value) && value > 0) metadata.pixelHeight = value;
      if (tag === TIFF_MAKE_TAG && typeof value === "string") metadata.cameraMake = value;
      if (tag === TIFF_MODEL_TAG && typeof value === "string") metadata.cameraModel = value;
      if (tag === TIFF_ORIENTATION_TAG && Number.isInteger(value) && value > 0) metadata.orientation = value;
      if (tag === EXIF_DATE_TIME_ORIGINAL_TAG && typeof value === "string") metadata.capturedAt = value;
      if (tag === EXIF_EXPOSURE_BIAS_TAG && typeof value === "number" && Number.isFinite(value)) metadata.exposureBiasEv = value;
      if (tag === EXIF_EXPOSURE_TIME_TAG && typeof value === "number" && Number.isFinite(value) && value > 0) metadata.exposureTimeSeconds = value;
      if (tag === EXIF_EXPOSURE_PROGRAM_TAG && Number.isInteger(value) && value >= 0) metadata.exposureProgram = value;
      if (tag === EXIF_FNUMBER_TAG && typeof value === "number" && Number.isFinite(value) && value > 0) metadata.fNumber = value;
      if (tag === EXIF_FLASH_TAG && Number.isInteger(value) && value >= 0) metadata.flashFired = (value & 0x1) === 1;
      if (tag === EXIF_METERING_MODE_TAG && Number.isInteger(value) && value >= 0) metadata.meteringMode = value;
      if (tag === EXIF_EXPOSURE_MODE_TAG && Number.isInteger(value) && value >= 0) metadata.exposureMode = value;
      if (tag === EXIF_ISO_SPEED_TAG && Number.isInteger(value) && value > 0) metadata.isoSpeed = value;
      if (tag === EXIF_FOCAL_LENGTH_TAG && typeof value === "number" && Number.isFinite(value) && value > 0) metadata.focalLengthMm = value;
      if (tag === EXIF_LENS_MODEL_TAG && typeof value === "string") metadata.lensModel = value;
      if (tag === EXIF_WHITE_BALANCE_TAG && Number.isInteger(value) && value >= 0) metadata.whiteBalanceMode = value;
      if (tag === TIFF_GPS_IFD_TAG && Number.isInteger(value) && value > 0) visitGpsIfd(value);
      if (tag === TIFF_EXIF_IFD_TAG && Number.isInteger(value) && value > 0) visitIfd(value);
    }
  }

  visitIfd(firstIfdOffset);
  return metadata;
}

function parsePngDimensions(buffer) {
  if (buffer.length < 24) return null;
  if (buffer.toString("hex", 0, 8) !== "89504e470d0a1a0a") return null;
  return {
    observedFormat: "png",
    pixelWidth: buffer.readUInt32BE(16),
    pixelHeight: buffer.readUInt32BE(20),
    orientation: null,
    capturedAt: null,
    cameraMake: null,
    cameraModel: null,
    lensModel: null,
    focalLengthMm: null,
    fNumber: null,
    isoSpeed: null,
    exposureTimeSeconds: null,
    exposureProgram: null,
    flashFired: null,
    exposureBiasEv: null,
    meteringMode: null,
    whiteBalanceMode: null,
    exposureMode: null,
    gpsLatitude: null,
    gpsLongitude: null,
    gpsAltitudeM: null,
  };
}

function parseJpegMetadata(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  const metadata = {
    observedFormat: "jpeg",
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
    exposureProgram: null,
    flashFired: null,
    exposureBiasEv: null,
    meteringMode: null,
    whiteBalanceMode: null,
    exposureMode: null,
    gpsLatitude: null,
    gpsLongitude: null,
    gpsAltitudeM: null,
  };

  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = readUInt16(buffer, offset + 2, false);
    if (length < 2 || !canRead(buffer, offset + 2, length)) break;
    const segmentStart = offset + 4;
    const segmentLength = length - 2;

    if (marker === 0xe1 && canRead(buffer, segmentStart, 6) && buffer.toString("ascii", segmentStart, segmentStart + 6) === "Exif\0\0") {
      const exif = parseTiffMetadata(buffer.subarray(segmentStart + 6, segmentStart + segmentLength), { observedFormat: "jpeg" });
      if (exif) {
        metadata.orientation = exif.orientation;
        metadata.capturedAt = exif.capturedAt;
        metadata.cameraMake = exif.cameraMake;
        metadata.cameraModel = exif.cameraModel;
        metadata.lensModel = exif.lensModel;
        metadata.focalLengthMm = exif.focalLengthMm;
        metadata.fNumber = exif.fNumber;
        metadata.isoSpeed = exif.isoSpeed;
        metadata.exposureTimeSeconds = exif.exposureTimeSeconds;
        metadata.exposureProgram = exif.exposureProgram;
        metadata.flashFired = exif.flashFired;
        metadata.exposureBiasEv = exif.exposureBiasEv;
        metadata.meteringMode = exif.meteringMode;
        metadata.whiteBalanceMode = exif.whiteBalanceMode;
        metadata.exposureMode = exif.exposureMode;
        metadata.gpsLatitude = exif.gpsLatitude;
        metadata.gpsLongitude = exif.gpsLongitude;
        metadata.gpsAltitudeM = exif.gpsAltitudeM;
        if (Number.isInteger(exif.pixelWidth)) metadata.pixelWidth = exif.pixelWidth;
        if (Number.isInteger(exif.pixelHeight)) metadata.pixelHeight = exif.pixelHeight;
      }
    }

    const isSof = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isSof && length >= 7 && canRead(buffer, offset + 5, 4)) {
      metadata.pixelHeight = buffer.readUInt16BE(offset + 5);
      metadata.pixelWidth = buffer.readUInt16BE(offset + 7);
    }

    offset += 2 + length;
  }

  return metadata;
}

function detectObservedImageMetadata(buffer, sourcePath) {
  const extension = extname(sourcePath).toLowerCase();
  return parsePngDimensions(buffer)
    ?? parseJpegMetadata(buffer)
    ?? parseTiffMetadata(buffer)
    ?? {
      observedFormat: [".jpg", ".jpeg"].includes(extension)
        ? "jpeg"
        : [".png"].includes(extension)
          ? "png"
          : [".tif", ".tiff"].includes(extension)
            ? "tiff"
            : [".dng", ".nef", ".arw", ".cr2", ".cr3", ".raf"].includes(extension)
              ? "raw"
            : null,
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
      exposureProgram: null,
      flashFired: null,
      exposureBiasEv: null,
      meteringMode: null,
      whiteBalanceMode: null,
      exposureMode: null,
      gpsLatitude: null,
      gpsLongitude: null,
      gpsAltitudeM: null,
    };
}

export async function readObservedSourceFileMetadata(sourcePath) {
  try {
    const info = await stat(sourcePath);
    const metadata = {
      byteSize: Number.isInteger(info.size) ? info.size : null,
      modifiedAt: info.mtime instanceof Date && !Number.isNaN(info.mtime.valueOf()) ? info.mtime.toISOString() : null,
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
      exposureProgram: null,
      flashFired: null,
      exposureBiasEv: null,
      meteringMode: null,
      whiteBalanceMode: null,
      exposureMode: null,
      gpsLatitude: null,
      gpsLongitude: null,
      gpsAltitudeM: null,
    };
    try {
      const buffer = await readFile(sourcePath);
      return {
        ...metadata,
        ...detectObservedImageMetadata(buffer, sourcePath),
      };
    } catch {
      return metadata;
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
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
      };
    }
    throw error;
  }
}


export async function summarizeObservedSourceFiles(sourcePaths = []) {
  if (!Array.isArray(sourcePaths)) throw new TypeError("sourcePaths must be an array");

  const entries = [];
  for (const sourcePath of sourcePaths) {
    entries.push({
      sourcePath,
      ...(await readObservedSourceFileMetadata(sourcePath)),
    });
  }

  const observedFormats = entries.reduce((summary, entry) => {
    const observedFormat = typeof entry?.observedFormat === "string" ? entry.observedFormat : null;
    if (!observedFormat) return summary;
    summary[observedFormat] = (summary[observedFormat] ?? 0) + 1;
    return summary;
  }, {});

  const latestObservedCaptureEntry = [...entries]
    .filter((entry) => typeof entry?.capturedAt === "string")
    .sort((a, b) => String(b.capturedAt).localeCompare(String(a.capturedAt)))[0] ?? null;
  const latestObservedFormatEntry = [...entries]
    .filter((entry) => typeof entry?.observedFormat === "string")
    .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
  const latestObservedCameraEntry = [...entries]
    .filter((entry) => typeof entry?.cameraMake === "string" || typeof entry?.cameraModel === "string")
    .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
  const latestObservedLensEntry = [...entries]
    .filter((entry) => typeof entry?.lensModel === "string")
    .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
  const latestObservedFocalLengthEntry = [...entries]
    .filter((entry) => typeof entry?.focalLengthMm === "number" && Number.isFinite(entry.focalLengthMm))
    .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
  const latestObservedExposureEntry = [...entries]
    .filter((entry) => (typeof entry?.fNumber === "number" && Number.isFinite(entry.fNumber)) || Number.isInteger(entry?.isoSpeed) || (typeof entry?.exposureTimeSeconds === "number" && Number.isFinite(entry.exposureTimeSeconds)) || Number.isInteger(entry?.exposureProgram) || typeof entry?.flashFired === "boolean" || typeof entry?.exposureBiasEv === "number" || Number.isInteger(entry?.meteringMode) || Number.isInteger(entry?.whiteBalanceMode) || Number.isInteger(entry?.exposureMode))
    .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
  const observedCameras = entries.reduce((summary, entry) => {
    const cameraMake = typeof entry?.cameraMake === "string" ? entry.cameraMake : null;
    const cameraModel = typeof entry?.cameraModel === "string" ? entry.cameraModel : null;
    const label = [cameraMake, cameraModel].filter(Boolean).join(" ") || cameraModel || cameraMake;
    if (!label) return summary;
    summary[label] = (summary[label] ?? 0) + 1;
    return summary;
  }, {});
  const latestObservedGpsEntry = [...entries]
    .filter((entry) => typeof entry?.gpsLatitude === "number" && Number.isFinite(entry.gpsLatitude) && typeof entry?.gpsLongitude === "number" && Number.isFinite(entry.gpsLongitude))
    .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
  const gpsAltitudes = entries
    .map((entry) => entry?.gpsAltitudeM)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  const latestObservedGpsAltitudeEntry = [...entries]
    .filter((entry) => typeof entry?.gpsAltitudeM === "number" && Number.isFinite(entry.gpsAltitudeM))
    .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
  const observedLenses = entries.reduce((summary, entry) => {
    const lensModel = typeof entry?.lensModel === "string" ? entry.lensModel : null;
    if (!lensModel) return summary;
    summary[lensModel] = (summary[lensModel] ?? 0) + 1;
    return summary;
  }, {});
  const focalLengths = entries
    .map((entry) => entry?.focalLengthMm)
    .filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const fNumbers = entries
    .map((entry) => entry?.fNumber)
    .filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const isoSpeeds = entries
    .map((entry) => entry?.isoSpeed)
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);
  const exposureTimes = entries
    .map((entry) => entry?.exposureTimeSeconds)
    .filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const exposureBiases = entries
    .map((entry) => entry?.exposureBiasEv)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);

  return {
    entries,
    counts: {
      total: entries.length,
      withKnownByteSize: entries.filter((entry) => Number.isInteger(entry?.byteSize)).length,
      withKnownModifiedAt: entries.filter((entry) => typeof entry?.modifiedAt === "string").length,
      withKnownDimensions: entries.filter((entry) => Number.isInteger(entry?.pixelWidth) && Number.isInteger(entry?.pixelHeight)).length,
      withObservedOrientation: entries.filter((entry) => Number.isInteger(entry?.orientation)).length,
      withObservedCaptureAt: entries.filter((entry) => typeof entry?.capturedAt === "string").length,
      withObservedCamera: entries.filter((entry) => typeof entry?.cameraMake === "string" || typeof entry?.cameraModel === "string").length,
      withObservedLens: entries.filter((entry) => typeof entry?.lensModel === "string").length,
      withObservedFocalLength: entries.filter((entry) => typeof entry?.focalLengthMm === "number" && Number.isFinite(entry.focalLengthMm) && entry.focalLengthMm > 0).length,
      withObservedFNumber: entries.filter((entry) => typeof entry?.fNumber === "number" && Number.isFinite(entry.fNumber) && entry.fNumber > 0).length,
      withObservedIsoSpeed: entries.filter((entry) => Number.isInteger(entry?.isoSpeed) && entry.isoSpeed > 0).length,
      withObservedExposureTime: entries.filter((entry) => typeof entry?.exposureTimeSeconds === "number" && Number.isFinite(entry.exposureTimeSeconds) && entry.exposureTimeSeconds > 0).length,
      withObservedExposureProgram: entries.filter((entry) => Number.isInteger(entry?.exposureProgram)).length,
      withObservedFlash: entries.filter((entry) => typeof entry?.flashFired === "boolean").length,
      withObservedExposureBias: entries.filter((entry) => typeof entry?.exposureBiasEv === "number" && Number.isFinite(entry.exposureBiasEv)).length,
      withObservedMeteringMode: entries.filter((entry) => Number.isInteger(entry?.meteringMode)).length,
      withObservedWhiteBalanceMode: entries.filter((entry) => Number.isInteger(entry?.whiteBalanceMode)).length,
      withObservedExposureMode: entries.filter((entry) => Number.isInteger(entry?.exposureMode)).length,
      withObservedGps: entries.filter((entry) => typeof entry?.gpsLatitude === "number" && Number.isFinite(entry.gpsLatitude) && typeof entry?.gpsLongitude === "number" && Number.isFinite(entry.gpsLongitude)).length,
      withObservedGpsAltitude: gpsAltitudes.length,
    },
    latestObservedCaptureAt: latestObservedCaptureEntry?.capturedAt ?? null,
    latestObservedCaptureEntry,
    observedFormats,
    observedCameras,
    observedLenses,
    focalLengthMmRange: focalLengths.length
      ? { min: focalLengths[0], max: focalLengths[focalLengths.length - 1] }
      : null,
    fNumberRange: fNumbers.length
      ? { min: fNumbers[0], max: fNumbers[fNumbers.length - 1] }
      : null,
    isoSpeedRange: isoSpeeds.length
      ? { min: isoSpeeds[0], max: isoSpeeds[isoSpeeds.length - 1] }
      : null,
    exposureTimeSecondsRange: exposureTimes.length
      ? { min: exposureTimes[0], max: exposureTimes[exposureTimes.length - 1] }
      : null,
    flashUsage: {
      fired: entries.filter((entry) => entry?.flashFired === true).length,
      notFired: entries.filter((entry) => entry?.flashFired === false).length,
    },
    exposureBiasEvRange: exposureBiases.length
      ? { min: exposureBiases[0], max: exposureBiases[exposureBiases.length - 1] }
      : null,
    latestObservedFormatEntry,
    latestObservedCameraEntry,
    latestObservedLensEntry,
    latestObservedFocalLengthEntry,
    latestObservedExposureEntry,
    latestObservedGpsEntry,
    latestObservedGpsAltitudeEntry,
    gpsAltitudeRange: gpsAltitudes.length
      ? { min: gpsAltitudes[0], max: gpsAltitudes[gpsAltitudes.length - 1] }
      : null,
    meteringModes: entries.reduce((summary, entry) => {
      if (!Number.isInteger(entry?.meteringMode)) return summary;
      summary[entry.meteringMode] = (summary[entry.meteringMode] ?? 0) + 1;
      return summary;
    }, {}),
    whiteBalanceModes: entries.reduce((summary, entry) => {
      if (!Number.isInteger(entry?.whiteBalanceMode)) return summary;
      summary[entry.whiteBalanceMode] = (summary[entry.whiteBalanceMode] ?? 0) + 1;
      return summary;
    }, {}),
    exposurePrograms: entries.reduce((summary, entry) => {
      if (!Number.isInteger(entry?.exposureProgram)) return summary;
      summary[entry.exposureProgram] = (summary[entry.exposureProgram] ?? 0) + 1;
      return summary;
    }, {}),
    exposureModes: entries.reduce((summary, entry) => {
      if (!Number.isInteger(entry?.exposureMode)) return summary;
      summary[entry.exposureMode] = (summary[entry.exposureMode] ?? 0) + 1;
      return summary;
    }, {}),
    largestPixelArea: entries
      .filter((entry) => Number.isInteger(entry?.pixelWidth) && Number.isInteger(entry?.pixelHeight))
      .map((entry) => entry.pixelWidth * entry.pixelHeight)
      .sort((a, b) => b - a)[0] ?? null,
  };
}


export async function summarizeObservedSourceFilesReport(sourcePaths = []) {
  const normalizedSourcePaths = Array.isArray(sourcePaths)
    ? sourcePaths.filter((sourcePath) => typeof sourcePath === "string" && sourcePath)
    : null;
  if (!normalizedSourcePaths) throw new TypeError("sourcePaths must be an array");

  const summary = await summarizeObservedSourceFiles(normalizedSourcePaths);
  return {
    operation: {
      kind: "summarize-observed-source-files",
      requestedSourcePaths: [...normalizedSourcePaths],
      missingSourcePaths: summary.entries
        .filter((entry) => entry.byteSize === null && entry.modifiedAt === null)
        .map((entry) => entry.sourcePath),
      observedSourcePaths: summary.entries
        .filter((entry) => entry.byteSize !== null || entry.modifiedAt !== null)
        .map((entry) => entry.sourcePath),
    },
    ...summary,
  };
}
