import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const STORE_VERSION = 1;
const emptyStore = () => ({ version: STORE_VERSION, snapshots: {} });
const clone = (value) => JSON.parse(JSON.stringify(value));
const defaultClock = () => new Date().toISOString();

function normalizeId(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function normalizeLicense(license) {
  if (license === null || typeof license === "undefined") return null;
  if (!license || typeof license !== "object" || Array.isArray(license)) {
    throw new TypeError("license must be an object when provided");
  }
  return clone(license);
}

function normalizeCredits(credits) {
  if (credits === null || typeof credits === "undefined") return { balance: 0 };
  if (!credits || typeof credits !== "object" || Array.isArray(credits)) {
    throw new TypeError("credits must be an object when provided");
  }
  const balance = Number.isInteger(credits.balance) ? credits.balance : 0;
  return { ...clone(credits), balance };
}

function normalizeSnapshot(snapshotId, entry, clock) {
  const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : clock();
  const evaluatedAt = typeof entry.evaluatedAt === "string" ? entry.evaluatedAt : createdAt;
  return {
    snapshotId: normalizeId(snapshotId, "snapshotId"),
    license: normalizeLicense(entry.license),
    credits: normalizeCredits(entry.credits),
    evaluatedAt,
    createdAt,
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : createdAt,
  };
}

export async function createLicensingSessionStore({ path, clock = defaultClock } = {}) {
  if (typeof path !== "string" || !path) throw new TypeError("path is required");

  let mutationChain = Promise.resolve();

  async function loadStore() {
    try {
      const parsed = JSON.parse(await readFile(path, "utf8"));
      if (parsed.version !== STORE_VERSION || !parsed.snapshots) {
        throw new RangeError("unsupported licensing session store version");
      }
      const snapshots = {};
      for (const [snapshotId, entry] of Object.entries(parsed.snapshots)) {
        snapshots[snapshotId] = normalizeSnapshot(snapshotId, entry, clock);
      }
      return { version: STORE_VERSION, snapshots };
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
    async saveSnapshot(snapshotId, payload) {
      const result = await this.saveSnapshotReport(snapshotId, payload);
      return result.snapshot;
    },

    async saveSnapshotReport(snapshotId, payload) {
      const normalizedSnapshotId = normalizeId(snapshotId, "snapshotId");
      if (!payload || typeof payload !== "object") throw new TypeError("snapshot payload is required");
      return withMutation(async () => {
        const store = await loadStore();
        const existing = store.snapshots[normalizedSnapshotId] ?? null;
        const timestamp = clock();
        const snapshot = normalizeSnapshot(
          normalizedSnapshotId,
          {
            ...existing,
            ...payload,
            createdAt: existing?.createdAt ?? timestamp,
            evaluatedAt: payload.evaluatedAt ?? existing?.evaluatedAt ?? timestamp,
            updatedAt: timestamp,
          },
          clock,
        );
        store.snapshots[normalizedSnapshotId] = snapshot;
        await saveStore(store);
        return {
          operation: {
            kind: "save-licensing-snapshot",
            snapshotId: normalizedSnapshotId,
            hasLicense: snapshot.license != null,
            creditBalance: snapshot.credits.balance,
          },
          snapshot: clone(snapshot),
        };
      });
    },

    async getSnapshot(snapshotId) {
      const result = await this.getSnapshotReport(snapshotId);
      return result?.snapshot ?? null;
    },

    async getSnapshotReport(snapshotId) {
      const store = await loadStore();
      const snapshot = store.snapshots[snapshotId] ? clone(store.snapshots[snapshotId]) : null;
      return snapshot ? {
        operation: {
          kind: "get-licensing-snapshot",
          snapshotId,
        },
        snapshot,
      } : null;
    },

    async listSnapshotIds() {
      const result = await this.listSnapshotIdsReport();
      return result.snapshotIds;
    },

    async listSnapshotIdsReport() {
      const snapshotIds = Object.keys((await loadStore()).snapshots).sort();
      return {
        operation: {
          kind: "list-licensing-snapshot-ids",
          count: snapshotIds.length,
        },
        snapshotIds,
      };
    },
  };
}
