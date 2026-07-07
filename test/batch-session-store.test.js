import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createBatchSessionStore } from "../src/catalog/batch-session-store.js";

async function makeTempStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-batch-session-"));
  const clockValues = [
    "2025-07-05T00:00:00.000Z",
    "2025-07-05T00:00:01.000Z",
    "2025-07-05T00:00:02.000Z",
  ];
  let i = 0;
  const store = await createBatchSessionStore({
    path: path.join(dir, "batch-sessions.json"),
    clock: () => clockValues[i++] ?? clockValues.at(-1),
  });
  return { dir, store };
}

test("batch session store saves deterministic sessions with stable timestamps", async () => {
  const { store } = await makeTempStore();
  const saved = await store.saveSession("session-001", {
    sourceImageId: "img-source",
    includedTypes: ["mask", "exposure", "mask"],
    targetImageIds: ["img-003", "img-001", "img-002", "img-001"],
  });

  assert.deepEqual(saved.includedTypes, ["exposure", "mask"]);
  assert.deepEqual(saved.targetImageIds, ["img-001", "img-002", "img-003"]);
  assert.equal(saved.createdAt, "2025-07-05T00:00:00.000Z");
  assert.equal(saved.updatedAt, "2025-07-05T00:00:00.000Z");

  const loaded = await store.getSession("session-001");
  assert.deepEqual(loaded, saved);
  assert.deepEqual(await store.listSessionIds(), ["session-001"]);
});

test("saving an existing batch session preserves createdAt and refreshes updatedAt", async () => {
  const { store } = await makeTempStore();
  await store.saveSession("session-001", {
    sourceImageId: "img-source",
    includedTypes: ["exposure"],
    targetImageIds: ["img-001"],
  });

  const updated = await store.saveSession("session-001", {
    sourceImageId: "img-source",
    includedTypes: ["contrast"],
    targetImageIds: ["img-002"],
  });

  assert.equal(updated.createdAt, "2025-07-05T00:00:00.000Z");
  assert.equal(updated.updatedAt, "2025-07-05T00:00:01.000Z");
  assert.deepEqual(updated.includedTypes, ["contrast"]);
  assert.deepEqual(updated.targetImageIds, ["img-002"]);
});


test("batch session store report helpers return operation metadata", async () => {
  const { store } = await makeTempStore();
  const saved = await store.saveSessionReport("batch-report", {
    sourceImageId: "img-source",
    includedTypes: ["contrast", "mask"],
    targetImageIds: ["img-002", "img-001"],
  });

  assert.deepEqual(saved.operation, {
    kind: "save-batch-session",
    sessionId: "batch-report",
    sourceImageId: "img-source",
    includedTypes: ["contrast", "mask"],
    targetCount: 2,
  });

  const loaded = await store.getSessionReport("batch-report");
  assert.deepEqual(loaded.operation, {
    kind: "get-batch-session",
    sessionId: "batch-report",
  });

  const listed = await store.listSessionIdsReport();
  assert.deepEqual(listed.operation, {
    kind: "list-batch-session-ids",
    count: 1,
  });
  assert.deepEqual(listed.sessionIds, ["batch-report"]);
});
