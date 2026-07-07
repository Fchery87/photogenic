import { createHash } from "node:crypto";
import { computeBehaviorSignature } from "./render-artifact.js";

export const RENDERED_JPEG_NOTE =
  "Deterministic software-rendered JPEG bytes are present on disk. This seam now writes a real JPEG image file, but it does not prove the final RAW/GPU pipeline.";

const ZIG_ZAG = [
  0, 1, 5, 6, 14, 15, 27, 28,
  2, 4, 7, 13, 16, 26, 29, 42,
  3, 8, 12, 17, 25, 30, 41, 43,
  9, 11, 18, 24, 31, 40, 44, 53,
  10, 19, 23, 32, 39, 45, 52, 54,
  20, 22, 33, 38, 46, 51, 55, 60,
  21, 34, 37, 47, 50, 56, 59, 61,
  35, 36, 48, 49, 57, 58, 62, 63,
];

const STD_LUMINANCE_QT = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

const STD_CHROMINANCE_QT = [
  17, 18, 24, 47, 99, 99, 99, 99,
  18, 21, 26, 66, 99, 99, 99, 99,
  24, 26, 56, 99, 99, 99, 99, 99,
  47, 66, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
  99, 99, 99, 99, 99, 99, 99, 99,
];

const STD_DC_LUMINANCE_NR_CODES = [0, 0, 1, 5, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0];
const STD_DC_LUMINANCE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const STD_AC_LUMINANCE_NR_CODES = [0, 0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d];
const STD_AC_LUMINANCE_VALUES = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12,
  0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08,
  0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16,
  0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39,
  0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59,
  0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79,
  0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98,
  0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6,
  0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4,
  0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea,
  0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];
const STD_DC_CHROMINANCE_NR_CODES = [0, 0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0];
const STD_DC_CHROMINANCE_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const STD_AC_CHROMINANCE_NR_CODES = [0, 0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77];
const STD_AC_CHROMINANCE_VALUES = [
  0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21,
  0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71,
  0x13, 0x22, 0x32, 0x81, 0x08, 0x14, 0x42, 0x91,
  0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0,
  0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34,
  0xe1, 0x25, 0xf1, 0x17, 0x18, 0x19, 0x1a, 0x26,
  0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38,
  0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48,
  0x49, 0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58,
  0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68,
  0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78,
  0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87,
  0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96,
  0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5,
  0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4,
  0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3,
  0xc4, 0xc5, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2,
  0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda,
  0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9,
  0xea, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

const aasf = [1.0, 1.387039845, 1.306562965, 1.175875602, 1.0, 0.785694958, 0.5411961, 0.275899379];

function normalizeDimension(value, label) {
  if (!Number.isInteger(value) || value < 1) throw new TypeError(`${label} must be a positive integer`);
  return value;
}

function buildPixelSeed({ source, recipe, width, height }) {
  return `${computeBehaviorSignature({ source, recipe })}:${width}x${height}:jpeg`;
}

function applySharpenChannel(value, detail) {
  return Math.max(0, Math.min(255, value + detail));
}

function buildRgb8Data({ width, height, seed, operationCount, sharpen = false }) {
  const raw = Buffer.alloc(width * height * 3);
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
      raw[offset++] = applySharpenChannel((baseR + tileX * 17 + tileY * 5 + band) & 0xff, baseDetail);
      raw[offset++] = applySharpenChannel((baseG + tileX * 7 + tileY * 13 + operationCount * 19) & 0xff, Math.trunc(baseDetail / 2));
      raw[offset++] = applySharpenChannel((baseB + tileX * 3 + tileY * 11 + band) & 0xff, -Math.trunc(baseDetail / 3));
    }
  }
  return raw;
}

function scaledTables(quality = 92) {
  const normalized = Number.isInteger(quality) ? Math.max(1, Math.min(quality, 100)) : 92;
  const scale = normalized < 50 ? Math.floor(5000 / normalized) : 200 - normalized * 2;
  const YTable = new Array(64);
  const UVTable = new Array(64);
  const fdtblY = new Array(64);
  const fdtblUV = new Array(64);
  for (let i = 0; i < 64; i += 1) {
    let y = Math.floor((STD_LUMINANCE_QT[i] * scale + 50) / 100);
    let uv = Math.floor((STD_CHROMINANCE_QT[i] * scale + 50) / 100);
    y = Math.max(1, Math.min(y, 255));
    uv = Math.max(1, Math.min(uv, 255));
    YTable[ZIG_ZAG[i]] = y;
    UVTable[ZIG_ZAG[i]] = uv;
  }
  let k = 0;
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      fdtblY[k] = 1 / (YTable[ZIG_ZAG[k]] * aasf[row] * aasf[col] * 8);
      fdtblUV[k] = 1 / (UVTable[ZIG_ZAG[k]] * aasf[row] * aasf[col] * 8);
      k += 1;
    }
  }
  return { YTable, UVTable, fdtblY, fdtblUV };
}

function computeHuffmanTable(nrCodes, values) {
  let codeValue = 0;
  let posInTable = 0;
  const table = [];
  for (let k = 1; k <= 16; k += 1) {
    for (let j = 1; j <= nrCodes[k]; j += 1) {
      table[values[posInTable]] = [codeValue, k];
      posInTable += 1;
      codeValue += 1;
    }
    codeValue *= 2;
  }
  return table;
}

const YDC_HT = computeHuffmanTable(STD_DC_LUMINANCE_NR_CODES, STD_DC_LUMINANCE_VALUES);
const UVDC_HT = computeHuffmanTable(STD_DC_CHROMINANCE_NR_CODES, STD_DC_CHROMINANCE_VALUES);
const YAC_HT = computeHuffmanTable(STD_AC_LUMINANCE_NR_CODES, STD_AC_LUMINANCE_VALUES);
const UVAC_HT = computeHuffmanTable(STD_AC_CHROMINANCE_NR_CODES, STD_AC_CHROMINANCE_VALUES);

const bitcode = new Array(65535);
const category = new Array(65535);
for (let cat = 1, lower = 1, upper = 2; cat <= 15; cat += 1, lower <<= 1, upper <<= 1) {
  for (let nr = lower; nr < upper; nr += 1) {
    category[32767 + nr] = cat;
    bitcode[32767 + nr] = [nr, cat];
  }
  for (let nrneg = -(upper - 1); nrneg <= -lower; nrneg += 1) {
    category[32767 + nrneg] = cat;
    bitcode[32767 + nrneg] = [upper - 1 + nrneg, cat];
  }
}

function fDCTQuant(data, fdtbl) {
  const tmp = new Array(64);
  for (let row = 0; row < 8; row += 1) {
    const rowOff = row * 8;
    const d0 = data[rowOff];
    const d1 = data[rowOff + 1];
    const d2 = data[rowOff + 2];
    const d3 = data[rowOff + 3];
    const d4 = data[rowOff + 4];
    const d5 = data[rowOff + 5];
    const d6 = data[rowOff + 6];
    const d7 = data[rowOff + 7];

    const tmp0 = d0 + d7;
    const tmp7 = d0 - d7;
    const tmp1 = d1 + d6;
    const tmp6 = d1 - d6;
    const tmp2 = d2 + d5;
    const tmp5 = d2 - d5;
    const tmp3 = d3 + d4;
    const tmp4 = d3 - d4;

    const tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    const tmp11 = tmp1 + tmp2;
    const tmp12 = tmp1 - tmp2;

    tmp[rowOff] = tmp10 + tmp11;
    tmp[rowOff + 4] = tmp10 - tmp11;

    const z1 = (tmp12 + tmp13) * 0.707106781;
    tmp[rowOff + 2] = tmp13 + z1;
    tmp[rowOff + 6] = tmp13 - z1;

    const tmp10o = tmp4 + tmp5;
    const tmp11o = tmp5 + tmp6;
    const tmp12o = tmp6 + tmp7;

    const z5 = (tmp10o - tmp12o) * 0.382683433;
    const z2 = 0.5411961 * tmp10o + z5;
    const z4 = 1.306562965 * tmp12o + z5;
    const z3 = tmp11o * 0.707106781;

    const z11 = tmp7 + z3;
    const z13 = tmp7 - z3;

    tmp[rowOff + 5] = z13 + z2;
    tmp[rowOff + 3] = z13 - z2;
    tmp[rowOff + 1] = z11 + z4;
    tmp[rowOff + 7] = z11 - z4;
  }

  for (let col = 0; col < 8; col += 1) {
    const d0 = tmp[col];
    const d1 = tmp[8 + col];
    const d2 = tmp[16 + col];
    const d3 = tmp[24 + col];
    const d4 = tmp[32 + col];
    const d5 = tmp[40 + col];
    const d6 = tmp[48 + col];
    const d7 = tmp[56 + col];

    const tmp0 = d0 + d7;
    const tmp7 = d0 - d7;
    const tmp1 = d1 + d6;
    const tmp6 = d1 - d6;
    const tmp2 = d2 + d5;
    const tmp5 = d2 - d5;
    const tmp3 = d3 + d4;
    const tmp4 = d3 - d4;

    const tmp10 = tmp0 + tmp3;
    const tmp13 = tmp0 - tmp3;
    const tmp11 = tmp1 + tmp2;
    const tmp12 = tmp1 - tmp2;

    tmp[col] = tmp10 + tmp11;
    tmp[32 + col] = tmp10 - tmp11;

    const z1 = (tmp12 + tmp13) * 0.707106781;
    tmp[16 + col] = tmp13 + z1;
    tmp[48 + col] = tmp13 - z1;

    const tmp10o = tmp4 + tmp5;
    const tmp11o = tmp5 + tmp6;
    const tmp12o = tmp6 + tmp7;

    const z5 = (tmp10o - tmp12o) * 0.382683433;
    const z2 = 0.5411961 * tmp10o + z5;
    const z4 = 1.306562965 * tmp12o + z5;
    const z3 = tmp11o * 0.707106781;

    const z11 = tmp7 + z3;
    const z13 = tmp7 - z3;

    tmp[40 + col] = z13 + z2;
    tmp[24 + col] = z13 - z2;
    tmp[8 + col] = z11 + z4;
    tmp[56 + col] = z11 - z4;
  }

  const out = new Array(64);
  for (let i = 0; i < 64; i += 1) {
    const q = tmp[i] * fdtbl[i];
    out[i] = q > 0 ? Math.floor(q + 0.5) : Math.ceil(q - 0.5);
  }
  return out;
}

class JpegWriter {
  constructor() {
    this.bytes = [];
    this.bytenew = 0;
    this.bytepos = 7;
  }

  writeByte(value) {
    this.bytes.push(value & 0xff);
  }

  writeWord(value) {
    this.writeByte((value >> 8) & 0xff);
    this.writeByte(value & 0xff);
  }

  writeMarker(marker) {
    this.writeWord(marker);
  }

  writeBits(bs) {
    let value = bs[0];
    let posval = bs[1] - 1;
    while (posval >= 0) {
      if (value & (1 << posval)) this.bytenew |= 1 << this.bytepos;
      posval -= 1;
      this.bytepos -= 1;
      if (this.bytepos < 0) {
        this.writeByte(this.bytenew);
        if (this.bytenew === 0xff) this.writeByte(0);
        this.bytepos = 7;
        this.bytenew = 0;
      }
    }
  }

  flushBits() {
    if (this.bytepos >= 0) this.writeBits([(1 << (this.bytepos + 1)) - 1, this.bytepos + 1]);
  }
}

function processDU(cdu, fdtbl, DC, HTDC, HTAC, writer) {
  const DU_DCT = fDCTQuant(cdu, fdtbl);
  const DU = new Array(64);
  for (let j = 0; j < 64; j += 1) DU[ZIG_ZAG[j]] = DU_DCT[j];
  const diff = DU[0] - DC;
  DC = DU[0];
  if (diff === 0) {
    writer.writeBits(HTDC[0]);
  } else {
    const diffBits = bitcode[32767 + diff];
    writer.writeBits(HTDC[category[32767 + diff]]);
    writer.writeBits(diffBits);
  }

  let end0pos = 63;
  while (end0pos > 0 && DU[end0pos] === 0) end0pos -= 1;
  if (end0pos === 0) {
    writer.writeBits(HTAC[0x00]);
    return DC;
  }

  let i = 1;
  while (i <= end0pos) {
    let startpos = i;
    while (DU[i] === 0 && i <= end0pos) i += 1;
    let nrzeroes = i - startpos;
    while (nrzeroes >= 16) {
      writer.writeBits(HTAC[0xf0]);
      nrzeroes -= 16;
    }
    const acBits = bitcode[32767 + DU[i]];
    writer.writeBits(HTAC[(nrzeroes << 4) + category[32767 + DU[i]]]);
    writer.writeBits(acBits);
    i += 1;
  }
  if (end0pos !== 63) writer.writeBits(HTAC[0x00]);
  return DC;
}

function writeAPP0(writer) {
  writer.writeMarker(0xffe0);
  writer.writeWord(16);
  writer.writeByte(0x4a); writer.writeByte(0x46); writer.writeByte(0x49); writer.writeByte(0x46); writer.writeByte(0);
  writer.writeByte(1); writer.writeByte(1);
  writer.writeByte(0);
  writer.writeWord(1); writer.writeWord(1);
  writer.writeByte(0); writer.writeByte(0);
}

function writeAPP2ICC(writer) {
  const payload = Buffer.concat([
    Buffer.from("ICC_PROFILE\0", "ascii"),
    Buffer.from([1, 1]),
    Buffer.from("PHOTOGENIC_ICC_V1\n", "utf8"),
  ]);
  writer.writeMarker(0xffe2);
  writer.writeWord(payload.length + 2);
  for (const byte of payload) writer.writeByte(byte);
}

function writeDQT(writer, YTable, UVTable) {
  writer.writeMarker(0xffdb);
  writer.writeWord(132);
  writer.writeByte(0);
  for (let i = 0; i < 64; i += 1) writer.writeByte(YTable[i]);
  writer.writeByte(1);
  for (let i = 0; i < 64; i += 1) writer.writeByte(UVTable[i]);
}

function writeSOF0(writer, width, height) {
  writer.writeMarker(0xffc0);
  writer.writeWord(17);
  writer.writeByte(8);
  writer.writeWord(height);
  writer.writeWord(width);
  writer.writeByte(3);
  writer.writeByte(1); writer.writeByte(0x11); writer.writeByte(0);
  writer.writeByte(2); writer.writeByte(0x11); writer.writeByte(1);
  writer.writeByte(3); writer.writeByte(0x11); writer.writeByte(1);
}

function writeDHT(writer) {
  writer.writeMarker(0xffc4);
  writer.writeWord(0x01a2);
  writer.writeByte(0);
  for (let i = 1; i <= 16; i += 1) writer.writeByte(STD_DC_LUMINANCE_NR_CODES[i]);
  for (const v of STD_DC_LUMINANCE_VALUES) writer.writeByte(v);
  writer.writeByte(0x10);
  for (let i = 1; i <= 16; i += 1) writer.writeByte(STD_AC_LUMINANCE_NR_CODES[i]);
  for (const v of STD_AC_LUMINANCE_VALUES) writer.writeByte(v);
  writer.writeByte(1);
  for (let i = 1; i <= 16; i += 1) writer.writeByte(STD_DC_CHROMINANCE_NR_CODES[i]);
  for (const v of STD_DC_CHROMINANCE_VALUES) writer.writeByte(v);
  writer.writeByte(0x11);
  for (let i = 1; i <= 16; i += 1) writer.writeByte(STD_AC_CHROMINANCE_NR_CODES[i]);
  for (const v of STD_AC_CHROMINANCE_VALUES) writer.writeByte(v);
}

function writeSOS(writer) {
  writer.writeMarker(0xffda);
  writer.writeWord(12);
  writer.writeByte(3);
  writer.writeByte(1); writer.writeByte(0);
  writer.writeByte(2); writer.writeByte(0x11);
  writer.writeByte(3); writer.writeByte(0x11);
  writer.writeByte(0); writer.writeByte(0x3f); writer.writeByte(0);
}

function samplePixel(data, width, height, x, y) {
  const clampedX = Math.max(0, Math.min(width - 1, x));
  const clampedY = Math.max(0, Math.min(height - 1, y));
  const offset = (clampedY * width + clampedX) * 3;
  return [data[offset], data[offset + 1], data[offset + 2]];
}

function encodeJpeg({ rgb, width, height, quality, embedIcc = true }) {
  const { YTable, UVTable, fdtblY, fdtblUV } = scaledTables(quality);
  const writer = new JpegWriter();
  writer.writeMarker(0xffd8);
  writeAPP0(writer);
  if (embedIcc) writeAPP2ICC(writer);
  writeDQT(writer, YTable, UVTable);
  writeSOF0(writer, width, height);
  writeDHT(writer);
  writeSOS(writer);

  let DCY = 0;
  let DCU = 0;
  let DCV = 0;
  const YDU = new Array(64);
  const UDU = new Array(64);
  const VDU = new Array(64);

  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      let pos = 0;
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const [r, g, b] = samplePixel(rgb, width, height, bx + x, by + y);
          const yy = 0.299 * r + 0.587 * g + 0.114 * b;
          const uu = -0.16874 * r - 0.33126 * g + 0.5 * b + 128;
          const vv = 0.5 * r - 0.41869 * g - 0.08131 * b + 128;
          YDU[pos] = yy - 128;
          UDU[pos] = uu - 128;
          VDU[pos] = vv - 128;
          pos += 1;
        }
      }
      DCY = processDU(YDU, fdtblY, DCY, YDC_HT, YAC_HT, writer);
      DCU = processDU(UDU, fdtblUV, DCU, UVDC_HT, UVAC_HT, writer);
      DCV = processDU(VDU, fdtblUV, DCV, UVDC_HT, UVAC_HT, writer);
    }
  }

  writer.flushBits();
  writer.writeMarker(0xffd9);
  return Buffer.from(writer.bytes);
}

export function renderDeterministicSoftwareJpeg({ source, recipe, width, height, quality = 92, sharpen = false, embedIcc = true }) {
  const normalizedWidth = normalizeDimension(width, "width");
  const normalizedHeight = normalizeDimension(height, "height");
  const operationCount = Array.isArray(recipe?.operations) ? recipe.operations.length : 0;
  const seed = buildPixelSeed({ source, recipe, width: normalizedWidth, height: normalizedHeight });
  const rgb = buildRgb8Data({ width: normalizedWidth, height: normalizedHeight, seed, operationCount, sharpen });
  const bytes = encodeJpeg({ rgb, width: normalizedWidth, height: normalizedHeight, quality, embedIcc });
  return {
    bytes,
    descriptor: {
      kind: "image/jpeg",
      status: "rendered-image",
      sizeBytes: bytes.length,
      contentHash: {
        algorithm: "sha256",
        value: createHash("sha256").update(bytes).digest("hex"),
      },
      width: normalizedWidth,
      height: normalizedHeight,
      note: RENDERED_JPEG_NOTE,
    },
  };
}

export function readRenderedJpegDescriptor(filePath, bytes) {
  const content = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (content.length < 4 || content[0] !== 0xff || content[1] !== 0xd8) {
    throw new TypeError("file does not contain a valid JPEG SOI marker");
  }
  let offset = 2;
  while (offset + 3 < content.length) {
    while (offset < content.length && content[offset] !== 0xff) offset += 1;
    if (offset + 1 >= content.length) break;
    let marker = content[offset + 1];
    while (marker === 0xff) {
      offset += 1;
      marker = content[offset + 1];
    }
    offset += 2;
    if (marker === 0xd9 || marker === 0xda) break;
    if (offset + 1 >= content.length) break;
    const segmentLength = content.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > content.length + 2) {
      throw new TypeError("file does not contain a readable JPEG segment");
    }
    if (marker === 0xc0 || marker === 0xc2) {
      if (segmentLength < 7) throw new TypeError("file does not contain readable JPEG frame dimensions");
      const height = content.readUInt16BE(offset + 3);
      const width = content.readUInt16BE(offset + 5);
      if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) {
        throw new TypeError("file does not contain readable JPEG dimensions");
      }
      return {
        path: filePath,
        kind: "image/jpeg",
        status: "rendered-image",
        sizeBytes: content.length,
        contentHash: {
          algorithm: "sha256",
          value: createHash("sha256").update(content).digest("hex"),
        },
        width,
        height,
        note: RENDERED_JPEG_NOTE,
      };
    }
    offset += segmentLength;
  }
  throw new TypeError("file does not contain a readable JPEG frame header");
}
