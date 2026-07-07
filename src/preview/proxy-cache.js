function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createProxyCache({ maxEntries = 3, clock = () => new Date().toISOString() } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1) {
    throw new TypeError("maxEntries must be a positive integer");
  }

  const entries = new Map();

  function touch(proxyKey) {
    const existing = entries.get(proxyKey);
    if (!existing) return null;
    existing.lastAccessedAt = clock();
    entries.delete(proxyKey);
    entries.set(proxyKey, existing);
    return existing;
  }

  function evictIfNeeded() {
    while (entries.size > maxEntries) {
      const [oldestKey, oldest] = entries.entries().next().value;
      entries.delete(oldestKey);
      oldest.evictedAt = clock();
    }
  }

  return {
    put(descriptor, filePath, renderedImage = null) {
      if (!descriptor?.proxyKey) throw new TypeError("descriptor.proxyKey is required");
      if (typeof filePath !== "string" || !filePath) throw new TypeError("filePath is required");
      const now = clock();
      const record = {
        proxyKey: descriptor.proxyKey,
        filePath,
        invalidationInputs: clone(descriptor.invalidationInputs ?? {}),
        viewport: clone(descriptor.viewport ?? {}),
        recipeFingerprint: descriptor.recipeFingerprint ?? null,
        renderedImage: clone(renderedImage),
        createdAt: entries.get(descriptor.proxyKey)?.createdAt ?? now,
        lastAccessedAt: now,
      };
      entries.delete(descriptor.proxyKey);
      entries.set(descriptor.proxyKey, record);
      evictIfNeeded();
      return clone(record);
    },

    restore(record) {
      if (!record?.proxyKey) throw new TypeError("record.proxyKey is required");
      if (typeof record.filePath !== "string" || !record.filePath) throw new TypeError("record.filePath is required");
      const restored = {
        proxyKey: record.proxyKey,
        filePath: record.filePath,
        invalidationInputs: clone(record.invalidationInputs ?? {}),
        viewport: clone(record.viewport ?? {}),
        recipeFingerprint: record.recipeFingerprint ?? null,
        renderedImage: clone(record.renderedImage),
        createdAt: typeof record.createdAt === "string" ? record.createdAt : clock(),
        lastAccessedAt: typeof record.lastAccessedAt === "string" ? record.lastAccessedAt : clock(),
      };
      entries.delete(record.proxyKey);
      entries.set(record.proxyKey, restored);
      evictIfNeeded();
      return clone(restored);
    },

    get(proxyKey) {
      const record = touch(proxyKey);
      return record ? clone(record) : null;
    },

    invalidateWhere(predicate) {
      let removed = 0;
      for (const [proxyKey, record] of entries.entries()) {
        if (predicate(record)) {
          entries.delete(proxyKey);
          removed += 1;
        }
      }
      return removed;
    },

    list() {
      return Array.from(entries.values(), clone);
    },
  };
}
