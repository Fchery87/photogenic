import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const STORE_VERSION = 1;
const emptyStore = () => ({ version: STORE_VERSION, runs: {} });
const clone = (value) => JSON.parse(JSON.stringify(value));
const defaultClock = () => new Date().toISOString();

function normalizeId(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function normalizeRun(runId, entry, clock) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new TypeError("run entry is required");
  const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : clock();
  return {
    runId: normalizeId(runId, "runId"),
    report: entry.report && typeof entry.report === "object" ? clone(entry.report) : null,
    createdAt,
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : createdAt,
  };
}

export async function createInternalAlphaSessionStore({ path, clock = defaultClock } = {}) {
  if (typeof path !== "string" || !path) throw new TypeError("path is required");

  let mutationChain = Promise.resolve();

  async function loadStore() {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8"));
      if (parsed.version !== STORE_VERSION || !parsed.runs) {
        throw new RangeError("unsupported internal alpha session store version");
      }
      const runs = {};
      for (const [runId, entry] of Object.entries(parsed.runs)) {
        runs[runId] = normalizeRun(runId, entry, clock);
      }
      return { version: STORE_VERSION, runs };
    } catch (error) {
      if (error && error.code === "ENOENT") return emptyStore();
      throw error;
    }
  }

  async function saveStore(store) {
    await mkdir(dirname(path), { recursive: true });
    const tempPath = `${path}.tmp`;
    await writeFile(tempPath, JSON.stringify(store, null, 2) + "\n", "utf8");
    await rename(tempPath, path);
  }

  async function withMutation(work) {
    const previous = mutationChain;
    let release;
    mutationChain = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await work();
    } finally {
      release();
    }
  }

  return {
    async saveRun(runId, payload) {
      const result = await this.saveRunReport(runId, payload);
      return result.run;
    },

    async saveRunReport(runId, payload) {
      const normalizedRunId = normalizeId(runId, "runId");
      if (!payload || typeof payload !== "object") throw new TypeError("run payload is required");
      return withMutation(async () => {
        const store = await loadStore();
        const existing = store.runs[normalizedRunId] ?? null;
        const timestamp = clock();
        const run = normalizeRun(
          normalizedRunId,
          {
            ...existing,
            ...payload,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
          },
          clock,
        );
        store.runs[normalizedRunId] = run;
        await saveStore(store);
        return {
          operation: {
            kind: "save-internal-alpha-run",
            runId: normalizedRunId,
            status: run.report?.health?.status ?? null,
          },
          run: clone(run),
        };
      });
    },

    async getRun(runId) {
      const result = await this.getRunReport(runId);
      return result?.run ?? null;
    },

    async getRunReport(runId) {
      const store = await loadStore();
      const run = store.runs[runId] ? clone(store.runs[runId]) : null;
      return run ? {
        operation: {
          kind: "get-internal-alpha-run",
          runId,
        },
        run,
      } : null;
    },

    async listRunIds() {
      const result = await this.listRunIdsReport();
      return result.runIds;
    },

    async listRunIdsReport() {
      const runIds = Object.keys((await loadStore()).runs).sort();
      return {
        operation: {
          kind: "list-internal-alpha-run-ids",
          count: runIds.length,
        },
        runIds,
      };
    },
  };
}
