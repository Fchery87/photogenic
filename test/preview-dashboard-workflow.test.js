import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createPreviewWorkflow } from "../src/preview/workflow.js";
import { createPreviewSessionStore } from "../src/preview/session-store.js";
import { createPreviewSessionWorkflow } from "../src/preview/session-workflow.js";
import { createPreviewDashboardWorkflow } from "../src/preview/dashboard-workflow.js";

function buildSource(id = "img-001") {
  return {
    imageId: id,
    path: `/shoots/day1/${id}.CR3`,
    width: 6000,
    height: 4000,
    revision: "raw-v1",
    colorSpace: "scene-linear",
  };
}

async function makeHarness() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-dashboard-"));
  let tick = 0;
  const sessionStore = await createPreviewSessionStore({
    path: path.join(dir, "preview-sessions.json"),
    clock: () => `2025-07-21T00:00:0${Math.min(tick++, 9)}.000Z`,
  });
  const previewWorkflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const sessionWorkflow = createPreviewSessionWorkflow({ sessionStore, previewWorkflow });

  const queued = previewWorkflow.requestPreview({
    source: buildSource("img-001"),
    recipe: createRecipe(),
    viewport: { width: 1200, height: 800 },
  });
  await sessionWorkflow.savePreview("preview-queued", queued);

  const ready = previewWorkflow.fulfillPreview(
    previewWorkflow.requestPreview({
      source: buildSource("img-002"),
      recipe: createRecipe({ operations: [{ type: "contrast", params: { amount: 12 } }] }),
      viewport: { width: 1440, height: 900 },
    }),
  );
  await sessionWorkflow.savePreview("preview-ready", ready);

  const cancelled = previewWorkflow.cancelPreview(
    previewWorkflow.requestPreview({
      source: buildSource("img-003"),
      recipe: createRecipe(),
      viewport: { width: 1000, height: 700 },
    }),
    "User navigated away.",
  );
  await sessionWorkflow.savePreview("preview-cancelled", { ...cancelled, cacheStatus: "miss", cacheRecord: null });

  return createPreviewDashboardWorkflow({ sessionStore });
}

test("preview dashboard workflow summarizes saved preview session states", async () => {
  const workflow = await makeHarness();
  const summary = await workflow.summarizeSessions();

  assert.deepEqual(summary.counts, {
    total: 3,
    queued: 1,
    ready: 1,
    cancelled: 1,
    superseded: 0,
    cacheHits: 0,
    cacheMisses: 2,
    cacheStored: 1,
    cacheIssues: 2,
    readyWithRenderedCachePresent: 1,
    readyWithRenderedCacheMissing: 0,
    readyWithRenderedCacheInvalid: 0,
    readyWithRenderedCacheStale: 0,
    readyWithRenderedCacheIssue: 0,
  });
  assert.deepEqual(summary.latestSessionIds, ["preview-cancelled", "preview-ready", "preview-queued"]);
  assert.equal(summary.latestReady.sessionId, "preview-ready");
  assert.equal(summary.latestReady.imageId, "img-002");
  assert.equal(summary.latestReady.cacheStatus, "stored");
  assert.equal(summary.latestReady.renderedCache.status, "present");
  assert.equal(summary.latestQueued.sessionId, "preview-queued");
  assert.equal(summary.latestQueued.imageId, "img-001");
  assert.equal(summary.latestQueued.renderedCache, null);
  assert.equal(summary.latestCancelled.sessionId, "preview-cancelled");
  assert.equal(summary.latestSuperseded, null);
  assert.equal(summary.latestCacheHit, null);
  assert.equal(summary.latestCacheMiss.sessionId, "preview-cancelled");
  assert.equal(summary.latestCacheStored.sessionId, "preview-ready");
  assert.equal(summary.latestCacheIssue.sessionId, "preview-cancelled");
  assert.equal(summary.latestRenderedCachePresent.sessionId, "preview-ready");
  assert.equal(summary.latestRenderedCacheIssue, null);
  assert.equal(summary.latestRenderedCacheMissing, null);
  assert.equal(summary.latestRenderedCacheInvalid, null);
  assert.equal(summary.latestRenderedCacheStale, null);
});

test("preview dashboard workflow handles an empty preview history", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-dashboard-empty-"));
  const sessionStore = await createPreviewSessionStore({
    path: path.join(dir, "preview-sessions.json"),
    clock: () => "2025-07-21T00:00:00.000Z",
  });
  const workflow = createPreviewDashboardWorkflow({ sessionStore });
  const summary = await workflow.summarizeSessions();

  assert.deepEqual(summary.counts, {
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
  });
  assert.deepEqual(summary.latestSessionIds, []);
  assert.equal(summary.latestReady, null);
  assert.equal(summary.latestQueued, null);
  assert.equal(summary.latestCancelled, null);
  assert.equal(summary.latestSuperseded, null);
  assert.equal(summary.latestCacheHit, null);
  assert.equal(summary.latestCacheMiss, null);
  assert.equal(summary.latestCacheStored, null);
  assert.equal(summary.latestCacheIssue, null);
  assert.equal(summary.latestRenderedCachePresent, null);
  assert.equal(summary.latestRenderedCacheIssue, null);
  assert.equal(summary.latestRenderedCacheMissing, null);
  assert.equal(summary.latestRenderedCacheInvalid, null);
});

test("preview dashboard workflow delegates summary shaping to the dashboard foundation", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-dashboard-delegation-"));
  const sessionStore = await createPreviewSessionStore({
    path: path.join(dir, "preview-sessions.json"),
    clock: () => "2025-07-21T00:00:00.000Z",
  });
  await sessionStore.saveSession("preview-1", {
    request: {
      requestId: "preview-1",
      status: "queued",
      source: buildSource("img-001"),
      recipe: createRecipe(),
      viewport: { width: 1200, height: 800 },
      proxy: { proxyKey: "proxy-1" },
      createdAt: "2025-07-21T00:00:00.000Z",
    },
    cacheStatus: "miss",
    cacheRecord: null,
  });

  const calls = [];
  const dashboardFoundation = {
    summarizeSessions(sessions) {
      calls.push(sessions);
      return { counts: { total: sessions.length }, latestSessionIds: ["delegated"], latestReady: null, latestQueued: null, latestCancelled: null, latestSuperseded: null, latestCacheHit: null, latestCacheMiss: null, latestCacheStored: null, latestCacheIssue: null, latestRenderedCachePresent: null, latestRenderedCacheIssue: null, latestRenderedCacheMissing: null, latestRenderedCacheInvalid: null, latestRenderedCacheStale: null };
    },
  };

  const workflow = createPreviewDashboardWorkflow({ sessionStore, dashboardFoundation });
  const summary = await workflow.summarizeSessions();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].sessionId, "preview-1");
  assert.deepEqual(summary, {
    counts: { total: 1 },
    latestSessionIds: ["delegated"],
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


test("preview dashboard workflow reflects refreshed missing rendered cache state after reload", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-dashboard-refresh-"));
  const sessionStore = await createPreviewSessionStore({
    path: path.join(dir, "preview-sessions.json"),
    clock: () => "2025-07-21T00:00:00.000Z",
  });
  const previewWorkflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const sessionWorkflow = createPreviewSessionWorkflow({ sessionStore, previewWorkflow });
  const ready = previewWorkflow.fulfillPreview(previewWorkflow.requestPreview({
    source: buildSource("img-010"),
    recipe: createRecipe(),
    viewport: { width: 1200, height: 800 },
  }));
  await sessionWorkflow.savePreview("preview-ready", ready);
  await (await import("node:fs/promises")).unlink(path.join(dir, `${ready.proxy.proxyKey}.png`));
  await sessionWorkflow.reloadPreview("preview-ready");

  const workflow = createPreviewDashboardWorkflow({ sessionStore });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.readyWithRenderedCachePresent, 0);
  assert.equal(summary.counts.readyWithRenderedCacheMissing, 1);
  assert.equal(summary.counts.readyWithRenderedCacheIssue, 1);
  assert.equal(summary.counts.cacheIssues, 1);
  assert.equal(summary.latestReady.renderedCache.status, "missing");
  assert.equal(summary.latestCancelled, null);
  assert.equal(summary.latestSuperseded, null);
  assert.equal(summary.latestCacheHit, null);
  assert.equal(summary.latestCacheMiss, null);
  assert.equal(summary.latestCacheStored.sessionId, "preview-ready");
  assert.equal(summary.latestCacheIssue.sessionId, "preview-ready");
  assert.equal(summary.latestRenderedCachePresent, null);
  assert.equal(summary.latestRenderedCacheIssue.sessionId, "preview-ready");
  assert.equal(summary.latestRenderedCacheMissing.sessionId, "preview-ready");
  assert.equal(summary.latestRenderedCacheInvalid, null);
});


test("preview dashboard workflow reflects refreshed invalid rendered cache state after reload", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-dashboard-invalid-"));
  const sessionStore = await createPreviewSessionStore({
    path: path.join(dir, "preview-sessions.json"),
    clock: () => "2025-07-21T00:00:00.000Z",
  });
  const previewWorkflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const sessionWorkflow = createPreviewSessionWorkflow({ sessionStore, previewWorkflow });
  const ready = previewWorkflow.fulfillPreview(previewWorkflow.requestPreview({
    source: buildSource("img-012"),
    recipe: createRecipe(),
    viewport: { width: 1200, height: 800 },
  }));
  await sessionWorkflow.savePreview("preview-invalid", ready);
  await (await import("node:fs/promises")).writeFile(path.join(dir, `${ready.proxy.proxyKey}.png`), "not-a-png\n", "utf8");
  await sessionWorkflow.reloadPreview("preview-invalid");

  const workflow = createPreviewDashboardWorkflow({ sessionStore });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.readyWithRenderedCachePresent, 0);
  assert.equal(summary.counts.readyWithRenderedCacheMissing, 0);
  assert.equal(summary.counts.readyWithRenderedCacheInvalid, 1);
  assert.equal(summary.counts.readyWithRenderedCacheStale, 0);
  assert.equal(summary.counts.readyWithRenderedCacheIssue, 1);
  assert.equal(summary.counts.cacheIssues, 1);
  assert.equal(summary.latestReady.renderedCache.status, "invalid");
  assert.equal(summary.latestCancelled, null);
  assert.equal(summary.latestSuperseded, null);
  assert.equal(summary.latestCacheHit, null);
  assert.equal(summary.latestCacheMiss, null);
  assert.equal(summary.latestCacheStored.sessionId, "preview-invalid");
  assert.equal(summary.latestCacheIssue.sessionId, "preview-invalid");
  assert.equal(summary.latestRenderedCachePresent, null);
  assert.equal(summary.latestRenderedCacheIssue.sessionId, "preview-invalid");
  assert.equal(summary.latestRenderedCacheMissing, null);
  assert.equal(summary.latestRenderedCacheInvalid.sessionId, "preview-invalid");
  assert.equal(summary.latestRenderedCacheStale, null);
});


test("preview dashboard workflow returns to present rendered cache state after rerender repair", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-dashboard-rerender-"));
  const sessionStore = await createPreviewSessionStore({
    path: path.join(dir, "preview-sessions.json"),
    clock: () => "2025-07-21T00:00:00.000Z",
  });
  const previewWorkflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const sessionWorkflow = createPreviewSessionWorkflow({ sessionStore, previewWorkflow });
  const ready = previewWorkflow.fulfillPreview(previewWorkflow.requestPreview({
    source: buildSource("img-013"),
    recipe: createRecipe(),
    viewport: { width: 1200, height: 800 },
  }));
  await sessionWorkflow.savePreview("preview-rerender", ready);
  await (await import("node:fs/promises")).writeFile(path.join(dir, `${ready.proxy.proxyKey}.png`), `not-a-png
`, "utf8");
  await sessionWorkflow.reloadPreview("preview-rerender");
  await sessionWorkflow.rerenderPreview("preview-rerender");

  const workflow = createPreviewDashboardWorkflow({ sessionStore });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.readyWithRenderedCachePresent, 1);
  assert.equal(summary.counts.readyWithRenderedCacheInvalid, 0);
  assert.equal(summary.counts.readyWithRenderedCacheStale, 0);
  assert.equal(summary.counts.readyWithRenderedCacheIssue, 0);
  assert.equal(summary.counts.cacheIssues, 0);
  assert.equal(summary.latestReady.renderedCache.status, "present");
  assert.equal(summary.latestCancelled, null);
  assert.equal(summary.latestSuperseded, null);
  assert.equal(summary.latestCacheHit, null);
  assert.equal(summary.latestCacheMiss, null);
  assert.equal(summary.latestCacheStored.sessionId, "preview-rerender");
  assert.equal(summary.latestCacheIssue, null);
  assert.equal(summary.latestRenderedCachePresent.sessionId, "preview-rerender");
  assert.equal(summary.latestRenderedCacheIssue, null);
  assert.equal(summary.latestRenderedCacheMissing, null);
  assert.equal(summary.latestRenderedCacheInvalid, null);
});


test("preview dashboard workflow reflects refreshed stale rendered cache state after reload", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-dashboard-stale-"));
  const sessionStore = await createPreviewSessionStore({
    path: path.join(dir, "preview-sessions.json"),
    clock: () => "2025-07-21T00:00:00.000Z",
  });
  const previewWorkflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const sessionWorkflow = createPreviewSessionWorkflow({ sessionStore, previewWorkflow });
  const request = previewWorkflow.requestPreview({
    source: buildSource("img-014"),
    recipe: createRecipe(),
    viewport: { width: 1200, height: 800 },
  });
  const ready = previewWorkflow.fulfillPreview(request);
  await sessionWorkflow.savePreview("preview-stale", ready);
  const mismatchWorkflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `mismatch-${descriptor.proxyKey}.png`),
  });
  const mismatchReady = mismatchWorkflow.fulfillPreview({
    ...request,
    status: "queued",
    viewport: { width: 1000, height: 700 },
  });
  await (await import("node:fs/promises")).writeFile(path.join(dir, `${ready.proxy.proxyKey}.png`), await (await import("node:fs/promises")).readFile(mismatchReady.cacheRecord.filePath));
  await sessionWorkflow.reloadPreview("preview-stale");

  const workflow = createPreviewDashboardWorkflow({ sessionStore });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.readyWithRenderedCachePresent, 0);
  assert.equal(summary.counts.readyWithRenderedCacheMissing, 0);
  assert.equal(summary.counts.readyWithRenderedCacheInvalid, 0);
  assert.equal(summary.counts.readyWithRenderedCacheStale, 1);
  assert.equal(summary.counts.readyWithRenderedCacheIssue, 1);
  assert.equal(summary.counts.cacheIssues, 1);
  assert.equal(summary.latestReady.renderedCache.status, "stale");
  assert.equal(summary.latestCacheStored.sessionId, "preview-stale");
  assert.equal(summary.latestCacheIssue.sessionId, "preview-stale");
  assert.equal(summary.latestRenderedCachePresent, null);
  assert.equal(summary.latestRenderedCacheIssue.sessionId, "preview-stale");
  assert.equal(summary.latestRenderedCacheMissing, null);
  assert.equal(summary.latestRenderedCacheInvalid, null);
  assert.equal(summary.latestRenderedCacheStale.sessionId, "preview-stale");
});


test("preview dashboard workflow returns to present rendered cache state after reload-time auto-repair", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-dashboard-auto-repair-"));
  const sessionStore = await createPreviewSessionStore({
    path: path.join(dir, "preview-sessions.json"),
    clock: () => "2025-07-21T00:00:00.000Z",
  });
  const previewWorkflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const sessionWorkflow = createPreviewSessionWorkflow({ sessionStore, previewWorkflow });
  const ready = previewWorkflow.fulfillPreview(previewWorkflow.requestPreview({
    source: buildSource("img-016"),
    recipe: createRecipe(),
    viewport: { width: 1200, height: 800 },
  }));
  await sessionWorkflow.savePreview("preview-auto-repair", ready);
  await (await import("node:fs/promises")).writeFile(path.join(dir, `${ready.proxy.proxyKey}.png`), "not-a-png\n", "utf8");
  await sessionWorkflow.reloadPreview("preview-auto-repair", { repairReady: true });

  const workflow = createPreviewDashboardWorkflow({ sessionStore });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.readyWithRenderedCachePresent, 1);
  assert.equal(summary.counts.readyWithRenderedCacheInvalid, 0);
  assert.equal(summary.counts.readyWithRenderedCacheStale, 0);
  assert.equal(summary.counts.readyWithRenderedCacheIssue, 0);
  assert.equal(summary.counts.cacheIssues, 0);
  assert.equal(summary.latestReady.renderedCache.status, "present");
  assert.equal(summary.latestRenderedCachePresent.sessionId, "preview-auto-repair");
  assert.equal(summary.latestRenderedCacheIssue, null);
  assert.equal(summary.latestRenderedCacheInvalid, null);
  assert.equal(summary.latestRenderedCacheStale, null);
});


test("preview dashboard workflow reloadPreviewsSummary returns reload report plus refreshed summary", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-dashboard-reload-summary-"));
  const sessionStore = await createPreviewSessionStore({
    path: path.join(dir, "preview-sessions.json"),
    clock: () => "2025-07-22T00:00:00.000Z",
  });
  const previewWorkflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const sessionWorkflow = createPreviewSessionWorkflow({ sessionStore, previewWorkflow });
  const ready = previewWorkflow.fulfillPreview(previewWorkflow.requestPreview({
    source: buildSource("img-030"),
    recipe: createRecipe(),
    viewport: { width: 1200, height: 800 },
  }));
  await sessionWorkflow.savePreview("preview-known", ready);
  await (await import("node:fs/promises")).unlink(path.join(dir, `${ready.proxy.proxyKey}.png`));

  const workflow = createPreviewDashboardWorkflow({ sessionStore, sessionWorkflow });
  const result = await workflow.reloadPreviewsSummary({ sessionIds: ["preview-known", "preview-missing"] });

  assert.deepEqual(result.operation, {
    kind: "reload-previews",
    repairReady: false,
    requestedSessionIds: ["preview-known", "preview-missing"],
    processedSessionIds: ["preview-known"],
    skippedSessionIds: ["preview-missing"],
  });
  assert.deepEqual(result.report.requestedSessionIds, ["preview-known", "preview-missing"]);
  assert.deepEqual(result.report.skippedSessionIds, ["preview-missing"]);
  assert.equal(result.report.counts.requested, 2);
  assert.equal(result.report.counts.processed, 1);
  assert.equal(result.report.counts.skipped, 1);
  assert.equal(result.summary.counts.readyWithRenderedCacheMissing, 1);
  assert.equal(result.summary.counts.readyWithRenderedCacheIssue, 1);
  assert.equal(result.summary.latestRenderedCacheMissing.sessionId, "preview-known");
});

test("preview dashboard workflow repairReadyPreviewsSummary returns repair report plus healed summary", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-dashboard-repair-summary-"));
  const sessionStore = await createPreviewSessionStore({
    path: path.join(dir, "preview-sessions.json"),
    clock: () => "2025-07-23T00:00:00.000Z",
  });
  const previewWorkflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const sessionWorkflow = createPreviewSessionWorkflow({ sessionStore, previewWorkflow });
  const ready = previewWorkflow.fulfillPreview(previewWorkflow.requestPreview({
    source: buildSource("img-031"),
    recipe: createRecipe(),
    viewport: { width: 1200, height: 800 },
  }));
  await sessionWorkflow.savePreview("preview-known", ready);
  await (await import("node:fs/promises")).unlink(path.join(dir, `${ready.proxy.proxyKey}.png`));

  const workflow = createPreviewDashboardWorkflow({ sessionStore, sessionWorkflow });
  const result = await workflow.repairReadyPreviewsSummary({ sessionIds: ["preview-known"] });

  assert.deepEqual(result.operation, {
    kind: "repair-ready-previews",
    repairReady: true,
    requestedSessionIds: ["preview-known"],
    processedSessionIds: ["preview-known"],
    skippedSessionIds: [],
  });
  assert.deepEqual(result.report.repairedSessionIds, ["preview-known"]);
  assert.equal(result.report.counts.repaired, 1);
  assert.equal(result.summary.counts.readyWithRenderedCachePresent, 1);
  assert.equal(result.summary.counts.readyWithRenderedCacheIssue, 0);
  assert.equal(result.summary.latestRenderedCachePresent.sessionId, "preview-known");
});


test("preview dashboard workflow reload/repair summary helpers require a session workflow", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-dashboard-reload-errors-"));
  const sessionStore = await createPreviewSessionStore({
    path: path.join(dir, "preview-sessions.json"),
    clock: () => "2025-07-24T00:00:00.000Z",
  });
  const workflow = createPreviewDashboardWorkflow({ sessionStore });

  await assert.rejects(() => workflow.reloadPreviewsSummary(), /sessionWorkflow with reloadPreviewsReport\(\) is required/);
  await assert.rejects(() => workflow.repairReadyPreviewsSummary(), /sessionWorkflow with reloadPreviewsReport\(\) is required/);
});
