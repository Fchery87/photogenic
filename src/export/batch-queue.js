const clone = (value) => JSON.parse(JSON.stringify(value));
const JOB_ID_PATTERN = /^export-(\d+)$/;

function normalizeStatus(status) {
  const value = status ?? "queued";
  if (!["queued", "running", "done", "failed"].includes(value)) {
    throw new RangeError(`unsupported export job status: ${String(status)}`);
  }
  return value;
}

function normalizeJob(job, { jobId, status } = {}) {
  if (!job || typeof job !== "object") throw new TypeError("job is required");
  if (typeof job.imageId !== "string" || !job.imageId) throw new TypeError("imageId is required");
  if (typeof job.outputPath !== "string" || !job.outputPath) throw new TypeError("outputPath is required");
  const normalizedJobId = jobId ?? job.jobId;
  if (typeof normalizedJobId !== "string" || !JOB_ID_PATTERN.test(normalizedJobId)) {
    throw new TypeError("jobId must match export-<number>");
  }
  return {
    jobId: normalizedJobId,
    imageId: job.imageId,
    outputPath: job.outputPath,
    format: job.format ?? "jpeg",
    status: normalizeStatus(status ?? job.status),
    ...(typeof job.error === "string" && job.error ? { error: job.error } : {}),
  };
}

export function createExportBatchQueue() {
  const jobs = [];
  let nextId = 1;

  function findJob(jobId) {
    const job = jobs.find((entry) => entry.jobId === jobId);
    if (!job) throw new Error(`unknown export job: ${jobId}`);
    return job;
  }

  function trackNextId(jobId) {
    const match = JOB_ID_PATTERN.exec(jobId);
    if (!match) return;
    nextId = Math.max(nextId, Number(match[1]) + 1);
  }

  return {
    enqueue(job) {
      const queued = normalizeJob(job, { jobId: `export-${nextId++}`, status: "queued" });
      jobs.push(queued);
      return clone(queued);
    },
    restore(job) {
      const restored = normalizeJob(job);
      if (jobs.some((entry) => entry.jobId === restored.jobId)) {
        throw new Error(`duplicate export job: ${restored.jobId}`);
      }
      jobs.push(restored);
      trackNextId(restored.jobId);
      return clone(restored);
    },
    list() {
      return jobs.map(clone);
    },
    markRunning(jobId) {
      const job = findJob(jobId);
      job.status = "running";
      delete job.error;
      return clone(job);
    },
    markDone(jobId) {
      const job = findJob(jobId);
      job.status = "done";
      delete job.error;
      return clone(job);
    },
    markFailed(jobId, error) {
      const job = findJob(jobId);
      job.status = "failed";
      job.error = typeof error === "string" ? error : "unknown error";
      return clone(job);
    },
  };
}
