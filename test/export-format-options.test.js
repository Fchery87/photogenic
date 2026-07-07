import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeExportOptions } from "../src/export/format-options.js";

test("normalizeExportOptions applies export defaults", () => {
  assert.deepEqual(normalizeExportOptions(), {
    format: "jpeg",
    quality: 90,
    resize: null,
    embedIcc: true,
    sharpenForOutput: false,
  });
});

test("normalizeExportOptions accepts explicit TIFF resize options", () => {
  assert.deepEqual(
    normalizeExportOptions({
      format: "tiff",
      quality: 100,
      resize: { width: 2400, height: 1600 },
      embedIcc: true,
      sharpenForOutput: true,
    }),
    {
      format: "tiff",
      quality: 100,
      resize: { width: 2400, height: 1600 },
      embedIcc: true,
      sharpenForOutput: true,
    },
  );
});

test("normalizeExportOptions rejects unsupported formats", () => {
  assert.throws(() => normalizeExportOptions({ format: "gif" }), /format must be jpeg, png, or tiff/i);
});
