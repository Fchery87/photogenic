import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPreviewFoundation } from "../src/preview/foundation.js";
import { createExportFoundation } from "../src/export/foundation.js";

const fixtureDir = path.join(process.cwd(), "test", "fixtures", "parity");

async function loadFixtures() {
  const source = JSON.parse(await readFile(path.join(fixtureDir, "source-001.json"), "utf8"));
  const recipe = JSON.parse(await readFile(path.join(fixtureDir, "recipe-001.json"), "utf8"));
  return { source, recipe };
}

test("preview and export artifacts share the same external behavior signature for fixed fixtures", async () => {
  const { source, recipe } = await loadFixtures();
  const preview = createPreviewFoundation({ clock: () => "2025-07-01T00:00:00.000Z" });
  const exportFoundation = createExportFoundation({ clock: () => "2025-07-01T00:00:00.000Z" });
  const request = preview.createRequest({ source, recipe, viewport: { width: 1512, height: 1006 } });
  const resolved = preview.fulfillRequest(request);
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-"));
  const outputPath = path.join(dir, "fixture-001.export.json");
  const exported = await exportFoundation.writeArtifact(outputPath, {
    source,
    recipe,
    outputName: "fixture-001.jpg",
  });
  const written = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(resolved.previewArtifact.behaviorSignature, exported.behaviorSignature);
  assert.equal(written.behaviorSignature, exported.behaviorSignature);
  assert.deepEqual(resolved.previewArtifact.operationTypes, exported.operationTypes);
  assert.equal(written.outputName, "fixture-001.jpg");
});
