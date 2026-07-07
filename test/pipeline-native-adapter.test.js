import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NATIVE_RENDER_COMMAND,
  NativePipelineUnavailableError,
  createNativePipelineAdapter,
} from "../src/pipeline/native-adapter.js";

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
