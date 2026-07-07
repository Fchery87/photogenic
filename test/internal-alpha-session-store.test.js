import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInternalAlphaSessionStore } from "../src/internal-alpha/session-store.js";

async function makeStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-internal-alpha-store-"));
  const times = [
    "2025-07-12T00:00:00.000Z",
    "2025-07-12T00:00:01.000Z",
    "2025-07-12T00:00:02.000Z",
  ];
  let i = 0;
  const store = await createInternalAlphaSessionStore({
    path: path.join(dir, "internal-alpha-runs.json"),
    clock: () => times[i++] ?? times.at(-1),
  });
  return { dir, store };
}

test("internal alpha session store persists integrated run reports", async () => {
  const { store } = await makeStore();
  const saved = await store.saveRun("run-001", {
    report: {
      operation: { kind: "run-internal-alpha-foundation-flow" },
      health: { status: "ready", blockingIssues: [], warnings: ["viewport-proof-still-provisional"] },
      evidence: { exportJobId: "export-1" },
    },
  });

  assert.equal(saved.createdAt, "2025-07-12T00:00:00.000Z");
  assert.equal(saved.updatedAt, "2025-07-12T00:00:00.000Z");
  assert.equal(saved.report.health.status, "ready");
  assert.equal(saved.report.evidence.exportJobId, "export-1");

  const loaded = await store.getRun("run-001");
  assert.deepEqual(loaded, saved);
  assert.deepEqual(await store.listRunIds(), ["run-001"]);
});

test("internal alpha session store report helpers return operation metadata", async () => {
  const { store } = await makeStore();
  const saved = await store.saveRunReport("run-op", {
    report: {
      health: { status: "provisional" },
    },
  });
  assert.deepEqual(saved.operation, {
    kind: "save-internal-alpha-run",
    runId: "run-op",
    status: "provisional",
  });

  const loaded = await store.getRunReport("run-op");
  assert.deepEqual(loaded.operation, {
    kind: "get-internal-alpha-run",
    runId: "run-op",
  });

  const listed = await store.listRunIdsReport();
  assert.deepEqual(listed.operation, {
    kind: "list-internal-alpha-run-ids",
    count: 1,
  });
  assert.deepEqual(listed.runIds, ["run-op"]);
});
