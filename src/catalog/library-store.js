import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import { readObservedSourceFileMetadata } from "./source-file-insights.js";

const STORE_VERSION = 1;
const emptyStore = () => ({ version: STORE_VERSION, images: {} });

const QUERYABLE_FIELDS = [
  "imageId",
  "sourcePath",
  "fileName",
  "observedFormat",
  "cameraMake",
  "cameraModel",
  "lensModel",
  "colorLabel",
  "gpsLatitude",
  "gpsLongitude",
  "gpsAltitudeM",
];

function normalizeQueryFields(value) {
  if (!Array.isArray(value)) return QUERYABLE_FIELDS;
  const fields = [...new Set(value.filter((field) => typeof field === "string" && QUERYABLE_FIELDS.includes(field)))];
  return fields.length ? fields : QUERYABLE_FIELDS;
}

const clone = (value) => JSON.parse(JSON.stringify(value));

function defaultClock() {
  return new Date().toISOString();
}

function normalizeRating(value) {
  if (typeof value === "undefined") return 0;
  if (!Number.isInteger(value) || value < 0 || value > 5) {
    throw new RangeError("rating must be an integer between 0 and 5");
  }
  return value;
}

function normalizeColorLabel(value) {
  if (typeof value === "undefined" || value === null || value === "") return null;
  if (typeof value !== "string") throw new TypeError("colorLabel must be a string or null");
  return value;
}

function normalizeBoolean(value, field) {
  if (typeof value === "undefined") return false;
  if (typeof value !== "boolean") throw new TypeError(`${field} must be boolean`);
  return value;
}



function normalizeNonNegativeInteger(value, field) {
  if (typeof value === "undefined" || value === null) return null;
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${field} must be a non-negative integer or null`);
  return value;
}

function normalizeByteSize(value) {
  if (typeof value === "undefined" || value === null) return null;
  if (!Number.isInteger(value) || value < 0) throw new RangeError("byteSize must be a non-negative integer or null");
  return value;
}

function normalizeObservedFormat(value) {
  if (typeof value === "undefined" || value === null || value === "") return null;
  if (typeof value !== "string") throw new TypeError("observedFormat must be a string or null");
  return value;
}

function normalizePixelDimension(value, field) {
  if (typeof value === "undefined" || value === null) return null;
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${field} must be a positive integer or null`);
  return value;
}

function normalizeOrientation(value) {
  if (typeof value === "undefined" || value === null) return null;
  if (!Number.isInteger(value) || value <= 0) throw new RangeError("orientation must be a positive integer or null");
  return value;
}

function normalizeObservedCameraField(value, field) {
  if (typeof value === "undefined" || value === null || value === "") return null;
  if (typeof value !== "string") throw new TypeError(`${field} must be a string or null`);
  return value;
}

function normalizeObservedPositiveNumber(value, field) {
  if (typeof value === "undefined" || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new RangeError(`${field} must be a positive number or null`);
  return value;
}

function normalizeObservedGpsCoordinate(value, field) {
  if (typeof value === "undefined" || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new RangeError(`${field} must be a finite number or null`);
  return value;
}

function normalizeObservedBoolean(value, field) {
  if (typeof value === "undefined" || value === null) return null;
  if (typeof value !== "boolean") throw new TypeError(`${field} must be a boolean or null`);
  return value;
}


function compareNullable(a, b, direction = "asc") {
  const factor = direction === "desc" ? -1 : 1;
  const aMissing = a === null || typeof a === "undefined";
  const bMissing = b === null || typeof b === "undefined";
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  if (typeof a === "number" && typeof b === "number") return (a - b) * factor;
  return String(a).localeCompare(String(b)) * factor;
}

function getSortValue(entry, sortBy = "sourcePath") {
  switch (sortBy) {
    case "sourcePath": return entry.sourcePath;
    case "importedAt": return entry.importedAt;
    case "updatedAt": return entry.updatedAt;
    case "captureAt": return entry.captureAt;
    case "rating": return entry.rating;
    case "byteSize": return entry.byteSize;
    case "pixelArea":
      return Number.isInteger(entry.pixelWidth) && Number.isInteger(entry.pixelHeight)
        ? entry.pixelWidth * entry.pixelHeight
        : null;
    case "isoSpeed": return entry.isoSpeed;
    case "exposureProgram": return entry.exposureProgram;
    case "focalLengthMm": return entry.focalLengthMm;
    case "gpsAltitudeM": return entry.gpsAltitudeM;
    case "meteringMode": return entry.meteringMode;
    case "whiteBalanceMode": return entry.whiteBalanceMode;
    case "exposureMode": return entry.exposureMode;
    default: return entry.sourcePath;
  }
}

function sortEntries(entries, filter = {}) {
  const sortBy = typeof filter.sortBy === "string" && filter.sortBy ? filter.sortBy : "sourcePath";
  const sortDirection = filter.sortDirection === "desc" ? "desc" : "asc";
  return [...entries].sort((a, b) => {
    const primary = compareNullable(getSortValue(a, sortBy), getSortValue(b, sortBy), sortDirection);
    if (primary !== 0) return primary;
    return String(a.sourcePath).localeCompare(String(b.sourcePath));
  });
}

function normalizeEntry(imageId, entry, clock) {
  if (typeof imageId !== "string" || !imageId) throw new TypeError("imageId is required");
  if (!entry || typeof entry !== "object") throw new TypeError("entry is required");
  if (typeof entry.sourcePath !== "string" || !entry.sourcePath) throw new TypeError("sourcePath is required");
  const importedAt = typeof entry.importedAt === "string" ? entry.importedAt : clock();
  const updatedAt = typeof entry.updatedAt === "string" ? entry.updatedAt : importedAt;
  return {
    imageId,
    sourcePath: entry.sourcePath,
    fileName: typeof entry.fileName === "string" && entry.fileName ? entry.fileName : basename(entry.sourcePath),
    captureAt: typeof entry.captureAt === "string" ? entry.captureAt : null,
    byteSize: normalizeByteSize(entry.byteSize),
    modifiedAt: typeof entry.modifiedAt === "string" ? entry.modifiedAt : null,
    observedFormat: normalizeObservedFormat(entry.observedFormat),
    pixelWidth: normalizePixelDimension(entry.pixelWidth, "pixelWidth"),
    pixelHeight: normalizePixelDimension(entry.pixelHeight, "pixelHeight"),
    orientation: normalizeOrientation(entry.orientation),
    observedCaptureAt: typeof entry.observedCaptureAt === "string" ? entry.observedCaptureAt : null,
    cameraMake: normalizeObservedCameraField(entry.cameraMake, "cameraMake"),
    cameraModel: normalizeObservedCameraField(entry.cameraModel, "cameraModel"),
    lensModel: normalizeObservedCameraField(entry.lensModel, "lensModel"),
    focalLengthMm: normalizeObservedPositiveNumber(entry.focalLengthMm, "focalLengthMm"),
    fNumber: normalizeObservedPositiveNumber(entry.fNumber, "fNumber"),
    isoSpeed: normalizeObservedPositiveNumber(entry.isoSpeed, "isoSpeed"),
    exposureTimeSeconds: normalizeObservedPositiveNumber(entry.exposureTimeSeconds, "exposureTimeSeconds"),
    exposureProgram: Number.isInteger(entry.exposureProgram) && entry.exposureProgram >= 0 ? entry.exposureProgram : entry.exposureProgram == null ? null : (() => { throw new RangeError("exposureProgram must be a non-negative integer or null"); })(),
    flashFired: normalizeObservedBoolean(entry.flashFired, "flashFired"),
    exposureBiasEv: typeof entry.exposureBiasEv === "number" && Number.isFinite(entry.exposureBiasEv) ? entry.exposureBiasEv : entry.exposureBiasEv == null ? null : (() => { throw new RangeError("exposureBiasEv must be a finite number or null"); })(),
    meteringMode: Number.isInteger(entry.meteringMode) && entry.meteringMode >= 0 ? entry.meteringMode : entry.meteringMode == null ? null : (() => { throw new RangeError("meteringMode must be a non-negative integer or null"); })(),
    whiteBalanceMode: Number.isInteger(entry.whiteBalanceMode) && entry.whiteBalanceMode >= 0 ? entry.whiteBalanceMode : entry.whiteBalanceMode == null ? null : (() => { throw new RangeError("whiteBalanceMode must be a non-negative integer or null"); })(),
    exposureMode: Number.isInteger(entry.exposureMode) && entry.exposureMode >= 0 ? entry.exposureMode : entry.exposureMode == null ? null : (() => { throw new RangeError("exposureMode must be a non-negative integer or null"); })(),
    gpsLatitude: normalizeObservedGpsCoordinate(entry.gpsLatitude, "gpsLatitude"),
    gpsLongitude: normalizeObservedGpsCoordinate(entry.gpsLongitude, "gpsLongitude"),
    gpsAltitudeM: normalizeObservedGpsCoordinate(entry.gpsAltitudeM, "gpsAltitudeM"),
    importedAt,
    updatedAt,
    rating: normalizeRating(entry.rating),
    flagged: normalizeBoolean(entry.flagged, "flagged"),
    rejected: normalizeBoolean(entry.rejected, "rejected"),
    colorLabel: normalizeColorLabel(entry.colorLabel),
  };
}

function matchesFilter(entry, filter = {}) {
  if (typeof filter.ratingAtLeast === "number" && entry.rating < filter.ratingAtLeast) return false;
  if (typeof filter.flagged === "boolean" && entry.flagged !== filter.flagged) return false;
  if (typeof filter.rejected === "boolean" && entry.rejected !== filter.rejected) return false;
  if (typeof filter.colorLabel === "string" && entry.colorLabel !== filter.colorLabel) return false;
  if (filter.keepersOnly === true && (entry.rejected || (!entry.flagged && entry.rating === 0))) return false;
  if (typeof filter.query === "string" && filter.query.trim()) {
    const terms = filter.query
      .trim()
      .toLocaleLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    const queryFields = normalizeQueryFields(filter.queryFields);
    const haystack = queryFields
      .map((field) => entry[field])
      .filter((value) => typeof value === "string" && value)
      .join(" ")
      .toLocaleLowerCase();
    const queryMode = filter.queryMode === "any" ? "any" : "all";
    const matches = queryMode === "any"
      ? terms.some((term) => haystack.includes(term))
      : terms.every((term) => haystack.includes(term));
    if (!matches) return false;
  }
  if (typeof filter.observedFormat === "string" && entry.observedFormat !== filter.observedFormat) return false;
  if (typeof filter.cameraMake === "string" && entry.cameraMake !== filter.cameraMake) return false;
  if (typeof filter.cameraModel === "string" && entry.cameraModel !== filter.cameraModel) return false;
  if (typeof filter.lensModel === "string" && entry.lensModel !== filter.lensModel) return false;
  if (typeof filter.flashFired === "boolean" && entry.flashFired !== filter.flashFired) return false;
  if (Number.isInteger(filter.exposureProgram) && entry.exposureProgram !== filter.exposureProgram) return false;
  if (Number.isInteger(filter.meteringMode) && entry.meteringMode !== filter.meteringMode) return false;
  if (Number.isInteger(filter.whiteBalanceMode) && entry.whiteBalanceMode !== filter.whiteBalanceMode) return false;
  if (Number.isInteger(filter.exposureMode) && entry.exposureMode !== filter.exposureMode) return false;
  if (typeof filter.hasGps === "boolean") {
    const hasGps = typeof entry.gpsLatitude === "number" && Number.isFinite(entry.gpsLatitude) && typeof entry.gpsLongitude === "number" && Number.isFinite(entry.gpsLongitude);
    if (hasGps !== filter.hasGps) return false;
  }
  if (typeof filter.isoSpeedAtLeast === "number" && (!(typeof entry.isoSpeed === "number") || entry.isoSpeed < filter.isoSpeedAtLeast)) return false;
  if (typeof filter.isoSpeedAtMost === "number" && (!(typeof entry.isoSpeed === "number") || entry.isoSpeed > filter.isoSpeedAtMost)) return false;
  if (typeof filter.focalLengthAtLeast === "number" && (!(typeof entry.focalLengthMm === "number") || entry.focalLengthMm < filter.focalLengthAtLeast)) return false;
  if (typeof filter.focalLengthAtMost === "number" && (!(typeof entry.focalLengthMm === "number") || entry.focalLengthMm > filter.focalLengthAtMost)) return false;
  if (typeof filter.fNumberAtLeast === "number" && (!(typeof entry.fNumber === "number") || entry.fNumber < filter.fNumberAtLeast)) return false;
  if (typeof filter.fNumberAtMost === "number" && (!(typeof entry.fNumber === "number") || entry.fNumber > filter.fNumberAtMost)) return false;
  if (typeof filter.exposureTimeAtLeast === "number" && (!(typeof entry.exposureTimeSeconds === "number") || entry.exposureTimeSeconds < filter.exposureTimeAtLeast)) return false;
  if (typeof filter.exposureTimeAtMost === "number" && (!(typeof entry.exposureTimeSeconds === "number") || entry.exposureTimeSeconds > filter.exposureTimeAtMost)) return false;
  if (typeof filter.exposureBiasAtLeast === "number" && (!(typeof entry.exposureBiasEv === "number") || entry.exposureBiasEv < filter.exposureBiasAtLeast)) return false;
  if (typeof filter.exposureBiasAtMost === "number" && (!(typeof entry.exposureBiasEv === "number") || entry.exposureBiasEv > filter.exposureBiasAtMost)) return false;
  if (typeof filter.gpsAltitudeAtLeast === "number" && (!(typeof entry.gpsAltitudeM === "number") || entry.gpsAltitudeM < filter.gpsAltitudeAtLeast)) return false;
  if (typeof filter.gpsAltitudeAtMost === "number" && (!(typeof entry.gpsAltitudeM === "number") || entry.gpsAltitudeM > filter.gpsAltitudeAtMost)) return false;
  return true;
}

export async function createLibraryStore({ path, clock = defaultClock } = {}) {
  if (typeof path !== "string" || !path) throw new TypeError("path is required");
  let mutationChain = Promise.resolve();

  async function loadStore() {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8"));
      if (parsed.version !== STORE_VERSION || !parsed.images) {
        throw new RangeError("unsupported library store version");
      }
      const images = {};
      for (const [imageId, entry] of Object.entries(parsed.images)) {
        images[imageId] = normalizeEntry(imageId, entry, clock);
      }
      return { version: STORE_VERSION, images };
    } catch (error) {
      if (error && error.code === "ENOENT") return emptyStore();
      throw error;
    }
  }

  async function saveStore(store) {
    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.tmp`;
    await writeFile(tempPath, JSON.stringify(store, null, 2) + "\n", "utf8");
    await rename(tempPath, path);
  }

  async function withMutation(work) {
    const previous = mutationChain;
    let release;
    mutationChain = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  function mergeEntry(imageId, patch, previous = null) {
    return normalizeEntry(
      imageId,
      {
        ...previous,
        ...patch,
        imageId,
        importedAt: previous?.importedAt ?? patch.importedAt ?? clock(),
        updatedAt: clock(),
      },
      clock,
    );
  }

  async function readObservedSourceMetadata(sourcePath) {
    const observed = await readObservedSourceFileMetadata(sourcePath);
    return {
      ...observed,
      observedCaptureAt: observed.capturedAt,
      cameraMake: observed.cameraMake,
      cameraModel: observed.cameraModel,
      lensModel: observed.lensModel,
      focalLengthMm: observed.focalLengthMm,
      fNumber: observed.fNumber,
      isoSpeed: observed.isoSpeed,
      exposureTimeSeconds: observed.exposureTimeSeconds,
      exposureProgram: observed.exposureProgram,
      flashFired: observed.flashFired,
      exposureBiasEv: observed.exposureBiasEv,
      meteringMode: observed.meteringMode,
      whiteBalanceMode: observed.whiteBalanceMode,
      exposureMode: observed.exposureMode,
      gpsLatitude: observed.gpsLatitude,
      gpsLongitude: observed.gpsLongitude,
      gpsAltitudeM: observed.gpsAltitudeM,
    };
  }


  return {
    async importImage(input) {
      if (!input || typeof input !== "object") throw new TypeError("image input is required");
      if (typeof input.imageId !== "string" || !input.imageId) throw new TypeError("imageId is required");
      return withMutation(async () => {
        const store = await loadStore();
        const entry = mergeEntry(input.imageId, input, store.images[input.imageId] ?? null);
        store.images[input.imageId] = entry;
        await saveStore(store);
        return clone(entry);
      });
    },

    async get(imageId) {
      const store = await loadStore();
      return store.images[imageId] ? clone(store.images[imageId]) : null;
    },

    async list(filter = {}) {
      const store = await loadStore();
      const offset = normalizeNonNegativeInteger(filter.offset, "offset") ?? 0;
      const limit = normalizeNonNegativeInteger(filter.limit, "limit");
      const entries = sortEntries(
        Object.values(store.images).filter((entry) => matchesFilter(entry, filter)),
        filter,
      );
      const pagedEntries = limit === null ? entries.slice(offset) : entries.slice(offset, offset + limit);
      return pagedEntries.map(clone);
    },

    async setRating(imageId, rating) {
      return withMutation(async () => {
        const store = await loadStore();
        const existing = store.images[imageId];
        if (!existing) throw new Error(`no library entry stored for imageId: ${imageId}`);
        const entry = mergeEntry(imageId, { rating }, existing);
        store.images[imageId] = entry;
        await saveStore(store);
        return clone(entry);
      });
    },

    async setFlag(imageId, flagged) {
      return withMutation(async () => {
        const store = await loadStore();
        const existing = store.images[imageId];
        if (!existing) throw new Error(`no library entry stored for imageId: ${imageId}`);
        const entry = mergeEntry(imageId, { flagged }, existing);
        store.images[imageId] = entry;
        await saveStore(store);
        return clone(entry);
      });
    },

    async setRejected(imageId, rejected) {
      return withMutation(async () => {
        const store = await loadStore();
        const existing = store.images[imageId];
        if (!existing) throw new Error(`no library entry stored for imageId: ${imageId}`);
        const entry = mergeEntry(imageId, { rejected }, existing);
        store.images[imageId] = entry;
        await saveStore(store);
        return clone(entry);
      });
    },

    async setColorLabel(imageId, colorLabel) {
      return withMutation(async () => {
        const store = await loadStore();
        const existing = store.images[imageId];
        if (!existing) throw new Error(`no library entry stored for imageId: ${imageId}`);
        const entry = mergeEntry(imageId, { colorLabel }, existing);
        store.images[imageId] = entry;
        await saveStore(store);
        return clone(entry);
      });
    },

    async refreshSourceMetadata(imageId) {
      return withMutation(async () => {
        const store = await loadStore();
        const existing = store.images[imageId];
        if (!existing) throw new Error(`no library entry stored for imageId: ${imageId}`);
        const observed = await readObservedSourceMetadata(existing.sourcePath);
        const entry = mergeEntry(imageId, observed, existing);
        store.images[imageId] = entry;
        await saveStore(store);
        return clone(entry);
      });
    },
  };
}
