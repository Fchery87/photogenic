import { summarizeInternalAlphaHistoryRuns } from "./history-foundation.js";
import { createInternalAlphaReport } from "./report.js";
import { createInternalAlphaDashboardReport } from "./dashboard-report.js";
import { summarizeInternalAlphaRunReport } from "./session-foundation.js";
import { createInternalAlphaDashboardWorkflow } from "./dashboard-workflow.js";

function ensureSessionStore(sessionStore) {
  if (
    !sessionStore ||
    typeof sessionStore.saveRun !== "function" ||
    typeof sessionStore.getRun !== "function" ||
    typeof sessionStore.listRunIds !== "function"
  ) {
    throw new TypeError("sessionStore with saveRun(), getRun(), and listRunIds() is required");
  }
}

export function createInternalAlphaSessionWorkflow({
  workflow,
  sessionStore,
  dashboardWorkflow = createInternalAlphaDashboardWorkflow({ sessionStore }),
} = {}) {
  if (!workflow || typeof workflow.runFoundationFlowReport !== "function") {
    throw new TypeError("workflow with runFoundationFlowReport() is required");
  }
  ensureSessionStore(sessionStore);
  if (!dashboardWorkflow || typeof dashboardWorkflow.summarizeRunsReport !== "function") {
    throw new TypeError("dashboardWorkflow with summarizeRunsReport() is required");
  }

  return {
    workflow,
    sessionStore,
    dashboardWorkflow,

    async listRunIds() {
      return sessionStore.listRunIds();
    },

    async loadLatestRun() {
      const result = await this.loadLatestRunReport();
      return result ? { run: result.run, report: result.report } : null;
    },

    async loadLatestRunReport() {
      const runIds = await sessionStore.listRunIds();
      const preferredRunIds = runIds.filter((runId) => !runId.startsWith("internal-alpha-"));
      const latestRunId = (preferredRunIds.at(-1) ?? runIds.at(-1)) ?? null;
      if (!latestRunId) return null;
      const loaded = await this.loadRunReport(latestRunId);
      return loaded ? {
        ...loaded,
        operation: {
          kind: "load-latest-internal-alpha-run",
          runId: latestRunId,
          status: loaded.runSummary?.status ?? null,
        },
      } : null;
    },

    async listRunIdsReport() {
      const runIds = await sessionStore.listRunIds();
      return {
        operation: {
          kind: "list-internal-alpha-runs",
          count: runIds.length,
        },
        runIds,
      };
    },

    async summarizeHistory() {
      const result = await this.summarizeHistoryReport();
      return result.summary;
    },

    async summarizeHistoryReport({ runIds = null } = {}) {
      const dashboard = await dashboardWorkflow.summarizeRunsReport({ runIds });
      return {
        operation: {
          kind: "summarize-internal-alpha-history",
          requestedRunIds: dashboard.operation.requestedRunIds,
          processedRunIds: dashboard.operation.processedRunIds,
          skippedRunIds: dashboard.operation.skippedRunIds,
        },
        runs: dashboard.runs,
        summary: dashboard.summary,
        historySummary: summarizeInternalAlphaHistoryRuns(dashboard.runs),
        readableReport: createInternalAlphaDashboardReport(dashboard.summary),
      };
    },

    async runAndSave(runId, options = {}) {
      const result = await this.runAndSaveReport(runId, options);
      return {
        run: result.run,
        report: result.report,
        summary: result.summary,
      };
    },

    async runAndSaveReport(runId, options = {}) {
      if (typeof runId !== "string" || !runId.trim()) throw new TypeError("runId is required");
      const report = await workflow.runFoundationFlowReport(options);
      const saved = await sessionStore.saveRunReport(runId, { report });
      const summary = await dashboardWorkflow.summarizeRunsReport({ runIds: [runId] });
      return {
        operation: {
          kind: "run-and-save-internal-alpha",
          runId: runId.trim(),
          status: report.health?.status ?? null,
          heroImageId: report.operation?.heroImageId ?? null,
        },
        run: saved.run,
        report,
        summary,
        runSummary: summarizeInternalAlphaRunReport(saved.run),
        readableReport: createInternalAlphaReport(saved.run),
      };
    },

    async loadRun(runId) {
      const result = await this.loadRunReport(runId);
      return result ? { run: result.run, report: result.report } : null;
    },

    async loadRunReport(runId) {
      const run = await sessionStore.getRun(runId);
      if (!run) return null;
      return {
        operation: {
          kind: "load-internal-alpha-run",
          runId,
          status: run.report?.health?.status ?? null,
        },
        run,
        report: run.report,
        runSummary: summarizeInternalAlphaRunReport(run),
        readableReport: createInternalAlphaReport(run),
      };
    },
  };
}
