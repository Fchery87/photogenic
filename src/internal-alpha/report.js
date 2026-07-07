import { summarizeInternalAlphaRunReport } from "./session-foundation.js";

export function createInternalAlphaReport(run = null) {
  const summary = summarizeInternalAlphaRunReport(run);
  if (!summary) {
    return {
      headline: "NO RUN",
      narrative: "No internal-alpha run has been saved yet.",
      checkpoints: [],
      nextMilestones: [],
    };
  }

  const checkpoints = [
    `runId: ${summary.runId}`,
    `status: ${summary.status}`,
    `heroImageId: ${summary.heroImageId ?? "none"}`,
    `imports: ${summary.importedImageCount} imported, ${summary.skippedImageCount} skipped`,
    `preview: ${summary.previewReady ? "ready" : "not-ready"}`,
    `export: ${summary.exportDone ? "done" : summary.exportBlocked ? "blocked" : "not-done"}`,
    `cache: ${summary.previewCacheStatus ?? "unknown"}`,
    `companion: ${summary.exportCompanionStatus ?? "unknown"}`,
  ];

  const headline = summary.status === "ready"
    ? (summary.warningCount > 0 ? "READY WITH WARNINGS" : "READY")
    : summary.status === "provisional"
      ? "PROVISIONAL"
      : summary.status === "empty-import"
        ? "EMPTY IMPORT"
        : "UNKNOWN";

  const narrativeParts = [];
  if (summary.previewReady) narrativeParts.push("Preview pipeline seam completed for the selected hero image.");
  if (summary.exportDone) narrativeParts.push("Export seam completed and wrote a persisted artifact path.");
  if (summary.exportBlocked) narrativeParts.push("Local export remained blocked by the current licensing state.");
  if (summary.warningCount > 0) narrativeParts.push(`Warnings remain: ${summary.warnings.join(", ")}.`);
  if (summary.blockingIssueCount > 0) narrativeParts.push(`Blocking issues remain: ${summary.blockingIssues.join(", ")}.`);
  if (narrativeParts.length === 0) narrativeParts.push("Run completed without recorded readiness details.");

  return {
    headline,
    narrative: narrativeParts.join(" "),
    checkpoints,
    nextMilestones: [...summary.nextMilestones],
    summary,
  };
}
