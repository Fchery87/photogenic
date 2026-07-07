import { createPreviewDashboardFoundation } from "./dashboard-foundation.js";

export function createPreviewDashboardWorkflow({
  sessionStore,
  sessionWorkflow = null,
  dashboardFoundation = createPreviewDashboardFoundation(),
} = {}) {
  if (!sessionStore || typeof sessionStore.getSession !== "function" || typeof sessionStore.listSessionIds !== "function") {
    throw new TypeError("sessionStore with getSession() and listSessionIds() is required");
  }
  if (!dashboardFoundation || typeof dashboardFoundation.summarizeSessions !== "function") {
    throw new TypeError("dashboardFoundation with summarizeSessions() is required");
  }

  function ensureSessionWorkflow() {
    if (!sessionWorkflow || typeof sessionWorkflow.reloadPreviewsReport !== "function") {
      throw new TypeError("sessionWorkflow with reloadPreviewsReport() is required for reload/repair summaries");
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

    async reloadPreviewsSummary({ repairReady = false, sessionIds = null } = {}) {
      ensureSessionWorkflow();
      const report = await sessionWorkflow.reloadPreviewsReport({ repairReady, sessionIds });
      const summary = await this.summarizeSessions();
      return {
        operation: {
          kind: repairReady ? "repair-ready-previews" : "reload-previews",
          repairReady,
          requestedSessionIds: report.requestedSessionIds,
          processedSessionIds: report.latestSessionIds,
          skippedSessionIds: report.skippedSessionIds,
        },
        report,
        summary,
      };
    },

    async repairReadyPreviewsSummary({ sessionIds = null } = {}) {
      return this.reloadPreviewsSummary({ repairReady: true, sessionIds });
    },
  };
}
