import { test } from "node:test";
import assert from "node:assert/strict";

import { createTauriBridge } from "../app/tauri-bridge.js";

// ---------------------------------------------------------------------------
// Bridge: disconnected mode (no __TAURI__)
// ---------------------------------------------------------------------------

test("bridge reports unavailable when __TAURI__ is not present", () => {
  // Ensure __TAURI__ is not set (Node environment)
  const saved = globalThis.__TAURI__;
  delete globalThis.__TAURI__;

  const bridge = createTauriBridge();
  assert.equal(bridge.available, false);

  globalThis.__TAURI__ = saved;
});

test("bridge methods reject with clear error when disconnected", async () => {
  const saved = globalThis.__TAURI__;
  delete globalThis.__TAURI__;

  const bridge = createTauriBridge();

  await assert.rejects(() => bridge.listLibrary(), /not available/i);
  await assert.rejects(() => bridge.getRecipe("img-001"), /not available/i);
  await assert.rejects(() => bridge.saveRecipe("img-001", {}), /not available/i);
  await assert.rejects(() => bridge.pipelineCapabilities(), /not available/i);

  globalThis.__TAURI__ = saved;
});

// ---------------------------------------------------------------------------
// Bridge: connected mode (mock __TAURI__)
// ---------------------------------------------------------------------------

test("bridge calls invoke with correct command names when connected", async () => {
  const calls = [];
  globalThis.__TAURI__ = {
    core: {
      invoke: async (command, args) => {
        calls.push({ command, args });
        if (command === "list_library") return [{ image_id: "img-1", observed_format: "nef" }];
        if (command === "get_recipe") return { imageId: args.imageId, recipe: { version: 1, operations: [] }, revision: 1 };
        if (command === "save_recipe") return { imageId: args.imageId, revision: 2 };
        if (command === "pipeline_capabilities") return { mode: "gpu" };
        return null;
      },
    },
  };

  try {
    const bridge = createTauriBridge();
    assert.equal(bridge.available, true);

    const lib = await bridge.listLibrary();
    assert.equal(lib.length, 1);
    assert.equal(calls[0].command, "list_library");

    const recipe = await bridge.getRecipe("img-001");
    assert.equal(calls[1].command, "get_recipe");
    assert.equal(calls[1].args.imageId, "img-001");

    const saved = await bridge.saveRecipe("img-001", { version: 1, operations: [] });
    assert.equal(calls[2].command, "save_recipe");
    assert.equal(calls[2].args.imageId, "img-001");
    assert.equal(saved.revision, 2);

    const caps = await bridge.pipelineCapabilities();
    assert.equal(caps.mode, "gpu");
    assert.equal(calls[3].command, "pipeline_capabilities");
  } finally {
    delete globalThis.__TAURI__;
  }
});

test("bridge works with Tauri v1 invoke placement", async () => {
  globalThis.__TAURI__ = {
    invoke: async (command) => {
      assert.equal(command, "list_library");
      return [];
    },
  };

  try {
    const bridge = createTauriBridge();
    assert.equal(bridge.available, true);
    const result = await bridge.listLibrary();
    assert.deepEqual(result, []);
  } finally {
    delete globalThis.__TAURI__;
  }
});

test("bridge calls preset and workspace commands with correct args", async () => {
  const calls = [];
  globalThis.__TAURI__ = {
    core: {
      invoke: async (command, args) => {
        calls.push({ command, args });
        if (command === "list_presets") return [{ preset_id: "p1", name: "Test" }];
        if (command === "save_preset") return { preset_id: args.presetId, name: args.name };
        if (command === "get_workspace_state") return { workspace_id: "default", state_json: "{\"selectedImageId\":\"img-1\"}" };
        if (command === "save_workspace_state") return { workspace_id: args.workspaceId };
        return null;
      },
    },
  };

  try {
    const bridge = createTauriBridge();

    const presets = await bridge.listPresets();
    assert.equal(calls.at(-1).command, "list_presets");
    assert.equal(presets.length, 1);

    const saved = await bridge.savePreset("warm", "Warm", { version: 1, operations: [] });
    assert.equal(calls.at(-1).command, "save_preset");
    assert.equal(calls.at(-1).args.presetId, "warm");
    assert.equal(saved.name, "Warm");

    const ws = await bridge.getWorkspaceState("default");
    assert.equal(calls.at(-1).command, "get_workspace_state");
    assert.ok(ws.state_json);

    await bridge.saveWorkspaceState("default", { selectedImageId: "img-2" });
    assert.equal(calls.at(-1).command, "save_workspace_state");
    assert.equal(calls.at(-1).args.workspaceId, "default");
  } finally {
    delete globalThis.__TAURI__;
  }
});

// ---------------------------------------------------------------------------
// Recipe <-> controls mapping (exported from main.js)
// ---------------------------------------------------------------------------

test("recipeFromControls builds operations from non-zero slider values", async () => {
  const { recipeFromControls } = await import("../app/main.js");

  const recipe = recipeFromControls((id) => {
    if (id === "exposure") return 0.5;
    if (id === "temperature") return 200;
    return 0; // all others at default
  }, () => 0);

  assert.equal(recipe.version, 1);
  assert.equal(recipe.operations.length, 2);
  assert.equal(recipe.operations[0].type, "exposure");
  assert.equal(recipe.operations[0].params.ev, 0.5);
  assert.equal(recipe.operations[1].type, "temperature");
  assert.equal(recipe.operations[1].params.kelvinDelta, 200);
});

test("recipeFromControls returns empty operations when all sliders are zero", async () => {
  const { recipeFromControls } = await import("../app/main.js");

  const recipe = recipeFromControls(() => 0, () => 0);
  assert.equal(recipe.operations.length, 0);
});

test("recipeFromControls maps tone curve midpoint to points array", async () => {
  const { recipeFromControls } = await import("../app/main.js");

  const recipe = recipeFromControls((id) => {
    if (id === "toneCurve") return 50;
    return 0;
  }, () => 0);

  const tc = recipe.operations.find((op) => op.type === "toneCurve");
  assert.ok(tc, "toneCurve operation present");
  assert.deepEqual(tc.params.points, [[0, 0], [0.5, 0.75], [1, 1]]);
});

test("recipeFromControls maps HSL sliders to red channel operation", async () => {
  const { recipeFromControls } = await import("../app/main.js");

  const recipe = recipeFromControls((id) => {
    if (id === "hsl-hue") return 15;
    if (id === "hsl-sat") return -20;
    return 0;
  }, () => 0);

  const hsl = recipe.operations.find((op) => op.type === "hsl");
  assert.ok(hsl);
  assert.equal(hsl.params.target, "red");
  assert.equal(hsl.params.hue, 15);
  assert.equal(hsl.params.saturation, -20);
  assert.equal(hsl.params.luminance, 0);
});

test("recipeFromControls maps crop sliders and rotate select", async () => {
  const { recipeFromControls } = await import("../app/main.js");

  const recipe = recipeFromControls((id) => {
    if (id === "crop-x") return 0.1;
    if (id === "crop-w") return 0.8;
    if (id === "crop-y") return 0;
    if (id === "crop-h") return 1; // default full height
    if (id === "straighten") return 2.5;
    return 0;
  }, (id) => {
    if (id === "rotate") return "90";
    return "0";
  });

  const crop = recipe.operations.find((op) => op.type === "crop");
  assert.ok(crop);
  assert.equal(crop.params.x, 0.1);
  assert.equal(crop.params.w, 0.8);

  const rotate = recipe.operations.find((op) => op.type === "rotate");
  assert.ok(rotate);
  assert.equal(rotate.params.degrees, 90);

  const straighten = recipe.operations.find((op) => op.type === "straighten");
  assert.ok(straighten);
  assert.equal(straighten.params.angle, 2.5);
});

test("controlsFromRecipe sets slider values from recipe operations", async () => {
  const { controlsFromRecipe } = await import("../app/main.js");

  const values = {};
  const selects = {};
  controlsFromRecipe(
    { version: 1, operations: [
      { type: "exposure", params: { ev: -1.5 } },
      { type: "contrast", params: { amount: 25 } },
      { type: "toneCurve", params: { points: [[0, 0], [0.5, 0.75], [1, 1]] } },
      { type: "hsl", params: { target: "red", hue: 10, saturation: 0, luminance: -5 } },
      { type: "crop", params: { x: 0.1, y: 0, w: 0.9, h: 1 } },
      { type: "rotate", params: { degrees: 180 } },
      { type: "straighten", params: { angle: 3.5 } },
    ] },
    (id, val) => { values[id] = val; },
    (id, val) => { selects[id] = val; },
  );

  assert.equal(values.exposure, -1.5);
  assert.equal(values.contrast, 25);
  assert.equal(values.toneCurve, 50); // 0.75 midpoint → (0.75-0.5)*200 = 50
  assert.equal(values["hsl-hue"], 10);
  assert.equal(values["hsl-lum"], -5);
  assert.equal(values["crop-x"], 0.1);
  assert.equal(values["crop-w"], 0.9);
  assert.equal(selects.rotate, "180");
  assert.equal(values.straighten, 3.5);
});
