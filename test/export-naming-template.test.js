import { test } from "node:test";
import assert from "node:assert/strict";
import { renderFileNameTemplate } from "../src/export/naming-template.js";

test("renders supported export naming template tokens", () => {
  const result = renderFileNameTemplate("{date}_{baseName}_{sequence}_{rating}", {
    baseName: "hero-image",
    sequence: 12,
    rating: 5,
    captureAt: "2025-07-05T10:00:00.000Z",
  });
  assert.equal(result, "20250705_hero-image_12_5");
});

test("leaves unknown tokens untouched while replacing supported ones", () => {
  const result = renderFileNameTemplate("{baseName}_{unknown}_{imageId}", {
    baseName: "hero-image",
    imageId: "img-001",
  });
  assert.equal(result, "hero-image_{unknown}_img-001");
});
