import { createHash } from "node:crypto";
import { readObservedSourceFileMetadata } from "./source-file-insights.js";

const SUPPORTED_EXTENSIONS = new Set([
  ".cr2",
  ".cr3",
  ".nef",
  ".arw",
  ".dng",
  ".raf",
  ".jpg",
  ".jpeg",
  ".png",
  ".tif",
  ".tiff",
]);

function extensionOf(sourcePath) {
  const index = sourcePath.lastIndexOf(".");
  return index >= 0 ? sourcePath.slice(index).toLowerCase() : "";
}

function createStableImageId(sourcePath) {
  return createHash("sha1").update(sourcePath).digest("hex").slice(0, 16);
}

export function isSupportedImportPath(sourcePath) {
  return typeof sourcePath === "string" && !!sourcePath && SUPPORTED_EXTENSIONS.has(extensionOf(sourcePath));
}


export async function readSourceFileMetadata(sourcePath) {
  return readObservedSourceFileMetadata(sourcePath);
}

export function classifyImportFile(sourcePath) {
  const supported = isSupportedImportPath(sourcePath);
  return {
    sourcePath,
    supported,
    imageId: supported ? createStableImageId(sourcePath) : null,
    extension: typeof sourcePath === "string" ? extensionOf(sourcePath) : "",
  };
}

export async function importShoot({ libraryStore, files }) {
  if (!libraryStore || typeof libraryStore.importImage !== "function") {
    throw new TypeError("libraryStore with importImage() is required");
  }
  if (!Array.isArray(files)) throw new TypeError("files must be an array");

  const imported = [];
  const skipped = [];

  for (const file of files) {
    const sourcePath = typeof file === "string" ? file : file?.sourcePath;
    const captureAt = typeof file === "object" ? file?.captureAt : undefined;
    const classified = classifyImportFile(sourcePath);
    if (!classified.supported) {
      skipped.push({ sourcePath, reason: "unsupported-format", extension: classified.extension });
      continue;
    }
    const fileMetadata = await readSourceFileMetadata(sourcePath);
    imported.push(
      await libraryStore.importImage({
        imageId: classified.imageId,
        sourcePath,
        captureAt,
        byteSize: fileMetadata.byteSize,
        modifiedAt: fileMetadata.modifiedAt,
        observedFormat: fileMetadata.observedFormat,
        pixelWidth: fileMetadata.pixelWidth,
        pixelHeight: fileMetadata.pixelHeight,
        orientation: fileMetadata.orientation,
        observedCaptureAt: fileMetadata.capturedAt,
        cameraMake: fileMetadata.cameraMake,
        cameraModel: fileMetadata.cameraModel,
        lensModel: fileMetadata.lensModel,
        focalLengthMm: fileMetadata.focalLengthMm,
        fNumber: fileMetadata.fNumber,
        isoSpeed: fileMetadata.isoSpeed,
        exposureTimeSeconds: fileMetadata.exposureTimeSeconds,
        exposureProgram: fileMetadata.exposureProgram,
        flashFired: fileMetadata.flashFired,
        exposureBiasEv: fileMetadata.exposureBiasEv,
        meteringMode: fileMetadata.meteringMode,
        whiteBalanceMode: fileMetadata.whiteBalanceMode,
        exposureMode: fileMetadata.exposureMode,
        gpsLatitude: fileMetadata.gpsLatitude,
        gpsLongitude: fileMetadata.gpsLongitude,
        gpsAltitudeM: fileMetadata.gpsAltitudeM,
      }),
    );
  }

  const importedWithKnownByteSize = imported.filter((entry) => Number.isInteger(entry?.byteSize));
  const importedWithKnownModifiedAt = imported.filter((entry) => typeof entry?.modifiedAt === "string");
  const observedFormatCounts = imported.reduce((summary, entry) => {
    const observedFormat = typeof entry?.observedFormat === "string" ? entry.observedFormat : null;
    if (!observedFormat) return summary;
    summary[observedFormat] = (summary[observedFormat] ?? 0) + 1;
    return summary;
  }, {});
  const observedCameraCounts = imported.reduce((summary, entry) => {
    const cameraMake = typeof entry?.cameraMake === "string" ? entry.cameraMake : null;
    const cameraModel = typeof entry?.cameraModel === "string" ? entry.cameraModel : null;
    const label = [cameraMake, cameraModel].filter(Boolean).join(" ") || cameraModel || cameraMake;
    if (!label) return summary;
    summary[label] = (summary[label] ?? 0) + 1;
    return summary;
  }, {});
  const observedLensCounts = imported.reduce((summary, entry) => {
    const lensModel = typeof entry?.lensModel === "string" ? entry.lensModel : null;
    if (!lensModel) return summary;
    summary[lensModel] = (summary[lensModel] ?? 0) + 1;
    return summary;
  }, {});
  const observedFocalLengths = imported
    .map((entry) => entry?.focalLengthMm)
    .filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const observedFNumbers = imported
    .map((entry) => entry?.fNumber)
    .filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const observedIsoSpeeds = imported
    .map((entry) => entry?.isoSpeed)
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);
  const observedExposureTimes = imported
    .map((entry) => entry?.exposureTimeSeconds)
    .filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const observedExposureBiases = imported
    .map((entry) => entry?.exposureBiasEv)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  const latestObservedGpsEntry = [...imported]
    .filter((entry) => typeof entry?.gpsLatitude === "number" && Number.isFinite(entry.gpsLatitude) && typeof entry?.gpsLongitude === "number" && Number.isFinite(entry.gpsLongitude))
    .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
  const observedGpsAltitudes = imported
    .map((entry) => entry?.gpsAltitudeM)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  const latestObservedExposureEntry = [...imported]
    .filter((entry) => (typeof entry?.fNumber === "number" && Number.isFinite(entry.fNumber) && entry.fNumber > 0)
      || (Number.isInteger(entry?.isoSpeed) && entry.isoSpeed > 0)
      || (typeof entry?.exposureTimeSeconds === "number" && Number.isFinite(entry.exposureTimeSeconds) && entry.exposureTimeSeconds > 0)
      || Number.isInteger(entry?.exposureProgram)
      || typeof entry?.flashFired === "boolean"
      || (typeof entry?.exposureBiasEv === "number" && Number.isFinite(entry.exposureBiasEv))
      || Number.isInteger(entry?.meteringMode)
      || Number.isInteger(entry?.whiteBalanceMode)
      || Number.isInteger(entry?.exposureMode))
    .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;

  return {
    imported,
    skipped,
    counts: {
      imported: imported.length,
      skipped: skipped.length,
      total: files.length,
      importedWithKnownByteSize: importedWithKnownByteSize.length,
      importedWithKnownModifiedAt: importedWithKnownModifiedAt.length,
      importedWithKnownDimensions: imported.filter((entry) => Number.isInteger(entry?.pixelWidth) && Number.isInteger(entry?.pixelHeight)).length,
      importedWithObservedOrientation: imported.filter((entry) => Number.isInteger(entry?.orientation)).length,
      importedWithObservedCaptureAt: imported.filter((entry) => typeof entry?.observedCaptureAt === "string").length,
      importedWithObservedCamera: imported.filter((entry) => typeof entry?.cameraMake === "string" || typeof entry?.cameraModel === "string").length,
      importedWithObservedLens: imported.filter((entry) => typeof entry?.lensModel === "string").length,
      importedWithObservedFocalLength: observedFocalLengths.length,
      importedWithObservedFNumber: observedFNumbers.length,
      importedWithObservedIsoSpeed: observedIsoSpeeds.length,
      importedWithObservedExposureTime: observedExposureTimes.length,
      importedWithObservedExposureProgram: imported.filter((entry) => Number.isInteger(entry?.exposureProgram)).length,
      importedWithObservedFlash: imported.filter((entry) => typeof entry?.flashFired === "boolean").length,
      importedWithObservedExposureBias: observedExposureBiases.length,
      importedWithObservedMeteringMode: imported.filter((entry) => Number.isInteger(entry?.meteringMode)).length,
      importedWithObservedWhiteBalanceMode: imported.filter((entry) => Number.isInteger(entry?.whiteBalanceMode)).length,
      importedWithObservedExposureMode: imported.filter((entry) => Number.isInteger(entry?.exposureMode)).length,
      importedWithObservedGps: imported.filter((entry) => typeof entry?.gpsLatitude === "number" && Number.isFinite(entry.gpsLatitude) && typeof entry?.gpsLongitude === "number" && Number.isFinite(entry.gpsLongitude)).length,
      importedWithObservedGpsAltitude: observedGpsAltitudes.length,
    },
    sourceFiles: {
      byteSizeTotal: importedWithKnownByteSize.reduce((sum, entry) => sum + entry.byteSize, 0),
      latestModifiedAt: importedWithKnownModifiedAt
        .map((entry) => entry.modifiedAt)
        .sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null,
      latestObservedCaptureAt: imported
        .filter((entry) => typeof entry?.observedCaptureAt === "string")
        .map((entry) => entry.observedCaptureAt)
        .sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null,
      observedFormats: observedFormatCounts,
      observedCameras: observedCameraCounts,
      observedLenses: observedLensCounts,
      focalLengthMmRange: observedFocalLengths.length
        ? { min: observedFocalLengths[0], max: observedFocalLengths[observedFocalLengths.length - 1] }
        : null,
      fNumberRange: observedFNumbers.length
        ? { min: observedFNumbers[0], max: observedFNumbers[observedFNumbers.length - 1] }
        : null,
      isoSpeedRange: observedIsoSpeeds.length
        ? { min: observedIsoSpeeds[0], max: observedIsoSpeeds[observedIsoSpeeds.length - 1] }
        : null,
      exposureTimeSecondsRange: observedExposureTimes.length
        ? { min: observedExposureTimes[0], max: observedExposureTimes[observedExposureTimes.length - 1] }
        : null,
      latestObservedExposureEntry,
      latestObservedGpsEntry,
      gpsAltitudeRange: observedGpsAltitudes.length
        ? { min: observedGpsAltitudes[0], max: observedGpsAltitudes[observedGpsAltitudes.length - 1] }
        : null,
      meteringModes: imported.reduce((summary, entry) => {
        if (!Number.isInteger(entry?.meteringMode)) return summary;
        summary[entry.meteringMode] = (summary[entry.meteringMode] ?? 0) + 1;
        return summary;
      }, {}),
      whiteBalanceModes: imported.reduce((summary, entry) => {
        if (!Number.isInteger(entry?.whiteBalanceMode)) return summary;
        summary[entry.whiteBalanceMode] = (summary[entry.whiteBalanceMode] ?? 0) + 1;
        return summary;
      }, {}),
      exposurePrograms: imported.reduce((summary, entry) => {
        if (!Number.isInteger(entry?.exposureProgram)) return summary;
        summary[entry.exposureProgram] = (summary[entry.exposureProgram] ?? 0) + 1;
        return summary;
      }, {}),
      exposureModes: imported.reduce((summary, entry) => {
        if (!Number.isInteger(entry?.exposureMode)) return summary;
        summary[entry.exposureMode] = (summary[entry.exposureMode] ?? 0) + 1;
        return summary;
      }, {}),
      flashUsage: {
        fired: imported.filter((entry) => entry?.flashFired === true).length,
        notFired: imported.filter((entry) => entry?.flashFired === false).length,
      },
      exposureBiasEvRange: observedExposureBiases.length
        ? { min: observedExposureBiases[0], max: observedExposureBiases[observedExposureBiases.length - 1] }
        : null,
      largestPixelArea: imported
        .filter((entry) => Number.isInteger(entry?.pixelWidth) && Number.isInteger(entry?.pixelHeight))
        .map((entry) => entry.pixelWidth * entry.pixelHeight)
        .sort((a, b) => b - a)[0] ?? null,
    },
  };
}
