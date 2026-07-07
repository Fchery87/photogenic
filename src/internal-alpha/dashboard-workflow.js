import { createInternalAlphaDashboardReport } from "./dashboard-report.js";
import { summarizeInternalAlphaRuns } from "./dashboard-foundation.js";

export function createInternalAlphaDashboardWorkflow({ sessionStore } = {}) {
  if (!sessionStore || typeof sessionStore.listRunIds !== "function" || typeof sessionStore.getRun !== "function") {
    throw new TypeError("sessionStore with listRunIds() and getRun() is required");
  }

  return {
    async summarizeRuns() {
      const result = await this.summarizeRunsReport();
      return result.summary;
    },

    async summarizeRunsReport({ runIds = null } = {}) {
      if (runIds != null && !Array.isArray(runIds)) {
        throw new TypeError("runIds must be an array when provided");
      }
      const availableRunIds = await sessionStore.listRunIds();
      const requestedRunIds = runIds ?? availableRunIds;
      const skippedRunIds = requestedRunIds.filter((runId) => !availableRunIds.includes(runId));
      const selectedRunIds = requestedRunIds.filter((runId) => availableRunIds.includes(runId));
      const runs = [];
      for (const runId of selectedRunIds) {
        const run = await sessionStore.getRun(runId);
        if (run) runs.push(run);
      }
      const summary = summarizeInternalAlphaRuns(runs);
      return {
        operation: {
          kind: "summarize-internal-alpha-runs",
          requestedRunIds,
          processedRunIds: runs.map((run) => run.runId),
          skippedRunIds,
        },
        runs,
        summary,
        readableReport: createInternalAlphaDashboardReport(summary),
      };
    },
  };
}
