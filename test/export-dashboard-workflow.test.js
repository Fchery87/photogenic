import { mkdtemp, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createExportFoundation } from "../src/export/foundation.js";
import { createExportSessionStore } from "../src/export/session-store.js";
import { createExportDashboardWorkflow } from "../src/export/dashboard-workflow.js";
import { createExportSessionWorkflow } from "../src/export/session-workflow.js";
import { createExportWorkflow } from "../src/export/workflow.js";

async function makeHarness() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-"));
  let tick = 0;
  const clock = () => `2025-07-17T00:00:0${Math.min(tick++, 9)}.000Z`;
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock });

  await sessionStore.saveSession("export-1", {
    imageId: "img-001",
    outputName: "hero-1.jpg",
    outputPath: "/exports/hero-1.jpg.json",
    status: "queued",
  });
  await sessionStore.saveSession("export-2", {
    imageId: "img-002",
    outputName: "hero-2.jpg",
    outputPath: "/exports/hero-2.jpg.json",
    status: "done",
    companionOutput: {
      path: "/exports/hero-2.jpg",
      kind: "text/plain",
      status: "placeholder-proof",
      sizeBytes: 128,
      contentHash: { algorithm: "sha256", value: "abc" },
      note: "Placeholder proof output only.",
    },
    artifactSidecar: {
      path: "/exports/hero-2.jpg.json",
      kind: "application/json",
      status: "present",
      sizeBytes: 256,
      note: "Export artifact sidecar JSON is present and parseable.",
    },
  });
  await sessionStore.saveSession("export-3", {
    imageId: "img-003",
    outputName: "hero-3.jpg",
    outputPath: "/exports/hero-3.jpg.json",
    status: "failed",
    error: "disk full",
  });
  await sessionStore.saveSession("export-4", {
    imageId: "img-004",
    outputName: "hero-4.jpg",
    outputPath: "/exports/hero-4.jpg.json",
    status: "done",
    companionOutput: {
      path: "/exports/hero-4.jpg",
      kind: "text/plain",
      status: "missing",
      sizeBytes: null,
      contentHash: null,
      note: "Expected placeholder proof output is missing on disk.",
    },
    artifactSidecar: {
      path: "/exports/hero-4.jpg.json",
      kind: "application/json",
      status: "invalid",
      sizeBytes: null,
      note: "Export artifact sidecar JSON could not be parsed from disk.",
    },
  });

  return createExportDashboardWorkflow({ sessionStore });
}

test("export dashboard workflow summarizes export session counts and refreshed companion proof state", async () => {
  const workflow = await makeHarness();
  const summary = await workflow.summarizeSessions();

  assert.deepEqual(summary.counts, {
    total: 4,
    queued: 1,
    running: 0,
    done: 2,
    doneWithProofPresent: 1,
    doneWithProofMissing: 1,
    doneWithProofInvalid: 0,
    doneWithProofStale: 0,
    doneWithProofIssue: 1,
    doneWithArtifactSidecarPresent: 1,
    doneWithArtifactSidecarMissing: 0,
    doneWithArtifactSidecarInvalid: 1,
    doneWithArtifactSidecarStale: 0,
    doneWithArtifactSidecarIssue: 1,
    doneWithIntegrityIssue: 1,
    failed: 1,
  });
  assert.deepEqual(summary.latestSessionIds, ["export-4", "export-3", "export-2", "export-1"]);
  assert.deepEqual(summary.latestQueued, {
    sessionId: "export-1",
    imageId: "img-001",
    outputName: "hero-1.jpg",
    status: "queued",
    updatedAt: "2025-07-17T00:00:00.000Z",
    companionProof: null,
    artifactSidecar: null,
  });
  assert.deepEqual(summary.latestRunning, null);
  assert.deepEqual(summary.latestDone, {
    sessionId: "export-4",
    imageId: "img-004",
    outputName: "hero-4.jpg",
    status: "done",
    updatedAt: "2025-07-17T00:00:03.000Z",
    companionProof: {
      status: "missing",
      path: "/exports/hero-4.jpg",
      refreshedStatus: "missing",
      note: "Expected placeholder proof output is missing on disk.",
    },
    artifactSidecar: {
      status: "invalid",
      path: "/exports/hero-4.jpg.json",
      refreshedStatus: "invalid",
      note: "Export artifact sidecar JSON could not be parsed from disk.",
    },
  });
  assert.deepEqual(summary.latestFailed, {
    sessionId: "export-3",
    imageId: "img-003",
    outputName: "hero-3.jpg",
    status: "failed",
    updatedAt: "2025-07-17T00:00:02.000Z",
    companionProof: null,
    artifactSidecar: null,
  });
  assert.deepEqual(summary.latestSessions, [
    {
      sessionId: "export-4",
      imageId: "img-004",
      outputName: "hero-4.jpg",
      status: "done",
      updatedAt: "2025-07-17T00:00:03.000Z",
      companionProof: {
        status: "missing",
        path: "/exports/hero-4.jpg",
        refreshedStatus: "missing",
        note: "Expected placeholder proof output is missing on disk.",
      },
      artifactSidecar: {
        status: "invalid",
        path: "/exports/hero-4.jpg.json",
        refreshedStatus: "invalid",
        note: "Export artifact sidecar JSON could not be parsed from disk.",
      },
    },
    {
      sessionId: "export-3",
      imageId: "img-003",
      outputName: "hero-3.jpg",
      status: "failed",
      updatedAt: "2025-07-17T00:00:02.000Z",
      companionProof: null,
      artifactSidecar: null,
    },
    {
      sessionId: "export-2",
      imageId: "img-002",
      outputName: "hero-2.jpg",
      status: "done",
      updatedAt: "2025-07-17T00:00:01.000Z",
      companionProof: {
        status: "present",
        path: "/exports/hero-2.jpg",
        refreshedStatus: "placeholder-proof",
        note: "Placeholder proof output only.",
      },
      artifactSidecar: {
        status: "present",
        path: "/exports/hero-2.jpg.json",
        refreshedStatus: "present",
        note: "Export artifact sidecar JSON is present and parseable.",
      },
    },
    {
      sessionId: "export-1",
      imageId: "img-001",
      outputName: "hero-1.jpg",
      status: "queued",
      updatedAt: "2025-07-17T00:00:00.000Z",
      companionProof: null,
      artifactSidecar: null,
    },
  ]);
  assert.equal(summary.latestProofPresent.sessionId, "export-2");
  assert.equal(summary.latestProofIssue.sessionId, "export-4");
  assert.equal(summary.latestProofMissing.sessionId, "export-4");
  assert.equal(summary.latestProofInvalid, null);
  assert.equal(summary.latestProofStale, null);
  assert.equal(summary.latestArtifactSidecarPresent.sessionId, "export-2");
  assert.equal(summary.latestIntegrityIssue.sessionId, "export-4");
  assert.equal(summary.latestArtifactSidecarIssue.sessionId, "export-4");
  assert.equal(summary.latestArtifactSidecarMissing, null);
  assert.equal(summary.latestArtifactSidecarInvalid.sessionId, "export-4");
  assert.equal(summary.latestArtifactSidecarStale, null);
  assert.deepEqual(summary.recentFailures, [
    {
      sessionId: "export-3",
      imageId: "img-003",
      outputName: "hero-3.jpg",
      error: "disk full",
      updatedAt: "2025-07-17T00:00:02.000Z",
    },
  ]);
});



test("export dashboard workflow surfaces rendered TIFF-16 companions as present proof state", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-tiff-present-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:00:00.000Z" });
  await sessionStore.saveSession("export-tiff", {
    imageId: "img-202",
    outputName: "hero.tiff",
    outputPath: "/exports/hero.tiff.json",
    status: "done",
    companionOutput: {
      path: "/exports/hero.tiff",
      kind: "image/tiff",
      status: "rendered-image",
      sizeBytes: 4096,
      contentHash: { algorithm: "sha256", value: "def" },
      width: 1200,
      height: 800,
      note: "Deterministic software-rendered TIFF-16 bytes are present on disk.",
    },
    artifactSidecar: {
      path: "/exports/hero.tiff.json",
      kind: "application/json",
      status: "present",
      sizeBytes: 512,
      note: "Export artifact sidecar JSON is present and parseable.",
    },
  });

  const workflow = createExportDashboardWorkflow({ sessionStore });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.doneWithProofPresent, 1);
  assert.equal(summary.latestDone.sessionId, "export-tiff");
  assert.equal(summary.latestProofPresent.sessionId, "export-tiff");
  assert.deepEqual(summary.latestSessions[0].companionProof, {
    status: "present",
    path: "/exports/hero.tiff",
    refreshedStatus: "rendered-image",
    note: "Deterministic software-rendered TIFF-16 bytes are present on disk.",
  });
});



test("export dashboard workflow surfaces invalid rendered TIFF-16 companions as proof issues", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-tiff-invalid-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:00:02.000Z" });
  await sessionStore.saveSession("export-invalid-tiff", {
    imageId: "img-203",
    outputName: "hero-invalid.tiff",
    outputPath: "/exports/hero-invalid.tiff.json",
    status: "done",
    companionOutput: {
      path: "/exports/hero-invalid.tiff",
      kind: "image/tiff",
      status: "invalid",
      sizeBytes: null,
      contentHash: null,
      width: null,
      height: null,
      note: "Rendered TIFF-16 output is present but is not a valid TIFF. This seam verifies deterministic software-rendered TIFF-16 bytes, not the final RAW/GPU pipeline.",
    },
  });

  const workflow = createExportDashboardWorkflow({ sessionStore });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.doneWithProofInvalid, 1);
  assert.equal(summary.counts.doneWithProofIssue, 1);
  assert.equal(summary.counts.doneWithIntegrityIssue, 1);
  assert.equal(summary.latestDone.sessionId, "export-invalid-tiff");
  assert.equal(summary.latestProofInvalid.sessionId, "export-invalid-tiff");
  assert.equal(summary.latestProofIssue.sessionId, "export-invalid-tiff");
  assert.equal(summary.latestIntegrityIssue.sessionId, "export-invalid-tiff");
  assert.deepEqual(summary.latestSessions[0].companionProof, {
    status: "invalid",
    path: "/exports/hero-invalid.tiff",
    refreshedStatus: "invalid",
    note: "Rendered TIFF-16 output is present but is not a valid TIFF. This seam verifies deterministic software-rendered TIFF-16 bytes, not the final RAW/GPU pipeline.",
  });
});
test("export dashboard workflow surfaces stale rendered TIFF-16 companions as proof issues", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-tiff-stale-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:00:01.000Z" });
  await sessionStore.saveSession("export-stale-tiff", {
    imageId: "img-204",
    outputName: "hero-stale.tiff",
    outputPath: "/exports/hero-stale.tiff.json",
    status: "done",
    companionOutput: {
      path: "/exports/hero-stale.tiff",
      kind: "image/tiff",
      status: "stale",
      sizeBytes: 1234,
      contentHash: { algorithm: "sha256", value: "stale-hash" },
      width: 64,
      height: 48,
      note: "Rendered TIFF-16 output is present but no longer matches the expected deterministic export output for this artifact. This seam verifies deterministic software-rendered TIFF-16 bytes, not the final RAW/GPU pipeline.",
    },
    artifactSidecar: {
      path: "/exports/hero-stale.tiff.json",
      kind: "application/json",
      status: "present",
      sizeBytes: 456,
      note: "Export artifact sidecar JSON is present and parseable.",
    },
  });

  const workflow = createExportDashboardWorkflow({ sessionStore });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.doneWithProofStale, 1);
  assert.equal(summary.counts.doneWithProofIssue, 1);
  assert.equal(summary.counts.doneWithIntegrityIssue, 1);
  assert.equal(summary.latestProofStale.sessionId, "export-stale-tiff");
  assert.equal(summary.latestProofIssue.sessionId, "export-stale-tiff");
  assert.equal(summary.latestIntegrityIssue.sessionId, "export-stale-tiff");
});
test("export dashboard workflow handles an empty export history", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-empty-"));
  const sessionStore = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: () => "2025-07-17T00:00:00.000Z",
  });
  const workflow = createExportDashboardWorkflow({ sessionStore });
  const summary = await workflow.summarizeSessions();

  assert.deepEqual(summary.counts, {
    total: 0,
    queued: 0,
    running: 0,
    done: 0,
    doneWithProofPresent: 0,
    doneWithProofMissing: 0,
    doneWithProofInvalid: 0,
    doneWithProofStale: 0,
    doneWithProofIssue: 0,
    doneWithArtifactSidecarPresent: 0,
    doneWithArtifactSidecarMissing: 0,
    doneWithArtifactSidecarInvalid: 0,
    doneWithArtifactSidecarStale: 0,
    doneWithArtifactSidecarIssue: 0,
    doneWithIntegrityIssue: 0,
    failed: 0,
  });
  assert.deepEqual(summary.latestSessionIds, []);
  assert.equal(summary.latestQueued, null);
  assert.equal(summary.latestRunning, null);
  assert.equal(summary.latestDone, null);
  assert.equal(summary.latestFailed, null);
  assert.deepEqual(summary.latestSessions, []);
  assert.equal(summary.latestProofPresent, null);
  assert.equal(summary.latestProofIssue, null);
  assert.equal(summary.latestProofMissing, null);
  assert.equal(summary.latestProofInvalid, null);
  assert.equal(summary.latestProofStale, null);
  assert.equal(summary.latestArtifactSidecarPresent, null);
  assert.equal(summary.latestIntegrityIssue, null);
  assert.equal(summary.latestArtifactSidecarIssue, null);
  assert.equal(summary.latestArtifactSidecarMissing, null);
  assert.equal(summary.latestArtifactSidecarInvalid, null);
  assert.equal(summary.latestArtifactSidecarStale, null);
  assert.deepEqual(summary.recentFailures, []);
});

test("export dashboard workflow reflects refreshed missing companion proof state saved by export session reloads", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-refresh-"));
  const sessionStore = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: (() => {
      let tick = 0;
      return () => `2025-07-18T00:00:0${Math.min(tick++, 9)}.000Z`;
    })(),
  });
  const exportFoundation = createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation }),
  });

  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-010",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "png" },
  });
  await sessionWorkflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image.png"));
  await (await import("node:fs/promises")).writeFile(path.join(dir, "hero-image.png.json"), `not-json
`, "utf8");

  const reloadedSessionStore = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: () => "2025-07-18T00:00:09.000Z",
  });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation }),
  });
  await reloadedSessionWorkflow.reloadJobs();

  const dashboardWorkflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore });
  const summary = await dashboardWorkflow.summarizeSessions();

  assert.equal(summary.counts.doneWithProofPresent, 0);
  assert.equal(summary.counts.doneWithProofMissing, 1);
  assert.equal(summary.counts.doneWithProofIssue, 1);
  assert.equal(summary.latestQueued, null);
  assert.equal(summary.latestRunning, null);
  assert.equal(summary.latestDone.sessionId, summary.latestSessions[0].sessionId);
  assert.equal(summary.latestFailed, null);
  assert.equal(summary.counts.doneWithProofInvalid, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarPresent, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarMissing, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarInvalid, 1);
  assert.equal(summary.counts.doneWithArtifactSidecarIssue, 1);
  assert.equal(summary.latestProofPresent, null);
  assert.equal(summary.latestProofIssue.sessionId, summary.latestSessions[0].sessionId);
  assert.equal(summary.latestProofMissing.sessionId, summary.latestSessions[0].sessionId);
  assert.equal(summary.latestProofInvalid, null);
  assert.equal(summary.latestArtifactSidecarPresent, null);
  assert.equal(summary.latestIntegrityIssue.sessionId, summary.latestSessions[0].sessionId);
  assert.equal(summary.latestArtifactSidecarIssue.sessionId, summary.latestSessions[0].sessionId);
  assert.equal(summary.latestArtifactSidecarMissing, null);
  assert.equal(summary.latestArtifactSidecarInvalid.sessionId, summary.latestSessions[0].sessionId);
  assert.deepEqual(summary.latestSessions[0].companionProof, {
    status: "missing",
    path: path.join(dir, "hero-image.png"),
    refreshedStatus: "missing",
    note: "Expected rendered PNG output is missing on disk. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.",
  });
  assert.deepEqual(summary.latestSessions[0].artifactSidecar, {
    status: "invalid",
    path: path.join(dir, "hero-image.png.json"),
    refreshedStatus: "invalid",
    note: "Export artifact sidecar JSON could not be parsed from disk. This seam still verifies placeholder-proof/export artifact bookkeeping, not final rendered image bytes.",
  });
});

test("export dashboard workflow delegates summary shaping to the dashboard foundation", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-delegation-"));
  const sessionStore = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: () => "2025-07-17T00:00:00.000Z",
  });
  await sessionStore.saveSession("export-1", {
    imageId: "img-001",
    outputName: "hero-1.jpg",
    outputPath: "/exports/hero-1.jpg.json",
    status: "queued",
  });

  const calls = [];
  const dashboardFoundation = {
    summarizeSessions(sessions) {
      calls.push(sessions);
      return { counts: { total: sessions.length }, latestSessionIds: ["delegated"], latestSessions: [], latestQueued: null, latestRunning: null, latestDone: null, latestFailed: null, latestProofPresent: null, latestProofIssue: null, latestProofMissing: null, latestProofInvalid: null, latestProofStale: null, latestArtifactSidecarPresent: null, latestIntegrityIssue: null, latestArtifactSidecarIssue: null, latestArtifactSidecarMissing: null, latestArtifactSidecarInvalid: null, latestArtifactSidecarStale: null, recentFailures: [] };
    },
  };

  const workflow = createExportDashboardWorkflow({ sessionStore, dashboardFoundation });
  const summary = await workflow.summarizeSessions();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].sessionId, "export-1");
  assert.deepEqual(summary, {
    counts: { total: 1 },
    latestSessionIds: ["delegated"],
    latestSessions: [],
    latestQueued: null,
    latestRunning: null,
    latestDone: null,
    latestFailed: null,
    latestProofPresent: null,
    latestProofIssue: null,
    latestProofMissing: null,
    latestProofInvalid: null,
    latestProofStale: null,
    latestArtifactSidecarPresent: null,
    latestIntegrityIssue: null,
    latestArtifactSidecarIssue: null,
    latestArtifactSidecarMissing: null,
    latestArtifactSidecarInvalid: null,
    latestArtifactSidecarStale: null,
    recentFailures: [],
  });
});


test("export dashboard workflow reflects refreshed invalid rendered png companion state saved by export session reloads", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-invalid-refresh-"));
  const sessionStore = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: (() => {
      let tick = 0;
      return () => `2025-07-19T00:00:0${Math.min(tick++, 9)}.000Z`;
    })(),
  });
  const exportFoundation = createExportFoundation({ clock: () => "2025-07-19T10:00:00.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation }),
  });

  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-011",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "png" },
  });
  await sessionWorkflow.runJob(queued.jobId);
  await (await import("node:fs/promises")).writeFile(path.join(dir, "hero-image.png"), "not-a-png\n", "utf8");

  const reloadedSessionStore = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: () => "2025-07-19T00:00:09.000Z",
  });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation }),
  });
  await reloadedSessionWorkflow.reloadJobs();

  const dashboardWorkflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore });
  const summary = await dashboardWorkflow.summarizeSessions();
  assert.equal(summary.counts.doneWithProofPresent, 0);
  assert.equal(summary.counts.doneWithProofMissing, 0);
  assert.equal(summary.counts.doneWithProofInvalid, 1);
  assert.equal(summary.latestQueued, null);
  assert.equal(summary.latestRunning, null);
  assert.equal(summary.latestDone.sessionId, summary.latestSessions[0].sessionId);
  assert.equal(summary.latestFailed, null);
  assert.deepEqual(summary.latestSessions[0].companionProof, {
    status: "invalid",
    path: path.join(dir, "hero-image.png"),
    refreshedStatus: "invalid",
    note: "Rendered PNG output is present but is not a valid PNG. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.",
  });
});


test("export dashboard workflow reflects refreshed stale rendered png companion state saved by export session reloads", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-stale-"));
  const sessionStore = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: () => "2025-07-17T00:00:00.000Z",
  });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-17T10:00:00.000Z" }),
    }),
  });
  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-020",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "png", quality: 95 },
  });
  await sessionWorkflow.runJob(queued.jobId);
  const mismatchWorkflow = createExportWorkflow({
    exportFoundation: createExportFoundation({ clock: () => "2025-07-17T10:00:00.000Z" }),
  });
  const mismatchQueued = mismatchWorkflow.queueExport({
    source: {
      imageId: "img-020",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "contrast", params: { amount: 12 } }] }),
    destinationDir: dir,
    namingTemplate: "mismatch-{baseName}",
    options: { format: "png", quality: 95, resize: { width: 1000, height: 700 } },
  });
  await mismatchWorkflow.runJob(mismatchQueued.jobId);
  await (await import("node:fs/promises")).copyFile(path.join(dir, "mismatch-hero-image.png"), path.join(dir, "hero-image.png"));

  const reloadedSessionStore = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: () => "2025-07-17T00:00:09.000Z",
  });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-17T10:00:00.000Z" }),
    }),
  });
  await reloadedSessionWorkflow.reloadJobs();

  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.doneWithProofPresent, 0);
  assert.equal(summary.counts.doneWithProofMissing, 0);
  assert.equal(summary.counts.doneWithProofInvalid, 0);
  assert.equal(summary.counts.doneWithProofStale, 1);
  assert.equal(summary.counts.doneWithProofIssue, 1);
  assert.equal(summary.counts.doneWithIntegrityIssue, 1);
  assert.equal(summary.latestProofPresent, null);
  assert.equal(summary.latestProofIssue.sessionId, queued.jobId);
  assert.equal(summary.latestProofMissing, null);
  assert.equal(summary.latestProofInvalid, null);
  assert.equal(summary.latestProofStale.sessionId, queued.jobId);
  assert.equal(summary.latestIntegrityIssue.sessionId, queued.jobId);
});


test("export dashboard workflow reflects refreshed stale artifact sidecar state saved by export session reloads", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-stale-sidecar-"));
  const sessionStore = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: (() => { let tick = 0; return () => `2025-07-20T00:00:0${Math.min(tick++, 9)}.000Z`; })(),
  });
  const exportFoundation = createExportFoundation({ clock: () => "2025-07-20T10:00:00.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({ sessionStore, exportWorkflow: createExportWorkflow({ exportFoundation }) });

  const queued = await sessionWorkflow.queueExport({
    source: { imageId: "img-021", path: "/shoots/day1/hero-image.CR3", width: 6000, height: 4000, revision: "source-v1", colorSpace: "scene-linear" },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "png" },
  });
  await sessionWorkflow.runJob(queued.jobId);
  const staleArtifact = JSON.parse(await (await import("node:fs/promises")).readFile(queued.artifactPath, "utf8"));
  staleArtifact.outputName = "swapped-image.png";
  staleArtifact.companionOutput.path = path.join(dir, "swapped-image.png");
  await (await import("node:fs/promises")).writeFile(queued.artifactPath, JSON.stringify(staleArtifact, null, 2) + "\n", "utf8");

  const reloadedSessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-20T00:00:09.000Z" });
  const reloadedSessionWorkflow = createExportSessionWorkflow({ sessionStore: reloadedSessionStore, exportWorkflow: createExportWorkflow({ exportFoundation }) });
  await reloadedSessionWorkflow.reloadJobs();

  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.doneWithArtifactSidecarPresent, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarMissing, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarInvalid, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarStale, 1);
  assert.equal(summary.counts.doneWithArtifactSidecarIssue, 1);
  assert.equal(summary.counts.doneWithIntegrityIssue, 1);
  assert.equal(summary.latestArtifactSidecarPresent, null);
  assert.equal(summary.latestArtifactSidecarMissing, null);
  assert.equal(summary.latestArtifactSidecarInvalid, null);
  assert.equal(summary.latestArtifactSidecarStale.sessionId, queued.jobId);
  assert.equal(summary.latestArtifactSidecarIssue.sessionId, queued.jobId);
  assert.equal(summary.latestIntegrityIssue.sessionId, queued.jobId);
});


test("export dashboard workflow reloadJobsSummary returns reload report plus refreshed summary", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-reload-summary-"));
  const sessionStore = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: () => "2025-07-22T00:00:00.000Z",
  });
  const exportFoundation = createExportFoundation({ clock: () => "2025-07-22T10:00:00.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation }),
  });
  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-030",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "png" },
  });
  await sessionWorkflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image.png"));

  const reloadedSessionStore = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: () => "2025-07-22T00:00:09.000Z",
  });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation }),
  });
  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore, sessionWorkflow: reloadedSessionWorkflow });
  const result = await workflow.reloadJobsSummary({ jobIds: [queued.jobId, "missing-job"] });

  assert.deepEqual(result.operation, {
    kind: "reload-jobs",
    repairDone: false,
    requestedJobIds: [queued.jobId, "missing-job"],
    processedJobIds: [queued.jobId],
    skippedJobIds: ["missing-job"],
  });
  assert.deepEqual(result.report.requestedJobIds, [queued.jobId, "missing-job"]);
  assert.deepEqual(result.report.skippedJobIds, ["missing-job"]);
  assert.equal(result.report.counts.requested, 2);
  assert.equal(result.report.counts.processed, 1);
  assert.equal(result.report.counts.skipped, 1);
  assert.equal(result.summary.counts.doneWithProofMissing, 1);
  assert.equal(result.summary.counts.doneWithProofIssue, 1);
  assert.equal(result.summary.latestProofMissing.sessionId, queued.jobId);
});

test("export dashboard workflow repairDoneJobsSummary returns repair report plus healed summary", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-repair-summary-"));
  const sessionStore = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: () => "2025-07-23T00:00:00.000Z",
  });
  const exportFoundation = createExportFoundation({ clock: () => "2025-07-23T10:00:00.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation }),
  });
  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-031",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "png" },
  });
  await sessionWorkflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image.png"));

  const reloadedSessionStore = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: () => "2025-07-23T00:00:09.000Z",
  });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation }),
  });
  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore, sessionWorkflow: reloadedSessionWorkflow });
  const result = await workflow.repairDoneJobsSummary({ jobIds: [queued.jobId] });

  assert.deepEqual(result.operation, {
    kind: "repair-done-jobs",
    repairDone: true,
    requestedJobIds: [queued.jobId],
    processedJobIds: [queued.jobId],
    skippedJobIds: [],
  });
  assert.deepEqual(result.report.repairedJobIds, [queued.jobId]);
  assert.equal(result.report.counts.repaired, 1);
  assert.equal(result.summary.counts.doneWithProofPresent, 1);
  assert.equal(result.summary.counts.doneWithProofIssue, 0);
  assert.equal(result.summary.latestProofPresent.sessionId, queued.jobId);
});




test("export dashboard workflow reflects refreshed invalid rendered TIFF-16 companion state saved by export session reloads", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-tiff-invalid-refresh-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:00:10.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }),
    }),
  });

  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-301",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await sessionWorkflow.runJob(queued.jobId);
  await (await import("node:fs/promises")).writeFile(path.join(dir, "hero-image.tiff"), "not-a-tiff\n", "utf8");

  const reloadedSessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:00:11.000Z" });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }),
    }),
  });
  await reloadedSessionWorkflow.reloadJobs();
  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore, sessionWorkflow: reloadedSessionWorkflow });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.doneWithProofInvalid, 1);
  assert.equal(summary.counts.doneWithProofIssue, 1);
  assert.equal(summary.latestProofInvalid.sessionId, queued.jobId);
  assert.equal(summary.latestIntegrityIssue.sessionId, queued.jobId);
  assert.equal(summary.latestSessions[0].companionProof.refreshedStatus, "invalid");
});

test("export dashboard workflow repairDoneJobsSummary heals broken TIFF-16 exports", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-tiff-repair-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:00:20.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }),
    }),
  });

  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-302",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await sessionWorkflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image.tiff"));
  await (await import("node:fs/promises")).writeFile(path.join(dir, "hero-image.tiff.json"), `not-json
`, "utf8");

  const reloadedSessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:00:21.000Z" });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }),
    }),
  });
  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore, sessionWorkflow: reloadedSessionWorkflow });
  const result = await workflow.repairDoneJobsSummary({ jobIds: [queued.jobId] });
  assert.equal(result.summary.counts.doneWithProofPresent, 1);
  assert.equal(result.summary.counts.doneWithProofIssue, 0);
  assert.equal(result.summary.latestProofPresent.sessionId, queued.jobId);
  assert.equal(result.report.repairedJobIds[0], queued.jobId);
  assert.equal(result.report.jobs[0].companionOutput.kind, "image/tiff");
  assert.equal(result.report.jobs[0].companionOutput.status, "rendered-image");
});


test("export dashboard workflow reflects refreshed stale rendered TIFF-16 companion state saved by export session reloads", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-tiff-stale-refresh-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:00:30.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }),
    }),
  });

  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-303",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await sessionWorkflow.runJob(queued.jobId);

  const mismatchWorkflow = createExportWorkflow({
    exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }),
  });
  const mismatchQueued = mismatchWorkflow.queueExport({
    source: {
      imageId: "img-303",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "contrast", params: { amount: 12 } }] }),
    destinationDir: dir,
    namingTemplate: "mismatch-{baseName}",
    options: { format: "tiff", resize: { width: 64, height: 48 } },
  });
  await mismatchWorkflow.runJob(mismatchQueued.jobId);
  await (await import("node:fs/promises")).copyFile(path.join(dir, "mismatch-hero-image.tiff"), path.join(dir, "hero-image.tiff"));

  const reloadedSessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:00:31.000Z" });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }),
    }),
  });
  await reloadedSessionWorkflow.reloadJobs();

  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore, sessionWorkflow: reloadedSessionWorkflow });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.doneWithProofStale, 1);
  assert.equal(summary.counts.doneWithProofIssue, 1);
  assert.equal(summary.latestProofStale.sessionId, queued.jobId);
  assert.equal(summary.latestIntegrityIssue.sessionId, queued.jobId);
  assert.equal(summary.latestSessions[0].companionProof.refreshedStatus, "stale");
});

test("export dashboard workflow reloadJobsSummary reports stale TIFF-16 proof issues", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-tiff-reload-summary-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:00:40.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }) }),
  });

  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-304",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await sessionWorkflow.runJob(queued.jobId);

  const mismatchWorkflow = createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }) });
  const mismatchQueued = mismatchWorkflow.queueExport({
    source: {
      imageId: "img-304",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "contrast", params: { amount: 12 } }] }),
    destinationDir: dir,
    namingTemplate: "mismatch-{baseName}",
    options: { format: "tiff", resize: { width: 64, height: 48 } },
  });
  await mismatchWorkflow.runJob(mismatchQueued.jobId);
  await (await import("node:fs/promises")).copyFile(path.join(dir, "mismatch-hero-image.tiff"), path.join(dir, "hero-image.tiff"));

  const reloadedSessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:00:41.000Z" });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }) }),
  });
  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore, sessionWorkflow: reloadedSessionWorkflow });
  const result = await workflow.reloadJobsSummary();
  assert.equal(result.summary.counts.doneWithProofStale, 1);
  assert.equal(result.summary.counts.doneWithProofIssue, 1);
  assert.equal(result.summary.latestProofStale.sessionId, queued.jobId);
  assert.equal(result.summary.latestIntegrityIssue.sessionId, queued.jobId);
  assert.equal(result.report.jobs[0].companionOutput.kind, "image/tiff");
  assert.equal(result.report.jobs[0].companionOutput.status, "stale");
});


test("export dashboard workflow repairDoneJobsSummary heals stale TIFF-16 proof issues", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-tiff-repair-summary-stale-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:00:50.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }) }),
  });

  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-305",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await sessionWorkflow.runJob(queued.jobId);

  const mismatchWorkflow = createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }) });
  const mismatchQueued = mismatchWorkflow.queueExport({
    source: {
      imageId: "img-305",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "contrast", params: { amount: 12 } }] }),
    destinationDir: dir,
    namingTemplate: "mismatch-{baseName}",
    options: { format: "tiff", resize: { width: 64, height: 48 } },
  });
  await mismatchWorkflow.runJob(mismatchQueued.jobId);
  await (await import("node:fs/promises")).copyFile(path.join(dir, "mismatch-hero-image.tiff"), path.join(dir, "hero-image.tiff"));

  const reloadedSessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:00:51.000Z" });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }) }),
  });
  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore, sessionWorkflow: reloadedSessionWorkflow });
  const result = await workflow.repairDoneJobsSummary({ jobIds: [queued.jobId] });
  assert.equal(result.summary.counts.doneWithProofPresent, 1);
  assert.equal(result.summary.counts.doneWithProofIssue, 0);
  assert.equal(result.summary.latestProofPresent.sessionId, queued.jobId);
  assert.deepEqual(result.report.repairedJobIds, [queued.jobId]);
  assert.equal(result.report.jobs[0].companionOutput.kind, "image/tiff");
  assert.equal(result.report.jobs[0].companionOutput.status, "rendered-image");
});


test("export dashboard workflow reloadJobsSummary reports invalid TIFF-16 proof issues", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-tiff-invalid-summary-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:01:00.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }) }),
  });

  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-306",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await sessionWorkflow.runJob(queued.jobId);
  await (await import("node:fs/promises")).writeFile(path.join(dir, "hero-image.tiff"), "not-a-tiff\n", "utf8");

  const reloadedSessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:01:01.000Z" });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }) }),
  });
  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore, sessionWorkflow: reloadedSessionWorkflow });
  const result = await workflow.reloadJobsSummary();
  assert.equal(result.summary.counts.doneWithProofInvalid, 1);
  assert.equal(result.summary.counts.doneWithProofIssue, 1);
  assert.equal(result.summary.latestProofInvalid.sessionId, queued.jobId);
  assert.equal(result.summary.latestIntegrityIssue.sessionId, queued.jobId);
  assert.equal(result.report.jobs[0].companionOutput.kind, "image/tiff");
  assert.equal(result.report.jobs[0].companionOutput.status, "invalid");
});

test("export dashboard workflow repairDoneJobsSummary heals invalid TIFF-16 proof issues", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-tiff-invalid-repair-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:01:10.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }) }),
  });

  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-307",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await sessionWorkflow.runJob(queued.jobId);
  await (await import("node:fs/promises")).writeFile(path.join(dir, "hero-image.tiff"), "not-a-tiff\n", "utf8");

  const reloadedSessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:01:11.000Z" });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }) }),
  });
  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore, sessionWorkflow: reloadedSessionWorkflow });
  const result = await workflow.repairDoneJobsSummary({ jobIds: [queued.jobId] });
  assert.equal(result.summary.counts.doneWithProofPresent, 1);
  assert.equal(result.summary.counts.doneWithProofIssue, 0);
  assert.equal(result.summary.latestProofPresent.sessionId, queued.jobId);
  assert.deepEqual(result.report.repairedJobIds, [queued.jobId]);
  assert.equal(result.report.jobs[0].companionOutput.kind, "image/tiff");
  assert.equal(result.report.jobs[0].companionOutput.status, "rendered-image");
});


test("export dashboard workflow reflects refreshed missing rendered TIFF-16 companion state saved by export session reloads", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-tiff-missing-refresh-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:01:20.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }) }),
  });

  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-308",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await sessionWorkflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image.tiff"));

  const reloadedSessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:01:21.000Z" });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }) }),
  });
  await reloadedSessionWorkflow.reloadJobs();

  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore, sessionWorkflow: reloadedSessionWorkflow });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.doneWithProofMissing, 1);
  assert.equal(summary.counts.doneWithProofIssue, 1);
  assert.equal(summary.latestProofMissing.sessionId, queued.jobId);
  assert.equal(summary.latestIntegrityIssue.sessionId, queued.jobId);
  assert.equal(summary.latestSessions[0].companionProof.refreshedStatus, "missing");
});

test("export dashboard workflow reloadJobsSummary reports missing TIFF-16 proof issues", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-tiff-missing-summary-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:01:30.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }) }),
  });

  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-309",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await sessionWorkflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image.tiff"));

  const reloadedSessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-18T00:01:31.000Z" });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-18T10:00:00.000Z" }) }),
  });
  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore, sessionWorkflow: reloadedSessionWorkflow });
  const result = await workflow.reloadJobsSummary();
  assert.equal(result.summary.counts.doneWithProofMissing, 1);
  assert.equal(result.summary.counts.doneWithProofIssue, 1);
  assert.equal(result.summary.latestProofMissing.sessionId, queued.jobId);
  assert.equal(result.summary.latestIntegrityIssue.sessionId, queued.jobId);
  assert.equal(result.report.jobs[0].companionOutput.kind, "image/tiff");
  assert.equal(result.report.jobs[0].companionOutput.status, "missing");
});
test("export dashboard workflow reload/repair summary helpers require a session workflow", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-reload-errors-"));
  const sessionStore = await createExportSessionStore({
    path: path.join(dir, "export-sessions.json"),
    clock: () => "2025-07-24T00:00:00.000Z",
  });
  const workflow = createExportDashboardWorkflow({ sessionStore });

  await assert.rejects(() => workflow.reloadJobsSummary(), /sessionWorkflow with reloadJobsReport\(\) is required/);
  await assert.rejects(() => workflow.repairDoneJobsSummary(), /sessionWorkflow with reloadJobsReport\(\) is required/);
});

test("export dashboard workflow surfaces rendered JPEG companions as present proof state", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-jpeg-present-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-25T00:00:00.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-25T10:00:00.000Z" }) }),
  });

  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-501",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "jpeg", quality: 92, resize: { width: 240, height: 160 } },
  });
  await sessionWorkflow.runJob(queued.jobId);

  const workflow = createExportDashboardWorkflow({ sessionStore, sessionWorkflow });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.doneWithProofPresent, 1);
  assert.equal(summary.counts.doneWithProofIssue, 0);
  assert.equal(summary.latestProofPresent.sessionId, queued.jobId);
  assert.equal(summary.latestSessions[0].companionProof.refreshedStatus, "rendered-image");
});

test("export dashboard workflow reflects refreshed invalid rendered JPEG companion state saved by export session reloads", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-invalid-jpeg-refresh-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-25T00:01:00.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-25T10:00:00.000Z" }) }),
  });

  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-502",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "jpeg", quality: 92, resize: { width: 240, height: 160 } },
  });
  await sessionWorkflow.runJob(queued.jobId);
  await (await import("node:fs/promises")).writeFile(path.join(dir, "hero-image.jpg"), "not-a-jpeg\n", "utf8");

  const reloadedSessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-25T00:01:01.000Z" });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-25T10:00:00.000Z" }) }),
  });
  await reloadedSessionWorkflow.reloadJobs();

  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore, sessionWorkflow: reloadedSessionWorkflow });
  const summary = await workflow.summarizeSessions();
  assert.equal(summary.counts.doneWithProofInvalid, 1);
  assert.equal(summary.counts.doneWithProofIssue, 1);
  assert.equal(summary.latestProofInvalid.sessionId, queued.jobId);
  assert.equal(summary.latestIntegrityIssue.sessionId, queued.jobId);
  assert.equal(summary.latestSessions[0].companionProof.refreshedStatus, "invalid");
});

test("export dashboard workflow repairDoneJobsSummary heals broken JPEG exports", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-dashboard-repair-jpeg-"));
  const sessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-25T00:02:00.000Z" });
  const sessionWorkflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-25T10:00:00.000Z" }) }),
  });

  const queued = await sessionWorkflow.queueExport({
    source: {
      imageId: "img-503",
      path: "/shoots/day1/hero-image.CR3",
      width: 6000,
      height: 4000,
      revision: "source-v1",
      colorSpace: "scene-linear",
    },
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "jpeg", quality: 92, resize: { width: 240, height: 160 } },
  });
  await sessionWorkflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image.jpg"));
  await (await import("node:fs/promises")).writeFile(queued.artifactPath, `not-json\n`, "utf8");

  const reloadedSessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json"), clock: () => "2025-07-25T00:02:01.000Z" });
  const reloadedSessionWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedSessionStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-25T10:00:00.000Z" }) }),
  });
  const workflow = createExportDashboardWorkflow({ sessionStore: reloadedSessionStore, sessionWorkflow: reloadedSessionWorkflow });
  const result = await workflow.repairDoneJobsSummary();
  assert.deepEqual(result.report.repairedJobIds, [queued.jobId]);
  assert.equal(result.summary.counts.doneWithIntegrityIssue, 0);
  assert.equal(result.summary.latestIntegrityIssue, null);
  assert.equal(result.summary.latestSessions[0].companionProof.refreshedStatus, "rendered-image");
});
