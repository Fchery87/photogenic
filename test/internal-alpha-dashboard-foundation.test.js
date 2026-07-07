import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeInternalAlphaRuns } from "../src/internal-alpha/dashboard-foundation.js";

test("internal alpha dashboard foundation summarizes run readiness and issue examples", () => {
  const summary = summarizeInternalAlphaRuns([
    {
      runId: "run-ready-warning",
      report: { health: { status: "ready", blockingIssues: [], warnings: ["viewport-proof-still-provisional"] } },
    },
    {
      runId: "run-provisional-blocked",
      report: { health: { status: "provisional", blockingIssues: ["local-export-blocked"], warnings: [] } },
    },
    {
      runId: "run-empty",
      report: { health: { status: "empty-import", blockingIssues: ["no-supported-imports"], warnings: [] } },
    },
  ]);

  assert.deepEqual(summary.counts, {
    total: 3,
    ready: 1,
    provisional: 1,
    emptyImport: 1,
    withBlockingIssues: 2,
    withWarnings: 1,
    readyWithWarnings: 1,
    provisionalWithBlockingIssues: 1,
  });

  assert.deepEqual(summary.latest, {
    ready: "run-ready-warning",
    provisional: "run-provisional-blocked",
    blocked: "run-provisional-blocked",
    warning: "run-ready-warning",
    readyWithWarnings: "run-ready-warning",
    provisionalWithBlockingIssues: "run-provisional-blocked",
  });
});
