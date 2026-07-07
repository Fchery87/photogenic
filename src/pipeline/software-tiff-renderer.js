import { createHash } from "node:crypto";
import { computeBehaviorSignature } from "./render-artifact.js";

export const RENDERED_TIFF16_NOTE =
  "Deterministic software-rendered TIFF-16 bytes are present on disk. This seam now writes a real 16-bit image file, but it does not prove the final RAW/GPU pipeline.";

function normalizeDimension(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return value;
}

function buildPixelSeed({ source, recipe, width, height }) {
  return computeBehaviorSignature({ source, recipe }) + `:${width}x${height}:tiff16`;
}

function applySharpenChannel(value, detail) {
  return Math.max(0, Math.min(255, value + detail));
}

function buildRgb16Data({ width, height, seed, operationCount, sharpen = false }) {
  const bytesPerPixel = 6;
  const raw = Buffer.alloc(width * height * bytesPerPixel);
  const baseR = seed.charCodeAt(0);
  const baseG = seed.charCodeAt(1 % seed.length);
  const baseB = seed.charCodeAt(2 % seed.length);
  let offset = 0;

  for (let y = 0; y < height; y += 1) {
    const tileY = y >> 5;
    for (let x = 0; x < width; x += 1) {
      const tileX = x >> 5;
      const band = ((tileX + tileY + operationCount) & 1) * 24;
      const baseDetail = sharpen ? (((x & 1) === 0 ? 1 : -1) * 10 + ((y & 1) === 0 ? 1 : -1) * 6 + (((tileX + tileY) & 1) === 0 ? 8 : -8)) : 0;
      const r8 = applySharpenChannel((baseR + tileX * 17 + tileY * 5 + band) & 0xff, baseDetail);
      const g8 = applySharpenChannel((baseG + tileX * 7 + tileY * 13 + operationCount * 19) & 0xff, Math.trunc(baseDetail / 2));
      const b8 = applySharpenChannel((baseB + tileX * 3 + tileY * 11 + band) & 0xff, -Math.trunc(baseDetail / 3));
      raw.writeUInt16LE((r8 << 8) | r8, offset); offset += 2;
      raw.writeUInt16LE((g8 << 8) | g8, offset); offset += 2;
      raw.writeUInt16LE((b8 << 8) | b8, offset); offset += 2;
    }
  }

  return raw;
}

function writeEntry(buffer, offset, { tag, type, count, value }) {
  buffer.writeUInt16LE(tag, offset);
  buffer.writeUInt16LE(type, offset + 2);
  buffer.writeUInt32LE(count, offset + 4);
  buffer.writeUInt32LE(value, offset + 8);
}

export function renderDeterministicSoftwareTiff16({ source, recipe, width, height, sharpen = false, embedIcc = true }) {
  const normalizedWidth = normalizeDimension(width, "width");
  const normalizedHeight = normalizeDimension(height, "height");
  const operationCount = Array.isArray(recipe?.operations) ? recipe.operations.length : 0;
  const seed = buildPixelSeed({ source, recipe, width: normalizedWidth, height: normalizedHeight });
  const pixelData = buildRgb16Data({ width: normalizedWidth, height: normalizedHeight, seed, operationCount, sharpen });
  const iccData = embedIcc ? Buffer.from("PHOTOGENIC_ICC_V1\n", "utf8") : Buffer.alloc(0);

  const entryCount = embedIcc ? 11 : 10;
  const ifdOffset = 8;
  const ifdSize = 2 + entryCount * 12 + 4;
  const bitsOffset = ifdOffset + ifdSize;
  const iccOffset = bitsOffset + 6;
  const stripOffset = iccOffset + iccData.length;
  const totalSize = stripOffset + pixelData.length;
  const bytes = Buffer.alloc(totalSize);

  bytes.write("II", 0, "ascii");
  bytes.writeUInt16LE(42, 2);
  bytes.writeUInt32LE(ifdOffset, 4);
  bytes.writeUInt16LE(entryCount, ifdOffset);

  const entries = [
    { tag: 256, type: 4, count: 1, value: normalizedWidth },
    { tag: 257, type: 4, count: 1, value: normalizedHeight },
    { tag: 258, type: 3, count: 3, value: bitsOffset },
    { tag: 259, type: 3, count: 1, value: 1 },
    { tag: 262, type: 3, count: 1, value: 2 },
    { tag: 273, type: 4, count: 1, value: stripOffset },
    { tag: 277, type: 3, count: 1, value: 3 },
    { tag: 278, type: 4, count: 1, value: normalizedHeight },
    { tag: 279, type: 4, count: 1, value: pixelData.length },
    { tag: 284, type: 3, count: 1, value: 1 },
  ];
  if (embedIcc) entries.push({ tag: 34675, type: 7, count: iccData.length, value: iccOffset });
  entries.forEach((entry, index) => writeEntry(bytes, ifdOffset + 2 + index * 12, entry));
  bytes.writeUInt32LE(0, ifdOffset + 2 + entryCount * 12);
  bytes.writeUInt16LE(16, bitsOffset);
  bytes.writeUInt16LE(16, bitsOffset + 2);
  bytes.writeUInt16LE(16, bitsOffset + 4);
  if (embedIcc) iccData.copy(bytes, iccOffset);
  pixelData.copy(bytes, stripOffset);

  return {
    bytes,
    descriptor: {
      kind: "image/tiff",
      status: "rendered-image",
      sizeBytes: bytes.length,
      contentHash: {
        algorithm: "sha256",
        value: createHash("sha256").update(bytes).digest("hex"),
      },
      width: normalizedWidth,
      height: normalizedHeight,
      note: RENDERED_TIFF16_NOTE,
    },
  };
}

export function readRenderedTiffDescriptor(filePath, bytes) {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (content.length < 8) throw new TypeError("file does not contain a valid TIFF header");
  const little = content.subarray(0, 2).toString("ascii") === "II";
  if (!little) throw new TypeError("file does not contain a supported little-endian TIFF header");
  if (content.readUInt16LE(2) !== 42) throw new TypeError("file does not contain a valid TIFF magic number");
  const ifdOffset = content.readUInt32LE(4);
  if (ifdOffset <= 0 || ifdOffset + 2 > content.length) throw new TypeError("file does not contain a readable TIFF IFD");
  const entryCount = content.readUInt16LE(ifdOffset);
  let width = null;
  let height = null;
  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    if (entryOffset + 12 > content.length) break;
    const tag = content.readUInt16LE(entryOffset);
    const type = content.readUInt16LE(entryOffset + 2);
    const count = content.readUInt32LE(entryOffset + 4);
    const value = content.readUInt32LE(entryOffset + 8);
    if (tag === 256 && type === 4 && count === 1) width = value;
    if (tag === 257 && type === 4 && count === 1) height = value;
  }
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new TypeError("file does not contain readable TIFF dimensions");
  }
  return {
    path: filePath,
    kind: "image/tiff",
    status: "rendered-image",
    sizeBytes: content.length,
    contentHash: {
      algorithm: "sha256",
      value: createHash("sha256").update(content).digest("hex"),
    },
    width,
    height,
    note: RENDERED_TIFF16_NOTE,
  };
}
