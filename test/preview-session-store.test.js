import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createPreviewWorkflow } from "../src/preview/workflow.js";
import { createPreviewSessionStore } from "../src/preview/session-store.js";

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

async function makeHarness() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-preview-session-store-"));
  const clockValues = [
    "2025-07-14T00:00:00.000Z",
    "2025-07-14T00:00:01.000Z",
    "2025-07-14T00:00:02.000Z",
  ];
  let index = 0;
  const store = await createPreviewSessionStore({
    path: path.join(dir, "preview-sessions.json"),
    clock: () => clockValues[index++] ?? clockValues.at(-1),
  });
  const workflow = createPreviewWorkflow({
    cachePathFor: (descriptor) => path.join(dir, `${descriptor.proxyKey}.png`),
  });
  return { dir, store, workflow };
}

test("preview session store saves deterministic request/cache snapshots", async () => {
  const { dir, store, workflow } = await makeHarness();
  const preview = workflow.fulfillPreview(
    workflow.requestPreview({
      source: buildSource(),
      recipe: createRecipe({ operations: [{ type: "contrast", params: { amount: 12 } }] }),
      viewport: { width: 1200, height: 800 },
    }),
  );

  const saved = await store.saveSession("preview-hero", {
    request: preview,
    cacheStatus: preview.cacheStatus,
    cacheRecord: preview.cacheRecord,
  });

  assert.equal(saved.sessionId, "preview-hero");
  assert.equal(saved.request.status, "ready");
  assert.equal(saved.cacheStatus, "stored");
  assert.equal(saved.cacheRecord.filePath, path.join(dir, `${preview.proxy.proxyKey}.png`));
  assert.equal(saved.createdAt, "2025-07-14T00:00:00.000Z");
  assert.equal(saved.updatedAt, "2025-07-14T00:00:00.000Z");
  assert.deepEqual(await store.listSessionIds(), ["preview-hero"]);
});

test("updating a preview session preserves createdAt and queued cache-miss metadata", async () => {
  const { store, workflow } = await makeHarness();
  const queued = workflow.requestPreview({
    source: buildSource(),
    recipe: createRecipe(),
    viewport: { width: 1440, height: 900 },
  });

  await store.saveSession("preview-hero", {
    request: queued,
    cacheStatus: queued.cacheStatus,
    cacheRecord: queued.cacheRecord,
  });

  const cancelled = workflow.cancelPreview(queued, "User navigated away.");
  const updated = await store.saveSession("preview-hero", {
    request: { ...cancelled, cacheStatus: "miss", cacheRecord: null },
    cacheStatus: "miss",
    cacheRecord: null,
  });

  assert.equal(updated.createdAt, "2025-07-14T00:00:00.000Z");
  assert.equal(updated.updatedAt, "2025-07-14T00:00:01.000Z");
  assert.equal(updated.request.status, "cancelled");
  assert.equal(updated.cacheStatus, "miss");
});


test("preview session store report helpers return operation metadata", async () => {
  const { dir, store, workflow } = await makeHarness();
  const preview = workflow.fulfillPreview(
    workflow.requestPreview({
      source: buildSource(),
      recipe: createRecipe({ operations: [{ type: "contrast", params: { amount: 6 } }] }),
      viewport: { width: 1200, height: 800 },
    }),
  );

  const saved = await store.saveSessionReport("preview-op", {
    request: preview,
    cacheStatus: preview.cacheStatus,
    cacheRecord: preview.cacheRecord,
  });
  assert.deepEqual(saved.operation, {
    kind: "save-preview-session",
    sessionId: "preview-op",
    status: "ready",
    cacheStatus: "stored",
  });

  const loaded = await store.getSessionReport("preview-op");
  assert.deepEqual(loaded.operation, {
    kind: "get-preview-session",
    sessionId: "preview-op",
  });

  const listed = await store.listSessionIdsReport();
  assert.deepEqual(listed.operation, {
    kind: "list-preview-session-ids",
    count: 1,
  });
  assert.deepEqual(listed.sessionIds, ["preview-op"]);
});
