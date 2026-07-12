import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createExportBatchQueue } from "../src/export/batch-queue.js";
import { createExportWorkflow } from "../src/export/workflow.js";
import { createExportFoundation } from "../src/export/foundation.js";

test("enqueue creates queued export jobs with stable ids", () => {
  const queue = createExportBatchQueue();
  const a = queue.enqueue({ imageId: "img-001", outputPath: "/tmp/a.jpg" });
  const b = queue.enqueue({ imageId: "img-002", outputPath: "/tmp/b.jpg", format: "tiff" });
  assert.equal(a.jobId, "export-1");
  assert.equal(b.jobId, "export-2");
  assert.equal(b.format, "tiff");
});

test("jobs transition through running, done, and failed states", () => {
  const queue = createExportBatchQueue();
  const job = queue.enqueue({ imageId: "img-003", outputPath: "/tmp/c.jpg" });
  assert.equal(queue.markRunning(job.jobId).status, "running");
  assert.equal(queue.markDone(job.jobId).status, "done");
  const another = queue.enqueue({ imageId: "img-004", outputPath: "/tmp/d.jpg" });
  const failed = queue.markFailed(another.jobId, "disk full");
  assert.equal(failed.status, "failed");
  assert.match(failed.error, /disk full/i);
});

// ---------------------------------------------------------------------------
// Batch execution engine (Issue 13)
// ---------------------------------------------------------------------------

let dirSeq = 0;
function tempDir() {
  const dir = path.join(tmpdir(), `photogenic-export-batch-${Date.now()}-${dirSeq++}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
function cleanupDir(dir) {
  try { rmSync(dir, { recursive: true }); } catch { /* ignore */ }
}
function makeSource(id) {
  return { imageId: id, path: `/shoots/${id}.nef`, width: 8, height: 8, revision: "raw-v1", colorSpace: "scene-linear" };
}
function makeRecipe(ev = 0.5) {
  return { version: 1, operations: [{ type: "exposure", params: { ev } }] };
}
const fixedClock = () => "2025-07-01T00:00:00Z";

test("runBatch processes all queued jobs to done", async () => {
  const dir = tempDir();
  try {
    const workflow = createExportWorkflow({ exportFoundation: createExportFoundation({ clock: fixedClock }) });
    for (let i = 0; i < 5; i++) {
      workflow.queueExport({
        source: makeSource(`batch-img-${i}`),
        recipe: makeRecipe(0.1 * i),
        destinationDir: dir,
        namingTemplate: "{imageId}",
        options: { format: "jpeg", quality: 90 },
      });
    }
    const report = await workflow.runBatch({ concurrency: 3 });
    assert.equal(report.summary.total, 5);
    assert.equal(report.summary.done, 5);
    assert.equal(report.summary.failed, 0);
    assert.equal(report.summary.remaining, 0);
    for (const job of report.jobs) {
      assert.equal(job.status, "done");
      assert.ok(existsSync(job.artifactPath), `artifact sidecar exists for ${job.jobId}`);
    }
  } finally { cleanupDir(dir); }
});

test("runBatch isolates failures — one bad job does not stop others", async () => {
  const dir = tempDir();
  try {
    const realFoundation = createExportFoundation({ clock: fixedClock });
    const failingFoundation = {
      ...realFoundation,
      async writeArtifact(outputPath, params) {
        if (params.source?.imageId === "will-fail") {
          throw new Error("simulated write failure");
        }
        return realFoundation.writeArtifact(outputPath, params);
      },
    };
    const workflow = createExportWorkflow({ exportFoundation: failingFoundation });
    workflow.queueExport({ source: makeSource("good-0"), recipe: makeRecipe(0.3), destinationDir: dir, namingTemplate: "{imageId}", options: { format: "jpeg" } });
    workflow.queueExport({ source: makeSource("will-fail"), recipe: makeRecipe(0.5), destinationDir: dir, namingTemplate: "{imageId}", options: { format: "jpeg" } });
    workflow.queueExport({ source: makeSource("good-2"), recipe: makeRecipe(0.7), destinationDir: dir, namingTemplate: "{imageId}", options: { format: "jpeg" } });

    const report = await workflow.runBatch({ concurrency: 2 });
    assert.equal(report.summary.total, 3);
    assert.equal(report.summary.done, 2, "two good jobs succeeded");
    assert.equal(report.summary.failed, 1, "one bad job failed");
    assert.equal(report.summary.remaining, 0);
    const failedJob = report.jobs.find((j) => j.status === "failed");
    assert.ok(failedJob);
    assert.match(failedJob.error, /simulated write failure/i);
  } finally { cleanupDir(dir); }
});

test("runBatch cancellation prevents remaining queued jobs from starting", async () => {
  const dir = tempDir();
  try {
    const workflow = createExportWorkflow({ exportFoundation: createExportFoundation({ clock: fixedClock }) });
    for (let i = 0; i < 6; i++) {
      workflow.queueExport({ source: makeSource(`cancel-img-${i}`), recipe: makeRecipe(0.2 * i), destinationDir: dir, namingTemplate: "{imageId}", options: { format: "jpeg" } });
    }

    const controller = new AbortController();
    let doneCount = 0;
    const originalRunJobReport = workflow.runJobReport.bind(workflow);
    workflow.runJobReport = async function (jobId) {
      const result = await originalRunJobReport(jobId);
      doneCount += 1;
      if (doneCount >= 1) controller.abort();
      return result;
    };

    const report = await workflow.runBatch({ concurrency: 1, signal: controller.signal });
    assert.ok(report.summary.done >= 1, "at least one job ran before cancellation");
    assert.ok(report.summary.remaining >= 1, "at least one job was not started");
    assert.equal(report.summary.cancelled, true);
    assert.equal(report.summary.done + report.summary.remaining, 6);
  } finally { cleanupDir(dir); }
});

test("runBatch summary preserves enqueue order", async () => {
  const dir = tempDir();
  try {
    const workflow = createExportWorkflow({ exportFoundation: createExportFoundation({ clock: fixedClock }) });
    const ids = ["alpha", "bravo", "charlie", "delta", "echo"];
    for (const id of ids) {
      workflow.queueExport({ source: makeSource(id), recipe: makeRecipe(0.5), destinationDir: dir, namingTemplate: "{imageId}", options: { format: "jpeg" } });
    }
    const report = await workflow.runBatch({ concurrency: 4 });
    const jobIds = report.jobs.map((j) => j.jobId);
    assert.deepEqual(jobIds, ["export-1", "export-2", "export-3", "export-4", "export-5"]);
  } finally { cleanupDir(dir); }
});

test("runBatch respects configurable concurrency limit", async () => {
  const dir = tempDir();
  try {
    const workflow = createExportWorkflow({ exportFoundation: createExportFoundation({ clock: fixedClock }) });
    for (let i = 0; i < 8; i++) {
      workflow.queueExport({ source: makeSource(`concurrency-${i}`), recipe: makeRecipe(0.1 * i), destinationDir: dir, namingTemplate: "{imageId}", options: { format: "png" } });
    }

    let maxConcurrent = 0;
    let currentRunning = 0;
    const originalRunJobReport = workflow.runJobReport.bind(workflow);
    workflow.runJobReport = async function (jobId) {
      currentRunning += 1;
      maxConcurrent = Math.max(maxConcurrent, currentRunning);
      const result = await originalRunJobReport(jobId);
      currentRunning -= 1;
      return result;
    };

    await workflow.runBatch({ concurrency: 2 });
    assert.ok(maxConcurrent <= 2, `concurrency never exceeded 2 (max was ${maxConcurrent})`);
  } finally { cleanupDir(dir); }
});

test("runBatch with no queued jobs returns empty summary", async () => {
  const workflow = createExportWorkflow();
  const report = await workflow.runBatch({ concurrency: 4 });
  assert.equal(report.summary.total, 0);
  assert.equal(report.summary.done, 0);
  assert.deepEqual(report.jobs, []);
});

test("JPEG quality parameter changes the encoded output bytes", async () => {
  const dir = tempDir();
  try {
    const foundation = createExportFoundation({ clock: fixedClock });
    const source = makeSource("quality-test");
    const recipe = makeRecipe(0.5);
    const lowQ = await foundation.writeArtifact(path.join(dir, "low.json"), { source, recipe, outputName: "low.jpg", options: { format: "jpeg", quality: 30 } });
    const highQ = await foundation.writeArtifact(path.join(dir, "high.json"), { source, recipe, outputName: "high.jpg", options: { format: "jpeg", quality: 95 } });
    assert.notEqual(lowQ.companionOutput.sizeBytes, highQ.companionOutput.sizeBytes, "different quality should produce different file sizes");
  } finally { cleanupDir(dir); }
});

test("TIFF export writes a valid 16-bit output file", async () => {
  const dir = tempDir();
  try {
    const foundation = createExportFoundation({ clock: fixedClock });
    const artifact = await foundation.writeArtifact(path.join(dir, "tiff16.json"), { source: makeSource("tiff-test"), recipe: makeRecipe(0.3), outputName: "tiff16.tiff", options: { format: "tiff" } });
    assert.ok(artifact.companionOutput);
    assert.match(artifact.companionOutput.kind, /tiff/i);
    const tiffPath = artifact.companionOutput.path;
    assert.ok(existsSync(tiffPath), "TIFF file exists on disk");
    const header = readFileSync(tiffPath).subarray(0, 4);
    const isLittleEndian = header[0] === 0x49 && header[1] === 0x49;
    const isBigEndian = header[0] === 0x4d && header[1] === 0x4d;
    assert.ok(isLittleEndian || isBigEndian, "valid TIFF byte-order marker");
  } finally { cleanupDir(dir); }
});

test("ICC embed flag is recorded in export options metadata", async () => {
  const dir = tempDir();
  try {
    const foundation = createExportFoundation({ clock: fixedClock });
    const withIcc = await foundation.writeArtifact(path.join(dir, "icc-on.json"), { source: makeSource("icc-test"), recipe: makeRecipe(0.2), outputName: "icc-on.jpg", options: { format: "jpeg", quality: 90, embedIcc: true } });
    const withoutIcc = await foundation.writeArtifact(path.join(dir, "icc-off.json"), { source: makeSource("icc-test"), recipe: makeRecipe(0.2), outputName: "icc-off.jpg", options: { format: "jpeg", quality: 90, embedIcc: false } });
    assert.equal(withIcc.exportOptions.embedIcc, true);
    assert.equal(withoutIcc.exportOptions.embedIcc, false);
  } finally { cleanupDir(dir); }
});
