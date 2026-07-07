import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PIPELINE_CAPABILITIES_COMMAND,
  loadPipelineCapabilities,
} from "../src/pipeline/native-capabilities.js";

test("loads native pipeline capabilities through the Tauri command contract", async () => {
  const capabilities = await loadPipelineCapabilities({
    invoke: async (command) => {
      assert.equal(command, "pipeline_capabilities");
      return {
        mode: "cpuFallback",
        adapterName: null,
        fallbackReason: "no compatible GPU adapter found",
      };
    },
  });

  assert.equal(PIPELINE_CAPABILITIES_COMMAND, "pipeline_capabilities");
  assert.deepEqual(Object.keys(capabilities), [
    "mode",
    "adapterName",
    "fallbackReason",
  ]);
});

test("rejects malformed native pipeline capability payloads", async () => {
  await assert.rejects(
    () =>
      loadPipelineCapabilities({
        invoke: async () => ({ mode: "gpuReady", adapterName: "Adapter" }),
      }),
    /fallbackReason/i,
  );
});
