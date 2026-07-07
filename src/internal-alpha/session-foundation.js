export function summarizeInternalAlphaRunReport(run = null) {
  if (!run) return null;
  const report = run.report ?? {};
  const health = report.health ?? {};
  const evidence = report.evidence ?? {};
  const persistence = report.persistence ?? {};
  const warnings = Array.isArray(health.warnings) ? [...health.warnings] : [];
  const blockingIssues = Array.isArray(health.blockingIssues) ? [...health.blockingIssues] : [];
  const nextMilestones = Array.isArray(health.nextMilestones) ? [...health.nextMilestones] : [];

  return {
    runId: run.runId,
    status: health.status ?? null,
    heroImageId: report.operation?.heroImageId ?? null,
    importedImageCount: health.importedCount ?? 0,
    skippedImageCount: health.skippedCount ?? 0,
    previewReady: health.previewReady === true,
    exportDone: health.exportDone === true,
    exportBlocked: health.exportBlocked === true,
    warningCount: warnings.length,
    blockingIssueCount: blockingIssues.length,
    warnings,
    blockingIssues,
    nextMilestones,
    previewRequestId: evidence.previewRequestId ?? null,
    exportJobId: evidence.exportJobId ?? null,
    previewCacheStatus: persistence.previewCacheStatus ?? null,
    exportCompanionStatus: persistence.exportCompanionStatus ?? null,
    viewportHeadline: evidence.viewportHeadline ?? null,
    localExportAllowed: evidence.localExportAllowed ?? null,
    createdAt: run.createdAt ?? null,
    updatedAt: run.updatedAt ?? null,
  };
}
