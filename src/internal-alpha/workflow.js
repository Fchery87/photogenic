import path from "node:path";

function defaultViewport(viewport = {}) {
  return {
    width: Number.isInteger(viewport.width) ? viewport.width : 1600,
    height: Number.isInteger(viewport.height) ? viewport.height : 900,
    zoom: typeof viewport.zoom === "number" ? viewport.zoom : 1,
    centerX: typeof viewport.centerX === "number" ? viewport.centerX : 0.5,
    centerY: typeof viewport.centerY === "number" ? viewport.centerY : 0.5,
  };
}

function defaultExportOptions(viewport, exportOptions = {}) {
  return {
    format: exportOptions.format ?? "png",
    quality: exportOptions.quality,
    embedIcc: exportOptions.embedIcc,
    sharpenForOutput: exportOptions.sharpenForOutput,
    resize: exportOptions.resize ?? {
      width: viewport.width,
      height: viewport.height,
    },
  };
}


function resolveHeroSource(libraryEntry, viewport) {
  return {
    ...libraryEntry,
    width: Number.isInteger(libraryEntry?.width) ? libraryEntry.width : viewport.width,
    height: Number.isInteger(libraryEntry?.height) ? libraryEntry.height : viewport.height,
  };
}


function buildBatchTargetRecipes(importedCatalogEntries, heroImageId) {
  return importedCatalogEntries
    .filter((entry) => entry.imageId !== heroImageId)
    .map((entry) => ({ imageId: entry.imageId, recipe: entry.recipe.recipe }));
}

function summarizeParity(preview, exportRun) {
  const previewImage = preview?.previewArtifact?.renderedImage ?? null;
  const exportImage = exportRun?.artifact?.companionOutput ?? null;
  if (!previewImage || !exportImage) {
    return {
      status: "unavailable",
      matched: false,
      reason: "Preview or export rendered image metadata is unavailable.",
    };
  }
  const previewHash = previewImage.contentHash?.value ?? null;
  const exportHash = exportImage.contentHash?.value ?? null;
  const matched =
    previewImage.status === "rendered-image" &&
    exportImage.status === "rendered-image" &&
    previewHash &&
    previewHash === exportHash &&
    previewImage.width === exportImage.width &&
    previewImage.height === exportImage.height;

  return {
    status: matched ? "matched" : "mismatched",
    matched,
    previewHash,
    exportHash,
    previewDimensions: {
      width: previewImage.width ?? null,
      height: previewImage.height ?? null,
    },
    exportDimensions: {
      width: exportImage.width ?? null,
      height: exportImage.height ?? null,
    },
    reason: matched
      ? "Preview cache PNG and export PNG companion metadata match for the current deterministic foundation seam."
      : "Preview and export rendered image metadata differ or are not both healthy rendered-image outputs.",
  };
}


function buildHealthSummary({
  access,
  imported,
  preview,
  exportRun,
  parity,
  preset,
  batchApplied,
  workspace,
  sidecar,
  sidecarSync,
  viewportProof,
  licensingSnapshot,
}) {
  const blockingIssues = [];
  const warnings = [];

  if (imported.imported.counts.imported === 0) {
    blockingIssues.push("no-supported-imports");
  }
  if (preview?.status !== "ready") {
    blockingIssues.push("preview-not-ready");
  }
  if (!access.access.localExport.allowed) {
    blockingIssues.push("local-export-blocked");
  }
  if (access.access.localExport.allowed && exportRun?.job?.status !== "done") {
    blockingIssues.push("export-not-done");
  }
  if (access.access.localExport.allowed && parity.status !== "matched") {
    blockingIssues.push("preview-export-parity-unmatched");
  }
  if (sidecar && sidecarSync?.sync?.status !== "in-sync") {
    warnings.push("sidecar-not-in-sync");
  }
  if (viewportProof?.report?.headline !== "UNLOCKED") {
    warnings.push("viewport-proof-still-provisional");
  }
  if (!licensingSnapshot) {
    warnings.push("licensing-session-not-persisted");
  }
  if (preset && batchApplied.length === 0) {
    warnings.push("preset-saved-without-batch-application");
  }
  if (workspace === null) {
    warnings.push("workspace-session-not-saved");
  }

  const nextMilestones = [];
  if (warnings.includes("viewport-proof-still-provisional")) {
    nextMilestones.push("prove-real-image-sized-viewport-path");
  }
  if (blockingIssues.includes("preview-export-parity-unmatched")) {
    nextMilestones.push("restore-preview-export-parity");
  }
  if (blockingIssues.includes("local-export-blocked")) {
    nextMilestones.push("resolve-local-license-for-export");
  }
  if (blockingIssues.includes("export-not-done")) {
    nextMilestones.push("stabilize-export-execution");
  }
  if (nextMilestones.length === 0 && warnings.length === 0) {
    nextMilestones.push("advance-native-pipeline-and-export-backends");
  }

  return {
    status: blockingIssues.length === 0 ? "ready" : imported.imported.counts.imported === 0 ? "empty-import" : "provisional",
    importedCount: imported.imported.counts.imported,
    skippedCount: imported.imported.counts.skipped,
    previewReady: preview?.status === "ready",
    exportDone: exportRun?.job?.status === "done",
    exportBlocked: !access.access.localExport.allowed,
    presetSaved: Boolean(preset),
    batchAppliedCount: batchApplied.length,
    workspaceSaved: Boolean(workspace),
    sidecarExported: Boolean(sidecar),
    sidecarInSync: sidecarSync?.sync?.status === "in-sync",
    viewportCollected: Boolean(viewportProof),
    licensingSnapshotSaved: Boolean(licensingSnapshot),
    blockingIssues,
    warnings,
    nextMilestones,
    parity,
  };
}


function buildEvidenceSummary({
  imported,
  preview,
  exportRun,
  preset,
  batchSession,
  workspace,
  sidecar,
  sidecarSync,
  viewportProof,
  licensingSnapshot,
  previewSession,
  exportSession,
}) {
  return {
    importedImageIds: imported.catalogEntries.map((entry) => entry.imageId),
    previewRequestId: preview?.requestId ?? null,
    previewCacheFilePath: preview?.previewArtifact?.cacheFilePath ?? null,
    exportJobId: exportRun?.job?.jobId ?? null,
    exportArtifactPath: exportRun?.artifact?.path ?? exportRun?.job?.outputPath ?? null,
    exportCompanionPath: exportRun?.artifact?.companionOutput?.path ?? null,
    presetId: preset?.preset?.presetId ?? null,
    batchSessionId: batchSession?.session?.sessionId ?? null,
    workspaceSnapshotId: workspace?.snapshot?.snapshotId ?? null,
    sidecarPath: sidecar?.exported?.sidecarFile?.path ?? sidecar?.exported?.sidecarPath ?? null,
    sidecarStatus: sidecarSync?.sync?.status ?? null,
    viewportSessionId: viewportProof?.session?.sessionId ?? null,
    viewportHeadline: viewportProof?.report?.headline ?? null,
    licensingSnapshotId: licensingSnapshot?.snapshot?.snapshotId ?? null,
    previewSessionId: previewSession?.session?.sessionId ?? null,
    exportSessionId: exportSession?.sessionId ?? exportSession?.session?.sessionId ?? null,
    localExportAllowed: licensingSnapshot?.report?.access?.localExport?.allowed ?? null,
  };
}


function buildPersistenceSummary({ preview, refreshedPreview, exportRun, refreshedExport, sidecarSync, viewportProof, licensingSnapshot, previewSession, exportSession }) {
  return {
    previewCacheStatus: refreshedPreview?.previewArtifact?.renderedImage?.status ?? preview?.previewArtifact?.renderedImage?.status ?? null,
    exportCompanionStatus: refreshedExport?.companionOutput?.status ?? exportRun?.artifact?.companionOutput?.status ?? null,
    exportArtifactSidecarStatus: refreshedExport?.artifactSidecar?.status ?? null,
    sidecarFileStatus: sidecarSync?.sync?.sidecarFile?.status ?? null,
    viewportStored: Boolean(viewportProof?.session?.sessionId),
    licensingStored: Boolean(licensingSnapshot?.snapshot?.snapshotId),
    previewSessionStored: Boolean(previewSession?.session?.sessionId),
    exportSessionStored: Boolean(exportSession?.sessionId ?? exportSession?.session?.sessionId),
  };
}

export function createInternalAlphaWorkflow({
  licensingWorkflow,
  catalogWorkflow,
  previewWorkflow,
  exportWorkflow,
  presetWorkflow = null,
  batchSessionWorkflow = null,
  workspaceSessionWorkflow = null,
  sidecarWorkflow = null,
  viewportProofWorkflow = null,
  licensingSessionWorkflow = null,
  previewSessionWorkflow = null,
  exportSessionWorkflow = null,
  sessionStore = null,
} = {}) {
  if (!licensingWorkflow || typeof licensingWorkflow.summarizeAccessReport !== "function") {
    throw new TypeError("licensingWorkflow with summarizeAccessReport() is required");
  }
  if (!catalogWorkflow || typeof catalogWorkflow.importShootReport !== "function") {
    throw new TypeError("catalogWorkflow with importShootReport() is required");
  }
  if (!previewWorkflow || typeof previewWorkflow.requestPreviewReport !== "function" || typeof previewWorkflow.fulfillPreviewReport !== "function") {
    throw new TypeError("previewWorkflow with requestPreviewReport() and fulfillPreviewReport() is required");
  }
  if (!exportWorkflow || typeof exportWorkflow.queueExportReport !== "function" || typeof exportWorkflow.runJobReport !== "function") {
    throw new TypeError("exportWorkflow with queueExportReport() and runJobReport() is required");
  }

  return {
    async runFoundationFlowReport({
      files,
      license = null,
      credits = null,
      now = null,
      viewport = {},
      destinationDir,
      namingTemplate = "{baseName}",
      exportOptions = {},
    } = {}) {
      if (!Array.isArray(files) || files.length === 0) throw new TypeError("files must be a non-empty array");
      if (typeof destinationDir !== "string" || !destinationDir) throw new TypeError("destinationDir is required");

      const access = licensingWorkflow.summarizeAccessReport({ license, credits, now });
      const imported = await catalogWorkflow.importShootReport(files);
      const hero = imported.catalogEntries[0] ?? null;
      if (!hero) {
        return {
          operation: {
            kind: "run-internal-alpha-foundation-flow",
            requestedFileCount: files.length,
            importedImageIds: [],
            heroImageId: null,
            exportAttempted: false,
          },
          access,
          imported,
          preview: null,
          exportRun: null,
          health: {
            status: "empty-import",
            importedCount: 0,
            skippedCount: imported.imported.skipped.length,
            previewReady: false,
            exportDone: false,
            exportBlocked: !access.access.localExport.allowed,
            parity: { status: "unavailable", matched: false, reason: "No imported hero image was available." },
          },
        };
      }

      const resolvedViewport = defaultViewport(viewport);
      const heroSource = resolveHeroSource(hero.library, resolvedViewport);
      const previewRequest = previewWorkflow.requestPreviewReport({
        source: heroSource,
        recipe: hero.recipe.recipe,
        viewport: resolvedViewport,
      });
      const preview = previewRequest.preview.cacheStatus === "hit"
        ? previewRequest.preview
        : previewWorkflow.fulfillPreviewReport(previewRequest.preview).preview;

      let preset = null;
      let appliedPreset = [];
      let batchSession = null;
      let batchApplied = [];
      let workspace = null;
      let sidecar = null;
      let sidecarSync = null;
      let viewportProof = null;
      let licensingSnapshot = null;
      let previewSession = null;
      let exportSession = null;
      let refreshedPreview = null;
      let refreshedExport = null;

      if (presetWorkflow && imported.catalogEntries.length > 1) {
        const presetResult = await presetWorkflow.savePresetFromRecipeReport("internal-alpha-hero", {
          name: "Internal Alpha Hero",
          recipe: hero.recipe.recipe,
          includedTypes: ["exposure", "contrast"],
          meta: { sourceImageId: hero.imageId },
        });
        preset = presetResult;

        const batchTargets = buildBatchTargetRecipes(imported.catalogEntries, hero.imageId);
        appliedPreset = await Promise.all(
          batchTargets.map(async ({ imageId, recipe }) => ({
            imageId,
            recipe: await presetWorkflow.applyPresetToRecipeReport("internal-alpha-hero", recipe),
          })),
        );

        if (batchSessionWorkflow && batchTargets.length > 0) {
          await batchSessionWorkflow.saveBatchSession("internal-alpha-batch", {
            sourceImageId: hero.imageId,
            includedTypes: ["exposure", "contrast"],
            targetImageIds: batchTargets.map((entry) => entry.imageId),
          });
          batchSession = await batchSessionWorkflow.applyBatchSessionReport("internal-alpha-batch");
          batchApplied = batchSession.applied;
        }
      }

      let exportRun = null;
      if (access.access.localExport.allowed) {
        const queued = exportWorkflow.queueExportReport({
          source: heroSource,
          recipe: hero.recipe.recipe,
          destinationDir,
          namingTemplate,
          options: defaultExportOptions(resolvedViewport, exportOptions),
        });
        exportRun = await exportWorkflow.runJobReport(queued.job.jobId);
      }

      if (workspaceSessionWorkflow) {
        await workspaceSessionWorkflow.saveWorkspace("internal-alpha-workspace", {
          selectedImageId: hero.imageId,
          activeFilter: "all",
          activePresetId: preset?.preset?.presetId ?? null,
          activeBatchSessionId: batchSession?.session?.sessionId ?? null,
          expandedImageIds: imported.catalogEntries.map((entry) => entry.imageId),
        });
        workspace = await workspaceSessionWorkflow.summarizeWorkspaceReport("internal-alpha-workspace");
      }

      if (sidecarWorkflow) {
        const sidecarPath = path.join(destinationDir, `${hero.imageId}.photogenic.json`);
        sidecar = await sidecarWorkflow.exportRecipeReport(hero.imageId, sidecarPath);
        sidecarSync = await sidecarWorkflow.inspectSyncReport(hero.imageId, sidecarPath);
      }

      if (viewportProofWorkflow) {
        viewportProof = await viewportProofWorkflow.collectAndSaveReport({
          sessionId: "internal-alpha-viewport",
          shell: "internal-alpha-browser",
          gradientDrawn: true,
          invoke: null,
        });
      }

      if (licensingSessionWorkflow) {
        licensingSnapshot = await licensingSessionWorkflow.saveSnapshotReport("internal-alpha-license", {
          evaluatedAt: now,
          license,
          credits,
        });
      }

      if (previewSessionWorkflow) {
        previewSession = await previewSessionWorkflow.savePreview("internal-alpha-preview", preview);
      }
      if (exportSessionWorkflow && access.access.localExport.allowed && exportRun?.job?.jobId) {
        exportSession = await exportSessionWorkflow.sessionStore?.saveSession?.(exportRun.job.jobId, {
          imageId: hero.imageId,
          outputName: exportRun.job.outputName,
          outputPath: exportRun.job.artifactPath,
          status: exportRun.job.status,
          options: defaultExportOptions(resolvedViewport, exportOptions),
          source: heroSource,
          recipe: hero.recipe.recipe,
          companionOutput: exportRun.artifact?.companionOutput ?? null,
          artifactSidecar: exportRun.job.artifactSidecar ?? null,
          error: exportRun.job.error ?? null,
        });
      }

      if (typeof previewWorkflow.refreshPreview === "function") {
        refreshedPreview = previewWorkflow.refreshPreview(preview);
      }
      if (exportRun?.job?.jobId && typeof exportWorkflow.refreshJob === "function") {
        refreshedExport = await exportWorkflow.refreshJob(exportRun.job.jobId);
      }

      const parity = summarizeParity(preview, exportRun);
      const evidence = buildEvidenceSummary({
        imported,
        preview,
        exportRun,
        preset,
        batchSession,
        workspace,
        sidecar,
        sidecarSync,
        viewportProof,
        licensingSnapshot,
        previewSession,
        exportSession,
      });
      const persistence = buildPersistenceSummary({
        preview,
        refreshedPreview,
        exportRun,
        refreshedExport,
        sidecarSync,
        viewportProof,
        licensingSnapshot,
        previewSession,
        exportSession,
      });
      const health = buildHealthSummary({
        access,
        imported,
        preview,
        exportRun,
        parity,
        preset,
        batchApplied,
        workspace,
        sidecar,
        sidecarSync,
        viewportProof,
        licensingSnapshot,
      });
      const report = {
        operation: {
          kind: "run-internal-alpha-foundation-flow",
          requestedFileCount: files.length,
          importedImageIds: imported.catalogEntries.map((entry) => entry.imageId),
          heroImageId: hero.imageId,
          exportAttempted: access.access.localExport.allowed,
        },
        access,
        imported,
        heroSource,
        preset,
        appliedPreset,
        batchSession,
        batchApplied,
        workspace,
        sidecar,
        sidecarSync,
        viewportProof,
        licensingSnapshot,
        previewSession,
        exportSession,
        refreshedPreview,
        refreshedExport,
        preview,
        exportRun,
        evidence,
        persistence,
        health,
      };
      if (sessionStore && typeof sessionStore.saveRunReport === "function") {
        const runId = `internal-alpha-${report.operation.heroImageId ?? "empty"}`;
        report.savedRun = await sessionStore.saveRunReport(runId, { report });
      }
      return report;
    },
  };
}
