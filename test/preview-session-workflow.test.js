import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createPreviewSessionStore } from "../src/preview/session-store.js";
import { createPreviewSessionWorkflow } from "../src/preview/session-workflow.js";
import { createPreviewWorkflow } from "../src/preview/workflow.js";

function buildSource() {
  return {
    imageId: "img-001",
    path: "/shoots/day1/hero-image.CR3",
    width: 6000,
    height: 4000,
    revision: "raw-v1",
    colorSpace: "scene-linear",
  };
}

function buildRecipe() {
  return createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] });
}

async function makeHarness() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-session-workflow-"));
  const clockValues = [
    "2025-07-15T00:00:00.000Z",
    "2025-07-15T00:00:01.000Z",
    "2025-07-15T00:00:02.000Z",
    "2025-07-15T00:00:03.000Z",
  ];
  let index = 0;
  const storePath = path.join(dir, "preview-sessions.json");
  const sessionStore = await createPreviewSessionStore({
    path: storePath,
    clock: () => clockValues[index++] ?? clockValues.at(-1),
  });
  const previewWorkflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const workflow = createPreviewSessionWorkflow({ sessionStore, previewWorkflow });
  return { dir, storePath, workflow };
}

test("preview session workflow saves and summarizes preview state snapshots", async () => {
  const { dir, workflow } = await makeHarness();
  const queued = workflow.previewWorkflow.requestPreview({
    source: buildSource(),
    recipe: buildRecipe(),
    viewport: { width: 1200, height: 800 },
  });
  const ready = workflow.previewWorkflow.fulfillPreview(queued);

  const saved = await workflow.savePreview("preview-hero", ready);

  assert.equal(saved.session.request.status, "ready");
  assert.equal(saved.preview.cacheStatus, "stored");
  assert.equal(saved.summary.cacheStatus, "stored");
  assert.equal(saved.summary.cacheFilePath, path.join(dir, `${ready.proxy.proxyKey}.png`));
  assert.equal(saved.summary.operationCount, 1);
});

test("preview session workflow reloads saved cache state into a fresh preview workflow", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = workflow.previewWorkflow.requestPreview({
    source: buildSource(),
    recipe: buildRecipe(),
    viewport: { width: 1440, height: 900 },
  });
  const ready = workflow.previewWorkflow.fulfillPreview(queued);
  await workflow.savePreview("preview-hero", ready);

  const reloadedStore = await createPreviewSessionStore({
    path: storePath,
    clock: () => "2025-07-15T00:00:04.000Z",
  });
  const reloadedWorkflow = createPreviewSessionWorkflow({
    sessionStore: reloadedStore,
    previewWorkflow: createPreviewWorkflow({
      cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
    }),
  });

  const restored = await reloadedWorkflow.reloadPreview("preview-hero");
  assert.equal(restored.preview.status, "ready");
  assert.equal(restored.preview.cacheStatus, "stored");
  assert.equal(restored.preview.cacheRecord.filePath, path.join(dir, `${ready.proxy.proxyKey}.png`));
  assert.equal(restored.summary.proxyKey, ready.proxy.proxyKey);

  const cached = reloadedWorkflow.previewWorkflow.requestPreview({
    source: buildSource(),
    recipe: buildRecipe(),
    viewport: { width: 1440, height: 900 },
  });

  assert.equal(cached.status, "ready");
  assert.equal(cached.cacheStatus, "hit");
  assert.equal(cached.cacheRecord.filePath, path.join(dir, `${ready.proxy.proxyKey}.png`));
});


test("preview session workflow refreshes ready cache metadata and surfaces missing rendered png files on reload", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = workflow.previewWorkflow.requestPreview({
    source: buildSource(),
    recipe: buildRecipe(),
    viewport: { width: 1200, height: 800 },
  });
  const ready = workflow.previewWorkflow.fulfillPreview(queued);
  await workflow.savePreview("preview-refresh", ready);

  await (await import("node:fs/promises")).unlink(path.join(dir, `${ready.proxy.proxyKey}.png`));

  const reloadedStore = await createPreviewSessionStore({
    path: storePath,
    clock: () => "2025-07-15T00:00:04.000Z",
  });
  const reloadedWorkflow = createPreviewSessionWorkflow({
    sessionStore: reloadedStore,
    previewWorkflow: createPreviewWorkflow({
      cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
    }),
  });

  const restored = await reloadedWorkflow.reloadPreview("preview-refresh");
  assert.equal(restored.preview.cacheRecord.renderedImage.status, "missing");
  assert.equal(restored.preview.previewArtifact.renderedImage.status, "missing");
  assert.match(restored.preview.cacheRecord.renderedImage.note, /expected rendered preview png cache output is missing on disk/i);
  assert.equal(restored.session.cacheRecord.renderedImage.status, "missing");
});




test("preview session workflow surfaces stale but parseable rendered png files on reload", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = workflow.previewWorkflow.requestPreview({
    source: buildSource(),
    recipe: buildRecipe(),
    viewport: { width: 1200, height: 800 },
  });
  const ready = workflow.previewWorkflow.fulfillPreview(queued);
  await workflow.savePreview("preview-stale", ready);

  const mismatched = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `mismatch-${descriptor.proxyKey}.png`),
  }).fulfillPreview({
    ...queued,
    status: "queued",
    viewport: { width: 1000, height: 700 },
  });
  await (await import("node:fs/promises")).writeFile(path.join(dir, `${ready.proxy.proxyKey}.png`), await (await import("node:fs/promises")).readFile(mismatched.cacheRecord.filePath));

  const reloadedStore = await createPreviewSessionStore({
    path: storePath,
    clock: () => "2025-07-15T00:00:04.000Z",
  });
  const reloadedWorkflow = createPreviewSessionWorkflow({
    sessionStore: reloadedStore,
    previewWorkflow: createPreviewWorkflow({
      cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
    }),
  });

  const restored = await reloadedWorkflow.reloadPreview("preview-stale");
  assert.equal(restored.preview.cacheRecord.renderedImage.status, "stale");
  assert.equal(restored.preview.previewArtifact.renderedImage.status, "stale");
  assert.match(restored.preview.cacheRecord.renderedImage.note, /no longer matches the expected deterministic render output/i);
  assert.equal(restored.session.cacheRecord.renderedImage.status, "stale");
});

test("preview session workflow surfaces invalid rendered png files on reload", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = workflow.previewWorkflow.requestPreview({
    source: buildSource(),
    recipe: buildRecipe(),
    viewport: { width: 1200, height: 800 },
  });
  const ready = workflow.previewWorkflow.fulfillPreview(queued);
  await workflow.savePreview("preview-invalid", ready);

  await (await import("node:fs/promises")).writeFile(path.join(dir, `${ready.proxy.proxyKey}.png`), "not-a-png\n", "utf8");

  const reloadedStore = await createPreviewSessionStore({
    path: storePath,
    clock: () => "2025-07-15T00:00:04.000Z",
  });
  const reloadedWorkflow = createPreviewSessionWorkflow({
    sessionStore: reloadedStore,
    previewWorkflow: createPreviewWorkflow({
      cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
    }),
  });

  const restored = await reloadedWorkflow.reloadPreview("preview-invalid");
  assert.equal(restored.preview.cacheRecord.renderedImage.status, "invalid");
  assert.equal(restored.preview.previewArtifact.renderedImage.status, "invalid");
  assert.match(restored.preview.cacheRecord.renderedImage.note, /not a valid png/i);
  assert.equal(restored.session.cacheRecord.renderedImage.status, "invalid");
});


test("preview session workflow rerenderPreview repairs broken ready preview caches and persists healthy metadata", async () => {
  const { dir, workflow } = await makeHarness();
  const queued = workflow.previewWorkflow.requestPreview({
    source: buildSource(),
    recipe: buildRecipe(),
    viewport: { width: 1200, height: 800 },
  });
  const ready = workflow.previewWorkflow.fulfillPreview(queued);
  await workflow.savePreview("preview-rerender", ready);
  await (await import("node:fs/promises")).writeFile(path.join(dir, `${ready.proxy.proxyKey}.png`), `not-a-png
`, "utf8");
  await workflow.reloadPreview("preview-rerender");

  const repaired = await workflow.rerenderPreview("preview-rerender");
  assert.equal(repaired.preview.cacheRecord.renderedImage.status, "rendered-image");
  assert.equal(repaired.preview.previewArtifact.renderedImage.status, "rendered-image");
  assert.equal(repaired.session.cacheRecord.renderedImage.status, "rendered-image");
  assert.equal((await workflow.loadPreview("preview-rerender")).cacheRecord.renderedImage.status, "rendered-image");
});


test("preview session workflow can repair broken ready caches during reload", async () => {
  const { dir, workflow } = await makeHarness();
  const queued = workflow.previewWorkflow.requestPreview({
    source: buildSource(),
    recipe: buildRecipe(),
    viewport: { width: 1200, height: 800 },
  });
  const ready = workflow.previewWorkflow.fulfillPreview(queued);
  await workflow.savePreview("preview-auto-repair", ready);

  await (await import("node:fs/promises")).writeFile(path.join(dir, `${ready.proxy.proxyKey}.png`), "not-a-png\n", "utf8");

  const repaired = await workflow.reloadPreview("preview-auto-repair", { repairReady: true });
  assert.equal(repaired.preview.status, "ready");
  assert.equal(repaired.preview.cacheRecord.renderedImage.status, "rendered-image");
  assert.equal(repaired.preview.previewArtifact.renderedImage.status, "rendered-image");
  assert.equal(repaired.session.cacheRecord.renderedImage.status, "rendered-image");
  assert.equal((await workflow.loadPreview("preview-auto-repair")).cacheRecord.renderedImage.status, "rendered-image");
});


test("preview session workflow can reload and auto-repair all saved previews", async () => {
  const { dir, workflow } = await makeHarness();

  const firstReady = workflow.previewWorkflow.fulfillPreview(workflow.previewWorkflow.requestPreview({
    source: buildSource(),
    recipe: buildRecipe(),
    viewport: { width: 1200, height: 800 },
  }));
  await workflow.savePreview("preview-a", firstReady);

  const secondReady = workflow.previewWorkflow.fulfillPreview(workflow.previewWorkflow.requestPreview({
    source: { ...buildSource(), imageId: "img-002", path: "/shoots/day1/alt-image.CR3" },
    recipe: buildRecipe(),
    viewport: { width: 1000, height: 700 },
  }));
  await workflow.savePreview("preview-b", secondReady);

  await (await import("node:fs/promises")).writeFile(path.join(dir, `${firstReady.proxy.proxyKey}.png`), "not-a-png\n", "utf8");
  await (await import("node:fs/promises")).unlink(path.join(dir, `${secondReady.proxy.proxyKey}.png`));

  const restored = await workflow.reloadPreviews({ repairReady: true });
  assert.equal(restored.length, 2);
  assert.equal(restored[0].preview.cacheRecord.renderedImage.status, "rendered-image");
  assert.equal(restored[1].preview.cacheRecord.renderedImage.status, "rendered-image");
  assert.equal((await workflow.loadPreview("preview-a")).cacheRecord.renderedImage.status, "rendered-image");
  assert.equal((await workflow.loadPreview("preview-b")).cacheRecord.renderedImage.status, "rendered-image");
});


test("preview session workflow summarizes bulk reload repair results", async () => {
  const { dir, workflow } = await makeHarness();

  const ready = workflow.previewWorkflow.fulfillPreview(workflow.previewWorkflow.requestPreview({
    source: buildSource(),
    recipe: buildRecipe(),
    viewport: { width: 1200, height: 800 },
  }));
  await workflow.savePreview("preview-report", ready);
  await (await import("node:fs/promises")).writeFile(path.join(dir, `${ready.proxy.proxyKey}.png`), "not-a-png\n", "utf8");

  const report = await workflow.reloadPreviewsReport({ repairReady: true });
  assert.deepEqual(report.counts, {
    total: 1,
    queued: 0,
    ready: 1,
    cancelled: 0,
    superseded: 0,
    repaired: 1,
    withRenderedCacheIssue: 0,
    withMissingRenderedCache: 0,
    withInvalidRenderedCache: 0,
    withStaleRenderedCache: 0,
    requested: 1,
    processed: 1,
    skipped: 0,
  });
  assert.deepEqual(report.requestedSessionIds, ["preview-report"]);
  assert.deepEqual(report.skippedSessionIds, []);
  assert.deepEqual(report.latestSessionIds, ["preview-report"]);
  assert.deepEqual(report.repairedSessionIds, ["preview-report"]);
  assert.deepEqual(report.renderedCacheIssueSessionIds, []);
  assert.equal(report.latestRepairedSessionId, "preview-report");
  assert.equal(report.latestRenderedCacheIssueSessionId, null);
  assert.equal(report.previews[0].repairedDuringReload, true);
  assert.equal(report.previews[0].preview.cacheRecord.renderedImage.status, "rendered-image");
});


test("preview session workflow reload report surfaces remaining rendered-cache issue types", async () => {
  const { dir, workflow } = await makeHarness();

  const ready = workflow.previewWorkflow.fulfillPreview(workflow.previewWorkflow.requestPreview({
    source: buildSource(),
    recipe: buildRecipe(),
    viewport: { width: 1200, height: 800 },
  }));
  await workflow.savePreview("preview-report-issue", ready);
  await (await import("node:fs/promises")).writeFile(path.join(dir, `${ready.proxy.proxyKey}.png`), "not-a-png\n", "utf8");

  const report = await workflow.reloadPreviewsReport();
  assert.deepEqual(report.counts, {
    total: 1,
    queued: 0,
    ready: 1,
    cancelled: 0,
    superseded: 0,
    repaired: 0,
    withRenderedCacheIssue: 1,
    withMissingRenderedCache: 0,
    withInvalidRenderedCache: 1,
    withStaleRenderedCache: 0,
    requested: 1,
    processed: 1,
    skipped: 0,
  });
  assert.deepEqual(report.requestedSessionIds, ["preview-report-issue"]);
  assert.deepEqual(report.skippedSessionIds, []);
  assert.deepEqual(report.latestSessionIds, ["preview-report-issue"]);
  assert.deepEqual(report.repairedSessionIds, []);
  assert.deepEqual(report.renderedCacheIssueSessionIds, ["preview-report-issue"]);
  assert.equal(report.latestRepairedSessionId, null);
  assert.equal(report.latestRenderedCacheIssueSessionId, "preview-report-issue");
  assert.equal(report.previews[0].repairedDuringReload, false);
  assert.equal(report.previews[0].preview.cacheRecord.renderedImage.status, "invalid");
});


test("preview session workflow repairReadyPreviews repairs broken saved ready previews and returns a repair report", async () => {
  const { dir, workflow } = await makeHarness();

  const ready = workflow.previewWorkflow.fulfillPreview(workflow.previewWorkflow.requestPreview({
    source: buildSource(),
    recipe: buildRecipe(),
    viewport: { width: 1200, height: 800 },
  }));
  await workflow.savePreview("preview-repair-all", ready);
  await (await import("node:fs/promises")).writeFile(path.join(dir, `${ready.proxy.proxyKey}.png`), "not-a-png\n", "utf8");

  const report = await workflow.repairReadyPreviews();
  assert.deepEqual(report.counts, {
    total: 1,
    queued: 0,
    ready: 1,
    cancelled: 0,
    superseded: 0,
    repaired: 1,
    withRenderedCacheIssue: 0,
    withMissingRenderedCache: 0,
    withInvalidRenderedCache: 0,
    withStaleRenderedCache: 0,
    requested: 1,
    processed: 1,
    skipped: 0,
  });
  assert.deepEqual(report.requestedSessionIds, ["preview-repair-all"]);
  assert.deepEqual(report.skippedSessionIds, []);
  assert.deepEqual(report.repairedSessionIds, ["preview-repair-all"]);
  assert.deepEqual(report.renderedCacheIssueSessionIds, []);
  assert.equal(report.latestRepairedSessionId, "preview-repair-all");
  assert.equal(report.latestRenderedCacheIssueSessionId, null);
  assert.equal(report.previews[0].repairedDuringReload, true);
  assert.equal(report.previews[0].preview.cacheRecord.renderedImage.status, "rendered-image");
});


test("preview session workflow repairReadyPreviews can target selected saved previews", async () => {
  const { dir, workflow } = await makeHarness();

  const first = workflow.previewWorkflow.fulfillPreview(workflow.previewWorkflow.requestPreview({
    source: buildSource(),
    recipe: buildRecipe(),
    viewport: { width: 1200, height: 800 },
  }));
  const second = workflow.previewWorkflow.fulfillPreview(workflow.previewWorkflow.requestPreview({
    source: { ...buildSource(), imageId: "img-002", path: "/shoots/day1/alt-image.CR3" },
    recipe: buildRecipe(),
    viewport: { width: 1000, height: 700 },
  }));
  await workflow.savePreview("preview-first", first);
  await workflow.savePreview("preview-second", second);
  await (await import("node:fs/promises")).writeFile(path.join(dir, `${first.proxy.proxyKey}.png`), "not-a-png\n", "utf8");
  await (await import("node:fs/promises")).writeFile(path.join(dir, `${second.proxy.proxyKey}.png`), "not-a-png\n", "utf8");

  const report = await workflow.repairReadyPreviews({ sessionIds: ["preview-first"] });
  assert.deepEqual(report.latestSessionIds, ["preview-first"]);
  assert.deepEqual(report.repairedSessionIds, ["preview-first"]);
  assert.deepEqual(report.renderedCacheIssueSessionIds, []);
  assert.equal((await workflow.loadPreview("preview-first")).cacheRecord.renderedImage.status, "rendered-image");
  assert.equal((await workflow.loadPreview("preview-second")).cacheRecord.renderedImage.status, "rendered-image");
});


test("preview session workflow repairReadyPreviews reports skipped unknown selected session ids", async () => {
  const { dir, workflow } = await makeHarness();

  const ready = workflow.previewWorkflow.fulfillPreview(workflow.previewWorkflow.requestPreview({
    source: buildSource(),
    recipe: buildRecipe(),
    viewport: { width: 1200, height: 800 },
  }));
  await workflow.savePreview("preview-known", ready);
  await (await import("node:fs/promises")).writeFile(path.join(dir, `${ready.proxy.proxyKey}.png`), "not-a-png\n", "utf8");

  const report = await workflow.repairReadyPreviews({ sessionIds: ["preview-missing", "preview-known"] });
  assert.deepEqual(report.requestedSessionIds, ["preview-missing", "preview-known"]);
  assert.equal(report.counts.requested, 2);
  assert.equal(report.counts.processed, 1);
  assert.equal(report.counts.skipped, 1);
  assert.deepEqual(report.skippedSessionIds, ["preview-missing"]);
  assert.equal(report.latestSkippedSessionId, "preview-missing");
  assert.deepEqual(report.latestSessionIds, ["preview-known"]);
  assert.deepEqual(report.repairedSessionIds, ["preview-known"]);
  assert.equal(report.latestRepairedSessionId, "preview-known");
});
