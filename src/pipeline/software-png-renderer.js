import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { computeBehaviorSignature } from "./render-artifact.js";


const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const RENDERED_PNG_NOTE =
  "Deterministic software-rendered PNG bytes are present on disk. This seam now writes a real image file, but it does not prove the final RAW/GPU pipeline.";

const crcTable = new Uint32Array(256);
for (let index = 0; index < 256; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  crcTable[index] = value >>> 0;
}

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function createChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function normalizeDimension(value, label) {
  if (!Number.isInteger(value) || value < 1) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return value;
}

function buildPixelSeed({ source, recipe, width, height }) {
  return computeBehaviorSignature({ source, recipe }) + `:${width}x${height}`;
}

function applySharpenChannel(value, detail) {
  return Math.max(0, Math.min(255, value + detail));
}

function buildRawImageData({ width, height, seed, operationCount, sharpen = false }) {
  const bytesPerPixel = 3;
  const stride = width * bytesPerPixel + 1;
  const raw = Buffer.alloc(stride * height);
  const baseR = seed.charCodeAt(0);
  const baseG = seed.charCodeAt(1 % seed.length);
  const baseB = seed.charCodeAt(2 % seed.length);

  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * stride;
    const tileY = y >> 5;
    raw[rowOffset] = 0;
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = rowOffset + 1 + x * bytesPerPixel;
      const tileX = x >> 5;
      const band = ((tileX + tileY + operationCount) & 1) * 24;
      const baseDetail = sharpen ? (((x & 1) === 0 ? 1 : -1) * 10 + ((y & 1) === 0 ? 1 : -1) * 6 + (((tileX + tileY) & 1) === 0 ? 8 : -8)) : 0;
      const red = (baseR + tileX * 17 + tileY * 5 + band) & 0xff;
      const green = (baseG + tileX * 7 + tileY * 13 + operationCount * 19) & 0xff;
      const blue = (baseB + tileX * 3 + tileY * 11 + band) & 0xff;
      raw[pixelOffset] = applySharpenChannel(red, baseDetail);
      raw[pixelOffset + 1] = applySharpenChannel(green, Math.trunc(baseDetail / 2));
      raw[pixelOffset + 2] = applySharpenChannel(blue, -Math.trunc(baseDetail / 3));
    }
  }

  return raw;
}

function createIccProfileChunk() {
  const profileName = Buffer.from("PhotogenicICC", "latin1");
  const compressed = deflateSync(Buffer.from("PHOTOGENIC_ICC_V1\n", "utf8"), { level: 9 });
  return createChunk("iCCP", Buffer.concat([profileName, Buffer.from([0, 0]), compressed]));
}

export function renderDeterministicSoftwarePng({ source, recipe, width, height, sharpen = false, embedIcc = true }) {
  const normalizedWidth = normalizeDimension(width, "width");
  const normalizedHeight = normalizeDimension(height, "height");
  const operationCount = Array.isArray(recipe?.operations) ? recipe.operations.length : 0;
  const seed = buildPixelSeed({ source, recipe, width: normalizedWidth, height: normalizedHeight });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(normalizedWidth, 0);
  ihdr.writeUInt32BE(normalizedHeight, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = buildRawImageData({ width: normalizedWidth, height: normalizedHeight, seed, operationCount, sharpen });
  const chunks = [
    PNG_SIGNATURE,
    createChunk("IHDR", ihdr),
  ];
  if (embedIcc) chunks.push(createIccProfileChunk());
  chunks.push(createChunk("IDAT", deflateSync(raw, { level: 9 })));
  chunks.push(createChunk("IEND"));
  const pngBytes = Buffer.concat(chunks);

  return {
    bytes: pngBytes,
    descriptor: {
      kind: "image/png",
      status: "rendered-image",
      sizeBytes: pngBytes.length,
      contentHash: {
        algorithm: "sha256",
        value: createHash("sha256").update(pngBytes).digest("hex"),
      },
      width: normalizedWidth,
      height: normalizedHeight,
      note: RENDERED_PNG_NOTE,
    },
  };
}

export function readRenderedPngDescriptor(filePath, bytes) {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (content.length < 33 || !content.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    throw new TypeError("file does not contain a valid PNG signature");
  }
  if (content.subarray(12, 16).toString("ascii") !== "IHDR") {
    throw new TypeError("file does not contain a valid PNG IHDR chunk");
  }
  return {
    path: filePath,
    kind: "image/png",
    status: "rendered-image",
    sizeBytes: content.length,
    contentHash: {
      algorithm: "sha256",
      value: createHash("sha256").update(content).digest("hex"),
    },
    width: content.readUInt32BE(16),
    height: content.readUInt32BE(20),
    note: RENDERED_PNG_NOTE,
  };
}
