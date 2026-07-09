import { createViewportProofFoundation } from "./foundation.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function summarizeSession(session, viewportProofFoundation) {
  const proofSummary = viewportProofFoundation.summarizeProof(session.results, session.verdict);
  return {
    sessionId: session.sessionId,
    shell: session.shell,
    updatedAt: session.updatedAt,
    ...proofSummary,
  };
}

function summarizeCounts(sessions, viewportProofFoundation) {
  return sessions.reduce(
    (counts, session) => {
      const summary = summarizeSession(session, viewportProofFoundation);
      counts.total += 1;
      if (summary.status === "unlocked") {
        counts.unlocked += 1;
      } else {
        counts.provisional += 1;
        counts.proofIssues += 1;
      }
      if (summary.measuredGateCount > 0) {
        counts.measuredRuns += 1;
        if (summary.status !== "unlocked") {
          counts.measuredProofIssues += 1;
        }
      } else {
        counts.unmeasuredRuns += 1;
      }
      if (session.shell === "browser") {
        counts.browserShells += 1;
      } else {
        counts.nonBrowserShells += 1;
      }
      return counts;
    },
    {
      total: 0,
      unlocked: 0,
      provisional: 0,
      proofIssues: 0,
      measuredRuns: 0,
      measuredProofIssues: 0,
      unmeasuredRuns: 0,
      browserShells: 0,
      nonBrowserShells: 0,
    },
  );
}

function nativeFrameHashFor(session) {
  return (
    session?.results?.find(
      (result) => result?.id === "raw_frame" && typeof result?.metrics?.frameHash === "string",
    )?.metrics.frameHash ?? null
  );
}

export function createViewportProofDashboardFoundation({
  viewportProofFoundation = createViewportProofFoundation(),
} = {}) {
  if (!viewportProofFoundation || typeof viewportProofFoundation.summarizeProof !== "function") {
    throw new TypeError("viewportProofFoundation with summarizeProof() is required");
  }

  return {
    viewportProofFoundation,

    summarizeSessions(sessions = []) {
      const normalizedSessions = Array.isArray(sessions) ? sessions.map((session) => clone(session)) : [];
      const latest = [...normalizedSessions].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const latestById = new Map(latest.map((session) => [session.sessionId, session]));
      const latestSummaries = latest.map((session) => summarizeSession(session, viewportProofFoundation));
      const latestUnlocked = latestSummaries.find((session) => session.status === "unlocked") ?? null;
      const latestProvisional = latestSummaries.find((session) => session.status !== "unlocked") ?? null;

      const bestProgress = [...latestSummaries].sort((a, b) => {
        const byPasses = b.genuinePassCount - a.genuinePassCount;
        if (byPasses !== 0) return byPasses;
        const byMeasured = b.measuredGateCount - a.measuredGateCount;
        if (byMeasured !== 0) return byMeasured;
        return String(b.updatedAt).localeCompare(String(a.updatedAt));
      })[0] ?? null;

      return {
        counts: summarizeCounts(normalizedSessions, viewportProofFoundation),
        latestSessionIds: latest.map((session) => session.sessionId),
        latestBrowserShell: (() => {
          const session = latestSummaries.find((item) => item.shell === "browser");
          return session
            ? {
                sessionId: session.sessionId,
                shell: session.shell,
                updatedAt: session.updatedAt,
                status: session.status,
              }
            : null;
        })(),
        latestMeasuredRun: (() => {
          const session = latestSummaries.find((item) => item.measuredGateCount > 0);
          return session
            ? {
                sessionId: session.sessionId,
                shell: session.shell,
                updatedAt: session.updatedAt,
                status: session.status,
                measuredGateCount: session.measuredGateCount,
              }
            : null;
        })(),
        latestMeasuredProofIssue: (() => {
          const session = latestSummaries.find((item) => item.measuredGateCount > 0 && item.status !== "unlocked");
          return session
            ? {
                sessionId: session.sessionId,
                shell: session.shell,
                updatedAt: session.updatedAt,
                status: session.status,
                measuredGateCount: session.measuredGateCount,
                remainingGateCount: session.remainingGateCount,
              }
            : null;
        })(),
        latestProofIssue: (() => {
          const session = latestSummaries.find((item) => item.status !== "unlocked");
          return session
            ? {
                sessionId: session.sessionId,
                shell: session.shell,
                updatedAt: session.updatedAt,
                status: session.status,
                remainingGateCount: session.remainingGateCount,
              }
            : null;
        })(),
        latestUnmeasuredRun: (() => {
          const session = latestSummaries.find((item) => item.measuredGateCount === 0);
          return session
            ? {
                sessionId: session.sessionId,
                shell: session.shell,
                updatedAt: session.updatedAt,
                status: session.status,
                measuredGateCount: session.measuredGateCount,
              }
            : null;
        })(),
        latestNonBrowserShell: (() => {
          const session = latestSummaries.find((item) => item.shell !== "browser");
          return session
            ? {
                sessionId: session.sessionId,
                shell: session.shell,
                updatedAt: session.updatedAt,
                status: session.status,
              }
            : null;
        })(),
        latestUnlocked: latestUnlocked
          ? (() => {
              const nativeFrameHash = nativeFrameHashFor(latestById.get(latestUnlocked.sessionId));
              return {
                sessionId: latestUnlocked.sessionId,
                shell: latestUnlocked.shell,
                updatedAt: latestUnlocked.updatedAt,
                passedGates: latestUnlocked.verdict.passedGates,
                ...(nativeFrameHash ? { nativeFrameHash } : {}),
              };
            })()
          : null,
        latestProvisional: latestProvisional
          ? {
              sessionId: latestProvisional.sessionId,
              shell: latestProvisional.shell,
              updatedAt: latestProvisional.updatedAt,
              remainingGates: latestProvisional.verdict.remainingGates,
            }
          : null,
        bestProgress: bestProgress
          ? (() => {
              const nativeFrameHash = nativeFrameHashFor(latestById.get(bestProgress.sessionId));
              return {
                sessionId: bestProgress.sessionId,
                shell: bestProgress.shell,
                updatedAt: bestProgress.updatedAt,
                status: bestProgress.status,
                genuinePassCount: bestProgress.genuinePassCount,
                measuredGateCount: bestProgress.measuredGateCount,
                remainingGateCount: bestProgress.remainingGateCount,
                ...(nativeFrameHash ? { nativeFrameHash } : {}),
              };
            })()
          : null,
      };
    },
  };
}
