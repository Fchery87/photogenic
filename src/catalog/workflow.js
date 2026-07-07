import { createRecipe } from "../edit-recipe/recipe.js";
import { importShoot } from "./import-workflow.js";
import { summarizeObservedSourceFiles, summarizeObservedSourceFilesReport } from "./source-file-insights.js";

export function summarizeLibraryFacets(entries = []) {
  const ratingCounts = entries.reduce((summary, entry) => {
    const rating = Number.isInteger(entry?.rating) ? entry.rating : 0;
    summary[rating] = (summary[rating] ?? 0) + 1;
    return summary;
  }, {});
  const colorLabelCounts = entries.reduce((summary, entry) => {
    const colorLabel = typeof entry?.colorLabel === "string" && entry.colorLabel ? entry.colorLabel : null;
    if (!colorLabel) return summary;
    summary[colorLabel] = (summary[colorLabel] ?? 0) + 1;
    return summary;
  }, {});

  return {
    total: entries.length,
    flaggedCount: entries.filter((entry) => entry?.flagged === true).length,
    rejectedCount: entries.filter((entry) => entry?.rejected === true).length,
    keeperCount: entries.filter((entry) => entry?.rejected !== true && (entry?.flagged === true || (Number.isInteger(entry?.rating) && entry.rating > 0))).length,
    unratedCount: entries.filter((entry) => !Number.isInteger(entry?.rating) || entry.rating === 0).length,
    colorLabelCounts,
    ratingCounts,
  };
}

export function summarizeObservedSourceMetadata(entries = []) {
  const observedFormatCounts = entries.reduce((summary, entry) => {
    const observedFormat = typeof entry?.observedFormat === "string" ? entry.observedFormat : null;
    if (!observedFormat) return summary;
    summary[observedFormat] = (summary[observedFormat] ?? 0) + 1;
    return summary;
  }, {});
  const observedLensCounts = entries.reduce((summary, entry) => {
    const lensModel = typeof entry?.lensModel === "string" ? entry.lensModel : null;
    if (!lensModel) return summary;
    summary[lensModel] = (summary[lensModel] ?? 0) + 1;
    return summary;
  }, {});

  const observedCameraCounts = entries.reduce((summary, entry) => {
    const cameraMake = typeof entry?.cameraMake === "string" ? entry.cameraMake : null;
    const cameraModel = typeof entry?.cameraModel === "string" ? entry.cameraModel : null;
    const label = [cameraMake, cameraModel].filter(Boolean).join(" ") || cameraModel || cameraMake;
    if (!label) return summary;
    summary[label] = (summary[label] ?? 0) + 1;
    return summary;
  }, {});
  const observedFocalLengths = entries
    .map((entry) => entry?.focalLengthMm)
    .filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const observedFNumbers = entries
    .map((entry) => entry?.fNumber)
    .filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const observedIsoSpeeds = entries
    .map((entry) => entry?.isoSpeed)
    .filter((value) => Number.isInteger(value) && value > 0)
    .sort((a, b) => a - b);
  const observedExposureTimes = entries
    .map((entry) => entry?.exposureTimeSeconds)
    .filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b);
  const observedExposureBiases = entries
    .map((entry) => entry?.exposureBiasEv)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  const latestObservedGpsEntry = [...entries]
    .filter((entry) => typeof entry?.gpsLatitude === "number" && Number.isFinite(entry.gpsLatitude) && typeof entry?.gpsLongitude === "number" && Number.isFinite(entry.gpsLongitude))
    .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
  const observedGpsAltitudes = entries
    .map((entry) => entry?.gpsAltitudeM)
    .filter((value) => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  const latestObservedGpsAltitudeEntry = [...entries]
    .filter((entry) => typeof entry?.gpsAltitudeM === "number" && Number.isFinite(entry.gpsAltitudeM))
    .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null;
  const latestObservedExposureEntry = [...entries]
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
    total: entries.length,
    withKnownByteSize: entries.filter((entry) => Number.isInteger(entry?.byteSize)).length,
    withKnownModifiedAt: entries.filter((entry) => typeof entry?.modifiedAt === "string").length,
    withKnownDimensions: entries.filter((entry) => Number.isInteger(entry?.pixelWidth) && Number.isInteger(entry?.pixelHeight)).length,
    withObservedOrientation: entries.filter((entry) => Number.isInteger(entry?.orientation)).length,
    withObservedCaptureAt: entries.filter((entry) => typeof entry?.observedCaptureAt === "string").length,
    withObservedCamera: entries.filter((entry) => typeof entry?.cameraMake === "string" || typeof entry?.cameraModel === "string").length,
    withObservedLens: entries.filter((entry) => typeof entry?.lensModel === "string").length,
    withObservedFocalLength: observedFocalLengths.length,
    withObservedFNumber: observedFNumbers.length,
    withObservedIsoSpeed: observedIsoSpeeds.length,
    withObservedExposureTime: observedExposureTimes.length,
    withObservedExposureProgram: entries.filter((entry) => Number.isInteger(entry?.exposureProgram)).length,
    withObservedFlash: entries.filter((entry) => typeof entry?.flashFired === "boolean").length,
    withObservedExposureBias: observedExposureBiases.length,
    withObservedMeteringMode: entries.filter((entry) => Number.isInteger(entry?.meteringMode)).length,
    withObservedWhiteBalanceMode: entries.filter((entry) => Number.isInteger(entry?.whiteBalanceMode)).length,
    withObservedExposureMode: entries.filter((entry) => Number.isInteger(entry?.exposureMode)).length,
    withObservedGps: entries.filter((entry) => typeof entry?.gpsLatitude === "number" && Number.isFinite(entry.gpsLatitude) && typeof entry?.gpsLongitude === "number" && Number.isFinite(entry.gpsLongitude)).length,
    withObservedGpsAltitude: observedGpsAltitudes.length,
    latestObservedCaptureAt: entries
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
    latestObservedGpsAltitudeEntry,
    gpsAltitudeRange: observedGpsAltitudes.length
      ? { min: observedGpsAltitudes[0], max: observedGpsAltitudes[observedGpsAltitudes.length - 1] }
      : null,
    flashUsage: {
      fired: entries.filter((entry) => entry?.flashFired === true).length,
      notFired: entries.filter((entry) => entry?.flashFired === false).length,
    },
    exposureBiasEvRange: observedExposureBiases.length
      ? { min: observedExposureBiases[0], max: observedExposureBiases[observedExposureBiases.length - 1] }
      : null,
    gpsUsage: {
      withGps: entries.filter((entry) => typeof entry?.gpsLatitude === "number" && Number.isFinite(entry.gpsLatitude) && typeof entry?.gpsLongitude === "number" && Number.isFinite(entry.gpsLongitude)).length,
      withoutGps: entries.filter((entry) => !(typeof entry?.gpsLatitude === "number" && Number.isFinite(entry.gpsLatitude) && typeof entry?.gpsLongitude === "number" && Number.isFinite(entry.gpsLongitude))).length,
    },
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
  };
}

export function createCatalogWorkflow({ libraryStore, recipeStore, defaultRecipeFactory = () => createRecipe() } = {}) {
  if (!libraryStore || typeof libraryStore.importImage !== "function" || typeof libraryStore.refreshSourceMetadata !== "function") {
    throw new TypeError("libraryStore with importImage() and refreshSourceMetadata() is required");
  }
  if (!recipeStore || typeof recipeStore.save !== "function") {
    throw new TypeError("recipeStore with save() is required");
  }
  if (typeof defaultRecipeFactory !== "function") {
    throw new TypeError("defaultRecipeFactory must be a function");
  }

  return {
    async importShoot(files) {
      const result = await this.importShootReport(files);
      return {
        ...result.imported,
        catalogEntries: result.catalogEntries,
      };
    },

    async importShootReport(files) {
      const imported = await importShoot({ libraryStore, files });
      const catalogEntries = [];
      for (const image of imported.imported) {
        const recipeEntry = await recipeStore.save(image.imageId, defaultRecipeFactory(image));
        catalogEntries.push({
          imageId: image.imageId,
          library: image,
          recipe: recipeEntry,
        });
      }
      return {
        operation: {
          kind: "import-shoot",
          requestedFileCount: Array.isArray(files) ? files.length : 0,
          importedImageIds: catalogEntries.map((entry) => entry.imageId),
          skippedSourcePaths: imported.skipped.map((entry) => entry.sourcePath),
        },
        imported,
        catalogEntries,
      };
    },

    async applyRating(imageId, rating) {
      return libraryStore.setRating(imageId, rating);
    },

    async applyFlag(imageId, flagged) {
      return libraryStore.setFlag(imageId, flagged);
    },

    async applyRejected(imageId, rejected) {
      return libraryStore.setRejected(imageId, rejected);
    },

    async applyColorLabel(imageId, colorLabel) {
      return libraryStore.setColorLabel(imageId, colorLabel);
    },


    async listLibrary(filter = {}) {
      const result = await this.listLibraryReport(filter);
      return result.entries;
    },



    async listLibrarySummary(filter = {}) {
      const report = await this.listLibraryReport(filter);
      return {
        operation: report.operation,
        visibleImageIds: report.visibleImageIds,
        matchedImageIds: report.matchedImageIds,
        metadataSummary: report.metadataSummary,
        facetSummary: report.facetSummary,
        matchedMetadataSummary: report.matchedMetadataSummary,
        matchedFacetSummary: report.matchedFacetSummary,
        totalMatchedCount: report.totalMatchedCount,
        pageInfo: report.pageInfo,
      };
    },
    async listLibraryReport(filter = {}) {
      if (!libraryStore || typeof libraryStore.list !== "function") {
        throw new TypeError("libraryStore with list() is required");
      }
      const normalizedFilter = { ...filter };
      const queryTerms = typeof normalizedFilter.query === "string"
        ? normalizedFilter.query.trim().split(/\s+/).filter(Boolean)
        : [];
      const queryMode = normalizedFilter.queryMode === "any" ? "any" : "all";
      const queryFields = Array.isArray(normalizedFilter.queryFields)
        ? [...new Set(normalizedFilter.queryFields.filter((field) => typeof field === "string" && field))]
        : [];
      const [entries, totalMatchedEntries] = await Promise.all([
        libraryStore.list(normalizedFilter),
        libraryStore.list({
          ...normalizedFilter,
          limit: undefined,
          offset: undefined,
        }),
      ]);
      const offset = typeof normalizedFilter.offset === "number" ? normalizedFilter.offset : 0;
      const limit = typeof normalizedFilter.limit === "number" ? normalizedFilter.limit : null;
      const sortBy = typeof normalizedFilter.sortBy === "string" && normalizedFilter.sortBy ? normalizedFilter.sortBy : "sourcePath";
      const sortDirection = normalizedFilter.sortDirection === "desc" ? "desc" : "asc";
      const totalMatchedCount = totalMatchedEntries.length;
      const hasPreviousPage = offset > 0;
      const hasNextPage = limit !== null ? (offset + entries.length) < totalMatchedCount : false;
      const previousOffset = hasPreviousPage ? Math.max(0, offset - (limit ?? offset)) : null;
      const nextOffset = hasNextPage ? offset + entries.length : null;
      const pageSize = limit ?? entries.length;
      const totalPages = limit !== null && limit > 0 ? Math.max(1, Math.ceil(totalMatchedCount / limit)) : 1;
      const currentPageIndex = limit !== null && limit > 0 ? Math.floor(offset / limit) : 0;
      return {
        operation: {
          kind: "list-library",
          filter: normalizedFilter,
          resultCount: entries.length,
          totalMatchedCount,
          offset,
          limit,
          hasPreviousPage,
          hasNextPage,
          previousOffset,
          nextOffset,
          pageSize,
          totalPages,
          currentPageIndex,
          sortBy,
          sortDirection,
          queryTerms,
          queryMode,
          queryFields,
          visibleImageIds: entries.map((entry) => entry.imageId),
          matchedImageIds: totalMatchedEntries.map((entry) => entry.imageId),
        },
        entries,
        visibleImageIds: entries.map((entry) => entry.imageId),
        matchedImageIds: totalMatchedEntries.map((entry) => entry.imageId),
        metadataSummary: summarizeObservedSourceMetadata(entries),
        facetSummary: summarizeLibraryFacets(entries),
        matchedMetadataSummary: summarizeObservedSourceMetadata(totalMatchedEntries),
        matchedFacetSummary: summarizeLibraryFacets(totalMatchedEntries),
        totalMatchedCount,
        pageInfo: {
          offset,
          limit,
          resultCount: entries.length,
          totalMatchedCount,
          hasPreviousPage,
          hasNextPage,
          previousOffset,
          nextOffset,
          pageSize,
          totalPages,
          currentPageIndex,
          sortBy,
          sortDirection,
          queryTerms,
          queryMode,
          queryFields,
          visibleImageIds: entries.map((entry) => entry.imageId),
          matchedImageIds: totalMatchedEntries.map((entry) => entry.imageId),
        },
      };
    },

    async refreshSourceMetadata(imageId) {
      return libraryStore.refreshSourceMetadata(imageId);
    },

    async inspectSourcePaths(sourcePaths) {
      const result = await this.inspectSourcePathsReport(sourcePaths);
      return {
        entries: result.entries,
        counts: result.counts,
        latestObservedCaptureAt: result.latestObservedCaptureAt,
        latestObservedCaptureEntry: result.latestObservedCaptureEntry,
        observedFormats: result.observedFormats,
        observedCameras: result.observedCameras,
        observedLenses: result.observedLenses,
        latestObservedFormatEntry: result.latestObservedFormatEntry,
        latestObservedCameraEntry: result.latestObservedCameraEntry,
        latestObservedLensEntry: result.latestObservedLensEntry,
        latestObservedFocalLengthEntry: result.latestObservedFocalLengthEntry,
        latestObservedExposureEntry: result.latestObservedExposureEntry,
        focalLengthMmRange: result.focalLengthMmRange,
        fNumberRange: result.fNumberRange,
        isoSpeedRange: result.isoSpeedRange,
        exposureTimeSecondsRange: result.exposureTimeSecondsRange,
        flashUsage: result.flashUsage,
        exposureBiasEvRange: result.exposureBiasEvRange,
        largestPixelArea: result.largestPixelArea,
      };
    },

    async inspectSourcePathsReport(sourcePaths) {
      return summarizeObservedSourceFilesReport(sourcePaths);
    },

    async refreshSourceMetadataReport(imageId) {
      const refreshed = await libraryStore.refreshSourceMetadata(imageId);
      return {
        operation: {
          kind: "refresh-source-metadata",
          imageId,
          observedFormat: refreshed?.observedFormat ?? null,
          observedCaptureAt: refreshed?.observedCaptureAt ?? null,
          cameraMake: refreshed?.cameraMake ?? null,
          cameraModel: refreshed?.cameraModel ?? null,
          lensModel: refreshed?.lensModel ?? null,
          focalLengthMm: refreshed?.focalLengthMm ?? null,
          fNumber: refreshed?.fNumber ?? null,
          isoSpeed: refreshed?.isoSpeed ?? null,
          exposureTimeSeconds: refreshed?.exposureTimeSeconds ?? null,
          exposureProgram: refreshed?.exposureProgram ?? null,
          flashFired: refreshed?.flashFired ?? null,
          exposureBiasEv: refreshed?.exposureBiasEv ?? null,
          gpsLatitude: refreshed?.gpsLatitude ?? null,
          gpsLongitude: refreshed?.gpsLongitude ?? null,
          gpsAltitudeM: refreshed?.gpsAltitudeM ?? null,
          meteringMode: refreshed?.meteringMode ?? null,
          whiteBalanceMode: refreshed?.whiteBalanceMode ?? null,
          exposureMode: refreshed?.exposureMode ?? null,
        },
        refreshed,
      };
    },

    async refreshAllSourceMetadataReport({ imageIds = null } = {}) {
      if (typeof libraryStore.list !== "function") {
        throw new TypeError("libraryStore with list() is required for refreshAllSourceMetadataReport()");
      }
      const requestedImageIds = Array.isArray(imageIds)
        ? [...new Set(imageIds.filter((imageId) => typeof imageId === "string" && imageId))]
        : (await libraryStore.list()).map((entry) => entry.imageId);
      const refreshedEntries = [];
      const skippedImageIds = [];
      for (const imageId of requestedImageIds) {
        try {
          refreshedEntries.push(await libraryStore.refreshSourceMetadata(imageId));
        } catch (error) {
          if (/no library entry stored for imageId:/i.test(String(error?.message ?? error))) {
            skippedImageIds.push(imageId);
            continue;
          }
          throw error;
        }
      }
      return {
        operation: {
          kind: "refresh-all-source-metadata",
          requestedImageIds,
          refreshedImageIds: refreshedEntries.map((entry) => entry.imageId),
          skippedImageIds,
        },
        refreshedEntries,
        summary: summarizeObservedSourceMetadata(refreshedEntries),
      };
    },
  };
}
