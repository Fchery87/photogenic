import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { normalizeExportOptions } from "./format-options.js";

const STORE_VERSION = 1;
const emptyStore = () => ({ version: STORE_VERSION, sessions: {} });
const clone = (value) => JSON.parse(JSON.stringify(value));
const defaultClock = () => new Date().toISOString();

function normalizeId(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function normalizeStatus(value) {
  const status = value ?? "queued";
  if (!["queued", "running", "done", "failed"].includes(status)) {
    throw new RangeError(`unsupported export session status: ${String(status)}`);
  }
  return status;
}

function normalizeCompanionOutput(value) {
  if (!value || typeof value !== "object") return null;
  return {
    path: typeof value.path === "string" && value.path ? value.path : null,
    kind: typeof value.kind === "string" && value.kind ? value.kind : null,
    status: typeof value.status === "string" && value.status ? value.status : null,
    sizeBytes: Number.isInteger(value.sizeBytes) && value.sizeBytes >= 0 ? value.sizeBytes : null,
    contentHash:
      value.contentHash && typeof value.contentHash === "object" && typeof value.contentHash.algorithm === "string" && typeof value.contentHash.value === "string"
        ? { algorithm: value.contentHash.algorithm, value: value.contentHash.value }
        : null,
    width: Number.isInteger(value.width) && value.width > 0 ? value.width : null,
    height: Number.isInteger(value.height) && value.height > 0 ? value.height : null,
    note: typeof value.note === "string" && value.note ? value.note : null,
  };
}

function normalizeArtifactSidecar(value) {
  if (!value || typeof value !== "object") return null;
  return {
    path: typeof value.path === "string" && value.path ? value.path : null,
    kind: typeof value.kind === "string" && value.kind ? value.kind : null,
    status: typeof value.status === "string" && value.status ? value.status : null,
    sizeBytes: Number.isInteger(value.sizeBytes) && value.sizeBytes >= 0 ? value.sizeBytes : null,
    note: typeof value.note === "string" && value.note ? value.note : null,
  };
}

function normalizeSession(sessionId, entry, clock) {
  const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : clock();
  return {
    sessionId: normalizeId(sessionId, "sessionId"),
    imageId: normalizeId(entry.imageId, "imageId"),
    outputName: normalizeId(entry.outputName, "outputName"),
    outputPath: normalizeId(entry.outputPath, "outputPath"),
    status: normalizeStatus(entry.status),
    options: normalizeExportOptions(entry.options ?? {}),
    source: entry.source && typeof entry.source === "object" ? clone(entry.source) : null,
    recipe: entry.recipe && typeof entry.recipe === "object" ? clone(entry.recipe) : null,
    companionOutput: normalizeCompanionOutput(entry.companionOutput),
    artifactSidecar: normalizeArtifactSidecar(entry.artifactSidecar),
    error: typeof entry.error === "string" && entry.error ? entry.error : null,
    createdAt,
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : createdAt,
  };
}

export async function createExportSessionStore({ path, clock = defaultClock } = {}) {
  if (typeof path !== "string" || !path) throw new TypeError("path is required");

  let mutationChain = Promise.resolve();

  async function loadStore() {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8"));
      if (parsed.version !== STORE_VERSION || !parsed.sessions) {
        throw new RangeError("unsupported export session store version");
      }
      const sessions = {};
      for (const [sessionId, entry] of Object.entries(parsed.sessions)) {
        sessions[sessionId] = normalizeSession(sessionId, entry, clock);
      }
      return { version: STORE_VERSION, sessions };
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
    async saveSession(sessionId, payload) {
      const result = await this.saveSessionReport(sessionId, payload);
      return result.session;
    },

    async saveSessionReport(sessionId, payload) {
      const normalizedSessionId = normalizeId(sessionId, "sessionId");
      if (!payload || typeof payload !== "object") throw new TypeError("session payload is required");
      return withMutation(async () => {
        const store = await loadStore();
        const existing = store.sessions[normalizedSessionId] ?? null;
        const timestamp = clock();
        const session = normalizeSession(
          normalizedSessionId,
          {
            ...existing,
            ...payload,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
          },
          clock,
        );
        store.sessions[normalizedSessionId] = session;
        await saveStore(store);
        return {
          operation: {
            kind: "save-export-session",
            sessionId: normalizedSessionId,
            status: session.status,
          },
          session: clone(session),
        };
      });
    },

    async getSession(sessionId) {
      const result = await this.getSessionReport(sessionId);
      return result?.session ?? null;
    },

    async getSessionReport(sessionId) {
      const store = await loadStore();
      const session = store.sessions[sessionId] ? clone(store.sessions[sessionId]) : null;
      return session ? {
        operation: {
          kind: "get-export-session",
          sessionId,
        },
        session,
      } : null;
    },

    async listSessionIds() {
      const result = await this.listSessionIdsReport();
      return result.sessionIds;
    },

    async listSessionIdsReport() {
      const sessionIds = Object.keys((await loadStore()).sessions).sort();
      return {
        operation: {
          kind: "list-export-session-ids",
          count: sessionIds.length,
        },
        sessionIds,
      };
    },
  };
}
