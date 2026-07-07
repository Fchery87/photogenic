export function createInternalAlphaDashboardReport(summary = null) {
  if (!summary) {
    return {
      headline: "NO RUN HISTORY",
      narrative: "No internal-alpha runs have been saved yet.",
      checkpoints: [],
    };
  }

  const counts = summary.counts ?? {};
  const latest = summary.latest ?? {};
  const checkpoints = [
    `total runs: ${counts.total ?? 0}`,
    `ready: ${counts.ready ?? 0}`,
    `provisional: ${counts.provisional ?? 0}`,
    `empty import: ${counts.emptyImport ?? 0}`,
    `with blocking issues: ${counts.withBlockingIssues ?? 0}`,
    `with warnings: ${counts.withWarnings ?? 0}`,
    `latest ready: ${latest.ready ?? "none"}`,
    `latest blocked: ${latest.blocked ?? "none"}`,
  ];

  let headline = "NO RUN HISTORY";
  if ((counts.ready ?? 0) > 0 && (counts.withBlockingIssues ?? 0) === 0) {
    headline = (counts.withWarnings ?? 0) > 0 ? "READY HISTORY WITH WARNINGS" : "READY HISTORY";
  } else if ((counts.total ?? 0) > 0) {
    headline = "PROVISIONAL HISTORY";
  }

  const narrativeParts = [];
  if ((counts.ready ?? 0) > 0) {
    narrativeParts.push(`${counts.ready} saved run${counts.ready === 1 ? "" : "s"} reached ready status.`);
  }
  if ((counts.provisional ?? 0) > 0) {
    narrativeParts.push(`${counts.provisional} saved run${counts.provisional === 1 ? "" : "s"} remained provisional.`);
  }
  if ((counts.withBlockingIssues ?? 0) > 0) {
    narrativeParts.push(`${counts.withBlockingIssues} saved run${counts.withBlockingIssues === 1 ? "" : "s"} still have blocking issues.`);
  }
  if ((counts.withWarnings ?? 0) > 0) {
    narrativeParts.push(`${counts.withWarnings} saved run${counts.withWarnings === 1 ? "" : "s"} still carry warnings.`);
  }
  if (narrativeParts.length === 0) {
    narrativeParts.push("No internal-alpha runs have been saved yet.");
  }

  return {
    headline,
    narrative: narrativeParts.join(" "),
    checkpoints,
    summary,
  };
}
