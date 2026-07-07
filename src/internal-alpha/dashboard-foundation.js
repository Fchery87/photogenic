function firstRunIdMatching(runs, predicate) {
  return runs.find(predicate)?.runId ?? null;
}

export function summarizeInternalAlphaRuns(runs = []) {
  const counts = {
    total: runs.length,
    ready: 0,
    provisional: 0,
    emptyImport: 0,
    withBlockingIssues: 0,
    withWarnings: 0,
    readyWithWarnings: 0,
    provisionalWithBlockingIssues: 0,
  };

  for (const run of runs) {
    const health = run?.report?.health ?? {};
    const status = health.status ?? null;
    const blockingIssues = Array.isArray(health.blockingIssues) ? health.blockingIssues : [];
    const warnings = Array.isArray(health.warnings) ? health.warnings : [];

    if (status === "ready") counts.ready += 1;
    if (status === "provisional") counts.provisional += 1;
    if (status === "empty-import") counts.emptyImport += 1;
    if (blockingIssues.length > 0) counts.withBlockingIssues += 1;
    if (warnings.length > 0) counts.withWarnings += 1;
    if (status === "ready" && warnings.length > 0) counts.readyWithWarnings += 1;
    if (status === "provisional" && blockingIssues.length > 0) counts.provisionalWithBlockingIssues += 1;
  }

  return {
    counts,
    latest: {
      ready: firstRunIdMatching(runs, (run) => run?.report?.health?.status === "ready"),
      provisional: firstRunIdMatching(runs, (run) => run?.report?.health?.status === "provisional"),
      blocked: firstRunIdMatching(runs, (run) => {
        const blockingIssues = run?.report?.health?.blockingIssues;
        return Array.isArray(blockingIssues) && blockingIssues.length > 0;
      }),
      warning: firstRunIdMatching(runs, (run) => {
        const warnings = run?.report?.health?.warnings;
        return Array.isArray(warnings) && warnings.length > 0;
      }),
      readyWithWarnings: firstRunIdMatching(runs, (run) => {
        const health = run?.report?.health ?? {};
        return health.status === "ready" && Array.isArray(health.warnings) && health.warnings.length > 0;
      }),
      provisionalWithBlockingIssues: firstRunIdMatching(runs, (run) => {
        const health = run?.report?.health ?? {};
        return health.status === "provisional" && Array.isArray(health.blockingIssues) && health.blockingIssues.length > 0;
      }),
    },
  };
}
