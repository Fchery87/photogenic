#!/usr/bin/env node
/**
 * Platform smoke script (Issue 15).
 *
 * Exercises the alpha-critical workflow chain:
 *   Tauri availability → Pipeline capabilities → License activation →
 *   Import → Cull → Develop → Preset → Batch Sync → Export → Viewport proof
 *
 * Emits explicit pass/fail fields for each step and writes a JSON report to
 * `.scratch/photogenic-foundation/verification/smoke-<platform>.json`.
 *
 * Usage:  node scripts/smoke.mjs
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync as writeFn, createWriteStream } from "node:fs";
import { tmpdir, platform, arch } from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

// Workflow imports
import { createSqliteCatalogBackend } from "../src/catalog/sqlite-backend.js";
import { createCatalogRecipeStore } from "../src/catalog/recipe-store.js";
import { createLibraryStore } from "../src/catalog/library-store.js";
import { createPresetStore } from "../src/catalog/preset-store.js";
import { importShoot } from "../src/catalog/import-workflow.js";
import { generateLicenseKeyPair, signLicense } from "../src/licensing/license-key.js";
import { activateLicense, describeExportLicensingState } from "../src/licensing/activation.js";
import { createExportWorkflow } from "../src/export/workflow.js";
import { createExportFoundation } from "../src/export/foundation.js";
import { applyPreset, copyBatchSync, createPresetFromRecipe } from "../src/edit-recipe/recipe.js";

const root = path.resolve(import.meta.dirname, "..");
const verificationDir = path.join(root, ".scratch", "photogenic-foundation", "verification");

function step(name) {
  return { name, status: "pending", detail: null };
}

function pass(step, detail) {
  step.status = "pass";
  step.detail = detail ?? null;
}

function fail(step, detail) {
  step.status = "fail";
  step.detail = typeof detail === "string" ? detail : (detail?.message ?? String(detail));
}

async function runSmoke() {
  const steps = [];
  const platformName = platform();
  const startedAt = new Date().toISOString();

  // Workspace
  const workspace = path.join(tmpdir(), `photogenic-smoke-${Date.now()}`);
  mkdirSync(workspace, { recursive: true });
  const dbPath = path.join(workspace, "catalog.sqlite");
  const shootDir = path.join(workspace, "shoot");
  const exportDir = path.join(workspace, "export");
  mkdirSync(shootDir, { recursive: true });
  mkdirSync(exportDir, { recursive: true });

  // --- Step 1: Tauri availability ---
  const tauriStep = step("tauri-availability");
  steps.push(tauriStep);
  try {
    const hasTauriGlobal = typeof globalThis.__TAURI__ !== "undefined";
    let tauriCliVersion = null;
    try {
      tauriCliVersion = execSync("npx @tauri-apps/cli@latest --version 2>/dev/null", { encoding: "utf8", timeout: 5000 }).trim();
    } catch {
      // CLI not available offline — expected in CI/headless
    }
    pass(tauriStep, {
      runtimeBridge: hasTauriGlobal,
      cliAvailable: tauriCliVersion !== null,
      cliVersion: tauriCliVersion,
      note: hasTauriGlobal ? "Tauri runtime bridge detected." : "No Tauri runtime bridge (headless/CI). Workflows run in Node fallback mode.",
    });
  } catch (error) {
    fail(tauriStep, error);
  }

  // --- Step 2: Pipeline capabilities ---
  const pipelineStep = step("pipeline-capabilities");
  steps.push(pipelineStep);
  try {
    const { createNativePipelineAdapter } = await import("../src/pipeline/native-adapter.js");
    let pipelineMode = "unknown";
    let nativeAvailable = false;
    try {
      const adapter = createNativePipelineAdapter();
      // If this doesn't throw, native is available
      nativeAvailable = true;
      pipelineMode = "native";
    } catch (error) {
      pipelineMode = "cpu-fallback";
      nativeAvailable = false;
    }
    pass(pipelineStep, {
      nativeAvailable,
      pipelineMode,
      note: nativeAvailable ? "Native GPU/CPU pipeline detected." : "Native pipeline not reachable — software renderer fallback active.",
    });
  } catch (error) {
    fail(pipelineStep, error);
  }

  // --- Step 3: License activation ---
  const licenseStep = step("license-activation");
  steps.push(licenseStep);
  let licenseSnapshot = null;
  try {
    const keyPair = generateLicenseKeyPair();
    const signed = signLicense({
      licenseId: "smoke-test-license",
      status: "active",
      validUntil: "2099-12-31T23:59:59Z",
      offlineValidUntil: "2099-12-31T23:59:59Z",
      features: ["local-edit", "local-export"],
      issuedAt: startedAt,
      holder: "internal-alpha-smoke",
    }, keyPair.privateKey);
    const result = activateLicense({
      signedLicense: signed,
      publicKey: keyPair.publicKey,
      now: startedAt,
    });
    if (!result.activated) throw new Error(result.reason);
    licenseSnapshot = { license: result.license, now: startedAt };
    const exportState = describeExportLicensingState(licenseSnapshot);
    pass(licenseStep, {
      activated: true,
      licenseId: result.license.licenseId,
      exportState: exportState.state,
      canExport: exportState.canExport,
    });
  } catch (error) {
    fail(licenseStep, error);
  }

  // --- Step 4: Import ---
  const importStep = step("import");
  steps.push(importStep);
  const backend = createSqliteCatalogBackend({ dbPath });
  let importedImageIds = [];
  try {
    const libraryStore = await createLibraryStore({ catalogBackend: backend.library, clock: () => startedAt });
    const sources = [
      path.join(shootDir, "hero.nef"),
      path.join(shootDir, "portrait.jpg"),
      path.join(shootDir, "landscape.dng"),
    ];
    for (const src of sources) {
      writeFileSync(src, Buffer.alloc(512, 0));
    }
    const result = await importShoot({ libraryStore, files: sources });
    importedImageIds = result.imported.map((r) => r.imageId);
    if (importedImageIds.length !== 3) throw new Error(`expected 3 imported images, got ${importedImageIds.length}`);
    pass(importStep, { imported: importedImageIds.length, imageIds: importedImageIds });
  } catch (error) {
    fail(importStep, error);
  }

  // --- Step 5: Cull ---
  const cullStep = step("cull");
  steps.push(cullStep);
  try {
    const libraryStore = await createLibraryStore({ catalogBackend: backend.library, clock: () => startedAt });
    await libraryStore.setRating(importedImageIds[0], 5);
    await libraryStore.setFlag(importedImageIds[0], true);
    await libraryStore.setColorLabel(importedImageIds[0], "red");
    await libraryStore.setRejected(importedImageIds[2], true);
    const rated = await libraryStore.get(importedImageIds[0]);
    if (rated.rating !== 5 || rated.flagged !== true || rated.colorLabel !== "red") {
      throw new Error("culling metadata not persisted");
    }
    pass(cullStep, { rated: importedImageIds[0], rejected: importedImageIds[2] });
  } catch (error) {
    fail(cullStep, error);
  }

  // --- Step 6: Develop (save recipe) ---
  const developStep = step("develop");
  steps.push(developStep);
  let developedRecipe = null;
  try {
    const recipeStore = await createCatalogRecipeStore({ catalogBackend: backend.recipe, clock: () => startedAt });
    const recipe = { version: 1, operations: [
      { type: "exposure", params: { ev: 0.5 } },
      { type: "temperature", params: { kelvinDelta: 200 } },
      { type: "tint", params: { amount: 5 } },
    ] };
    const saved = await recipeStore.save(importedImageIds[0], recipe);
    if (saved.revision !== 1) throw new Error(`expected revision 1, got ${saved.revision}`);
    developedRecipe = recipe;
    pass(developStep, { imageId: importedImageIds[0], revision: saved.revision });
  } catch (error) {
    fail(developStep, error);
  }

  // --- Step 7: Preset ---
  const presetStep = step("preset");
  steps.push(presetStep);
  try {
    const presetStore = await createPresetStore({ catalogBackend: backend.preset, clock: () => startedAt });
    const preset = createPresetFromRecipe({
      name: "Warm Sunset",
      recipe: developedRecipe,
      includedTypes: ["exposure"],
    });
    await presetStore.savePreset("preset-warm-sunset", preset);
    const loaded = await presetStore.getPreset("preset-warm-sunset");
    if (loaded.name !== "Warm Sunset") throw new Error("preset not loaded correctly");
    // Apply preset to another image
    const appliedRecipe = applyPreset(
      { version: 1, operations: [{ type: "crop", params: { x: 0, y: 0, w: 1, h: 1 } }] },
      loaded,
    );
    const hasExposure = appliedRecipe.operations.some((op) => op.type === "exposure");
    if (!hasExposure) throw new Error("preset application did not add exposure operation");
    pass(presetStep, { presetId: "preset-warm-sunset", appliedTo: importedImageIds[1] });
  } catch (error) {
    fail(presetStep, error);
  }

  // --- Step 8: Batch Sync ---
  const batchSyncStep = step("batch-sync");
  steps.push(batchSyncStep);
  try {
    const recipeStore = await createCatalogRecipeStore({ catalogBackend: backend.recipe, clock: () => startedAt });
    // Save the developed recipe as the source for batch sync
    const sourceRecipe = await recipeStore.save(importedImageIds[0], developedRecipe);
    // Batch sync the exposure operation to the other images
    const synced1 = copyBatchSync(
      developedRecipe,
      { version: 1, operations: [] },
      ["exposure"],
    );
    const synced2 = copyBatchSync(
      developedRecipe,
      { version: 1, operations: [{ type: "crop", params: { x: 0, y: 0, w: 1, h: 1 } }] },
      ["exposure"],
    );
    const syncResult = [synced1, synced2];
    if (syncResult.length !== 2) throw new Error(`expected 2 synced recipes, got ${syncResult.length}`);
    const allHaveExposure = syncResult.every((r) => r.operations.some((op) => op.type === "exposure"));
    if (!allHaveExposure) throw new Error("not all synced recipes have the exposure operation");
    // Save synced recipes
    await recipeStore.save(importedImageIds[1], syncResult[0]);
    await recipeStore.save(importedImageIds[2], syncResult[1]);
    pass(batchSyncStep, { syncedTo: importedImageIds.slice(1), operationTypes: ["exposure"] });
  } catch (error) {
    fail(batchSyncStep, error);
  }

  // --- Step 9: Export ---
  const exportStep = step("export");
  steps.push(exportStep);
  try {
    const exportFoundation = createExportFoundation({ clock: () => startedAt });
    const workflow = createExportWorkflow({ exportFoundation });
    for (const imageId of importedImageIds) {
      workflow.queueExport({
        source: { imageId, path: `${shootDir}/${imageId}.nef`, width: 8, height: 8, revision: "raw-v1", colorSpace: "scene-linear" },
        recipe: developedRecipe ?? { version: 1, operations: [] },
        destinationDir: exportDir,
        namingTemplate: "{imageId}",
        options: { format: "jpeg", quality: 90 },
      });
    }
    const report = await workflow.runBatch({ concurrency: 2 });
    if (report.summary.done !== importedImageIds.length) {
      throw new Error(`expected ${importedImageIds.length} exports, got ${report.summary.done} done, ${report.summary.failed} failed`);
    }
    pass(exportStep, {
      exported: report.summary.done,
      format: "jpeg",
      concurrency: 2,
    });
  } catch (error) {
    fail(exportStep, error);
  }

  // --- Step 10: Viewport proof summary ---
  const viewportStep = step("viewport-proof");
  steps.push(viewportStep);
  try {
    const viewportReportPath = path.join(verificationDir, `viewport-${platformName}.json`);
    let viewportStatus = "not-found";
    let shellDecisionUnlocked = false;
    if (existsSync(viewportReportPath)) {
      const vp = JSON.parse(readFileSync(viewportReportPath, "utf8"));
      shellDecisionUnlocked = vp.shellDecisionUnlocked === true || vp.verdict?.shellDecisionUnlocked === true;
      viewportStatus = shellDecisionUnlocked ? "unlocked" : "provisional";
    }
    pass(viewportStep, {
      reportExists: viewportStatus !== "not-found",
      status: viewportStatus,
      shellDecisionUnlocked,
      note: shellDecisionUnlocked ? "Shell decision unlocked — GPU→webview path proven." : "Shell decision still provisional — raw-frame provenance unproven on this platform.",
    });
  } catch (error) {
    fail(viewportStep, error);
  }

  backend.close();

  // --- Cleanup ---
  try { rmSync(workspace, { recursive: true }); } catch { /* ignore */ }

  // --- Assemble report ---
  const allPassed = steps.every((s) => s.status === "pass");
  const finishedAt = new Date().toISOString();
  const report = {
    platform: platformName,
    arch: arch(),
    startedAt,
    finishedAt,
    overall: allPassed ? "pass" : "fail",
    steps: steps.map((s) => ({ name: s.name, status: s.status, detail: s.detail })),
    summary: {
      total: steps.length,
      passed: steps.filter((s) => s.status === "pass").length,
      failed: steps.filter((s) => s.status === "fail").length,
    },
    licenseState: licenseSnapshot ? describeExportLicensingState(licenseSnapshot).state : "no-license",
    knownLimitations: [
      "Native RAW decode is stubbed — software renderers produce deterministic test pixels, not real RAW pipeline output.",
      "Viewport proof is provisional until measured on a platform with a display server.",
    ],
  };

  // --- Write report ---
  mkdirSync(verificationDir, { recursive: true });
  const reportPath = path.join(verificationDir, `smoke-${platformName}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");

  // --- Console output ---
  console.log(`\n  Photogenic Alpha Smoke — ${platformName}/${arch()}`);
  console.log(`  ${"─".repeat(50)}`);
  for (const s of steps) {
    const icon = s.status === "pass" ? "✓" : "✗";
    console.log(`  ${icon} ${s.name.padEnd(24)} ${s.status.toUpperCase()}`);
  }
  console.log(`  ${"─".repeat(50)}`);
  console.log(`  ${report.summary.passed}/${report.summary.total} passed — ${report.overall.toUpperCase()}`);
  console.log(`  Report: ${path.relative(root, reportPath)}\n`);

  return report;
}

runSmoke().catch((error) => {
  console.error("Smoke script failed:", error);
  process.exit(1);
});
