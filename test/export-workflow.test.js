import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createExportFoundation } from "../src/export/foundation.js";
import { createExportWorkflow } from "../src/export/workflow.js";

function buildSource() {
  return {
    imageId: "img-001",
    path: "/shoots/day1/hero-image.CR3",
    width: 6000,
    height: 4000,
    revision: "source-v1",
    colorSpace: "scene-linear",
  };
}

test("queueExport renders the naming template and runs an artifact export through the batch queue seam", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-workflow-"));
  const workflow = createExportWorkflow({
    exportFoundation: createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" }),
  });
  const recipe = createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] });
  const queued = workflow.queueExport({
    source: buildSource(),
    recipe,
    destinationDir: dir,
    namingTemplate: "{date}_{baseName}_{sequence}",
    naming: {
      sequence: 3,
      captureAt: "2025-07-04T16:30:00.000Z",
    },
    options: {
      format: "png",
      quality: 95,
    },
  });

  assert.equal(queued.status, "queued");
  assert.equal(queued.outputName, "20250704_hero-image_3.png");
  assert.equal(queued.artifactPath, path.join(dir, "20250704_hero-image_3.png.json"));

  const result = await workflow.runJob(queued.jobId);
  const written = JSON.parse(await readFile(queued.artifactPath, "utf8"));
  const proofOutput = await readFile(path.join(dir, "20250704_hero-image_3.png"));

  assert.equal(result.job.status, "done");
  assert.equal(written.mode, "export");
  assert.equal(written.outputName, "20250704_hero-image_3.png");
  assert.deepEqual(written.exportOptions, {
    format: "png",
    quality: 95,
    resize: null,
    embedIcc: true,
    sharpenForOutput: false,
  });
  assert.equal(written.companionOutput.path, path.join(dir, "20250704_hero-image_3.png"));
  assert.equal(written.companionOutput.kind, "image/png");
  assert.equal(written.companionOutput.status, "rendered-image");
  assert.ok(written.companionOutput.sizeBytes > 0);
  assert.deepEqual(written.companionOutput.contentHash, {
    algorithm: "sha256",
    value: createHash("sha256").update(proofOutput).digest("hex"),
  });
  assert.match(written.companionOutput.note, /real image file/i);
  assert.equal(written.companionOutput.width, 6000);
  assert.equal(written.companionOutput.height, 4000);
  assert.deepEqual(result.artifact.companionOutput, written.companionOutput);
  assert.deepEqual(result.job.companionOutput, written.companionOutput);
  assert.deepEqual(result.job.artifactSidecar, {
    path: queued.artifactPath,
    kind: "application/json",
    status: "present",
    sizeBytes: (await stat(queued.artifactPath)).size,
    note: "Export artifact sidecar JSON is present and parseable. This seam verifies placeholder-proof/export artifact bookkeeping, not final rendered image bytes.",
  });
  assert.deepEqual(workflow.inspect(queued.jobId).companionOutput, written.companionOutput);
  assert.equal(workflow.inspect(queued.jobId).artifactSidecar.status, "present");
  assert.deepEqual(proofOutput.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
});



test("queueExport runs a rendered TIFF-16 export through the workflow seam", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-workflow-tiff-"));
  const workflow = createExportWorkflow({
    exportFoundation: createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" }),
  });
  const queued = workflow.queueExport({
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 4 },
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });

  assert.equal(queued.outputName, "hero-image_4.tiff");
  const result = await workflow.runJob(queued.jobId);
  const written = JSON.parse(await readFile(queued.artifactPath, "utf8"));
  const output = await readFile(path.join(dir, "hero-image_4.tiff"));

  assert.equal(result.job.status, "done");
  assert.equal(written.companionOutput.kind, "image/tiff");
  assert.equal(written.companionOutput.status, "rendered-image");
  assert.equal(written.companionOutput.width, 120);
  assert.equal(written.companionOutput.height, 80);
  assert.equal(result.job.companionOutput.kind, "image/tiff");
  assert.equal(result.job.companionOutput.status, "rendered-image");
  assert.equal(output.subarray(0, 2).toString("ascii"), "II");
  assert.equal(output.readUInt16LE(2), 42);
});
test("restoreExport can refresh companion proof metadata for done jobs", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-workflow-refresh-"));
  const exportFoundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const workflow = createExportWorkflow({ exportFoundation });

  const queued = workflow.queueExport({
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "png", quality: 95 },
  });
  const firstRun = await workflow.runJob(queued.jobId);

  const restoredWorkflow = createExportWorkflow({ exportFoundation });
  const restored = restoredWorkflow.restoreExport({
    jobId: firstRun.job.jobId,
    imageId: firstRun.job.imageId,
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    outputName: firstRun.job.outputName,
    artifactPath: firstRun.job.artifactPath,
    options: { format: "png", quality: 95 },
    status: "done",
    companionOutput: {
      path: "/stale/path.png",
      kind: "image/png",
      status: "rendered-image",
      sizeBytes: 1,
      contentHash: { algorithm: "sha256", value: "stale" },
      width: 1,
      height: 1,
      note: "stale",
    },
    artifactSidecar: {
      path: "/stale/path.json",
      kind: "application/json",
      status: "missing",
      sizeBytes: null,
      note: "stale",
    },
  });
  assert.equal(restored.companionOutput.path, "/stale/path.png");

  const refreshedPresent = await restoredWorkflow.refreshJob(restored.jobId);
  assert.deepEqual(refreshedPresent.companionOutput, firstRun.artifact.companionOutput);
  assert.deepEqual(refreshedPresent.artifactSidecar, {
    path: firstRun.job.artifactPath,
    kind: "application/json",
    status: "present",
    sizeBytes: (await stat(firstRun.job.artifactPath)).size,
    note: "Export artifact sidecar JSON is present and parseable. This seam verifies placeholder-proof/export artifact bookkeeping, not final rendered image bytes.",
  });

  await unlink(path.join(dir, "hero-image.png"));
  const refreshedMissing = await restoredWorkflow.refreshJob(restored.jobId);
  assert.deepEqual(refreshedMissing.companionOutput, {
    path: path.join(dir, "hero-image.png"),
    kind: "image/png",
    status: "missing",
    sizeBytes: null,
    contentHash: null,
    width: null,
    height: null,
    note: "Expected rendered PNG output is missing on disk. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.",
  });
  assert.equal(restoredWorkflow.inspect(restored.jobId).companionOutput.status, "missing");
  assert.equal(restoredWorkflow.inspect(restored.jobId).artifactSidecar.status, "present");
});

test("runJob records explicit failure state when artifact writing fails", async () => {
  const workflow = createExportWorkflow({
    exportFoundation: {
      async writeArtifact() {
        throw new Error("disk offline");
      },
    },
  });

  const queued = workflow.queueExport({
    source: buildSource(),
    recipe: createRecipe(),
    destinationDir: "/exports",
    namingTemplate: "{baseName}",
  });

  const result = await workflow.runJob(queued.jobId);

  assert.equal(result.artifact, null);
  assert.equal(result.job.status, "failed");
  assert.match(result.job.error, /disk offline/i);
  assert.equal(workflow.inspect(queued.jobId).status, "failed");
});


test("rerunJob repairs missing png companions and invalid sidecars for done exports", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-workflow-rerun-"));
  const exportFoundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const workflow = createExportWorkflow({ exportFoundation });

  const queued = workflow.queueExport({
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "png", quality: 95 },
  });
  await workflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image.png"));
  await (await import("node:fs/promises")).writeFile(queued.artifactPath, `not-json
`, "utf8");

  const refreshedBroken = await workflow.refreshJob(queued.jobId);
  assert.equal(refreshedBroken.companionOutput.status, "missing");
  assert.equal(refreshedBroken.artifactSidecar.status, "invalid");

  const repaired = await workflow.rerunJob(queued.jobId);
  assert.equal(repaired.job.status, "done");
  assert.equal(repaired.job.companionOutput.status, "rendered-image");
  assert.equal(repaired.job.artifactSidecar.status, "present");
  assert.deepEqual((await readFile(path.join(dir, "hero-image.png"))).subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal(JSON.parse(await readFile(queued.artifactPath, "utf8")).companionOutput.status, "rendered-image");
});




test("rerunJob repairs missing tiff companions and invalid sidecars for done exports", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-workflow-rerun-tiff-"));
  const exportFoundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const workflow = createExportWorkflow({ exportFoundation });

  const queued = workflow.queueExport({
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await workflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image.tiff"));
  await (await import("node:fs/promises")).writeFile(queued.artifactPath, `not-json
`, "utf8");

  const refreshedBroken = await workflow.refreshJob(queued.jobId);
  assert.equal(refreshedBroken.companionOutput.status, "missing");
  assert.equal(refreshedBroken.artifactSidecar.status, "invalid");

  const repaired = await workflow.rerunJob(queued.jobId);
  assert.equal(repaired.job.status, "done");
  assert.equal(repaired.job.companionOutput.kind, "image/tiff");
  assert.equal(repaired.job.companionOutput.status, "rendered-image");
  assert.equal(repaired.job.artifactSidecar.status, "present");
  const output = await readFile(path.join(dir, "hero-image.tiff"));
  assert.equal(output.subarray(0, 2).toString("ascii"), "II");
  assert.equal(output.readUInt16LE(2), 42);
  assert.equal(JSON.parse(await readFile(queued.artifactPath, "utf8")).companionOutput.status, "rendered-image");
});
test("restoreExport refreshes stale rendered png companions honestly", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-workflow-stale-"));
  const exportFoundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const workflow = createExportWorkflow({ exportFoundation });

  const queued = workflow.queueExport({
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "png", quality: 95 },
  });
  const firstRun = await workflow.runJob(queued.jobId);

  const mismatchWorkflow = createExportWorkflow({ exportFoundation });
  const mismatchQueued = mismatchWorkflow.queueExport({
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "contrast", params: { amount: 12 } }] }),
    destinationDir: dir,
    namingTemplate: "mismatch-{baseName}",
    options: { format: "png", quality: 95, resize: { width: 1000, height: 700 } },
  });
  await mismatchWorkflow.runJob(mismatchQueued.jobId);
  await (await import("node:fs/promises")).copyFile(path.join(dir, "mismatch-hero-image.png"), path.join(dir, "hero-image.png"));

  const refreshed = await workflow.refreshJob(queued.jobId);
  assert.deepEqual(refreshed.companionOutput, {
    path: path.join(dir, "hero-image.png"),
    kind: "image/png",
    status: "stale",
    sizeBytes: refreshed.companionOutput.sizeBytes,
    contentHash: refreshed.companionOutput.contentHash,
    width: 1000,
    height: 700,
    note: "Rendered PNG output is present but no longer matches the expected deterministic export output for this artifact. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.",
  });
  assert.equal(workflow.inspect(queued.jobId).companionOutput.status, "stale");
  assert.equal(workflow.inspect(queued.jobId).artifactSidecar.status, "present");
});


test("restoreExport refreshes stale artifact sidecars honestly", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-workflow-stale-sidecar-"));
  const exportFoundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const workflow = createExportWorkflow({ exportFoundation });

  const queued = workflow.queueExport({
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "png", quality: 95 },
  });
  await workflow.runJob(queued.jobId);

  const staleArtifact = JSON.parse(await readFile(queued.artifactPath, "utf8"));
  staleArtifact.outputName = "swapped-image.png";
  staleArtifact.companionOutput.path = path.join(dir, "swapped-image.png");
  await (await import("node:fs/promises")).writeFile(queued.artifactPath, JSON.stringify(staleArtifact, null, 2) + "\n", "utf8");

  const refreshed = await workflow.refreshJob(queued.jobId);
  assert.equal(refreshed.artifactSidecar.status, "stale");
  assert.equal(refreshed.companionOutput.status, "rendered-image");
  assert.deepEqual(refreshed.artifactSidecar, {
    path: queued.artifactPath,
    kind: "application/json",
    status: "stale",
    sizeBytes: (await stat(queued.artifactPath)).size,
    note: "Export artifact sidecar JSON is parseable but no longer matches the expected export artifact identity for this output path. This seam still verifies placeholder-proof/export artifact bookkeeping, not final rendered image bytes.",
  });
});




test("restoreExport refreshes invalid rendered tiff companions honestly", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-workflow-invalid-tiff-"));
  const exportFoundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const workflow = createExportWorkflow({ exportFoundation });

  const queued = workflow.queueExport({
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await workflow.runJob(queued.jobId);

  await (await import("node:fs/promises")).writeFile(path.join(dir, "hero-image.tiff"), "not-a-tiff\n", "utf8");
  const refreshed = await workflow.refreshJob(queued.jobId);
  assert.deepEqual(refreshed.companionOutput, {
    path: path.join(dir, "hero-image.tiff"),
    kind: "image/tiff",
    status: "invalid",
    sizeBytes: null,
    contentHash: null,
    width: null,
    height: null,
    note: "Rendered TIFF-16 output is present but is not a valid TIFF. This seam verifies deterministic software-rendered TIFF-16 bytes, not the final RAW/GPU pipeline.",
  });
  assert.equal(workflow.inspect(queued.jobId).companionOutput.status, "invalid");
});


test("restoreExport refreshes stale rendered tiff companions honestly", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-workflow-stale-tiff-"));
  const exportFoundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const workflow = createExportWorkflow({ exportFoundation });

  const queued = workflow.queueExport({
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await workflow.runJob(queued.jobId);

  const mismatchQueued = workflow.queueExport({
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "contrast", params: { amount: 12 } }] }),
    destinationDir: dir,
    namingTemplate: "mismatch-{baseName}",
    options: { format: "tiff", resize: { width: 64, height: 48 } },
  });
  await workflow.runJob(mismatchQueued.jobId);
  await (await import("node:fs/promises")).copyFile(path.join(dir, "mismatch-hero-image.tiff"), path.join(dir, "hero-image.tiff"));

  const refreshed = await workflow.refreshJob(queued.jobId);
  assert.equal(refreshed.companionOutput.kind, "image/tiff");
  assert.equal(refreshed.companionOutput.status, "stale");
  assert.equal(refreshed.companionOutput.width, 64);
  assert.equal(refreshed.companionOutput.height, 48);
  assert.match(refreshed.companionOutput.note, /no longer matches the expected deterministic export output/i);
  assert.equal(workflow.inspect(queued.jobId).companionOutput.status, "stale");
});
test("export workflow report helpers return operation metadata", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-workflow-report-"));
  const workflow = createExportWorkflow({
    exportFoundation: createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" }),
  });
  const queued = workflow.queueExportReport({
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}",
    options: { format: "png", quality: 95 },
  });
  assert.deepEqual(queued.operation, {
    kind: "queue-export-job",
    jobId: queued.job.jobId,
    imageId: "img-001",
    outputName: "hero-image.png",
    format: "png",
  });

  const run = await workflow.runJobReport(queued.job.jobId);
  assert.deepEqual(run.operation, {
    kind: "run-export-job",
    jobId: queued.job.jobId,
    status: "done",
  });
  assert.equal(run.job.status, "done");
});

test("queueExport runs a rendered JPEG export through the workflow seam", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-workflow-jpeg-"));
  const workflow = createExportWorkflow({
    exportFoundation: createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" }),
  });
  const queued = workflow.queueExport({
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 5 },
    options: { format: "jpeg", quality: 92, resize: { width: 240, height: 160 } },
  });

  assert.equal(queued.outputName, "hero-image_5.jpg");
  const result = await workflow.runJob(queued.jobId);
  const written = JSON.parse(await readFile(queued.artifactPath, "utf8"));
  const output = await readFile(path.join(dir, "hero-image_5.jpg"));

  assert.equal(result.job.status, "done");
  assert.equal(written.companionOutput.kind, "image/jpeg");
  assert.equal(written.companionOutput.status, "rendered-image");
  assert.equal(written.companionOutput.width, 240);
  assert.equal(written.companionOutput.height, 160);
  assert.equal(result.job.companionOutput.kind, "image/jpeg");
  assert.equal(result.job.companionOutput.status, "rendered-image");
  assert.equal(output[0], 0xff);
  assert.equal(output[1], 0xd8);
});

test("queueExport preserves sharpenForOutput and writes different rendered jpeg bytes when enabled", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-workflow-jpeg-sharpen-"));
  const workflow = createExportWorkflow({
    exportFoundation: createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" }),
  });
  const recipe = createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] });

  const soft = workflow.queueExport({
    source: buildSource(),
    recipe,
    destinationDir: dir,
    namingTemplate: "soft-{baseName}",
    options: { format: "jpeg", quality: 92, resize: { width: 120, height: 80 }, sharpenForOutput: false },
  });
  const sharp = workflow.queueExport({
    source: buildSource(),
    recipe,
    destinationDir: dir,
    namingTemplate: "sharp-{baseName}",
    options: { format: "jpeg", quality: 92, resize: { width: 120, height: 80 }, sharpenForOutput: true },
  });

  const softRun = await workflow.runJob(soft.jobId);
  const sharpRun = await workflow.runJob(sharp.jobId);
  assert.equal(softRun.artifact.exportOptions.sharpenForOutput, false);
  assert.equal(sharpRun.artifact.exportOptions.sharpenForOutput, true);
  assert.notEqual(softRun.job.companionOutput.contentHash.value, sharpRun.job.companionOutput.contentHash.value);
});

test("queueExport preserves embedIcc and writes different rendered png bytes when disabled", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-workflow-png-icc-"));
  const workflow = createExportWorkflow({
    exportFoundation: createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" }),
  });
  const recipe = createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] });

  const withIcc = workflow.queueExport({
    source: buildSource(), recipe, destinationDir: dir, namingTemplate: "with-{baseName}",
    options: { format: "png", quality: 95, resize: { width: 120, height: 80 }, embedIcc: true },
  });
  const withoutIcc = workflow.queueExport({
    source: buildSource(), recipe, destinationDir: dir, namingTemplate: "without-{baseName}",
    options: { format: "png", quality: 95, resize: { width: 120, height: 80 }, embedIcc: false },
  });

  const withRun = await workflow.runJob(withIcc.jobId);
  const withoutRun = await workflow.runJob(withoutIcc.jobId);
  assert.equal(withRun.artifact.exportOptions.embedIcc, true);
  assert.equal(withoutRun.artifact.exportOptions.embedIcc, false);
  assert.notEqual(withRun.job.companionOutput.contentHash.value, withoutRun.job.companionOutput.contentHash.value);
});
