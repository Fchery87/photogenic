import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createViewportProofSessionStore } from "../src/viewport-proof/session-store.js";
import { createViewportProofWorkflow } from "../src/viewport-proof/workflow.js";

async function makeWorkflow() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-viewport-workflow-"));
  let tick = 0;
  const sessionStore = await createViewportProofSessionStore({
    path: path.join(dir, "viewport-sessions.json"),
    clock: () => `2025-07-11T00:00:0${Math.min(tick++, 9)}.000Z`,
  });
  return createViewportProofWorkflow({ sessionStore });
}

function nativeRawFrameResult() {
  return {
    id: "raw_frame",
    passed: true,
    metrics: {
      sourceFileId: "viewport-proof-native-frame",
      recipeFingerprint: "f".repeat(64),
      frameWidth: 2,
      frameHeight: 2,
      transferMethod: "cpu-linear-float32",
      frameHash: "a".repeat(64),
      renderDurationMs: 4,
    },
    note: "Raw frame proven.",
  };
}

test("viewport workflow saves placeholder browser evidence and returns a readable provisional report", async () => {
  const workflow = await makeWorkflow();
  const result = await workflow.collectAndSave({
    sessionId: "browser-fallback",
    shell: "browser",
    gradientDrawn: true,
    invoke: null,
  });

  assert.equal(result.session.shell, "browser");
  assert.equal(result.session.results.length, 1);
  assert.equal(result.report.headline, "PROVISIONAL");
  assert.match(result.report.evidenceSummary, /recorded 1 gate result/i);
  assert.equal(result.report.gates[0].id, "gradient");
});

test("viewport workflow saves successful shell measurements and reloads an unlocked report", async () => {
  const workflow = await makeWorkflow();
  const saved = await workflow.collectAndSave({
    sessionId: "tauri-dev",
    shell: "tauri-dev",
    gradientDrawn: true,
    invoke: async () => [
      { id: "gradient", passed: true, note: "Measured in shell." },
      nativeRawFrameResult(),
      { id: "zoom_pan", passed: true, note: "Zoom/pan proven." },
      { id: "overlay", passed: true, note: "Overlay proven." },
      { id: "color_managed", passed: true, note: "Color management proven." },
      { id: "sustained_60fps", passed: true, fps: 63, note: "Sustained frame rate proven." },
    ],
  });

  assert.equal(saved.session.verdict.shellDecisionUnlocked, true);
  assert.equal(saved.report.headline, "UNLOCKED");

  const loaded = await workflow.loadReport("tauri-dev");
  assert.equal(loaded.session.shell, "tauri-dev");
  assert.equal(loaded.report.verdict.shellDecisionUnlocked, true);
  assert.deepEqual(loaded.report.verdict.remainingGates, []);
});


test("viewport workflow forwards webview + sustained-fps measurements so all gates can be captured", async () => {
  const workflow = await makeWorkflow();
  const saved = await workflow.collectAndSave({
    sessionId: "tauri-wired",
    shell: "tauri-dev",
    gradientDrawn: true,
    invoke: async () => [
      { id: "gradient", passed: true, note: "Measured in shell." },
      nativeRawFrameResult(),
    ],
    measureWebviewGates: async () => [
      { id: "zoom_pan", passed: true, note: "Zoom/pan proven." },
      { id: "overlay", passed: true, note: "Overlay proven." },
      { id: "color_managed", passed: true, note: "Color management proven." },
    ],
    measureSustainedFps: async () => ({ fps: 63, frameCount: 189, durationMs: 3000 }),
  });

  assert.equal(saved.session.verdict.shellDecisionUnlocked, true);
  assert.equal(saved.report.headline, "UNLOCKED");
  assert.deepEqual(saved.report.verdict.remainingGates, []);
  assert.equal(
    saved.session.results.some((result) => result.id === "sustained_60fps"),
    true,
  );
  assert.equal(
    saved.session.results.some((result) => result.id === "color_managed"),
    true,
  );
});

test("viewport workflow report helpers return operation metadata", async () => {
  const workflow = await makeWorkflow();
  const saved = await workflow.collectAndSaveReport({
    sessionId: "tauri-op",
    shell: "tauri-dev",
    gradientDrawn: true,
    invoke: async () => [
      { id: "gradient", passed: true, note: "Measured in shell." },
      nativeRawFrameResult(),
    ],
  });

  assert.deepEqual(saved.operation, {
    kind: "collect-and-save-viewport-proof",
    sessionId: "tauri-op",
    shell: "tauri-dev",
    collectedGateIds: ["gradient", "raw_frame"],
  });

  const loaded = await workflow.loadReportWithOperation("tauri-op");
  assert.deepEqual(loaded.operation, {
    kind: "load-viewport-proof-report",
    sessionId: "tauri-op",
    shell: "tauri-dev",
  });
  assert.equal(loaded.report.headline, "PROVISIONAL");
});
