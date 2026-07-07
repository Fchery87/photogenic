import { createViewportProofReport } from "./report.js";
import { loadViewportProofResults } from "./shell-source.js";

export function createViewportProofWorkflow({ sessionStore } = {}) {
  if (!sessionStore || typeof sessionStore.saveSession !== "function" || typeof sessionStore.getSession !== "function") {
    throw new TypeError("sessionStore with saveSession() and getSession() is required");
  }

  return {
    async collectAndSave({ sessionId, shell = "unknown", gradientDrawn, invoke } = {}) {
      const result = await this.collectAndSaveReport({ sessionId, shell, gradientDrawn, invoke });
      return {
        session: result.session,
        report: result.report,
      };
    },

    async collectAndSaveReport({ sessionId, shell = "unknown", gradientDrawn, invoke } = {}) {
      if (typeof sessionId !== "string" || !sessionId) {
        throw new TypeError("sessionId is required");
      }
      const results = await loadViewportProofResults({ gradientDrawn, invoke });
      const saved = await sessionStore.saveSession(sessionId, { shell, results });
      return {
        operation: {
          kind: "collect-and-save-viewport-proof",
          sessionId,
          shell,
          collectedGateIds: saved.results.map((result) => result.id),
        },
        session: saved,
        report: createViewportProofReport(saved.results),
      };
    },

    async loadReport(sessionId) {
      const result = await this.loadReportWithOperation(sessionId);
      return result ? { session: result.session, report: result.report } : null;
    },

    async loadReportWithOperation(sessionId) {
      const session = await sessionStore.getSession(sessionId);
      if (!session) return null;
      return {
        operation: {
          kind: "load-viewport-proof-report",
          sessionId,
          shell: session.shell,
        },
        session,
        report: createViewportProofReport(session.results),
      };
    },
  };
}
