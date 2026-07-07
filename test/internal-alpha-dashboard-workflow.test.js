import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createInternalAlphaSessionStore } from "../src/internal-alpha/session-store.js";
import { createInternalAlphaDashboardWorkflow } from "../src/internal-alpha/dashboard-workflow.js";

async function makeWorkflow() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-internal-alpha-dashboard-"));
  const store = await createInternalAlphaSessionStore({ path: path.join(dir, "internal-alpha.json") });
  const workflow = createInternalAlphaDashboardWorkflow({ sessionStore: store });
  return { store, workflow };
}

test("internal alpha dashboard workflow summarizes persisted run health", async () => {
  const { store, workflow } = await makeWorkflow();
  await store.saveRun("run-ready", {
    report: { health: { status: "ready", blockingIssues: [], warnings: ["viewport-proof-still-provisional"] } },
  });
  await store.saveRun("run-blocked", {
    report: { health: { status: "provisional", blockingIssues: ["local-export-blocked"], warnings: [] } },
  });

  const summary = await workflow.summarizeRuns();
  assert.deepEqual(summary.counts, {
    total: 2,
    ready: 1,
    provisional: 1,
    emptyImport: 0,
    withBlockingIssues: 1,
    withWarnings: 1,
    readyWithWarnings: 1,
    provisionalWithBlockingIssues: 1,
  });
  assert.equal(summary.latest.ready, "run-ready");
  assert.equal(summary.latest.provisional, "run-blocked");
  assert.equal(summary.latest.blocked, "run-blocked");
  assert.equal(summary.latest.warning, "run-ready");
  assert.equal(summary.latest.readyWithWarnings, "run-ready");
  assert.equal(summary.latest.provisionalWithBlockingIssues, "run-blocked");
});

test("internal alpha dashboard workflow report helper returns operation metadata and skipped ids", async () => {
  const { store, workflow } = await makeWorkflow();
  await store.saveRun("run-only", {
    report: { health: { status: "ready", blockingIssues: [], warnings: [] } },
  });

  const report = await workflow.summarizeRunsReport({ runIds: ["run-only", "run-missing"] });
  assert.deepEqual(report.operation, {
    kind: "summarize-internal-alpha-runs",
    requestedRunIds: ["run-only", "run-missing"],
    processedRunIds: ["run-only"],
    skippedRunIds: ["run-missing"],
  });
  assert.equal(report.summary.counts.total, 1);
  assert.equal(report.runs[0].runId, "run-only");
  assert.equal(report.readableReport.headline, "READY HISTORY");
  assert.match(report.readableReport.narrative, /1 saved run reached ready status/i);
});
