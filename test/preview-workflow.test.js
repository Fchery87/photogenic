import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
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

test("preview workflow reports cache misses until a preview request is fulfilled and stored", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-workflow-"));
  const workflow = createPreviewWorkflow({
    previewFoundation: undefined,
    proxyCache: undefined,
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const recipe = createRecipe({ operations: [{ type: "contrast", params: { amount: 12 } }] });

  const queued = workflow.requestPreview({
    source: buildSource(),
    recipe,
    viewport: { width: 1200, height: 800 },
  });

  assert.equal(queued.status, "queued");
  assert.equal(queued.cacheStatus, "miss");
  assert.equal(queued.cacheRecord, null);

  const ready = workflow.fulfillPreview(queued);
  const cachedBytes = await readFile(path.join(dir, `${queued.proxy.proxyKey}.png`));

  assert.equal(ready.status, "ready");
  assert.equal(ready.cacheStatus, "stored");
  assert.equal(ready.previewArtifact.mode, "preview");
  assert.equal(ready.previewArtifact.proxyKey, queued.proxy.proxyKey);
  assert.equal(ready.previewArtifact.cacheFilePath, path.join(dir, `${queued.proxy.proxyKey}.png`));
  assert.equal(ready.cacheRecord.filePath, path.join(dir, `${queued.proxy.proxyKey}.png`));
  assert.equal(ready.previewArtifact.renderedImage.path, path.join(dir, `${queued.proxy.proxyKey}.png`));
  assert.equal(ready.previewArtifact.renderedImage.kind, "image/png");
  assert.equal(ready.previewArtifact.renderedImage.status, "rendered-image");
  assert.equal(ready.previewArtifact.renderedImage.width, 1200);
  assert.equal(ready.previewArtifact.renderedImage.height, 800);
  assert.deepEqual(cachedBytes.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
});

test("preview workflow resolves matching requests from proxy cache metadata without creating a duplicate cache entry", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-workflow-hit-"));
  const workflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const recipe = createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] });
  const first = workflow.requestPreview({
    source: buildSource(),
    recipe,
    viewport: { width: 1440, height: 900 },
  });

  const stored = workflow.fulfillPreview(first);
  const cached = workflow.requestPreview({
    source: buildSource(),
    recipe,
    viewport: { width: 1440, height: 900 },
  });

  assert.equal(stored.cacheRecord.proxyKey, cached.proxy.proxyKey);
  assert.equal(cached.status, "ready");
  assert.equal(cached.cacheStatus, "hit");
  assert.equal(cached.cacheRecord.filePath, stored.cacheRecord.filePath);
  assert.equal(cached.previewArtifact.cacheFilePath, stored.cacheRecord.filePath);
  assert.deepEqual(cached.previewArtifact.renderedImage, stored.previewArtifact.renderedImage);
  assert.equal(workflow.proxyCache.list().length, 1);
});

test("preview workflow still exposes request lifecycle helpers for cancellation and supersession", () => {
  const workflow = createPreviewWorkflow();
  const source = buildSource();
  const first = workflow.requestPreview({
    source,
    recipe: createRecipe(),
    viewport: { width: 1200, height: 800 },
  });
  const second = workflow.requestPreview({
    source,
    recipe: createRecipe({ operations: [{ type: "temperature", params: { kelvinDelta: 150 } }] }),
    viewport: { width: 1400, height: 900 },
  });

  const superseded = workflow.supersedePreview(first, second);
  const cancelled = workflow.cancelPreview({
    ...second,
    cacheStatus: undefined,
    cacheRecord: undefined,
  }, "User navigated away.");

  assert.equal(superseded.status, "superseded");
  assert.equal(superseded.supersededByRequestId, second.requestId);
  assert.equal(cancelled.status, "cancelled");
  assert.match(cancelled.note, /navigated away/i);
  assert.equal(workflow.latestRequestIdFor(source.imageId), second.requestId);
});


test("preview workflow falls back to a miss when a cached png file has disappeared", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-workflow-missing-hit-"));
  const workflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const recipe = createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] });
  const first = workflow.requestPreview({
    source: buildSource(),
    recipe,
    viewport: { width: 1440, height: 900 },
  });
  const stored = workflow.fulfillPreview(first);
  await (await import("node:fs/promises")).unlink(stored.cacheRecord.filePath);

  const retried = workflow.requestPreview({
    source: buildSource(),
    recipe,
    viewport: { width: 1440, height: 900 },
  });

  assert.equal(retried.status, "queued");
  assert.equal(retried.cacheStatus, "miss");
  assert.equal(retried.cacheRecord, null);
  assert.equal(workflow.proxyCache.list().length, 0);
});



test("preview workflow falls back to a miss when a cached png file is stale but still parseable", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-workflow-stale-hit-"));
  const workflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const recipe = createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] });
  const first = workflow.requestPreview({
    source: buildSource(),
    recipe,
    viewport: { width: 1440, height: 900 },
  });
  const stored = workflow.fulfillPreview(first);
  const mismatched = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  }).fulfillPreview({
    ...first,
    status: "queued",
    viewport: { width: 1280, height: 720 },
  });
  await (await import("node:fs/promises")).writeFile(stored.cacheRecord.filePath, await readFile(mismatched.cacheRecord.filePath));

  const retried = workflow.requestPreview({
    source: buildSource(),
    recipe,
    viewport: { width: 1440, height: 900 },
  });

  assert.equal(retried.status, "queued");
  assert.equal(retried.cacheStatus, "miss");
  assert.equal(retried.cacheRecord, null);
  assert.equal(workflow.proxyCache.list().length, 0);
});

test("preview workflow falls back to a miss when a cached png file is invalid", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-workflow-invalid-hit-"));
  const workflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const recipe = createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] });
  const first = workflow.requestPreview({
    source: buildSource(),
    recipe,
    viewport: { width: 1440, height: 900 },
  });
  const stored = workflow.fulfillPreview(first);
  await (await import("node:fs/promises")).writeFile(stored.cacheRecord.filePath, `not-a-png\n`, "utf8");

  const retried = workflow.requestPreview({
    source: buildSource(),
    recipe,
    viewport: { width: 1440, height: 900 },
  });

  assert.equal(retried.status, "queued");
  assert.equal(retried.cacheStatus, "miss");
  assert.equal(retried.cacheRecord, null);
  assert.equal(workflow.proxyCache.list().length, 0);
});


test("preview workflow rerenderPreview repairs a missing cached png file", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-workflow-rerender-"));
  const workflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const recipe = createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] });
  const first = workflow.requestPreview({
    source: buildSource(),
    recipe,
    viewport: { width: 1440, height: 900 },
  });
  const stored = workflow.fulfillPreview(first);
  await (await import("node:fs/promises")).unlink(stored.cacheRecord.filePath);

  const repaired = workflow.rerenderPreview(stored);
  const retried = workflow.requestPreview({
    source: buildSource(),
    recipe,
    viewport: { width: 1440, height: 900 },
  });

  assert.equal(repaired.status, "ready");
  assert.equal(repaired.cacheStatus, "stored");
  assert.equal(repaired.cacheRecord.renderedImage.status, "rendered-image");
  assert.equal(retried.status, "ready");
  assert.equal(retried.cacheStatus, "hit");
});


test("preview workflow report helpers return operation metadata", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-workflow-report-"));
  const workflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  const recipe = createRecipe({ operations: [{ type: "contrast", params: { amount: 12 } }] });

  const requested = workflow.requestPreviewReport({
    source: buildSource(),
    recipe,
    viewport: { width: 1200, height: 800 },
  });
  assert.deepEqual(requested.operation, {
    kind: "request-preview",
    requestId: requested.preview.requestId,
    proxyKey: requested.preview.proxy.proxyKey,
    cacheStatus: "miss",
  });

  const fulfilled = workflow.fulfillPreviewReport(requested.preview);
  assert.deepEqual(fulfilled.operation, {
    kind: "fulfill-preview",
    requestId: requested.preview.requestId,
    proxyKey: requested.preview.proxy.proxyKey,
    cacheFilePath: path.join(dir, `${requested.preview.proxy.proxyKey}.png`),
  });
  assert.equal(fulfilled.preview.status, "ready");
});
