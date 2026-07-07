import { createViewportProofDashboardFoundation } from "./dashboard-foundation.js";

export function createViewportProofDashboardWorkflow({
  sessionStore,
  dashboardFoundation = createViewportProofDashboardFoundation(),
} = {}) {
  if (!sessionStore || typeof sessionStore.getSession !== "function" || typeof sessionStore.listSessionIds !== "function") {
    throw new TypeError("sessionStore with getSession() and listSessionIds() is required");
  }
  if (!dashboardFoundation || typeof dashboardFoundation.summarizeSessions !== "function") {
    throw new TypeError("dashboardFoundation with summarizeSessions() is required");
  }

  return {
    dashboardFoundation,

    async summarizeSessions() {
      const result = await this.summarizeSessionsReport();
      return result.summary;
    },

    async summarizeSessionsReport() {
      const sessionIds = await sessionStore.listSessionIds();
      const sessions = [];
      const processedSessionIds = [];
      const skippedSessionIds = [];
      for (const sessionId of sessionIds) {
        const session = await sessionStore.getSession(sessionId);
        if (session) {
          sessions.push(session);
          processedSessionIds.push(sessionId);
        } else {
          skippedSessionIds.push(sessionId);
        }
      }

      return {
        operation: {
          kind: "summarize-viewport-proof-sessions",
          requestedSessionIds: sessionIds,
          processedSessionIds,
          skippedSessionIds,
        },
        summary: dashboardFoundation.summarizeSessions(sessions),
      };
    },
  };
}
