import path from "node:path";
import { createExportBatchQueue } from "./batch-queue.js";
import { createExportFoundation } from "./foundation.js";
import { normalizeExportOptions } from "./format-options.js";
import { renderFileNameTemplate } from "./naming-template.js";

const FORMAT_EXTENSION = {
  jpeg: ".jpg",
  png: ".png",
  tiff: ".tiff",
};

function deriveBaseName(source) {
  if (typeof source?.path === "string" && source.path) {
    return path.parse(source.path).name;
  }
  if (typeof source?.imageId === "string" && source.imageId) {
    return source.imageId;
  }
  return "export";
}

function buildNamingContext(source, overrides = {}) {
  const baseName = overrides.baseName ?? deriveBaseName(source);
  const fileName = overrides.fileName ?? (typeof source?.path === "string" && source.path ? path.basename(source.path) : baseName);
  return {
    imageId: source?.imageId,
    fileName,
    baseName,
    sequence: overrides.sequence,
    rating: overrides.rating,
    captureAt: overrides.captureAt,
    date: overrides.date,
  };
}

export function createExportWorkflow({
  queue = createExportBatchQueue(),
  exportFoundation = createExportFoundation(),
} = {}) {
  const plans = new Map();

  async function refreshArtifactSidecar(outputPath) {
    if (typeof exportFoundation.refreshArtifactSidecar !== "function") return null;
    return exportFoundation.refreshArtifactSidecar(outputPath);
  }

  async function refreshCompanionOutput(outputPath) {
    if (typeof exportFoundation.refreshCompanionOutput !== "function") return null;
    return exportFoundation.refreshCompanionOutput(outputPath);
  }

  function rememberPlan(jobId, plan) {
    plans.set(jobId, {
      source: plan.source,
      recipe: plan.recipe,
      outputName: plan.outputName,
      artifactPath: plan.artifactPath,
      options: normalizeExportOptions(plan.options ?? {}),
      companionOutput: plan.companionOutput ?? null,
      artifactSidecar: plan.artifactSidecar ?? null,
    });
  }

  function inspectJob(jobId) {
    const plan = plans.get(jobId);
    if (!plan) throw new Error(`unknown export job: ${jobId}`);
    const status = queue.list().find((job) => job.jobId === jobId);
    return {
      ...status,
      outputName: plan.outputName,
      artifactPath: plan.artifactPath,
      companionOutput: plan.companionOutput,
      artifactSidecar: plan.artifactSidecar,
    };
  }

  return {
    queue,

    queueExport({ source, recipe, destinationDir, namingTemplate, naming = {}, options = {} }) {
      const result = this.queueExportReport({ source, recipe, destinationDir, namingTemplate, naming, options });
      return result.job;
    },

    queueExportReport({ source, recipe, destinationDir, namingTemplate, naming = {}, options = {} }) {
      if (typeof destinationDir !== "string" || !destinationDir) {
        throw new TypeError("destinationDir is required");
      }
      const exportOptions = normalizeExportOptions(options);
      const outputName = `${renderFileNameTemplate(namingTemplate, buildNamingContext(source, naming))}${FORMAT_EXTENSION[exportOptions.format]}`;
      const artifactPath = path.join(destinationDir, `${outputName}.json`);
      const queued = queue.enqueue({
        imageId: source?.imageId,
        outputPath: artifactPath,
        format: exportOptions.format,
      });
      rememberPlan(queued.jobId, {
        source,
        recipe,
        outputName,
        artifactPath,
        options: exportOptions,
        companionOutput: null,
        artifactSidecar: null,
      });
      return {
        operation: {
          kind: "queue-export-job",
          jobId: queued.jobId,
          imageId: source?.imageId ?? null,
          outputName,
          format: exportOptions.format,
        },
        job: inspectJob(queued.jobId),
      };
    },

    restoreExport({
      jobId,
      imageId,
      source,
      recipe,
      outputName,
      artifactPath,
      options = {},
      status = "queued",
      error = null,
      companionOutput = null,
      artifactSidecar = null,
    }) {
      if (typeof outputName !== "string" || !outputName) throw new TypeError("outputName is required");
      if (typeof artifactPath !== "string" || !artifactPath) throw new TypeError("artifactPath is required");
      const exportOptions = normalizeExportOptions(options);
      const restored = queue.restore({
        jobId,
        imageId: source?.imageId ?? imageId,
        outputPath: artifactPath,
        format: exportOptions.format,
        status,
        error,
      });
      rememberPlan(restored.jobId, {
        source,
        recipe,
        outputName,
        artifactPath,
        options: exportOptions,
        companionOutput,
        artifactSidecar,
      });
      return inspectJob(restored.jobId);
    },

    inspect(jobId) {
      return inspectJob(jobId);
    },

    async refreshJob(jobId) {
      const plan = plans.get(jobId);
      if (!plan) throw new Error(`unknown export job: ${jobId}`);
      const [companionOutput, artifactSidecar] = await Promise.all([
        refreshCompanionOutput(plan.artifactPath),
        refreshArtifactSidecar(plan.artifactPath),
      ]);
      plan.companionOutput = companionOutput;
      plan.artifactSidecar = artifactSidecar;
      return inspectJob(jobId);
    },

    async runJob(jobId) {
      const result = await this.runJobReport(jobId);
      return {
        job: result.job,
        artifact: result.artifact,
      };
    },

    async runJobReport(jobId) {
      const plan = plans.get(jobId);
      if (!plan) throw new Error(`unknown export job: ${jobId}`);
      queue.markRunning(jobId);
      try {
        const artifact = await exportFoundation.writeArtifact(plan.artifactPath, {
          source: plan.source,
          recipe: plan.recipe,
          outputName: plan.outputName,
          options: plan.options,
        });
        plan.companionOutput = artifact.companionOutput ?? null;
        plan.artifactSidecar = await refreshArtifactSidecar(plan.artifactPath);
        const job = queue.markDone(jobId);
        return {
          operation: {
            kind: "run-export-job",
            jobId,
            status: "done",
          },
          job: {
            ...job,
            outputName: plan.outputName,
            artifactPath: plan.artifactPath,
            companionOutput: plan.companionOutput,
            artifactSidecar: plan.artifactSidecar,
          },
          artifact,
        };
      } catch (error) {
        plan.companionOutput = null;
        plan.artifactSidecar = null;
        const job = queue.markFailed(jobId, error instanceof Error ? error.message : String(error));
        return {
          operation: {
            kind: "run-export-job",
            jobId,
            status: "failed",
          },
          job: {
            ...job,
            outputName: plan.outputName,
            artifactPath: plan.artifactPath,
            companionOutput: null,
            artifactSidecar: null,
          },
          artifact: null,
        };
      }
    },

    async rerunJob(jobId) {
      return this.runJob(jobId);
    },

    /**
     * Run all queued export jobs with bounded concurrency.
     *
     * - Jobs are processed by a pool of `concurrency` workers pulling from the
     *   queue in enqueue order.
     * - A failed job does NOT stop unrelated jobs — failure isolation is built
     *   into runJobReport (try/catch per job).
     * - If `signal` (an AbortSignal) is aborted, workers stop pulling new jobs;
     *   remaining queued jobs stay queued and are reported as not-started.
     *
     * @param {object} [options]
     * @param {number} [options.concurrency=4]   - Max parallel jobs.
     * @param {AbortSignal} [options.signal]      - Abort to cancel remaining jobs.
     * @returns {Promise<object>} Deterministic batch report with all job statuses.
     */
    async runBatch({ concurrency = 4, signal } = {}) {
      if (!Number.isInteger(concurrency) || concurrency < 1) {
        throw new TypeError("concurrency must be a positive integer");
      }

      const queuedJobs = queue.list().filter((j) => j.status === "queued");
      let nextIndex = 0;

      const isCancelled = () => signal?.aborted === true;

      const worker = async () => {
        while (nextIndex < queuedJobs.length) {
          if (isCancelled()) break;
          const job = queuedJobs[nextIndex];
          nextIndex += 1;
          // runJobReport has built-in failure isolation (try/catch per job).
          await this.runJobReport(job.jobId);
        }
      };

      const workerCount = Math.min(concurrency, queuedJobs.length);
      if (workerCount > 0) {
        await Promise.all(Array.from({ length: workerCount }, () => worker()));
      }

      const finalJobs = queue.list();
      const summary = {
        total: queuedJobs.length,
        done: finalJobs.filter((j) => j.status === "done").length,
        failed: finalJobs.filter((j) => j.status === "failed").length,
        remaining: finalJobs.filter((j) => j.status === "queued").length,
        cancelled: isCancelled(),
      };

      return {
        operation: {
          kind: "run-batch-export",
          concurrency,
          cancelled: summary.cancelled,
        },
        jobs: finalJobs.map((j) => inspectJob(j.jobId)),
        summary,
      };
    },
  };
}
