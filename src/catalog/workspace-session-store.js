import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const STORE_VERSION = 1;
const emptyStore = () => ({ version: STORE_VERSION, snapshots: {} });
const clone = (value) => JSON.parse(JSON.stringify(value));
const defaultClock = () => new Date().toISOString();

function normalizeId(value, label, { allowNull = false } = {}) {
  if (allowNull && (value === null || typeof value === "undefined" || value === "")) return null;
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} is required`);
  return value.trim();
}

function normalizeStringList(values, label) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => normalizeId(value, label)))].sort();
}

function normalizeSnapshot(snapshotId, entry, clock) {
  const createdAt = typeof entry.createdAt === "string" ? entry.createdAt : clock();
  return {
    snapshotId: normalizeId(snapshotId, "snapshotId"),
    selectedImageId: normalizeId(entry.selectedImageId, "selectedImageId", { allowNull: true }),
    activeFilter: normalizeId(entry.activeFilter ?? "all", "activeFilter"),
    activePresetId: normalizeId(entry.activePresetId, "activePresetId", { allowNull: true }),
    activeBatchSessionId: normalizeId(entry.activeBatchSessionId, "activeBatchSessionId", { allowNull: true }),
    expandedImageIds: normalizeStringList(entry.expandedImageIds, "expandedImageIds"),
    createdAt,
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : createdAt,
  };
}

export async function createWorkspaceSessionStore({ path, catalogBackend, clock = defaultClock } = {}) {
  if (catalogBackend) {
    if (typeof catalogBackend.loadStore !== "function" || typeof catalogBackend.saveStore !== "function") {
      throw new TypeError("catalogBackend with loadStore() and saveStore() is required");
    }
  } else if (typeof path !== "string" || !path) {
    throw new TypeError("path is required");
  }

  let mutationChain = Promise.resolve();

  async function loadStore() {
    if (catalogBackend) {
      const loaded = await catalogBackend.loadStore();
      if (!loaded) return emptyStore();
      if (loaded.version !== STORE_VERSION || !loaded.snapshots) {
        throw new RangeError("unsupported workspace session store version");
      }
      const snapshots = {};
      for (const [snapshotId, entry] of Object.entries(loaded.snapshots)) {
        snapshots[snapshotId] = normalizeSnapshot(snapshotId, entry, clock);
      }
      return { version: STORE_VERSION, snapshots };
    }
    try {
      const parsed = JSON.parse(await readFile(path, "utf8"));
      if (parsed.version !== STORE_VERSION || !parsed.snapshots) {
        throw new RangeError("unsupported workspace session store version");
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
    if (catalogBackend) {
      await catalogBackend.saveStore(clone(store));
      return;
    }
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
            ...payload,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
          },
          clock,
        );
        store.snapshots[normalizedSnapshotId] = snapshot;
        await saveStore(store);
        return {
          operation: {
            kind: "save-workspace-session",
            snapshotId: normalizedSnapshotId,
            selectedImageId: snapshot.selectedImageId,
            activePresetId: snapshot.activePresetId,
            activeBatchSessionId: snapshot.activeBatchSessionId
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
          kind: "get-workspace-session",
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
          kind: "list-workspace-session-snapshot-ids",
          count: snapshotIds.length,
        },
        snapshotIds,
      };
    },
  };
}
