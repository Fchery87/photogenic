import { createExportWorkflow } from "./workflow.js";

function ensureSessionStore(sessionStore) {
  if (
    !sessionStore ||
    typeof sessionStore.saveSession !== "function" ||
    typeof sessionStore.getSession !== "function" ||
    typeof sessionStore.listSessionIds !== "function"
  ) {
    throw new TypeError("sessionStore with saveSession(), getSession(), and listSessionIds() is required");
  }
}

function buildSessionPayload(job, request, overrides = {}) {
  return {
    imageId: request.source?.imageId ?? job.imageId,
    outputName: job.outputName,
    outputPath: job.artifactPath,
    status: overrides.status ?? job.status,
    options: request.options,
    source: request.source,
    recipe: request.recipe,
    companionOutput: overrides.companionOutput ?? null,
    artifactSidecar: overrides.artifactSidecar ?? null,
    error: overrides.error ?? job.error ?? null,
  };
}

function buildRestoreRequest(session) {
  return {
    jobId: session.sessionId,
    imageId: session.imageId,
    source: session.source,
    recipe: session.recipe,
    outputName: session.outputName,
    artifactPath: session.outputPath,
    options: session.options,
    status: session.status,
    error: session.error,
    companionOutput: session.companionOutput,
    artifactSidecar: session.artifactSidecar,
  };
}

function hasIntegrityIssue(job) {
  const proofStatus = job?.companionOutput?.status ?? null;
  const sidecarStatus = job?.artifactSidecar?.status ?? null;
  return proofStatus === "missing" || proofStatus === "invalid" || proofStatus === "stale" || sidecarStatus === "missing" || sidecarStatus === "invalid" || sidecarStatus === "stale";
}

function summarizeReloadCounts(jobs = []) {
  return jobs.reduce((summary, job) => {
    const proofStatus = job?.companionOutput?.status ?? null;
    const sidecarStatus = job?.artifactSidecar?.status ?? null;
    summary.total += 1;
    if (job.status === "queued") summary.queued += 1;
    if (job.status === "running") summary.running += 1;
    if (job.status === "done") summary.done += 1;
    if (job.status === "failed") summary.failed += 1;
    if (job.repairedDuringReload) summary.repaired += 1;
    if (hasIntegrityIssue(job)) summary.withIntegrityIssue += 1;
    if (proofStatus === "missing") summary.withMissingProof += 1;
    if (proofStatus === "invalid") summary.withInvalidProof += 1;
    if (proofStatus === "stale") summary.withStaleProof += 1;
    if (sidecarStatus === "missing") summary.withMissingArtifactSidecar += 1;
    if (sidecarStatus === "invalid") summary.withInvalidArtifactSidecar += 1;
    if (sidecarStatus === "stale") summary.withStaleArtifactSidecar += 1;
    return summary;
  }, {
    total: 0,
    queued: 0,
    running: 0,
    done: 0,
    failed: 0,
    repaired: 0,
    withIntegrityIssue: 0,
    withMissingProof: 0,
    withInvalidProof: 0,
    withStaleProof: 0,
    withMissingArtifactSidecar: 0,
    withInvalidArtifactSidecar: 0,
    withStaleArtifactSidecar: 0,
  });
}

function normalizeSessionIdFilter(ids, label) {
  if (ids == null) return null;
  if (!Array.isArray(ids)) throw new TypeError(`${label} must be an array when provided`);
  return ids.map((value) => {
    if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} entries must be non-empty strings`);
    return value.trim();
  });
}

export function createExportSessionWorkflow({ exportWorkflow = createExportWorkflow(), sessionStore } = {}) {
  ensureSessionStore(sessionStore);

  return {
    exportWorkflow,
    sessionStore,

    async queueExport(request) {
      const queued = exportWorkflow.queueExport(request);
      await sessionStore.saveSession(queued.jobId, buildSessionPayload(queued, request));
      return queued;
    },

    async loadJob(jobId) {
      return sessionStore.getSession(jobId);
    },

    async listJobIds() {
      return sessionStore.listSessionIds();
    },

    async reloadJobs({ repairDone = false, jobIds = null } = {}) {
      const report = await this.reloadJobsReport({ repairDone, jobIds });
      return report.jobs.map(({ repairedDuringReload, ...job }) => job);
    },

    async repairDoneJobs({ jobIds = null } = {}) {
      return this.reloadJobsReport({ repairDone: true, jobIds });
    },

    async reloadJobsReport({ repairDone = false, jobIds = null } = {}) {
      const selectedJobIds = normalizeSessionIdFilter(jobIds, "jobIds");
      const availableJobIds = await sessionStore.listSessionIds();
      const targetJobIds = selectedJobIds ? selectedJobIds.filter((jobId) => availableJobIds.includes(jobId)) : availableJobIds;
      const skippedJobIds = selectedJobIds ? selectedJobIds.filter((jobId) => !availableJobIds.includes(jobId)) : [];
      const jobs = [];
      const repairedJobIds = [];
      for (const jobId of targetJobIds) {
        const session = await sessionStore.getSession(jobId);
        if (!session) continue;
        const job = exportWorkflow.restoreExport(buildRestoreRequest(session));
        if (job.status === "done") {
          const refreshed = await exportWorkflow.refreshJob(job.jobId);
          if (repairDone && hasIntegrityIssue(refreshed)) {
            await sessionStore.saveSession(job.jobId, {
              status: "running",
              error: null,
              companionOutput: null,
              artifactSidecar: null,
            });
            const repaired = await exportWorkflow.rerunJob(job.jobId);
            await sessionStore.saveSession(job.jobId, {
              status: repaired.job.status,
              companionOutput: repaired.artifact?.companionOutput ?? null,
              artifactSidecar: repaired.job.artifactSidecar ?? null,
              error: repaired.job.error ?? null,
            });
            jobs.push(repaired.job);
            repairedJobIds.push(job.jobId);
            continue;
          }
          await sessionStore.saveSession(job.jobId, {
            companionOutput: refreshed.companionOutput,
            artifactSidecar: refreshed.artifactSidecar,
          });
          jobs.push(refreshed);
          continue;
        }
        jobs.push(job);
      }
      const reportedJobs = jobs.map((job) => ({
        ...job,
        repairedDuringReload: repairedJobIds.includes(job.jobId),
      }));
      const requestedJobIds = selectedJobIds ?? availableJobIds;
      const integrityIssueJobIds = reportedJobs.filter((job) => hasIntegrityIssue(job)).map((job) => job.jobId);
      const counts = {
        ...summarizeReloadCounts(reportedJobs),
        requested: requestedJobIds.length,
        processed: reportedJobs.length,
        skipped: skippedJobIds.length,
      };
      return {
        counts,
        requestedJobIds,
        skippedJobIds,
        latestJobIds: jobs.map((job) => job.jobId),
        repairedJobIds,
        integrityIssueJobIds,
        latestRepairedJobId: repairedJobIds[0] ?? null,
        latestIntegrityIssueJobId: integrityIssueJobIds[0] ?? null,
        latestSkippedJobId: skippedJobIds[0] ?? null,
        jobs: reportedJobs,
      };
    },

    async runJob(jobId) {
      const session = await sessionStore.getSession(jobId);
      if (!session) throw new Error(`no export session stored for jobId: ${jobId}`);

      await sessionStore.saveSession(jobId, {
        status: "running",
        error: null,
        companionOutput: null,
        artifactSidecar: null,
      });
      const result = await exportWorkflow.runJob(jobId);
      await sessionStore.saveSession(jobId, {
        status: result.job.status,
        companionOutput: result.artifact?.companionOutput ?? null,
        artifactSidecar: result.job.artifactSidecar ?? null,
        error: result.job.error ?? null,
      });

      return {
        ...result,
        session: await sessionStore.getSession(jobId),
      };
    },

    async rerunJob(jobId) {
      const session = await sessionStore.getSession(jobId);
      if (!session) throw new Error(`no export session stored for jobId: ${jobId}`);

      await sessionStore.saveSession(jobId, {
        status: "running",
        error: null,
        companionOutput: null,
        artifactSidecar: null,
      });
      const result = await exportWorkflow.rerunJob(jobId);
      await sessionStore.saveSession(jobId, {
        status: result.job.status,
        companionOutput: result.artifact?.companionOutput ?? null,
        artifactSidecar: result.job.artifactSidecar ?? null,
        error: result.job.error ?? null,
      });

      return {
        ...result,
        session: await sessionStore.getSession(jobId),
      };
    },
  };
}
