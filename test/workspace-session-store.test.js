import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createWorkspaceSessionStore } from "../src/catalog/workspace-session-store.js";

async function makeTempStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-workspace-session-"));
  const clockValues = [
    "2025-07-08T00:00:00.000Z",
    "2025-07-08T00:00:01.000Z",
    "2025-07-08T00:00:02.000Z",
  ];
  let index = 0;
  const store = await createWorkspaceSessionStore({
    path: path.join(dir, "workspace-session.json"),
    clock: () => clockValues[index++] ?? clockValues.at(-1),
  });
  return { dir, store };
}

test("workspace session store saves deterministic reopen snapshots", async () => {
  const { store } = await makeTempStore();
  const saved = await store.saveSnapshot("workspace-main", {
    selectedImageId: "img-002",
    activeFilter: "keepers",
    activePresetId: "warm-base",
    activeBatchSessionId: "session-hero",
    expandedImageIds: ["img-003", "img-001", "img-003"],
  });

  assert.equal(saved.selectedImageId, "img-002");
  assert.equal(saved.activeFilter, "keepers");
  assert.deepEqual(saved.expandedImageIds, ["img-001", "img-003"]);
  assert.equal(saved.createdAt, "2025-07-08T00:00:00.000Z");
  assert.equal(saved.updatedAt, "2025-07-08T00:00:00.000Z");

  const loaded = await store.getSnapshot("workspace-main");
  assert.deepEqual(loaded, saved);
  assert.deepEqual(await store.listSnapshotIds(), ["workspace-main"]);
});

test("updating a workspace snapshot preserves createdAt and refreshes updatedAt", async () => {
  const { store } = await makeTempStore();
  await store.saveSnapshot("workspace-main", {
    selectedImageId: "img-001",
    activeFilter: "all",
    expandedImageIds: [],
  });

  const updated = await store.saveSnapshot("workspace-main", {
    selectedImageId: "img-010",
    activeFilter: "rejected",
    activePresetId: null,
    activeBatchSessionId: "session-b",
    expandedImageIds: ["img-010"],
  });

  assert.equal(updated.createdAt, "2025-07-08T00:00:00.000Z");
  assert.equal(updated.updatedAt, "2025-07-08T00:00:01.000Z");
  assert.equal(updated.selectedImageId, "img-010");
  assert.equal(updated.activeBatchSessionId, "session-b");
});


test("workspace session store report helpers return operation metadata", async () => {
  const { store } = await makeTempStore();
  const saved = await store.saveSnapshotReport("workspace-report", {
    selectedImageId: "img-020",
    activeFilter: "keepers",
    activePresetId: "preset-soft",
    activeBatchSessionId: "batch-hero",
    expandedImageIds: ["img-020", "img-021"],
  });

  assert.deepEqual(saved.operation, {
    kind: "save-workspace-session",
    snapshotId: "workspace-report",
    selectedImageId: "img-020",
    activePresetId: "preset-soft",
    activeBatchSessionId: "batch-hero",
  });

  const loaded = await store.getSnapshotReport("workspace-report");
  assert.deepEqual(loaded.operation, {
    kind: "get-workspace-session",
    snapshotId: "workspace-report",
  });

  const listed = await store.listSnapshotIdsReport();
  assert.deepEqual(listed.operation, {
    kind: "list-workspace-session-snapshot-ids",
    count: 1,
  });
  assert.deepEqual(listed.snapshotIds, ["workspace-report"]);
});
