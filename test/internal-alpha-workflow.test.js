import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
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
import { createInternalAlphaWorkflow } from "../src/internal-alpha/workflow.js";
import { createSidecarWorkflow } from "../src/catalog/sidecar-workflow.js";
import { createViewportProofSessionStore } from "../src/viewport-proof/session-store.js";
import { createViewportProofWorkflow } from "../src/viewport-proof/workflow.js";
import { createLicensingSessionStore } from "../src/licensing/session-store.js";
import { createLicensingSessionWorkflow } from "../src/licensing/session-workflow.js";
import { createPreviewSessionStore } from "../src/preview/session-store.js";
import { createPreviewSessionWorkflow } from "../src/preview/session-workflow.js";
import { createExportSessionStore } from "../src/export/session-store.js";
import { createExportSessionWorkflow } from "../src/export/session-workflow.js";
import { createInternalAlphaSessionStore } from "../src/internal-alpha/session-store.js";

async function makeFoundation() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-internal-alpha-"));
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
  const workspaceSessionWorkflow = createWorkspaceSessionWorkflow({
    sessionStore: workspaceSessionStore,
    libraryStore,
    presetStore,
    batchSessionStore,
  });
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
  const internalAlphaWorkflow = createInternalAlphaWorkflow({
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
  return { dir, internalAlphaWorkflow };
}

test("internal alpha workflow exercises import, preview, licensing, export, and parity together", async () => {
  const { dir, internalAlphaWorkflow } = await makeFoundation();
  const sourcePath = path.join(dir, "shoot", "hero.arw");
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, "raw-source-placeholder", "utf8");

  const report = await internalAlphaWorkflow.runFoundationFlowReport({
    files: [sourcePath],
    license: {
      status: "active",
      expiresAt: "2026-01-01T00:00:00.000Z",
    },
    credits: { balance: 3 },
    now: "2025-07-10T00:00:00.000Z",
    viewport: { width: 1200, height: 800 },
    destinationDir: path.join(dir, "exports"),
    namingTemplate: "{baseName}-final",
    exportOptions: { format: "png" },
  });

  assert.deepEqual(report.operation, {
    kind: "run-internal-alpha-foundation-flow",
    requestedFileCount: 1,
    importedImageIds: [report.operation.importedImageIds[0]],
    heroImageId: report.operation.importedImageIds[0],
    exportAttempted: true,
  });
  assert.equal(report.health.status, "ready");
  assert.equal(report.health.importedCount, 1);
  assert.equal(report.health.previewReady, true);
  assert.equal(report.health.exportDone, true);
  assert.equal(report.health.exportBlocked, false);
  assert.equal(report.health.parity.status, "matched");
  assert.deepEqual(report.health.blockingIssues, []);
  assert.deepEqual(report.health.warnings, ["viewport-proof-still-provisional"]);
  assert.deepEqual(report.health.nextMilestones, ["prove-real-image-sized-viewport-path"]);
  assert.equal(report.preview.previewArtifact.renderedImage.status, "rendered-image");
  assert.equal(report.exportRun.job.status, "done");
  assert.equal(report.exportRun.artifact.exportOptions.format, "png");
  assert.equal(report.evidence.previewRequestId, report.preview.requestId);
  assert.equal(report.evidence.exportJobId, report.exportRun.job.jobId);
  assert.equal(report.evidence.viewportSessionId, "internal-alpha-viewport");
  assert.equal(report.evidence.licensingSnapshotId, "internal-alpha-license");
  assert.equal(report.evidence.previewSessionId, "internal-alpha-preview");
  assert.equal(report.evidence.exportSessionId, report.exportRun.job.jobId);
  assert.equal(report.persistence.previewCacheStatus, "rendered-image");
  assert.equal(report.persistence.exportCompanionStatus, "rendered-image");
  assert.equal(report.persistence.exportArtifactSidecarStatus, "present");
  assert.equal(report.persistence.previewSessionStored, true);
  assert.equal(report.persistence.exportSessionStored, true);
  assert.equal(report.savedRun.operation.kind, "save-internal-alpha-run");
  assert.equal(report.savedRun.run.runId, `internal-alpha-${report.operation.heroImageId}`);
});

test("internal alpha workflow reports blocked local export honestly when license access is denied", async () => {
  const { dir, internalAlphaWorkflow } = await makeFoundation();
  const sourcePath = path.join(dir, "shoot", "locked.arw");
  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, "raw-source-placeholder", "utf8");

  const report = await internalAlphaWorkflow.runFoundationFlowReport({
    files: [sourcePath],
    license: {
      status: "expired",
      expiresAt: "2024-01-01T00:00:00.000Z",
    },
    credits: { balance: 9 },
    now: "2025-07-10T00:00:00.000Z",
    viewport: { width: 1200, height: 800 },
    destinationDir: path.join(dir, "exports"),
    exportOptions: { format: "png" },
  });

  assert.equal(report.health.status, "provisional");
  assert.equal(report.health.importedCount, 1);
  assert.equal(report.health.previewReady, true);
  assert.equal(report.health.exportDone, false);
  assert.equal(report.health.exportBlocked, true);
  assert.equal(report.exportRun, null);
  assert.equal(report.health.parity.status, "unavailable");
  assert.equal(report.access.access.localExport.allowed, false);
  assert.deepEqual(report.health.blockingIssues, ["local-export-blocked"]);
  assert.deepEqual(report.health.warnings, ["viewport-proof-still-provisional"]);
  assert.deepEqual(report.health.nextMilestones, ["prove-real-image-sized-viewport-path", "resolve-local-license-for-export"]);
});


test("internal alpha workflow can extend the hero edit through preset, batch session, and workspace summary", async () => {
  const { dir, internalAlphaWorkflow } = await makeFoundation();
  const heroPath = path.join(dir, "shoot", "hero-2.arw");
  const targetPath = path.join(dir, "shoot", "target-2.arw");
  await mkdir(path.dirname(heroPath), { recursive: true });
  await writeFile(heroPath, "raw-source-placeholder", "utf8");
  await writeFile(targetPath, "raw-source-placeholder-2", "utf8");

  const report = await internalAlphaWorkflow.runFoundationFlowReport({
    files: [heroPath, targetPath],
    license: {
      status: "active",
      expiresAt: "2026-01-01T00:00:00.000Z",
    },
    credits: { balance: 5 },
    now: "2025-07-10T00:00:00.000Z",
    viewport: { width: 1000, height: 700 },
    destinationDir: path.join(dir, "exports"),
    namingTemplate: "{baseName}-hero",
    exportOptions: { format: "png" },
  });

  assert.equal(report.health.status, "ready");
  assert.equal(report.health.presetSaved, true);
  assert.equal(report.health.batchAppliedCount, 1);
  assert.equal(report.health.workspaceSaved, true);
  assert.deepEqual(report.health.blockingIssues, []);
  assert.equal(report.preset.operation.kind, "save-preset-from-recipe");
  assert.equal(report.batchSession.operation.kind, "apply-batch-session");
  assert.equal(report.workspace.operation.kind, "summarize-workspace-session");
  assert.equal(report.appliedPreset.length, 1);
  assert.equal(report.batchApplied.length, 1);
  assert.equal(report.workspace.snapshot.selectedImageId, report.operation.heroImageId);
  assert.equal(report.workspace.snapshot.activeBatchSessionId, "internal-alpha-batch");
  assert.equal(report.evidence.presetId, "internal-alpha-hero");
  assert.equal(report.evidence.batchSessionId, "internal-alpha-batch");
  assert.equal(report.evidence.workspaceSnapshotId, "internal-alpha-workspace");
});


test("internal alpha workflow can persist licensing, sidecar, and viewport proof evidence alongside the integrated flow", async () => {
  const { dir, internalAlphaWorkflow } = await makeFoundation();
  const heroPath = path.join(dir, "shoot", "hero-3.arw");
  await mkdir(path.dirname(heroPath), { recursive: true });
  await writeFile(heroPath, "raw-source-placeholder-3", "utf8");

  const report = await internalAlphaWorkflow.runFoundationFlowReport({
    files: [heroPath],
    license: {
      status: "active",
      expiresAt: "2026-01-01T00:00:00.000Z",
    },
    credits: { balance: 7 },
    now: "2025-07-10T00:00:00.000Z",
    viewport: { width: 900, height: 600 },
    destinationDir: path.join(dir, "exports"),
    exportOptions: { format: "png" },
  });

  assert.equal(report.health.status, "ready");
  assert.equal(report.health.sidecarExported, true);
  assert.equal(report.health.sidecarInSync, true);
  assert.equal(report.health.viewportCollected, true);
  assert.equal(report.health.licensingSnapshotSaved, true);
  assert.equal(report.sidecar.operation.kind, "export-sidecar-recipe");
  assert.equal(report.sidecarSync.operation.kind, "inspect-sidecar-sync");
  assert.equal(report.sidecarSync.sync.status, "in-sync");
  assert.equal(report.viewportProof.operation.kind, "collect-and-save-viewport-proof");
  assert.equal(report.viewportProof.report.headline, "PROVISIONAL");
  assert.equal(report.licensingSnapshot.operation.kind, "save-licensing-snapshot");
  assert.equal(report.licensingSnapshot.report.access.localExport.allowed, true);
  assert.deepEqual(report.health.warnings, ["viewport-proof-still-provisional"]);
  assert.equal(report.evidence.sidecarStatus, "in-sync");
  assert.equal(report.evidence.viewportHeadline, "PROVISIONAL");
  assert.equal(report.evidence.localExportAllowed, true);
  assert.equal(report.persistence.sidecarFileStatus, "present");
  assert.equal(report.persistence.viewportStored, true);
  assert.equal(report.persistence.licensingStored, true);
});
