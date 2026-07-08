import { createHash } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPreviewFoundation } from "../src/preview/foundation.js";
import { createPreviewWorkflow } from "../src/preview/workflow.js";
import { createExportFoundation } from "../src/export/foundation.js";
import { createNativePipelineAdapter } from "../src/pipeline/native-adapter.js";

const fixtureDir = path.join(process.cwd(), "test", "fixtures", "parity");
const goldenDir = path.join(process.cwd(), "test", "fixtures", "golden");

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


test("preview and export call the same native pipeline command and preserve pixel identity", async () => {
  const { source, recipe } = await loadFixtures();
  const whiteBalanceRecipe = {
    ...recipe,
    operations: [
      { type: "temperature", params: { kelvinDelta: 450 } },
      { type: "tint", params: { amount: -12 } },
      { type: "contrast", params: { amount: 18 } },
      { type: "highlights", params: { amount: -10 } },
      { type: "shadows", params: { amount: 20 } },
      { type: "whites", params: { amount: 10 } },
      { type: "blacks", params: { amount: -20 } },
      { type: "toneCurve", params: { points: [[0, 0], [0.5, 0.6], [1, 1]] } },
      { type: "hsl", params: { range: "red", hue: 30, saturation: 20, luminance: -10 } },
      { type: "sharpen", params: { amount: 20 } },
      { type: "noiseReduction", params: { amount: 20 } },
      { type: "crop", params: { x: 0.25, y: 0, w: 0.5, h: 1 } },
      { type: "rotate", params: { degrees: 90 } },
      { type: "straighten", params: { angle: -1.5 } },
      ...recipe.operations,
    ],
  };
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-parity-png-"));
  const goldenPreviewBytes = await readFile(path.join(goldenDir, "exposure-preview.png"));
  const goldenExportBytes = await readFile(path.join(goldenDir, "exposure-export.png"));
  const calls = [];
  const nativePipeline = createNativePipelineAdapter({
    invoke: async (command, request) => {
      calls.push({ command, request });
      const payload = request.mode === "preview" ? goldenPreviewBytes : goldenExportBytes;
      return {
        mode: request.mode,
        kind: "image/png",
        status: "rendered-image",
        width: request.output.width,
        height: request.output.height,
        bytesBase64: payload.toString("base64"),
        contentHash: { algorithm: "sha256", value: createHash("sha256").update(payload).digest("hex") },
        pixelHash: { algorithm: "sha256", value: "native-linear-pixels-fixture-001" },
        sourceIdentity: { imageId: request.source.imageId, path: request.source.path, revision: request.source.revision },
        recipeFingerprint: `native-recipe-fingerprint-${request.recipe.operations.map((operation) => operation.type).join("-")}`,
      };
    },
  });
  const previewWorkflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
    nativePipeline,
  });
  const queued = previewWorkflow.requestPreview({
    source,
    recipe: whiteBalanceRecipe,
    viewport: { width: 1512, height: 1006 },
  });
  const previewReady = await previewWorkflow.fulfillPreview(queued);
  const previewBytes = await readFile(previewReady.previewArtifact.cacheFilePath);

  const exportFoundation = createExportFoundation({ clock: () => "2025-07-01T00:00:00.000Z", nativePipeline });
  const outputPath = path.join(dir, "fixture-001.png.json");
  const exported = await exportFoundation.writeArtifact(outputPath, {
    source,
    recipe: whiteBalanceRecipe,
    outputName: "fixture-001.png",
    options: { format: "png", quality: 95, resize: { width: 1512, height: 1006 } },
  });
  const exportBytes = await readFile(path.join(dir, "fixture-001.png"));
  const written = JSON.parse(await readFile(outputPath, "utf8"));

  assert.deepEqual(calls.map((call) => call.command), ["render_pipeline", "render_pipeline"]);
  assert.deepEqual(calls.map((call) => call.request.mode), ["preview", "export"]);
  assert.deepEqual(calls.map((call) => call.request.recipe.operations.map((operation) => operation.type)), [
    ["temperature", "tint", "contrast", "highlights", "shadows", "whites", "blacks", "toneCurve", "hsl", "sharpen", "noiseReduction", "crop", "rotate", "straighten", ...recipe.operations.map((operation) => operation.type)],
    ["temperature", "tint", "contrast", "highlights", "shadows", "whites", "blacks", "toneCurve", "hsl", "sharpen", "noiseReduction", "crop", "rotate", "straighten", ...recipe.operations.map((operation) => operation.type)],
  ]);
  assert.deepEqual(calls.map((call) => call.request.output), [
    { width: 1512, height: 1006, format: "png" },
    { width: 1512, height: 1006, format: "png" },
  ]);
  assert.deepEqual(previewBytes, goldenPreviewBytes);
  assert.deepEqual(exportBytes, goldenExportBytes);
  assert.deepEqual(previewBytes, exportBytes);
  assert.equal(previewReady.previewArtifact.renderedImage.pixelHash.value, exported.companionOutput.pixelHash.value);
  assert.equal(previewReady.previewArtifact.renderedImage.pipelineCommand, "render_pipeline");
  assert.equal(exported.companionOutput.pipelineCommand, "render_pipeline");
  assert.deepEqual(written.sourceIdentity, {
    imageId: source.imageId,
    path: source.path,
    revision: source.revision,
  });
  assert.equal(written.recipeFingerprint, exported.recipeFingerprint);
  assert.deepEqual(written.renderedImage, written.companionOutput);
  assert.equal(previewReady.previewArtifact.renderedImage.width, 1512);
  assert.equal(previewReady.previewArtifact.renderedImage.height, 1006);
  assert.equal(exported.companionOutput.status, "rendered-image");
  assert.equal(exported.companionOutput.kind, "image/png");
});
