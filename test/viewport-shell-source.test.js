import { test } from "node:test";
import assert from "node:assert/strict";
import { loadViewportProofResults, resolveTauriInvoke } from "../src/viewport-proof/shell-source.js";

test("returns no results when the placeholder gradient cannot be drawn", async () => {
  const results = await loadViewportProofResults({ gradientDrawn: false });
  assert.deepEqual(results, []);
});

test("falls back to explicit placeholder evidence when no Tauri invoke function exists", async () => {
  const results = await loadViewportProofResults({ gradientDrawn: true, invoke: null });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "gradient");
  assert.equal(results[0].passed, false);
  assert.match(results[0].note, /placeholder/i);
});

test("uses shell-provided measurements and merges DOM webview gates plus a sustained fps sample when invoke succeeds", async () => {
  const results = await loadViewportProofResults({
    gradientDrawn: true,
    invoke: async (command) => {
      assert.equal(command, "viewport_proof_results");
      return [
        { id: "gradient", passed: true, note: "Measured in shell." },
        {
          id: "raw_frame",
          passed: false,
          metrics: { physicalWidth: 1440, physicalHeight: 900, scaleFactor: 2, ignored: 1 },
          note: "Raw frame path not yet proven.",
        },
      ];
    },
    measureWebviewGates: async () => [
      {
        id: "zoom_pan",
        passed: true,
        note: "Measured translate+scale behavior in the shell webview DOM.",
      },
      {
        id: "overlay",
        passed: true,
        note: "Measured overlay stacking in the shell webview DOM.",
      },
    ],
    measureSustainedFps: async () => ({ fps: 61.2, durationMs: 500, frameCount: 31 }),
  });
  assert.equal(results[0].passed, true);
  assert.deepEqual(results[1], {
    id: "raw_frame",
    passed: false,
    fps: undefined,
    metrics: { physicalWidth: 1440, physicalHeight: 900, scaleFactor: 2 },
    note: "Raw frame path not yet proven.",
  });
  assert.deepEqual(results[2], {
    id: "zoom_pan",
    passed: true,
    fps: undefined,
    metrics: undefined,
    note: "Measured translate+scale behavior in the shell webview DOM.",
  });
  assert.deepEqual(results[3], {
    id: "overlay",
    passed: true,
    fps: undefined,
    metrics: undefined,
    note: "Measured overlay stacking in the shell webview DOM.",
  });
  assert.deepEqual(results[4], {
    id: "sustained_60fps",
    passed: true,
    fps: 61.2,
    metrics: { frameCount: 31, durationMs: 500 },
    note:
      "Measured 61.2 fps from requestAnimationFrame across 31 frames over 500 ms in this shell webview. This samples presentation cadence only; the separate raw-frame, zoom/pan, overlay, and color-management gates still require their own measurements.",
  });
});

test("returns readable fallback evidence when shell invocation fails", async () => {
  const results = await loadViewportProofResults({
    gradientDrawn: true,
    invoke: async () => {
      throw new Error("bridge offline");
    },
  });
  assert.equal(results[0].id, "gradient");
  assert.equal(results[1].id, "raw_frame");
  assert.match(results[1].note, /bridge offline/i);
});

test("records an explicit sustained fps failure note when the webview sample is unusable", async () => {
  const results = await loadViewportProofResults({
    gradientDrawn: true,
    invoke: async () => [{ id: "gradient", passed: false, note: "Still provisional." }],
    measureSustainedFps: async () => null,
  });

  const sustained = results.find((result) => result.id === "sustained_60fps");
  assert.ok(sustained);
  assert.equal(sustained.passed, false);
  assert.match(sustained.note, /did not produce a usable fps reading/i);
  assert.match(sustained.note, /does not substitute for the separate raw-frame, zoom\/pan, overlay, or color-management gates/i);
});

test("resolveTauriInvoke finds the core invoke bridge when present", () => {
  const invoke = () => {};
  assert.equal(resolveTauriInvoke({ __TAURI__: { core: { invoke } } }), invoke);
  assert.equal(resolveTauriInvoke({}), null);
});
