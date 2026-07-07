import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeInternalAlphaRunReport } from "../src/internal-alpha/session-foundation.js";

test("internal alpha session foundation summarizes a persisted run into a compact report", () => {
  const summary = summarizeInternalAlphaRunReport({
    runId: "alpha-run-1",
    createdAt: "2025-07-12T00:00:00.000Z",
    updatedAt: "2025-07-12T00:00:01.000Z",
    report: {
      operation: { heroImageId: "img-123" },
      health: {
        status: "provisional",
        importedCount: 2,
        skippedCount: 1,
        previewReady: true,
        exportDone: false,
        exportBlocked: true,
        warnings: ["viewport-proof-still-provisional"],
        blockingIssues: ["local-export-blocked"],
        nextMilestones: ["prove-real-image-sized-viewport-path", "resolve-local-license-for-export"],
      },
      evidence: {
        previewRequestId: "preview-1",
        exportJobId: null,
        viewportHeadline: "PROVISIONAL",
        localExportAllowed: false,
      },
      persistence: {
        previewCacheStatus: "rendered-image",
        exportCompanionStatus: null,
      },
    },
  });

  assert.deepEqual(summary, {
    runId: "alpha-run-1",
    status: "provisional",
    heroImageId: "img-123",
    importedImageCount: 2,
    skippedImageCount: 1,
    previewReady: true,
    exportDone: false,
    exportBlocked: true,
    warningCount: 1,
    blockingIssueCount: 1,
    warnings: ["viewport-proof-still-provisional"],
    blockingIssues: ["local-export-blocked"],
    nextMilestones: ["prove-real-image-sized-viewport-path", "resolve-local-license-for-export"],
    previewRequestId: "preview-1",
    exportJobId: null,
    previewCacheStatus: "rendered-image",
    exportCompanionStatus: null,
    viewportHeadline: "PROVISIONAL",
    localExportAllowed: false,
    createdAt: "2025-07-12T00:00:00.000Z",
    updatedAt: "2025-07-12T00:00:01.000Z",
  });
});
