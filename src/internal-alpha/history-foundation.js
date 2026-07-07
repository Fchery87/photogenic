export function summarizeInternalAlphaHistoryRuns(runs = []) {
  const runIds = runs.map((run) => run.runId);
  const statuses = runs.reduce((summary, run) => {
    const status = run?.report?.health?.status ?? "unknown";
    summary[status] = (summary[status] ?? 0) + 1;
    return summary;
  }, {});

  return {
    total: runs.length,
    runIds,
    latestRunId: runIds[0] ?? null,
    oldestRunId: runIds.at(-1) ?? null,
    statuses,
  };
}
