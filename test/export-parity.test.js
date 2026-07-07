import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPreviewFoundation } from "../src/preview/foundation.js";
import { createPreviewWorkflow } from "../src/preview/workflow.js";
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
    options: { format: "jpeg", quality: 92, resize: { width: 2400, height: 1600 }, sharpenForOutput: true },
  });
  const written = JSON.parse(await readFile(outputPath, "utf8"));
  const proofOutputPath = path.join(dir, "fixture-001.export");
  const proofOutput = await readFile(proofOutputPath);
  assert.equal(resolved.previewArtifact.behaviorSignature, exported.behaviorSignature);
  assert.equal(written.behaviorSignature, exported.behaviorSignature);
  assert.deepEqual(resolved.previewArtifact.operationTypes, exported.operationTypes);
  assert.equal(written.outputName, "fixture-001.jpg");
  assert.equal(written.companionOutput.kind, "image/jpeg");
  assert.match(written.companionOutput.note, /real JPEG image file|software-rendered JPEG bytes/i);
  assert.ok(written.companionOutput.sizeBytes > 0);
  assert.deepEqual(written.exportOptions, {
    format: "jpeg",
    quality: 92,
    resize: { width: 2400, height: 1600 },
    embedIcc: true,
    sharpenForOutput: true,
  });
  assert.equal(written.companionOutput.path, proofOutputPath);
  assert.equal(written.companionOutput.kind, "image/jpeg");
  assert.equal(written.companionOutput.status, "rendered-image");
  assert.ok(written.companionOutput.sizeBytes > 0);
  assert.deepEqual(written.companionOutput.contentHash, {
    algorithm: "sha256",
    value: createHash("sha256").update(proofOutput).digest("hex"),
  });
  assert.equal(written.companionOutput.width, 2400);
  assert.equal(written.companionOutput.height, 1600);
  assert.match(written.companionOutput.note, /software-rendered JPEG bytes/i);
  assert.deepEqual(exported.companionOutput, written.companionOutput);
  assert.equal(proofOutput[0], 0xff);
  assert.equal(proofOutput[1], 0xd8);
});


test("preview cache png bytes and png export companion bytes stay identical when source recipe and dimensions match", async () => {
  const { source, recipe } = await loadFixtures();
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-parity-png-"));
  const previewWorkflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const queued = previewWorkflow.requestPreview({
    source,
    recipe,
    viewport: { width: 1512, height: 1006 },
  });
  const previewReady = previewWorkflow.fulfillPreview(queued);
  const previewBytes = await readFile(previewReady.previewArtifact.cacheFilePath);

  const exportFoundation = createExportFoundation({ clock: () => "2025-07-01T00:00:00.000Z" });
  const outputPath = path.join(dir, "fixture-001.png.json");
  const exported = await exportFoundation.writeArtifact(outputPath, {
    source,
    recipe,
    outputName: "fixture-001.png",
    options: { format: "png", quality: 95, resize: { width: 1512, height: 1006 } },
  });
  const exportBytes = await readFile(path.join(dir, "fixture-001.png"));
  const written = JSON.parse(await readFile(outputPath, "utf8"));

  assert.deepEqual(previewBytes, exportBytes);
  assert.deepEqual(
    { ...previewReady.previewArtifact.renderedImage, path: null },
    { ...exported.companionOutput, path: null },
  );
  assert.deepEqual(written.renderedImage, written.companionOutput);
  assert.equal(previewReady.previewArtifact.renderedImage.width, 1512);
  assert.equal(previewReady.previewArtifact.renderedImage.height, 1006);
  assert.equal(exported.companionOutput.status, "rendered-image");
  assert.equal(exported.companionOutput.kind, "image/png");
  assert.equal(previewReady.previewArtifact.behaviorSignature, exported.behaviorSignature);
});
