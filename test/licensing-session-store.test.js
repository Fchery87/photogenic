import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLicensingSessionStore } from "../src/licensing/session-store.js";

async function makeTempStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-licensing-session-"));
  const clockValues = [
    "2025-07-14T00:00:00.000Z",
    "2025-07-14T00:00:01.000Z",
    "2025-07-14T00:00:02.000Z",
  ];
  let index = 0;
  const store = await createLicensingSessionStore({
    path: path.join(dir, "licensing-snapshots.json"),
    clock: () => clockValues[index++] ?? clockValues.at(-1),
  });
  return { store };
}

test("licensing session store persists local-license and cloud-credit snapshots", async () => {
  const { store } = await makeTempStore();
  const saved = await store.saveSnapshot("offline-seat", {
    evaluatedAt: "2025-07-14T08:30:00.000Z",
    license: {
      status: "active",
      offlineValidUntil: "2025-07-20T00:00:00.000Z",
      validUntil: "2025-08-01T00:00:00.000Z",
    },
    credits: { balance: 6, source: "cloud-sync" },
  });

  assert.equal(saved.snapshotId, "offline-seat");
  assert.equal(saved.evaluatedAt, "2025-07-14T08:30:00.000Z");
  assert.equal(saved.license.status, "active");
  assert.deepEqual(saved.credits, { balance: 6, source: "cloud-sync" });
  assert.equal(saved.createdAt, "2025-07-14T00:00:00.000Z");
  assert.equal(saved.updatedAt, "2025-07-14T00:00:00.000Z");
  assert.deepEqual(await store.listSnapshotIds(), ["offline-seat"]);
});

test("updating a licensing snapshot preserves createdAt and normalizes missing credits", async () => {
  const { store } = await makeTempStore();
  await store.saveSnapshot("offline-seat", {
    license: {
      status: "inactive",
      validUntil: "2025-08-01T00:00:00.000Z",
    },
    credits: { balance: 3 },
  });

  const updated = await store.saveSnapshot("offline-seat", {
    evaluatedAt: "2025-07-15T09:00:00.000Z",
    license: {
      status: "active",
      offlineValidUntil: "2025-07-22T00:00:00.000Z",
      validUntil: "2025-08-01T00:00:00.000Z",
    },
    credits: {},
  });

  assert.equal(updated.createdAt, "2025-07-14T00:00:00.000Z");
  assert.equal(updated.updatedAt, "2025-07-14T00:00:01.000Z");
  assert.equal(updated.evaluatedAt, "2025-07-15T09:00:00.000Z");
  assert.deepEqual(updated.credits, { balance: 0 });
});


test("licensing session store report helpers return operation metadata", async () => {
  const { store } = await makeTempStore();
  const saved = await store.saveSnapshotReport("seat-op", {
    evaluatedAt: "2025-07-14T10:00:00.000Z",
    license: { status: "active" },
    credits: { balance: 2 },
  });

  assert.deepEqual(saved.operation, {
    kind: "save-licensing-snapshot",
    snapshotId: "seat-op",
    hasLicense: true,
    creditBalance: 2,
  });

  const loaded = await store.getSnapshotReport("seat-op");
  assert.deepEqual(loaded.operation, {
    kind: "get-licensing-snapshot",
    snapshotId: "seat-op",
  });

  const listed = await store.listSnapshotIdsReport();
  assert.deepEqual(listed.operation, {
    kind: "list-licensing-snapshot-ids",
    count: 1,
  });
  assert.deepEqual(listed.snapshotIds, ["seat-op"]);
});
