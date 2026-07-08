import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createViewportProofSessionStore } from "../src/viewport-proof/session-store.js";

async function makeTempStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-viewport-session-"));
  const clockValues = [
    "2025-07-10T00:00:00.000Z",
    "2025-07-10T00:00:01.000Z",
    "2025-07-10T00:00:02.000Z",
  ];
  let index = 0;
  const store = await createViewportProofSessionStore({
    path: path.join(dir, "viewport-proof-sessions.json"),
    clock: () => clockValues[index++] ?? clockValues.at(-1),
  });
  return { store };
}

function nativeRawFrameResult() {
  return {
    id: "raw_frame",
    passed: true,
    metrics: {
      physicalWidth: 1440,
      physicalHeight: 900,
      scaleFactor: 2,
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

test("viewport proof session store persists ordered gate results with computed verdicts", async () => {
  const { store } = await makeTempStore();
  const saved = await store.saveSession("tauri-dev", {
    shell: "tauri-dev",
    results: [
      { id: "gradient", passed: true, note: "Measured in shell." },
      {
        id: "raw_frame",
        passed: false,
        metrics: { physicalWidth: 1440, physicalHeight: 900, scaleFactor: 2 },
        note: "Raw frame path still provisional.",
      },
    ],
  });

  assert.equal(saved.shell, "tauri-dev");
  assert.deepEqual(saved.results.map((entry) => entry.id), ["gradient", "raw_frame"]);
  assert.deepEqual(saved.results[1].metrics, { physicalWidth: 1440, physicalHeight: 900, scaleFactor: 2 });
  assert.equal(saved.verdict.shellDecisionUnlocked, false);
  assert.equal(saved.createdAt, "2025-07-10T00:00:00.000Z");
  assert.equal(saved.updatedAt, "2025-07-10T00:00:00.000Z");

  const loaded = await store.getSession("tauri-dev");
  assert.deepEqual(loaded, saved);
  assert.deepEqual(await store.listSessionIds(), ["tauri-dev"]);
});

test("updating a viewport proof session preserves createdAt and refreshes verdict state", async () => {
  const { store } = await makeTempStore();
  await store.saveSession("tauri-dev", {
    shell: "tauri-dev",
    results: [{ id: "gradient", passed: false, note: "Placeholder only." }],
  });

  const updated = await store.saveSession("tauri-dev", {
    shell: "tauri-dev",
    results: [
      { id: "gradient", passed: true, note: "Measured in shell." },
      nativeRawFrameResult(),
      { id: "zoom_pan", passed: true, note: "Zoom/pan proven." },
      { id: "overlay", passed: true, note: "Overlay proven." },
      { id: "color_managed", passed: true, note: "Color management proven." },
      {
        id: "sustained_60fps",
        passed: true,
        fps: 61,
        metrics: { frameCount: 31, durationMs: 510 },
        note: "Sustained frame rate proven.",
      },
    ],
  });

  assert.equal(updated.createdAt, "2025-07-10T00:00:00.000Z");
  assert.equal(updated.updatedAt, "2025-07-10T00:00:01.000Z");
  assert.equal(updated.verdict.shellDecisionUnlocked, true);
  assert.deepEqual(updated.results.at(-1)?.metrics, { frameCount: 31, durationMs: 510 });
  assert.deepEqual(updated.verdict.remainingGates, []);
});


test("viewport proof session store report helpers return operation metadata", async () => {
  const { store } = await makeTempStore();
  const saved = await store.saveSessionReport("tauri-op", {
    shell: "tauri-dev",
    results: [
      { id: "gradient", passed: true, note: "Measured in shell." },
      { id: "raw_frame", passed: false, note: "Raw frame still provisional." },
    ],
  });

  assert.deepEqual(saved.operation, {
    kind: "save-viewport-proof-session",
    sessionId: "tauri-op",
    shell: "tauri-dev",
    unlocked: false,
  });

  const loaded = await store.getSessionReport("tauri-op");
  assert.deepEqual(loaded.operation, {
    kind: "get-viewport-proof-session",
    sessionId: "tauri-op",
  });

  const listed = await store.listSessionIdsReport();
  assert.deepEqual(listed.operation, {
    kind: "list-viewport-proof-session-ids",
    count: 1,
  });
  assert.deepEqual(listed.sessionIds, ["tauri-op"]);
});
