import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createExportSessionStore } from "../src/export/session-store.js";

async function makeTempStore() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-session-"));
  const clockValues = [
    "2025-07-12T00:00:00.000Z",
    "2025-07-12T00:00:01.000Z",
    "2025-07-12T00:00:02.000Z",
  ];
  let index = 0;
  const store = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: () => clockValues[index++] ?? clockValues.at(-1),
  });
  return { store };
}

test("export session store saves deterministic export session snapshots", async () => {
  const { store } = await makeTempStore();
  const saved = await store.saveSession("export-hero", {
    imageId: "img-001",
    outputName: "hero-image.jpg",
    outputPath: "/exports/hero-image.jpg.json",
    status: "queued",
    options: { format: "jpeg", quality: 92, sharpenForOutput: true },
    artifactSidecar: {
      path: "/exports/hero-image.jpg.json",
      kind: "application/json",
      status: "present",
      sizeBytes: 512,
      note: "Export artifact sidecar JSON is present and parseable.",
    },
  });

  assert.equal(saved.sessionId, "export-hero");
  assert.equal(saved.status, "queued");
  assert.deepEqual(saved.options, {
    format: "jpeg",
    quality: 92,
    resize: null,
    embedIcc: true,
    sharpenForOutput: true,
  });
  assert.equal(saved.createdAt, "2025-07-12T00:00:00.000Z");
  assert.equal(saved.updatedAt, "2025-07-12T00:00:00.000Z");
  assert.deepEqual(saved.artifactSidecar, {
    path: "/exports/hero-image.jpg.json",
    kind: "application/json",
    status: "present",
    sizeBytes: 512,
    note: "Export artifact sidecar JSON is present and parseable.",
  });
  assert.deepEqual(await store.listSessionIds(), ["export-hero"]);
});

test("updating an export session preserves createdAt and records failure state", async () => {
  const { store } = await makeTempStore();
  await store.saveSession("export-hero", {
    imageId: "img-001",
    outputName: "hero-image.jpg",
    outputPath: "/exports/hero-image.jpg.json",
    status: "running",
  });

  const updated = await store.saveSession("export-hero", {
    status: "failed",
    error: "disk offline",
  });

  assert.equal(updated.createdAt, "2025-07-12T00:00:00.000Z");
  assert.equal(updated.updatedAt, "2025-07-12T00:00:01.000Z");
  assert.equal(updated.status, "failed");
  assert.match(updated.error, /disk offline/i);
});


test("export session store preserves rendered png companion metadata", async () => {
  const { store } = await makeTempStore();
  const saved = await store.saveSession("export-png", {
    imageId: "img-002",
    outputName: "hero-image.png",
    outputPath: "/exports/hero-image.png.json",
    status: "done",
    options: { format: "png", quality: 95 },
    companionOutput: {
      path: "/exports/hero-image.png",
      kind: "image/png",
      status: "rendered-image",
      sizeBytes: 4096,
      contentHash: { algorithm: "sha256", value: "abc123" },
      width: 1200,
      height: 800,
      note: "Deterministic software-rendered PNG bytes are present on disk.",
    },
  });

  assert.deepEqual(saved.companionOutput, {
    path: "/exports/hero-image.png",
    kind: "image/png",
    status: "rendered-image",
    sizeBytes: 4096,
    contentHash: { algorithm: "sha256", value: "abc123" },
    width: 1200,
    height: 800,
    note: "Deterministic software-rendered PNG bytes are present on disk.",
  });
});


test("export session store report helpers return operation metadata", async () => {
  const { store } = await makeTempStore();
  const saved = await store.saveSessionReport("export-op", {
    imageId: "img-003",
    outputName: "hero-image.png",
    outputPath: "/exports/hero-image.png.json",
    status: "done",
    options: { format: "png", quality: 95 },
  });
  assert.deepEqual(saved.operation, {
    kind: "save-export-session",
    sessionId: "export-op",
    status: "done",
  });

  const loaded = await store.getSessionReport("export-op");
  assert.deepEqual(loaded.operation, {
    kind: "get-export-session",
    sessionId: "export-op",
  });

  const listed = await store.listSessionIdsReport();
  assert.deepEqual(listed.operation, {
    kind: "list-export-session-ids",
    count: 1,
  });
  assert.deepEqual(listed.sessionIds, ["export-op"]);
});
