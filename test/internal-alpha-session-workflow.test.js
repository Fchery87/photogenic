import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createLibraryStore } from "../src/catalog/library-store.js";
import { createCatalogRecipeStore } from "../src/catalog/recipe-store.js";
import { createCatalogWorkflow } from "../src/catalog/workflow.js";
import { createPreviewWorkflow } from "../src/preview/workflow.js";
import { createExportWorkflow } from "../src/export/workflow.js";
import { createLicensingWorkflow } from "../src/licensing/workflow.js";
import { createPresetStore } from "../src/catalog/preset-store.js";
import { createPresetWorkflow } from "../src/catalog/preset-workflow.js";
import { createBatchSessionStore } from "../src/catalog/batch-session-store.js";
import { createBatchSessionWorkflow } from "../src/catalog/batch-session-workflow.js";
import { createWorkspaceSessionStore } from "../src/catalog/workspace-session-store.js";
import { createWorkspaceSessionWorkflow } from "../src/catalog/workspace-session-workflow.js";
import { createSidecarWorkflow } from "../src/catalog/sidecar-workflow.js";
import { createViewportProofSessionStore } from "../src/viewport-proof/session-store.js";
import { createViewportProofWorkflow } from "../src/viewport-proof/workflow.js";
import { createLicensingSessionStore } from "../src/licensing/session-store.js";
import { createLicensingSessionWorkflow } from "../src/licensing/session-workflow.js";
import { createPreviewSessionStore } from "../src/preview/session-store.js";
import { createPreviewSessionWorkflow } from "../src/preview/session-workflow.js";
import { createExportSessionStore } from "../src/export/session-store.js";
import { createExportSessionWorkflow } from "../src/export/session-workflow.js";
import { createInternalAlphaWorkflow } from "../src/internal-alpha/workflow.js";
import { createInternalAlphaSessionStore } from "../src/internal-alpha/session-store.js";
import { createInternalAlphaDashboardWorkflow } from "../src/internal-alpha/dashboard-workflow.js";
import { createInternalAlphaSessionWorkflow } from "../src/internal-alpha/session-workflow.js";

async function makeSessionWorkflow() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-internal-alpha-session-workflow-"));
  const libraryStore = await createLibraryStore({ path: path.join(dir, "library.json") });
  const recipeStore = await createCatalogRecipeStore({ path: path.join(dir, "recipes.json") });
  const catalogWorkflow = createCatalogWorkflow({ libraryStore, recipeStore });
  const previewWorkflow = createPreviewWorkflow({
    cachePathFor: (proxy) => path.join(dir, "preview-cache", `${proxy.proxyKey}.png`),
  });
  const exportWorkflow = createExportWorkflow();
  const licensingWorkflow = createLicensingWorkflow();
  const presetStore = await createPresetStore({ path: path.join(dir, "presets.json") });
  const presetWorkflow = createPresetWorkflow({ presetStore });
  const batchSessionStore = await createBatchSessionStore({ path: path.join(dir, "batch-sessions.json") });
  const batchSessionWorkflow = createBatchSessionWorkflow({ sessionStore: batchSessionStore, recipeStore });
  const workspaceSessionStore = await createWorkspaceSessionStore({ path: path.join(dir, "workspace.json") });
  const workspaceSessionWorkflow = createWorkspaceSessionWorkflow({ sessionStore: workspaceSessionStore, libraryStore, presetStore, batchSessionStore });
  const sidecarWorkflow = createSidecarWorkflow({ recipeStore });
  const viewportSessionStore = await createViewportProofSessionStore({ path: path.join(dir, "viewport.json") });
  const viewportProofWorkflow = createViewportProofWorkflow({ sessionStore: viewportSessionStore });
  const licensingSessionStore = await createLicensingSessionStore({ path: path.join(dir, "licensing.json") });
  const licensingSessionWorkflow = createLicensingSessionWorkflow({ licensingWorkflow, sessionStore: licensingSessionStore });
  const previewSessionStore = await createPreviewSessionStore({ path: path.join(dir, "preview-sessions.json") });
  const previewSessionWorkflow = createPreviewSessionWorkflow({ previewWorkflow, sessionStore: previewSessionStore });
  const exportSessionStore = await createExportSessionStore({ path: path.join(dir, "export-sessions.json") });
  const exportSessionWorkflow = createExportSessionWorkflow({ exportWorkflow, sessionStore: exportSessionStore });
  const internalAlphaSessionStore = await createInternalAlphaSessionStore({ path: path.join(dir, "internal-alpha.json") });
  const workflow = createInternalAlphaWorkflow({
    licensingWorkflow,
    catalogWorkflow,
    previewWorkflow,
    exportWorkflow,
    presetWorkflow,
    batchSessionWorkflow,
    workspaceSessionWorkflow,
    sidecarWorkflow,
    viewportProofWorkflow,
    licensingSessionWorkflow,
    previewSessionWorkflow,
    exportSessionWorkflow,
    sessionStore: internalAlphaSessionStore,
  });
  const dashboardWorkflow = createInternalAlphaDashboardWorkflow({ sessionStore: internalAlphaSessionStore });
  const sessionWorkflow = createInternalAlphaSessionWorkflow({ workflow, sessionStore: internalAlphaSessionStore, dashboardWorkflow });
  return { dir, sessionWorkflow };
}

test("internal alpha session workflow can run, save, and summarize a foundation flow", async () => {
  const { dir, sessionWorkflow } = await makeSessionWorkflow();
  const sourcePath = path.join(dir, "shoot", "hero.arw");
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, "raw-source-placeholder", "utf8");

  const result = await sessionWorkflow.runAndSaveReport("alpha-run-1", {
    files: [sourcePath],
    license: { status: "active", expiresAt: "2026-01-01T00:00:00.000Z" },
    credits: { balance: 3 },
    now: "2025-07-10T00:00:00.000Z",
    viewport: { width: 1200, height: 800 },
    destinationDir: path.join(dir, "exports"),
    exportOptions: { format: "png" },
  });

  assert.deepEqual(result.operation, {
    kind: "run-and-save-internal-alpha",
    runId: "alpha-run-1",
    status: "ready",
    heroImageId: result.report.operation.heroImageId,
  });
  assert.equal(result.run.runId, "alpha-run-1");
  assert.equal(result.report.health.status, "ready");
  assert.equal(result.summary.summary.counts.total, 1);
  assert.equal(result.summary.summary.counts.ready, 1);
  assert.equal(result.runSummary.runId, "alpha-run-1");
  assert.equal(result.runSummary.status, "ready");
  assert.equal(result.runSummary.previewReady, true);
  assert.equal(result.readableReport.headline, "READY WITH WARNINGS");
  assert.match(result.readableReport.narrative, /Warnings remain/i);
});

test("internal alpha session workflow can load a saved run with operation metadata", async () => {
  const { dir, sessionWorkflow } = await makeSessionWorkflow();
  const sourcePath = path.join(dir, "shoot", "hero-2.arw");
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, "raw-source-placeholder", "utf8");

  await sessionWorkflow.runAndSave("alpha-run-2", {
    files: [sourcePath],
    license: { status: "expired", expiresAt: "2024-01-01T00:00:00.000Z" },
    credits: { balance: 3 },
    now: "2025-07-10T00:00:00.000Z",
    viewport: { width: 800, height: 600 },
    destinationDir: path.join(dir, "exports"),
    exportOptions: { format: "png" },
  });

  const loaded = await sessionWorkflow.loadRunReport("alpha-run-2");
  assert.deepEqual(loaded.operation, {
    kind: "load-internal-alpha-run",
    runId: "alpha-run-2",
    status: "provisional",
  });
  assert.equal(loaded.run.runId, "alpha-run-2");
  assert.equal(loaded.report.health.status, "provisional");
  assert.equal(loaded.runSummary.runId, "alpha-run-2");
  assert.equal(loaded.runSummary.status, "provisional");
  assert.equal(loaded.runSummary.exportBlocked, true);
  assert.equal(loaded.readableReport.headline, "PROVISIONAL");
  assert.match(loaded.readableReport.narrative, /Local export remained blocked/i);
});

test("internal alpha session workflow can summarize saved run history with a readable report", async () => {
  const { dir, sessionWorkflow } = await makeSessionWorkflow();
  const readyPath = path.join(dir, "shoot", "ready.arw");
  const blockedPath = path.join(dir, "shoot", "blocked.arw");
  await mkdir(path.dirname(readyPath), { recursive: true });
  await writeFile(readyPath, "raw-source-placeholder", "utf8");
  await writeFile(blockedPath, "raw-source-placeholder", "utf8");

  await sessionWorkflow.runAndSave("alpha-ready", {
    files: [readyPath],
    license: { status: "active", expiresAt: "2026-01-01T00:00:00.000Z" },
    credits: { balance: 3 },
    now: "2025-07-10T00:00:00.000Z",
    viewport: { width: 1200, height: 800 },
    destinationDir: path.join(dir, "exports-ready"),
    exportOptions: { format: "png" },
  });
  await sessionWorkflow.runAndSave("alpha-blocked", {
    files: [blockedPath],
    license: { status: "expired", expiresAt: "2024-01-01T00:00:00.000Z" },
    credits: { balance: 3 },
    now: "2025-07-10T00:00:00.000Z",
    viewport: { width: 800, height: 600 },
    destinationDir: path.join(dir, "exports-blocked"),
    exportOptions: { format: "png" },
  });

  const listed = await sessionWorkflow.listRunIdsReport();
  assert.deepEqual(listed.operation, {
    kind: "list-internal-alpha-runs",
    count: 4,
  });
  assert.ok(listed.runIds.includes("alpha-blocked"));
  assert.ok(listed.runIds.includes("alpha-ready"));

  const history = await sessionWorkflow.summarizeHistoryReport({ runIds: ["alpha-blocked", "alpha-ready"] });
  assert.deepEqual(history.operation, {
    kind: "summarize-internal-alpha-history",
    requestedRunIds: ["alpha-blocked", "alpha-ready"],
    processedRunIds: ["alpha-blocked", "alpha-ready"],
    skippedRunIds: [],
  });
  assert.equal(history.summary.counts.total, 2);
  assert.equal(history.summary.counts.ready, 1);
  assert.equal(history.summary.counts.provisional, 1);
  assert.equal(history.readableReport.headline, "PROVISIONAL HISTORY");
  assert.match(history.readableReport.narrative, /1 saved run reached ready status/i);
  assert.match(history.readableReport.narrative, /1 saved run remained provisional/i);
  assert.deepEqual(history.historySummary, {
    total: 2,
    runIds: ["alpha-blocked", "alpha-ready"],
    latestRunId: "alpha-blocked",
    oldestRunId: "alpha-ready",
    statuses: { provisional: 1, ready: 1 },
  });

  const latest = await sessionWorkflow.loadLatestRunReport();
  assert.deepEqual(latest.operation, {
    kind: "load-latest-internal-alpha-run",
    runId: "alpha-ready",
    status: "ready",
  });
  assert.equal(latest.run.runId, "alpha-ready");
});
