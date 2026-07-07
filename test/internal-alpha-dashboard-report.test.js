import { test } from "node:test";
import assert from "node:assert/strict";
import { createInternalAlphaDashboardReport } from "../src/internal-alpha/dashboard-report.js";

test("internal alpha dashboard report renders a readable history summary", () => {
  const report = createInternalAlphaDashboardReport({
    counts: {
      total: 3,
      ready: 1,
      provisional: 2,
      emptyImport: 0,
      withBlockingIssues: 1,
      withWarnings: 2,
      readyWithWarnings: 1,
      provisionalWithBlockingIssues: 1,
    },
    latest: {
      ready: "run-ready",
      provisional: "run-provisional",
      blocked: "run-blocked",
      warning: "run-ready",
      readyWithWarnings: "run-ready",
      provisionalWithBlockingIssues: "run-blocked",
    },
  });

  assert.equal(report.headline, "PROVISIONAL HISTORY");
  assert.match(report.narrative, /1 saved run reached ready status/i);
  assert.match(report.narrative, /1 saved run still have blocking issues/i);
  assert.ok(report.checkpoints.includes("latest ready: run-ready"));
  assert.ok(report.checkpoints.includes("latest blocked: run-blocked"));
});

test("internal alpha dashboard report handles missing history honestly", () => {
  const report = createInternalAlphaDashboardReport(null);
  assert.equal(report.headline, "NO RUN HISTORY");
  assert.equal(report.narrative, "No internal-alpha runs have been saved yet.");
  assert.deepEqual(report.checkpoints, []);
});
