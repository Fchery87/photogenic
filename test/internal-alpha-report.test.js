import { test } from "node:test";
import assert from "node:assert/strict";
import { createInternalAlphaReport } from "../src/internal-alpha/report.js";

test("internal alpha report renders a readable summary for a ready run with warnings", () => {
  const report = createInternalAlphaReport({
    runId: "alpha-ready",
    createdAt: "2025-07-12T00:00:00.000Z",
    updatedAt: "2025-07-12T00:00:01.000Z",
    report: {
      operation: { heroImageId: "img-001" },
      health: {
        status: "ready",
        importedCount: 1,
        skippedCount: 0,
        previewReady: true,
        exportDone: true,
        exportBlocked: false,
        warnings: ["viewport-proof-still-provisional"],
        blockingIssues: [],
        nextMilestones: ["prove-real-image-sized-viewport-path"],
      },
      evidence: {
        previewRequestId: "preview-1",
        exportJobId: "export-1",
      },
      persistence: {
        previewCacheStatus: "rendered-image",
        exportCompanionStatus: "rendered-image",
      },
    },
  });

  assert.equal(report.headline, "READY WITH WARNINGS");
  assert.match(report.narrative, /Preview pipeline seam completed/i);
  assert.match(report.narrative, /Warnings remain: viewport-proof-still-provisional/i);
  assert.deepEqual(report.nextMilestones, ["prove-real-image-sized-viewport-path"]);
  assert.ok(report.checkpoints.includes("runId: alpha-ready"));
  assert.ok(report.checkpoints.includes("export: done"));
});

test("internal alpha report handles missing run data honestly", () => {
  const report = createInternalAlphaReport(null);
  assert.equal(report.headline, "NO RUN");
  assert.equal(report.narrative, "No internal-alpha run has been saved yet.");
  assert.deepEqual(report.checkpoints, []);
});
