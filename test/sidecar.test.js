import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { parseSidecar, readSidecarFile, serializeSidecar, writeSidecarFile } from "../src/catalog/sidecar.js";

test("serializeSidecar/parseSidecar round-trip the documented schema", () => {
  const recipe = createRecipe({ operations: [{ type: "exposure", params: { ev: 0.5 } }], meta: { label: "hero" } });
  const text = serializeSidecar({ imageId: "img-001", recipe, exportedAt: "2025-07-01T00:00:00.000Z", catalogRevision: 7 });
  const parsed = parseSidecar(text);
  assert.equal(parsed.imageId, "img-001");
  assert.equal(parsed.catalogRevision, 7);
  assert.equal(parsed.exportedAt, "2025-07-01T00:00:00.000Z");
  assert.deepEqual(parsed.recipe.operations, recipe.operations);
});

test("writeSidecarFile/readSidecarFile preserve payload on disk", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-sidecar-"));
  const sidecarPath = path.join(dir, "img-raw-01.photogenic.json");
  await writeSidecarFile(sidecarPath, {
    imageId: "img-raw-01",
    recipe: createRecipe({ operations: [{ type: "temperature", params: { kelvinDelta: 350 } }] }),
    exportedAt: "2025-07-01T00:00:00.000Z",
    catalogRevision: 3,
  });
  const raw = await readFile(sidecarPath, "utf8");
  const parsed = await readSidecarFile(sidecarPath);
  assert.match(raw, /"sidecarVersion": 1/);
  assert.equal(parsed.imageId, "img-raw-01");
  assert.equal(parsed.catalogRevision, 3);
});
