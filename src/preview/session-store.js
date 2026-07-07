import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const STORE_VERSION = 1;
const emptyStore = () => ({ version: STORE_VERSION, sessions: {} });
const clone = (value) => JSON.parse(JSON.stringify(value));
const defaultClock = () => new Date().toISOString();
const REQUEST_STATUSES = new Set(["queued", "cancelled", "superseded", "ready"]);
const CACHE_STATUSES = new Set(["miss", "hit", "stored"]);

function normalizeId(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function normalizeCacheStatus(value) {
  if (value === null || typeof value === "undefined" || value === "") return null;
  if (!CACHE_STATUSES.has(value)) {
    throw new RangeError(`unsupported preview cache status: ${String(value)}`);
  }
  return value;
}

function normalizeCacheRecord(record) {
  if (record === null || typeof record === "undefined") return null;
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new TypeError("cacheRecord must be an object when provided");
  }
  return {
    proxyKey: normalizeId(record.proxyKey, "cacheRecord.proxyKey"),
    filePath: normalizeId(record.filePath, "cacheRecord.filePath"),
    invalidationInputs: record.invalidationInputs && typeof record.invalidationInputs === "object"
      ? clone(record.invalidationInputs)
      : {},
    viewport: record.viewport && typeof record.viewport === "object" ? clone(record.viewport) : {},
    recipeFingerprint: typeof record.recipeFingerprint === "string" && record.recipeFingerprint
      ? record.recipeFingerprint
      : null,
    renderedImage: record.renderedImage && typeof record.renderedImage === "object" ? clone(record.renderedImage) : null,
    createdAt: typeof record.createdAt === "string" ? record.createdAt : null,
    lastAccessedAt: typeof record.lastAccessedAt === "string" ? record.lastAccessedAt : null,
  };
}

function normalizeRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) {
    throw new TypeError("request is required");
  }
  if (!REQUEST_STATUSES.has(request.status)) {
    throw new RangeError(`unsupported preview request status: ${String(request.status)}`);
  }
  if (!request.source || typeof request.source !== "object") {
    throw new TypeError("request.source is required");
  }
  if (!request.proxy || typeof request.proxy !== "object") {
    throw new TypeError("request.proxy is required");
  }
  return clone({
    ...request,
    requestId: normalizeId(request.requestId, "request.requestId"),
    status: request.status,
    source: {
      ...request.source,
      imageId: normalizeId(request.source.imageId, "request.source.imageId"),
    },
    proxy: {
      ...request.proxy,
      proxyKey: normalizeId(request.proxy.proxyKey, "request.proxy.proxyKey"),
    },
  });
}

function normalizeSession(sessionId, entry, clock) {
  const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : clock();
  return {
    sessionId: normalizeId(sessionId, "sessionId"),
    request: normalizeRequest(entry.request),
    cacheStatus: normalizeCacheStatus(entry.cacheStatus),
    cacheRecord: normalizeCacheRecord(entry.cacheRecord),
    createdAt,
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : createdAt,
  };
}

export async function createPreviewSessionStore({ path, clock = defaultClock } = {}) {
  if (typeof path !== "string" || !path) throw new TypeError("path is required");

  let mutationChain = Promise.resolve();

  async function loadStore() {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8"));
      if (parsed.version !== STORE_VERSION || !parsed.sessions) {
        throw new RangeError("unsupported preview session store version");
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
            kind: "save-preview-session",
            sessionId: normalizedSessionId,
            status: session.request.status,
            cacheStatus: session.cacheStatus,
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
          kind: "get-preview-session",
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
          kind: "list-preview-session-ids",
          count: sessionIds.length,
        },
        sessionIds,
      };
    },
  };
}
