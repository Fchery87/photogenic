import { test } from "node:test";
import assert from "node:assert/strict";
import { createPreviewDashboardFoundation } from "../src/preview/dashboard-foundation.js";

test("preview dashboard foundation summarizes deterministic preview session metadata", () => {
  const foundation = createPreviewDashboardFoundation();
  const sessions = [
    {
      sessionId: "preview-queued",
      request: {
        status: "queued",
        source: { imageId: "img-001" },
        proxy: { proxyKey: "proxy-queued" },
      },
      cacheStatus: "miss",
      updatedAt: "2025-07-21T00:00:00.000Z",
    },
    {
      sessionId: "preview-ready",
      request: {
        status: "ready",
        source: { imageId: "img-002" },
        proxy: { proxyKey: "proxy-ready" },
      },
      cacheStatus: "stored",
      updatedAt: "2025-07-21T00:00:01.000Z",
    },
    {
      sessionId: "preview-cancelled",
      request: {
        status: "cancelled",
        source: { imageId: "img-003" },
        proxy: { proxyKey: "proxy-cancelled" },
      },
      cacheStatus: "miss",
      updatedAt: "2025-07-21T00:00:02.000Z",
    },
    {
      sessionId: "preview-superseded",
      request: {
        status: "superseded",
        source: { imageId: "img-004" },
        proxy: { proxyKey: "proxy-superseded" },
      },
      cacheStatus: "hit",
      updatedAt: "2025-07-21T00:00:03.000Z",
    },
  ];

  const summary = foundation.summarizeSessions(sessions);

  assert.deepEqual(summary, {
    counts: {
      total: 4,
      queued: 1,
      ready: 1,
      cancelled: 1,
      superseded: 1,
      cacheHits: 1,
      cacheMisses: 2,
      cacheStored: 1,
      cacheIssues: 3,
      readyWithRenderedCachePresent: 0,
      readyWithRenderedCacheMissing: 1,
      readyWithRenderedCacheInvalid: 0,
      readyWithRenderedCacheStale: 0,
      readyWithRenderedCacheIssue: 1,
    },
    latestSessionIds: ["preview-superseded", "preview-cancelled", "preview-ready", "preview-queued"],
    latestReady: {
      sessionId: "preview-ready",
      imageId: "img-002",
      proxyKey: "proxy-ready",
      cacheStatus: "stored",
      renderedCache: {
        status: "missing",
        path: null,
        refreshedStatus: null,
        note: null,
      },
      updatedAt: "2025-07-21T00:00:01.000Z",
    },
    latestQueued: {
      sessionId: "preview-queued",
      imageId: "img-001",
      proxyKey: "proxy-queued",
      cacheStatus: "miss",
      renderedCache: null,
      updatedAt: "2025-07-21T00:00:00.000Z",
    },
    latestCancelled: {
      sessionId: "preview-cancelled",
      imageId: "img-003",
      proxyKey: "proxy-cancelled",
      cacheStatus: "miss",
      renderedCache: null,
      updatedAt: "2025-07-21T00:00:02.000Z",
    },
    latestSuperseded: {
      sessionId: "preview-superseded",
      imageId: "img-004",
      proxyKey: "proxy-superseded",
      cacheStatus: "hit",
      renderedCache: null,
      updatedAt: "2025-07-21T00:00:03.000Z",
    },
    latestCacheHit: {
      sessionId: "preview-superseded",
      imageId: "img-004",
      proxyKey: "proxy-superseded",
      cacheStatus: "hit",
      renderedCache: null,
      updatedAt: "2025-07-21T00:00:03.000Z",
    },
    latestCacheMiss: {
      sessionId: "preview-cancelled",
      imageId: "img-003",
      proxyKey: "proxy-cancelled",
      cacheStatus: "miss",
      renderedCache: null,
      updatedAt: "2025-07-21T00:00:02.000Z",
    },
    latestCacheStored: {
      sessionId: "preview-ready",
      imageId: "img-002",
      proxyKey: "proxy-ready",
      cacheStatus: "stored",
      renderedCache: {
        status: "missing",
        path: null,
        refreshedStatus: null,
        note: null,
      },
      updatedAt: "2025-07-21T00:00:01.000Z",
    },
    latestCacheIssue: {
      sessionId: "preview-cancelled",
      imageId: "img-003",
      proxyKey: "proxy-cancelled",
      cacheStatus: "miss",
      renderedCache: null,
      updatedAt: "2025-07-21T00:00:02.000Z",
    },
    latestRenderedCachePresent: null,
    latestRenderedCacheIssue: {
      sessionId: "preview-ready",
      imageId: "img-002",
      proxyKey: "proxy-ready",
      cacheStatus: "stored",
      renderedCache: {
        status: "missing",
        path: null,
        refreshedStatus: null,
        note: null,
      },
      updatedAt: "2025-07-21T00:00:01.000Z",
    },
    latestRenderedCacheMissing: {
      sessionId: "preview-ready",
      imageId: "img-002",
      proxyKey: "proxy-ready",
      cacheStatus: "stored",
      renderedCache: {
        status: "missing",
        path: null,
        refreshedStatus: null,
        note: null,
      },
      updatedAt: "2025-07-21T00:00:01.000Z",
    },
    latestRenderedCacheInvalid: null,
    latestRenderedCacheStale: null,
  });

  sessions[1].cacheStatus = "hit";
  assert.equal(summary.latestReady.cacheStatus, "stored");
});

test("preview dashboard foundation handles empty preview history", () => {
  const foundation = createPreviewDashboardFoundation();
  const summary = foundation.summarizeSessions();

  assert.deepEqual(summary, {
    counts: {
      total: 0,
      queued: 0,
      ready: 0,
      cancelled: 0,
      superseded: 0,
      cacheHits: 0,
      cacheMisses: 0,
      cacheStored: 0,
      cacheIssues: 0,
      readyWithRenderedCachePresent: 0,
      readyWithRenderedCacheMissing: 0,
      readyWithRenderedCacheInvalid: 0,
      readyWithRenderedCacheStale: 0,
      readyWithRenderedCacheIssue: 0,
    },
    latestSessionIds: [],
    latestReady: null,
    latestQueued: null,
    latestCancelled: null,
    latestSuperseded: null,
    latestCacheHit: null,
    latestCacheMiss: null,
    latestCacheStored: null,
    latestCacheIssue: null,
    latestRenderedCachePresent: null,
    latestRenderedCacheIssue: null,
    latestRenderedCacheMissing: null,
    latestRenderedCacheInvalid: null,
    latestRenderedCacheStale: null,
  });
});


test("preview dashboard foundation surfaces rendered cache presence for ready sessions", () => {
  const foundation = createPreviewDashboardFoundation();
  const summary = foundation.summarizeSessions([
    {
      sessionId: "preview-ready",
      request: {
        status: "ready",
        source: { imageId: "img-009" },
        proxy: { proxyKey: "proxy-ready" },
        previewArtifact: {
          cacheFilePath: "/cache/proxy-ready.png",
          renderedImage: {
            status: "rendered-image",
            note: "Deterministic software-rendered PNG bytes are present on disk.",
          },
        },
      },
      cacheStatus: "stored",
      cacheRecord: {
        filePath: "/cache/proxy-ready.png",
        renderedImage: {
          status: "rendered-image",
          note: "Deterministic software-rendered PNG bytes are present on disk.",
        },
      },
      updatedAt: "2025-07-21T00:00:09.000Z",
    },
  ]);

  assert.equal(summary.counts.readyWithRenderedCachePresent, 1);
  assert.equal(summary.latestCacheHit, null);
  assert.equal(summary.latestCacheMiss, null);
  assert.equal(summary.latestCacheStored.sessionId, "preview-ready");
  assert.equal(summary.latestCacheIssue, null);
  assert.equal(summary.latestRenderedCachePresent.sessionId, "preview-ready");
  assert.equal(summary.latestRenderedCacheIssue, null);
  assert.equal(summary.latestRenderedCacheMissing, null);
  assert.equal(summary.latestRenderedCacheInvalid, null);
  assert.equal(summary.latestRenderedCacheStale, null);
  assert.deepEqual(summary.latestReady.renderedCache, {
    status: "present",
    path: "/cache/proxy-ready.png",
    refreshedStatus: "rendered-image",
    note: "Deterministic software-rendered PNG bytes are present on disk.",
  });
});


test("preview dashboard foundation surfaces invalid rendered cache state for ready sessions", () => {
  const foundation = createPreviewDashboardFoundation();
  const summary = foundation.summarizeSessions([
    {
      sessionId: "preview-invalid",
      request: {
        status: "ready",
        source: { imageId: "img-011" },
        proxy: { proxyKey: "proxy-invalid" },
        previewArtifact: {
          cacheFilePath: "/cache/proxy-invalid.png",
          renderedImage: {
            status: "invalid",
            note: "Preview cache file is present but is not a valid PNG.",
          },
        },
      },
      cacheStatus: "stored",
      cacheRecord: {
        filePath: "/cache/proxy-invalid.png",
        renderedImage: {
          status: "invalid",
          note: "Preview cache file is present but is not a valid PNG.",
        },
      },
      updatedAt: "2025-07-21T00:00:10.000Z",
    },
  ]);

  assert.equal(summary.counts.readyWithRenderedCachePresent, 0);
  assert.equal(summary.counts.readyWithRenderedCacheMissing, 0);
  assert.equal(summary.counts.readyWithRenderedCacheInvalid, 1);
  assert.equal(summary.counts.readyWithRenderedCacheStale, 0);
  assert.equal(summary.latestCacheHit, null);
  assert.equal(summary.latestCacheMiss, null);
  assert.equal(summary.latestCacheStored.sessionId, "preview-invalid");
  assert.equal(summary.latestCacheIssue.sessionId, "preview-invalid");
  assert.equal(summary.latestRenderedCachePresent, null);
  assert.equal(summary.latestRenderedCacheIssue.sessionId, "preview-invalid");
  assert.equal(summary.latestRenderedCacheMissing, null);
  assert.equal(summary.latestRenderedCacheInvalid.sessionId, "preview-invalid");
  assert.equal(summary.latestRenderedCacheStale, null);
  assert.deepEqual(summary.latestReady.renderedCache, {
    status: "invalid",
    path: "/cache/proxy-invalid.png",
    refreshedStatus: "invalid",
    note: "Preview cache file is present but is not a valid PNG.",
  });
});


test("preview dashboard foundation surfaces stale rendered cache state for ready sessions", () => {
  const foundation = createPreviewDashboardFoundation();
  const summary = foundation.summarizeSessions([
    {
      sessionId: "preview-stale",
      request: {
        status: "ready",
        source: { imageId: "img-015" },
        proxy: { proxyKey: "proxy-stale" },
        previewArtifact: {
          cacheFilePath: "/cache/proxy-stale.png",
          renderedImage: {
            status: "stale",
            note: "Preview cache PNG is present but no longer matches the expected deterministic render output for this request.",
          },
        },
      },
      cacheStatus: "stored",
      cacheRecord: {
        filePath: "/cache/proxy-stale.png",
        renderedImage: {
          status: "stale",
          note: "Preview cache PNG is present but no longer matches the expected deterministic render output for this request.",
        },
      },
      updatedAt: "2025-07-21T00:00:11.000Z",
    },
  ]);

  assert.equal(summary.counts.readyWithRenderedCachePresent, 0);
  assert.equal(summary.counts.readyWithRenderedCacheMissing, 0);
  assert.equal(summary.counts.readyWithRenderedCacheInvalid, 0);
  assert.equal(summary.counts.readyWithRenderedCacheStale, 1);
  assert.equal(summary.counts.readyWithRenderedCacheIssue, 1);
  assert.equal(summary.counts.cacheIssues, 1);
  assert.equal(summary.latestCacheStored.sessionId, "preview-stale");
  assert.equal(summary.latestCacheIssue.sessionId, "preview-stale");
  assert.equal(summary.latestRenderedCacheIssue.sessionId, "preview-stale");
  assert.equal(summary.latestRenderedCacheMissing, null);
  assert.equal(summary.latestRenderedCacheInvalid, null);
  assert.equal(summary.latestRenderedCacheStale.sessionId, "preview-stale");
  assert.deepEqual(summary.latestReady.renderedCache, {
    status: "stale",
    path: "/cache/proxy-stale.png",
    refreshedStatus: "stale",
    note: "Preview cache PNG is present but no longer matches the expected deterministic render output for this request.",
  });
});
