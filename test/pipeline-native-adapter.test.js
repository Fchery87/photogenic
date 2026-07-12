import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  NATIVE_RENDER_COMMAND,
  NativePipelineUnavailableError,
  createNativePipelineAdapter,
} from "../src/pipeline/native-adapter.js";
import { createPreviewWorkflow } from "../src/preview/workflow.js";
import { createExportFoundation } from "../src/export/foundation.js";

function buildSource() {
  return {
    imageId: "img-native-001",
    path: "/shoots/native/hero.nef",
    width: 4,
    height: 2,
    revision: "raw-v1",
    colorSpace: "scene-linear",
  };
}

test("native adapter invokes the shared render_pipeline command", async () => {
  const calls = [];
  const adapter = createNativePipelineAdapter({
    invoke: async (command, request) => {
      calls.push({ command, request });
      return {
        mode: request.mode,
        kind: "image/png",
        status: "rendered-image",
        width: request.output.width,
        height: request.output.height,
        bytesBase64: Buffer.from("native-png").toString("base64"),
        contentHash: { algorithm: "sha256", value: "hash-native-png" },
        pixelHash: { algorithm: "sha256", value: "pixels-native" },
        sourceIdentity: { imageId: request.source.imageId, path: request.source.path, revision: request.source.revision },
        recipeFingerprint: "recipe-native",
      };
    },
  });

  const rendered = await adapter.render({
    mode: "preview",
    source: buildSource(),
    recipe: { version: 1, operations: [{ type: "exposure", params: { ev: 1 } }] },
    width: 4,
    height: 2,
    format: "png",
  });

  assert.equal(NATIVE_RENDER_COMMAND, "render_pipeline");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, "render_pipeline");
  assert.equal(calls[0].request.mode, "preview");
  assert.deepEqual(calls[0].request.output, { width: 4, height: 2, format: "png" });
  assert.equal(rendered.descriptor.pipelineCommand, "render_pipeline");
  assert.equal(rendered.descriptor.pixelHash.value, "pixels-native");
  assert.deepEqual(rendered.bytes, Buffer.from("native-png"));
});

test("native adapter reports native-unavailable instead of silently using software rendering", async () => {
  const adapter = createNativePipelineAdapter();

  await assert.rejects(
    () =>
      adapter.render({
        mode: "preview",
        source: buildSource(),
        recipe: { version: 1, operations: [] },
        width: 4,
        height: 2,
        format: "png",
      }),
    (error) => error instanceof NativePipelineUnavailableError && error.code === "native-unavailable",
  );
});

test("native adapter only uses software rendering in explicit test mode", async () => {
  const adapter = createNativePipelineAdapter({ testMode: true });
  const rendered = await adapter.render({
    mode: "preview",
    source: buildSource(),
    recipe: { version: 1, operations: [] },
    width: 4,
    height: 2,
    format: "png",
  });

  assert.equal(rendered.descriptor.pipelineCommand, "render_pipeline");
  assert.equal(rendered.descriptor.pipelineFallback, "deterministic-software-test-mode");
  assert.deepEqual(rendered.bytes.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
});

test("production preview workflow reports native-unavailable when the native pipeline cannot be reached", async () => {
  const workflow = createPreviewWorkflow({ requireNativePipeline: true });
  const queued = workflow.requestPreview({
    source: { imageId: "native-required-preview", width: 4, height: 4, revision: "v1" },
    recipe: { version: 1, operations: [{ type: "exposure", params: { ev: 0.5 } }] },
    viewport: { width: 4, height: 4 },
  });

  await assert.rejects(
    () => workflow.fulfillPreview(queued),
    (error) => error instanceof NativePipelineUnavailableError && error.code === "native-unavailable",
  );
});

test("production export foundation reports native-unavailable when the native pipeline cannot be reached", async () => {
  const foundation = createExportFoundation({
    requireNativePipeline: true,
    clock: () => "2025-07-01T00:00:00.000Z",
  });
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-native-required-export-"));

  await assert.rejects(
    () => foundation.writeArtifact(path.join(dir, "out.json"), {
      source: { imageId: "native-required-export", width: 4, height: 4, revision: "v1" },
      recipe: { version: 1, operations: [{ type: "exposure", params: { ev: 0.5 } }] },
      outputName: "out.jpg",
      options: { format: "jpeg", quality: 92 },
    }),
    (error) => error instanceof NativePipelineUnavailableError && error.code === "native-unavailable",
  );
});

test("test-mode preview workflow still software-renders by default (no native-unavailable)", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-test-mode-preview-"));
  const workflow = createPreviewWorkflow({ cachePathFor: () => path.join(dir, "software-default.png") });
  const queued = workflow.requestPreview({
    source: { imageId: "software-default", width: 2, height: 2, revision: "v1" },
    recipe: { version: 1, operations: [] },
    viewport: { width: 2, height: 2 },
  });
  const ready = await workflow.fulfillPreview(queued);

  assert.equal(ready.status, "ready");
  assert.equal(ready.previewArtifact.renderedImage.status, "rendered-image");
});
