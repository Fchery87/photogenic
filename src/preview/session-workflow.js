import { createPreviewWorkflow } from "./workflow.js";

function ensureSessionStore(sessionStore) {
  if (
    !sessionStore ||
    typeof sessionStore.saveSession !== "function" ||
    typeof sessionStore.getSession !== "function" ||
    typeof sessionStore.listSessionIds !== "function"
  ) {
    throw new TypeError("sessionStore with saveSession(), getSession(), and listSessionIds() is required");
  }
}

function buildSessionPayload(preview) {
  if (!preview || typeof preview !== "object") throw new TypeError("preview snapshot is required");
  if (!preview.requestId || !preview.proxy || !preview.source) {
    throw new TypeError("preview snapshot must include request lifecycle fields");
  }
  return {
    request: {
      requestId: preview.requestId,
      status: preview.status,
      source: preview.source,
      recipe: preview.recipe,
      viewport: preview.viewport,
      proxy: preview.proxy,
      createdAt: preview.createdAt,
      supersedesRequestId: preview.supersedesRequestId ?? null,
      cancelledAt: preview.cancelledAt,
      readyAt: preview.readyAt,
      supersededAt: preview.supersededAt,
      supersededByRequestId: preview.supersededByRequestId,
      note: preview.note,
      previewArtifact: preview.previewArtifact,
    },
    cacheStatus: preview.cacheStatus ?? null,
    cacheRecord: preview.cacheRecord ?? null,
  };
}

function hasRenderedCacheIssue(preview) {
  const status = preview?.cacheRecord?.renderedImage?.status ?? preview?.previewArtifact?.renderedImage?.status ?? null;
  return status === "missing" || status === "invalid" || status === "stale";
}

function summarizeReloadCounts(results = []) {
  return results.reduce((summary, result) => {
    summary.total += 1;
    const status = result?.preview?.status ?? null;
    const renderedCacheStatus = result?.preview?.cacheRecord?.renderedImage?.status ?? result?.preview?.previewArtifact?.renderedImage?.status ?? null;
    if (status === "queued") summary.queued += 1;
    if (status === "ready") summary.ready += 1;
    if (status === "cancelled") summary.cancelled += 1;
    if (status === "superseded") summary.superseded += 1;
    if (result?.repairedDuringReload) summary.repaired += 1;
    if (hasRenderedCacheIssue(result?.preview)) summary.withRenderedCacheIssue += 1;
    if (renderedCacheStatus === "missing") summary.withMissingRenderedCache += 1;
    if (renderedCacheStatus === "invalid") summary.withInvalidRenderedCache += 1;
    if (renderedCacheStatus === "stale") summary.withStaleRenderedCache += 1;
    return summary;
  }, {
    total: 0,
    queued: 0,
    ready: 0,
    cancelled: 0,
    superseded: 0,
    repaired: 0,
    withRenderedCacheIssue: 0,
    withMissingRenderedCache: 0,
    withInvalidRenderedCache: 0,
    withStaleRenderedCache: 0,
  });
}

function normalizeSessionIdFilter(ids, label) {
  if (ids == null) return null;
  if (!Array.isArray(ids)) throw new TypeError(`${label} must be an array when provided`);
  return ids.map((value) => {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} entries must be non-empty strings`);
    return value.trim();
  });
}

export function createPreviewSessionWorkflow({ previewWorkflow = createPreviewWorkflow(), sessionStore } = {}) {
  ensureSessionStore(sessionStore);

  return {
    previewWorkflow,

    async savePreview(sessionId, preview) {
      const session = await sessionStore.saveSession(sessionId, buildSessionPayload(preview));
      return {
        session,
        preview: previewWorkflow.restorePreview(session),
        summary: previewWorkflow.summarizePreview(session),
      };
    },

    async loadPreview(sessionId) {
      return sessionStore.getSession(sessionId);
    },

    async listPreviewSessionIds() {
      return sessionStore.listSessionIds();
    },

    async reloadPreviews({ repairReady = false, sessionIds = null } = {}) {
      const report = await this.reloadPreviewsReport({ repairReady, sessionIds });
      return report.previews.map(({ repairedDuringReload, ...result }) => result);
    },

    async repairReadyPreviews({ sessionIds = null } = {}) {
      return this.reloadPreviewsReport({ repairReady: true, sessionIds });
    },

    async reloadPreviewsReport({ repairReady = false, sessionIds = null } = {}) {
      const selectedSessionIds = normalizeSessionIdFilter(sessionIds, "sessionIds");
      const availableSessionIds = await sessionStore.listSessionIds();
      const targetSessionIds = selectedSessionIds ? selectedSessionIds.filter((sessionId) => availableSessionIds.includes(sessionId)) : availableSessionIds;
      const skippedSessionIds = selectedSessionIds ? selectedSessionIds.filter((sessionId) => !availableSessionIds.includes(sessionId)) : [];
      const previews = [];
      for (const sessionId of targetSessionIds) {
        const result = await this.reloadPreview(sessionId, { repairReady });
        if (result) previews.push(result);
      }
      const repairedSessionIds = previews.filter((result) => result.repairedDuringReload).map((result) => result.session.sessionId);
      const renderedCacheIssueSessionIds = previews.filter((result) => hasRenderedCacheIssue(result.preview)).map((result) => result.session.sessionId);
      const requestedSessionIds = selectedSessionIds ?? availableSessionIds;
      const counts = {
        ...summarizeReloadCounts(previews),
        requested: requestedSessionIds.length,
        processed: previews.length,
        skipped: skippedSessionIds.length,
      };
      return {
        counts,
        requestedSessionIds,
        skippedSessionIds,
        latestSessionIds: previews.map((result) => result.session.sessionId),
        repairedSessionIds,
        renderedCacheIssueSessionIds,
        latestRepairedSessionId: repairedSessionIds[0] ?? null,
        latestRenderedCacheIssueSessionId: renderedCacheIssueSessionIds[0] ?? null,
        latestSkippedSessionId: skippedSessionIds[0] ?? null,
        previews,
      };
    },

    async reloadPreview(sessionId, { repairReady = false } = {}) {
      const session = await sessionStore.getSession(sessionId);
      if (!session) return null;
      let preview = session.request?.status === "ready" ? previewWorkflow.refreshPreview(session) : previewWorkflow.restorePreview(session);
      let refreshedSession = session.request?.status === "ready"
        ? await sessionStore.saveSession(sessionId, buildSessionPayload(preview))
        : session;
      let repairedDuringReload = false;
      if (repairReady && preview.status === "ready" && hasRenderedCacheIssue(preview)) {
        preview = previewWorkflow.rerenderPreview(refreshedSession);
        refreshedSession = await sessionStore.saveSession(sessionId, buildSessionPayload(preview));
        repairedDuringReload = true;
      }
      return {
        session: refreshedSession,
        preview,
        summary: previewWorkflow.summarizePreview(preview),
        repairedDuringReload,
      };
    },


    async rerenderPreview(sessionId) {
      const session = await sessionStore.getSession(sessionId);
      if (!session) throw new Error(`no preview session stored for sessionId: ${sessionId}`);
      const preview = previewWorkflow.rerenderPreview(session);
      const updatedSession = await sessionStore.saveSession(sessionId, buildSessionPayload(preview));
      return {
        session: updatedSession,
        preview,
        summary: previewWorkflow.summarizePreview(preview),
      };
    },

    async summarizePreview(sessionId) {
      const session = await sessionStore.getSession(sessionId);
      return session ? previewWorkflow.summarizePreview(session) : null;
    },
  };
}
