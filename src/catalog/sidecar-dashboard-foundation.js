function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function hasSavedSidecar(entry) {
  return typeof entry.sidecarPath === "string" && entry.sidecarPath;
}

function sortByLinkedOrUpdatedAt(a, b) {
  const aValue = String(a.sidecarLinkedAt ?? a.updatedAt);
  const bValue = String(b.sidecarLinkedAt ?? b.updatedAt);
  return bValue.localeCompare(aValue);
}

function summarizeCounts(entries, linkedEntries, syncStates) {
  const linkedWithTimestamp = linkedEntries.filter((entry) => typeof entry.sidecarLinkedAt === "string" && entry.sidecarLinkedAt).length;
  return {
    totalImages: entries.length,
    withSavedSidecars: linkedEntries.length,
    withoutSavedSidecars: entries.length - linkedEntries.length,
    withLinkedTimestamp: linkedWithTimestamp,
    withoutLinkedTimestamp: linkedEntries.length - linkedWithTimestamp,
    inSync: syncStates.filter((state) => state.status === "in-sync").length,
    conflicts: syncStates.filter((state) => state.status === "conflict").length,
    missingSidecars: syncStates.filter((state) => state.status === "missing-sidecar").length,
    syncIssues: syncStates.filter((state) => state.status === "conflict" || state.status === "missing-sidecar").length,
    withObservedSidecarFile: syncStates.filter((state) => state.sidecarFile?.status === "present").length,
    withMissingObservedSidecarFile: syncStates.filter((state) => state.sidecarFile?.status === "missing").length,
    withMatchedRevision: syncStates.filter((state) => state.revisionDrift?.status === "matched").length,
    withCatalogNewerRevision: syncStates.filter((state) => state.revisionDrift?.status === "catalog-newer").length,
    withSidecarNewerRevision: syncStates.filter((state) => state.revisionDrift?.status === "sidecar-newer").length,
    withUnknownRevisionDrift: syncStates.filter((state) => state.revisionDrift?.status === "unknown").length,
    withRevisionIssue: syncStates.filter((state) => {
      const status = state.revisionDrift?.status;
      return status === "catalog-newer" || status === "sidecar-newer" || status === "unknown";
    }).length,
    unchangedSinceLink: syncStates.filter((state) => state.sidecarFreshness?.status === "unchanged-since-link").length,
    modifiedAfterLink: syncStates.filter((state) => state.sidecarFreshness?.status === "modified-after-link").length,
    missingSinceLink: syncStates.filter((state) => state.sidecarFreshness?.status === "missing").length,
    unknownFreshness: syncStates.filter((state) => state.sidecarFreshness?.status === "unknown").length,
    withFreshnessIssue: syncStates.filter((state) => {
      const status = state.sidecarFreshness?.status;
      return status === "modified-after-link" || status === "missing" || status === "unknown";
    }).length,
  };
}

function summarizeSidecarFiles(syncStates) {
  const observed = syncStates.filter((state) => state.sidecarFile?.status === "present");
  const knownByteSizes = observed
    .map((state) => state.sidecarFile?.byteSize)
    .filter((value) => Number.isInteger(value) && value >= 0);
  const knownModifiedAts = observed
    .map((state) => state.sidecarFile?.modifiedAt)
    .filter((value) => typeof value === "string" && value);

  return {
    byteSizeTotal: knownByteSizes.reduce((sum, value) => sum + value, 0),
    withKnownByteSize: knownByteSizes.length,
    withKnownModifiedAt: knownModifiedAts.length,
    latestModifiedAt: knownModifiedAts.sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null,
  };
}

function summarizeLargestObservedSidecar(syncStates) {
  const observed = syncStates.filter((state) => state.sidecarFile?.status === "present");
  const sortable = observed
    .filter((state) => Number.isInteger(state.sidecarFile?.byteSize) && state.sidecarFile.byteSize >= 0)
    .sort((a, b) => {
      const bySize = b.sidecarFile.byteSize - a.sidecarFile.byteSize;
      if (bySize !== 0) return bySize;
      return String(b.updatedAt).localeCompare(String(a.updatedAt));
    });
  return sortable[0] ?? null;
}

function summarizeLinkedTimeline(linkedEntries) {
  const linkedAtValues = linkedEntries
    .map((entry) => entry.sidecarLinkedAt)
    .filter((value) => typeof value === "string" && value);
  const sorted = [...linkedAtValues].sort((a, b) => String(a).localeCompare(String(b)));
  const earliestLinkedAt = sorted[0] ?? null;
  const latestLinkedAt = sorted.at(-1) ?? null;
  const earliestMs = earliestLinkedAt ? Date.parse(earliestLinkedAt) : Number.NaN;
  const latestMs = latestLinkedAt ? Date.parse(latestLinkedAt) : Number.NaN;
  const spanMs = Number.isFinite(earliestMs) && Number.isFinite(latestMs) ? Math.max(0, latestMs - earliestMs) : null;
  return {
    withLinkedAt: linkedAtValues.length,
    withoutLinkedAt: linkedEntries.length - linkedAtValues.length,
    earliestLinkedAt,
    latestLinkedAt,
    spanMs,
    spanStatus: spanMs === null ? "unknown" : spanMs === 0 ? "single-point" : "range",
  };
}

export function createSidecarDashboardFoundation() {
  return {
    summarizeSavedSyncStates({ entries = [], syncStates = [] } = {}) {
      const normalizedEntries = Array.isArray(entries) ? entries.map((entry) => clone(entry)) : [];
      const normalizedSyncStates = Array.isArray(syncStates) ? syncStates.map((state) => clone(state)) : [];
      const latestEntries = [...normalizedEntries].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
      const linkedEntries = latestEntries.filter((entry) => hasSavedSidecar(entry)).sort(sortByLinkedOrUpdatedAt);
      const latestSyncStates = [...normalizedSyncStates].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

      return {
        counts: summarizeCounts(normalizedEntries, linkedEntries, normalizedSyncStates),
        savedSidecarFiles: summarizeSidecarFiles(normalizedSyncStates),
        linkedTimeline: summarizeLinkedTimeline(linkedEntries),
        latestImageIds: latestEntries.map((entry) => entry.imageId),
        latestLinkedImageIds: linkedEntries.map((entry) => entry.imageId),
        earliestLinkedWithTimestamp: [...linkedEntries].reverse().find((entry) => entry.sidecarLinkedAt) ?? null,
        latestLinkedWithTimestamp: linkedEntries.find((entry) => entry.sidecarLinkedAt) ?? null,
        latestLinkedWithoutTimestamp: linkedEntries.find((entry) => !entry.sidecarLinkedAt) ?? null,
        latestInSync: latestSyncStates.find((state) => state.status === "in-sync") ?? null,
        latestSyncIssue: latestSyncStates.find((state) => state.status === "conflict" || state.status === "missing-sidecar") ?? null,
        latestConflict: latestSyncStates.find((state) => state.status === "conflict") ?? null,
        latestMissingSidecar: latestSyncStates.find((state) => state.status === "missing-sidecar") ?? null,
        latestObservedSidecarFile: latestSyncStates.find((state) => state.sidecarFile?.status === "present") ?? null,
        latestMissingObservedSidecarFile: latestSyncStates.find((state) => state.sidecarFile?.status === "missing") ?? null,
        largestObservedSidecarFile: summarizeLargestObservedSidecar(latestSyncStates),
        latestMatchedRevision: latestSyncStates.find((state) => state.revisionDrift?.status === "matched") ?? null,
        latestRevisionIssue: latestSyncStates.find((state) => {
          const status = state.revisionDrift?.status;
          return status === "catalog-newer" || status === "sidecar-newer" || status === "unknown";
        }) ?? null,
        latestCatalogNewerRevision: latestSyncStates.find((state) => state.revisionDrift?.status === "catalog-newer") ?? null,
        latestSidecarNewerRevision: latestSyncStates.find((state) => state.revisionDrift?.status === "sidecar-newer") ?? null,
        latestUnknownRevisionDrift: latestSyncStates.find((state) => state.revisionDrift?.status === "unknown") ?? null,
        latestUnchangedSinceLink: latestSyncStates.find((state) => state.sidecarFreshness?.status === "unchanged-since-link") ?? null,
        latestFreshnessIssue: latestSyncStates.find((state) => {
          const status = state.sidecarFreshness?.status;
          return status === "modified-after-link" || status === "missing" || status === "unknown";
        }) ?? null,
        latestModifiedAfterLink: latestSyncStates.find((state) => state.sidecarFreshness?.status === "modified-after-link") ?? null,
        latestMissingSinceLink: latestSyncStates.find((state) => state.sidecarFreshness?.status === "missing") ?? null,
        latestUnknownFreshness: latestSyncStates.find((state) => state.sidecarFreshness?.status === "unknown") ?? null,
      };
    },
  };
}
