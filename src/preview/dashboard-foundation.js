function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function summarizeRenderedCache(session) {
  if (session.request.status !== "ready") return null;
  const status = session.cacheRecord?.renderedImage?.status;
  return {
    status: status === "rendered-image" ? "present" : status === "invalid" ? "invalid" : status === "stale" ? "stale" : "missing",
    path: session.cacheRecord?.filePath ?? session.request.previewArtifact?.cacheFilePath ?? null,
    refreshedStatus: status ?? null,
    note: session.cacheRecord?.renderedImage?.note ?? session.request.previewArtifact?.renderedImage?.note ?? null,
  };
}

function summarizeCounts(sessions) {
  return {
    total: sessions.length,
    queued: sessions.filter((session) => session.request.status === "queued").length,
    ready: sessions.filter((session) => session.request.status === "ready").length,
    cancelled: sessions.filter((session) => session.request.status === "cancelled").length,
    superseded: sessions.filter((session) => session.request.status === "superseded").length,
    cacheHits: sessions.filter((session) => session.cacheStatus === "hit").length,
    cacheMisses: sessions.filter((session) => session.cacheStatus === "miss").length,
    cacheStored: sessions.filter((session) => session.cacheStatus === "stored").length,
    cacheIssues: sessions.filter((session) => {
      const cacheStatus = session.cacheStatus;
      const renderedStatus = summarizeRenderedCache(session)?.status;
      return cacheStatus === "miss" || renderedStatus === "missing" || renderedStatus === "invalid" || renderedStatus === "stale";
    }).length,
    readyWithRenderedCachePresent: sessions.filter((session) => summarizeRenderedCache(session)?.status === "present").length,
    readyWithRenderedCacheMissing: sessions.filter((session) => summarizeRenderedCache(session)?.status === "missing").length,
    readyWithRenderedCacheInvalid: sessions.filter((session) => summarizeRenderedCache(session)?.status === "invalid").length,
    readyWithRenderedCacheStale: sessions.filter((session) => summarizeRenderedCache(session)?.status === "stale").length,
    readyWithRenderedCacheIssue: sessions.filter((session) => {
      const status = summarizeRenderedCache(session)?.status;
      return status === "missing" || status === "invalid" || status === "stale";
    }).length,
  };
}

function summarizeLatestSession(session) {
  return {
    sessionId: session.sessionId,
    imageId: session.request.source.imageId,
    proxyKey: session.request.proxy.proxyKey,
    cacheStatus: session.cacheStatus,
    renderedCache: summarizeRenderedCache(session),
    updatedAt: session.updatedAt,
  };
}

export function createPreviewDashboardFoundation() {
  return {
    summarizeSessions(sessions = []) {
      const normalizedSessions = Array.isArray(sessions) ? sessions.map((session) => clone(session)) : [];
      const latest = [...normalizedSessions].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const latestReady = latest.find((session) => session.request.status === "ready") ?? null;
      const latestQueued = latest.find((session) => session.request.status === "queued") ?? null;

      return {
        counts: summarizeCounts(normalizedSessions),
        latestSessionIds: latest.map((session) => session.sessionId),
        latestReady: latestReady ? summarizeLatestSession(latestReady) : null,
        latestQueued: latestQueued ? summarizeLatestSession(latestQueued) : null,
        latestCancelled: (() => {
          const session = latest.find((item) => item.request.status === "cancelled");
          return session ? summarizeLatestSession(session) : null;
        })(),
        latestSuperseded: (() => {
          const session = latest.find((item) => item.request.status === "superseded");
          return session ? summarizeLatestSession(session) : null;
        })(),
        latestCacheHit: (() => {
          const session = latest.find((item) => item.cacheStatus === "hit");
          return session ? summarizeLatestSession(session) : null;
        })(),
        latestCacheMiss: (() => {
          const session = latest.find((item) => item.cacheStatus === "miss");
          return session ? summarizeLatestSession(session) : null;
        })(),
        latestCacheStored: (() => {
          const session = latest.find((item) => item.cacheStatus === "stored");
          return session ? summarizeLatestSession(session) : null;
        })(),
        latestCacheIssue: (() => {
          const session = latest.find((item) => {
            const cacheStatus = item.cacheStatus;
            const renderedStatus = summarizeRenderedCache(item)?.status;
            return cacheStatus === "miss" || renderedStatus === "missing" || renderedStatus === "invalid" || renderedStatus === "stale";
          });
          return session ? summarizeLatestSession(session) : null;
        })(),
        latestRenderedCachePresent: (() => {
          const session = latest.find((item) => summarizeRenderedCache(item)?.status === "present");
          return session ? summarizeLatestSession(session) : null;
        })(),
        latestRenderedCacheIssue: (() => {
          const session = latest.find((item) => {
            const status = summarizeRenderedCache(item)?.status;
            return status === "missing" || status === "invalid" || status === "stale";
          });
          return session ? summarizeLatestSession(session) : null;
        })(),
        latestRenderedCacheMissing: (() => {
          const session = latest.find((item) => summarizeRenderedCache(item)?.status === "missing");
          return session ? summarizeLatestSession(session) : null;
        })(),
        latestRenderedCacheInvalid: (() => {
          const session = latest.find((item) => summarizeRenderedCache(item)?.status === "invalid");
          return session ? summarizeLatestSession(session) : null;
        })(),
        latestRenderedCacheStale: (() => {
          const session = latest.find((item) => summarizeRenderedCache(item)?.status === "stale");
          return session ? summarizeLatestSession(session) : null;
        })(),
      };
    },
  };
}
