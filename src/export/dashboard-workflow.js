import { createExportDashboardFoundation } from "./dashboard-foundation.js";

export function createExportDashboardWorkflow({
  sessionStore,
  sessionWorkflow = null,
  dashboardFoundation = createExportDashboardFoundation(),
} = {}) {
  if (!sessionStore || typeof sessionStore.getSession !== "function" || typeof sessionStore.listSessionIds !== "function") {
    throw new TypeError("sessionStore with getSession() and listSessionIds() is required");
  }
  if (!dashboardFoundation || typeof dashboardFoundation.summarizeSessions !== "function") {
    throw new TypeError("dashboardFoundation with summarizeSessions() is required");
  }

  function ensureSessionWorkflow() {
    if (!sessionWorkflow || typeof sessionWorkflow.reloadJobsReport !== "function") {
      throw new TypeError("sessionWorkflow with reloadJobsReport() is required for reload/repair summaries");
    }
  }

  return {
    dashboardFoundation,

    async summarizeSessions() {
      const sessionIds = await sessionStore.listSessionIds();
      const sessions = [];
      for (const sessionId of sessionIds) {
        const session = await sessionStore.getSession(sessionId);
        if (session) sessions.push(session);
      }

      return dashboardFoundation.summarizeSessions(sessions);
    },

    async reloadJobsSummary({ repairDone = false, jobIds = null } = {}) {
      ensureSessionWorkflow();
      const report = await sessionWorkflow.reloadJobsReport({ repairDone, jobIds });
      const summary = await this.summarizeSessions();
      return {
        operation: {
          kind: repairDone ? "repair-done-jobs" : "reload-jobs",
          repairDone,
          requestedJobIds: report.requestedJobIds,
          processedJobIds: report.latestJobIds,
          skippedJobIds: report.skippedJobIds,
        },
        report,
        summary,
      };
    },

    async repairDoneJobsSummary({ jobIds = null } = {}) {
      return this.reloadJobsSummary({ repairDone: true, jobIds });
    },
  };
}
