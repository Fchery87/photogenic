import { test } from "node:test";
import assert from "node:assert/strict";
import { createExportBatchQueue } from "../src/export/batch-queue.js";

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
