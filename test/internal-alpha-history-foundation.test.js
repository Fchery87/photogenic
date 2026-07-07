import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeInternalAlphaHistoryRuns } from "../src/internal-alpha/history-foundation.js";

test("internal alpha history foundation summarizes run ids and status counts", () => {
  const summary = summarizeInternalAlphaHistoryRuns([
    { runId: "run-c", report: { health: { status: "ready" } } },
    { runId: "run-b", report: { health: { status: "provisional" } } },
    { runId: "run-a", report: { health: { status: "ready" } } },
  ]);

  assert.deepEqual(summary, {
    total: 3,
    runIds: ["run-c", "run-b", "run-a"],
    latestRunId: "run-c",
    oldestRunId: "run-a",
    statuses: {
      ready: 2,
      provisional: 1,
    },
  });
});
