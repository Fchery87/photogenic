import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { GATE_LADDER, evaluateViewportProof } from "./gates.js";

const STORE_VERSION = 1;
const emptyStore = () => ({ version: STORE_VERSION, sessions: {} });
const clone = (value) => JSON.parse(JSON.stringify(value));
const defaultClock = () => new Date().toISOString();

function normalizeSessionId(value) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError("sessionId is required");
  return value.trim();
}

function normalizeResults(results) {
  const verdict = evaluateViewportProof(results);
  return GATE_LADDER.filter((id) => results.some((result) => result.id === id)).map((id) => {
    const result = results.find((entry) => entry.id === id);
    return {
      id: result.id,
      passed: result.passed,
      fps: typeof result.fps === "number" ? result.fps : undefined,
      note: typeof result.note === "string" ? result.note : undefined,
    };
  }).concat([]) && { results: clone(results), verdict };
}

function normalizeEntry(sessionId, entry, clock) {
  const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : clock();
  const normalized = normalizeResults(entry.results ?? []);
  return {
    sessionId: normalizeSessionId(sessionId),
    shell: typeof entry.shell === "string" && entry.shell ? entry.shell : "unknown",
    results: normalized.results,
    verdict: normalized.verdict,
    createdAt,
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : createdAt,
  };
}

export async function createViewportProofSessionStore({ path, clock = defaultClock } = {}) {
  if (typeof path !== "string" || !path) throw new TypeError("path is required");

  let mutationChain = Promise.resolve();

  async function loadStore() {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8"));
      if (parsed.version !== STORE_VERSION || !parsed.sessions) {
        throw new RangeError("unsupported viewport proof session store version");
      }
      const sessions = {};
      for (const [sessionId, entry] of Object.entries(parsed.sessions)) {
        sessions[sessionId] = normalizeEntry(sessionId, entry, clock);
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
      const normalizedSessionId = normalizeSessionId(sessionId);
      if (!payload || typeof payload !== "object") throw new TypeError("session payload is required");
      return withMutation(async () => {
        const store = await loadStore();
        const existing = store.sessions[normalizedSessionId] ?? null;
        const timestamp = clock();
        const entry = normalizeEntry(
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
            kind: "save-viewport-proof-session",
            sessionId: normalizedSessionId,
            shell: entry.shell,
            unlocked: entry.verdict.shellDecisionUnlocked,
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
          kind: "get-viewport-proof-session",
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
          kind: "list-viewport-proof-session-ids",
          count: sessionIds.length,
        },
        sessionIds,
      };
    },
  };
}
