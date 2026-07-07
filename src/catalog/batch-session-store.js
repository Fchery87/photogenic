import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { BATCH_SYNC_ALLOWED_OPERATION_TYPES } from "../edit-recipe/recipe.js";

const STORE_VERSION = 1;
const emptyStore = () => ({ version: STORE_VERSION, sessions: {} });
const clone = (value) => JSON.parse(JSON.stringify(value));
const defaultClock = () => new Date().toISOString();

function normalizeId(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function normalizeIdList(values, label) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError(`${label} must be a non-empty array`);
  }
  return [...new Set(values.map((value) => normalizeId(value, label)))].sort();
}

function normalizeIncludedTypes(values) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError("includedTypes must be a non-empty array");
  }
  return [...new Set(values.map((value) => normalizeId(value, "includedTypes")))].sort().map((type) => {
    if (!BATCH_SYNC_ALLOWED_OPERATION_TYPES.has(type)) {
      throw new RangeError(`includedTypes contains unsupported type: ${String(type)}`);
    }
    return type;
  });
}

function normalizeSessionEntry(sessionId, entry, clock) {
  const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : clock();
  return {
    sessionId: normalizeId(sessionId, "sessionId"),
    sourceImageId: normalizeId(entry.sourceImageId, "sourceImageId"),
    includedTypes: normalizeIncludedTypes(entry.includedTypes),
    targetImageIds: normalizeIdList(entry.targetImageIds, "targetImageIds"),
    createdAt,
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : createdAt,
  };
}

export async function createBatchSessionStore({ path, clock = defaultClock } = {}) {
  if (typeof path !== "string" || !path) throw new TypeError("path is required");

  let mutationChain = Promise.resolve();

  async function loadStore() {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8"));
      if (parsed.version !== STORE_VERSION || !parsed.sessions) {
        throw new RangeError("unsupported batch session store version");
      }
      const sessions = {};
      for (const [sessionId, entry] of Object.entries(parsed.sessions)) {
        sessions[sessionId] = normalizeSessionEntry(sessionId, entry, clock);
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
        const entry = normalizeSessionEntry(
          normalizedSessionId,
          {
            ...payload,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
          },
          clock,
        );
        store.sessions[normalizedSessionId] = entry;
        await saveStore(store);
        return {
          operation: {
            kind: "save-batch-session",
            sessionId: normalizedSessionId,
            sourceImageId: entry.sourceImageId,
            includedTypes: [...entry.includedTypes],
            targetCount: entry.targetImageIds.length
          },
          session: clone(entry),
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
          kind: "get-batch-session",
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
          kind: "list-batch-session-ids",
          count: sessionIds.length,
        },
        sessionIds,
      };
    },
  };
}
