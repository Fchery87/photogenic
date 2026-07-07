function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function summarizeCompanionProof(session) {
  if (session.status !== "done") return null;

  const status = session.companionOutput?.status;
  return {
    status: status === "placeholder-proof" || status === "rendered-image" ? "present" : status === "invalid" ? "invalid" : status === "stale" ? "stale" : "missing",
    path: session.companionOutput?.path ?? null,
    refreshedStatus: status ?? null,
    note: session.companionOutput?.note ?? null,
  };
}

function summarizeArtifactSidecar(session) {
  if (session.status !== "done") return null;

  const status = session.artifactSidecar?.status;
  return {
    status: status === "present" ? "present" : status === "invalid" ? "invalid" : status === "stale" ? "stale" : "missing",
    path: session.artifactSidecar?.path ?? session.outputPath ?? null,
    refreshedStatus: status ?? null,
    note: session.artifactSidecar?.note ?? null,
  };
}

function summarizeCounts(sessions) {
  return {
    total: sessions.length,
    queued: sessions.filter((session) => session.status === "queued").length,
    running: sessions.filter((session) => session.status === "running").length,
    done: sessions.filter((session) => session.status === "done").length,
    doneWithProofPresent: sessions.filter((session) => summarizeCompanionProof(session)?.status === "present").length,
    doneWithProofMissing: sessions.filter((session) => summarizeCompanionProof(session)?.status === "missing").length,
    doneWithProofInvalid: sessions.filter((session) => summarizeCompanionProof(session)?.status === "invalid").length,
    doneWithProofStale: sessions.filter((session) => summarizeCompanionProof(session)?.status === "stale").length,
    doneWithProofIssue: sessions.filter((session) => {
      const status = summarizeCompanionProof(session)?.status;
      return status === "missing" || status === "invalid" || status === "stale";
    }).length,
    doneWithArtifactSidecarPresent: sessions.filter((session) => summarizeArtifactSidecar(session)?.status === "present").length,
    doneWithArtifactSidecarMissing: sessions.filter((session) => summarizeArtifactSidecar(session)?.status === "missing").length,
    doneWithArtifactSidecarInvalid: sessions.filter((session) => summarizeArtifactSidecar(session)?.status === "invalid").length,
    doneWithArtifactSidecarStale: sessions.filter((session) => summarizeArtifactSidecar(session)?.status === "stale").length,
    doneWithArtifactSidecarIssue: sessions.filter((session) => {
      const status = summarizeArtifactSidecar(session)?.status;
      return status === "missing" || status === "invalid" || status === "stale";
    }).length,
    doneWithIntegrityIssue: sessions.filter((session) => {
      const proofStatus = summarizeCompanionProof(session)?.status;
      const sidecarStatus = summarizeArtifactSidecar(session)?.status;
      return proofStatus === "missing" || proofStatus === "invalid" || proofStatus === "stale" || sidecarStatus === "missing" || sidecarStatus === "invalid" || sidecarStatus === "stale";
    }).length,
    failed: sessions.filter((session) => session.status === "failed").length,
  };
}

function summarizeSession(session) {
  return {
    sessionId: session.sessionId,
    imageId: session.imageId,
    outputName: session.outputName,
    status: session.status,
    updatedAt: session.updatedAt,
    companionProof: summarizeCompanionProof(session),
    artifactSidecar: summarizeArtifactSidecar(session),
  };
}

function summarizeFailure(session) {
  return {
    sessionId: session.sessionId,
    imageId: session.imageId,
    outputName: session.outputName,
    error: session.error,
    updatedAt: session.updatedAt,
  };
}

export function createExportDashboardFoundation() {
  return {
    summarizeSessions(sessions = []) {
      const normalizedSessions = Array.isArray(sessions) ? sessions.map((session) => clone(session)) : [];
      const latest = [...normalizedSessions].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

      return {
        counts: summarizeCounts(normalizedSessions),
        latestSessionIds: latest.map((session) => session.sessionId),
        latestSessions: latest.map(summarizeSession),
        latestQueued: (() => {
          const session = latest.find((item) => item.status === "queued");
          return session ? summarizeSession(session) : null;
        })(),
        latestRunning: (() => {
          const session = latest.find((item) => item.status === "running");
          return session ? summarizeSession(session) : null;
        })(),
        latestDone: (() => {
          const session = latest.find((item) => item.status === "done");
          return session ? summarizeSession(session) : null;
        })(),
        latestFailed: (() => {
          const session = latest.find((item) => item.status === "failed");
          return session ? summarizeSession(session) : null;
        })(),
        latestProofPresent: (() => {
          const session = latest.find((item) => summarizeCompanionProof(item)?.status === "present");
          return session ? summarizeSession(session) : null;
        })(),
        latestProofIssue: (() => {
          const session = latest.find((item) => {
            const status = summarizeCompanionProof(item)?.status;
            return status === "missing" || status === "invalid" || status === "stale";
          });
          return session ? summarizeSession(session) : null;
        })(),
        latestProofMissing: (() => {
          const session = latest.find((item) => summarizeCompanionProof(item)?.status === "missing");
          return session ? summarizeSession(session) : null;
        })(),
        latestProofInvalid: (() => {
          const session = latest.find((item) => summarizeCompanionProof(item)?.status === "invalid");
          return session ? summarizeSession(session) : null;
        })(),
        latestProofStale: (() => {
          const session = latest.find((item) => summarizeCompanionProof(item)?.status === "stale");
          return session ? summarizeSession(session) : null;
        })(),
        latestArtifactSidecarPresent: (() => {
          const session = latest.find((item) => summarizeArtifactSidecar(item)?.status === "present");
          return session ? summarizeSession(session) : null;
        })(),
        latestIntegrityIssue: (() => {
          const session = latest.find((item) => {
            const proofStatus = summarizeCompanionProof(item)?.status;
            const sidecarStatus = summarizeArtifactSidecar(item)?.status;
            return proofStatus === "missing" || proofStatus === "invalid" || proofStatus === "stale" || sidecarStatus === "missing" || sidecarStatus === "invalid" || sidecarStatus === "stale";
          });
          return session ? summarizeSession(session) : null;
        })(),
        latestArtifactSidecarIssue: (() => {
          const session = latest.find((item) => {
            const status = summarizeArtifactSidecar(item)?.status;
            return status === "missing" || status === "invalid" || status === "stale";
          });
          return session ? summarizeSession(session) : null;
        })(),
        latestArtifactSidecarMissing: (() => {
          const session = latest.find((item) => summarizeArtifactSidecar(item)?.status === "missing");
          return session ? summarizeSession(session) : null;
        })(),
        latestArtifactSidecarInvalid: (() => {
          const session = latest.find((item) => summarizeArtifactSidecar(item)?.status === "invalid");
          return session ? summarizeSession(session) : null;
        })(),
        latestArtifactSidecarStale: (() => {
          const session = latest.find((item) => summarizeArtifactSidecar(item)?.status === "stale");
          return session ? summarizeSession(session) : null;
        })(),
        recentFailures: latest.filter((session) => session.status === "failed").slice(0, 5).map(summarizeFailure),
      };
    },
  };
}
