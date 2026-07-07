import { createCatalogFoundation } from "./foundation.js";
import { summarizeLibraryFacets, summarizeObservedSourceMetadata } from "./workflow.js";



function normalizeDashboardQueryFields(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter((field) => typeof field === "string" && field))]
    : [];
}

function buildListPageInfo(filter, entries, totalMatchedCount) {
  const offset = typeof filter.offset === "number" ? filter.offset : 0;
  const limit = typeof filter.limit === "number" ? filter.limit : null;
  const hasPreviousPage = offset > 0;
  const hasNextPage = limit !== null ? (offset + entries.length) < totalMatchedCount : false;
  const previousOffset = hasPreviousPage ? Math.max(0, offset - (limit ?? offset)) : null;
  const nextOffset = hasNextPage ? offset + entries.length : null;
  const pageSize = limit ?? entries.length;
  const totalPages = limit !== null && limit > 0 ? Math.max(1, Math.ceil(totalMatchedCount / limit)) : 1;
  const currentPageIndex = limit !== null && limit > 0 ? Math.floor(offset / limit) : 0;
  const queryTerms = typeof filter.query === "string"
    ? filter.query.trim().split(/\s+/).filter(Boolean)
    : [];
  const queryMode = filter.queryMode === "any" ? "any" : "all";
  const queryFields = normalizeDashboardQueryFields(filter.queryFields);

  const visibleImageIds = entries.map((entry) => entry.imageId);
  const currentPageStartPosition = totalMatchedCount > 0 ? offset + 1 : 0;
  const currentPageEndPosition = entries.length > 0 ? offset + entries.length : 0;
  return {
    offset,
    limit,
    resultCount: entries.length,
    totalMatchedCount,
    hasPreviousPage,
    hasNextPage,
    previousOffset,
    nextOffset,
    pageSize,
    totalPages,
    currentPageIndex,
    currentPageNumber: currentPageIndex + 1,
    queryTerms,
    queryMode,
    queryFields,
    visibleImageIds,
    currentPageImageIds: visibleImageIds,
    currentPageFirstImageId: visibleImageIds[0] ?? null,
    currentPageLastImageId: visibleImageIds.at(-1) ?? null,
    currentPageStartPosition,
    currentPageEndPosition,
  };
}

function buildWorkspaceFilter(activeFilter) {
  return activeFilter === "all" ? {} : activeFilter === "keepers"
    ? { keepersOnly: true }
    : activeFilter === "rejected"
      ? { rejected: true }
      : {};
}

export function createCatalogDashboardWorkflow({
  libraryStore,
  workspaceSessionStore,
  presetStore = null,
  batchSessionStore = null,
  foundation = createCatalogFoundation(),
} = {}) {
  if (!libraryStore || typeof libraryStore.list !== "function" || typeof libraryStore.get !== "function") {
    throw new TypeError("libraryStore with list() and get() is required");
  }
  if (!workspaceSessionStore || typeof workspaceSessionStore.getSnapshot !== "function") {
    throw new TypeError("workspaceSessionStore with getSnapshot() is required");
  }
  if (!foundation || typeof foundation.summarizeDashboardWorkspace !== "function") {
    throw new TypeError("foundation with summarizeDashboardWorkspace() is required");
  }

  return {
    async listVisibleLibrary(snapshotId, filter = {}) {
      const report = await this.listVisibleLibraryReport(snapshotId, filter);
      return report?.entries ?? null;
    },

    async listVisibleLibrarySummary(snapshotId, filter = {}) {
      const report = await this.listVisibleLibraryReport(snapshotId, filter);
      if (!report) return null;
      return {
        operation: report.operation,
        visibleImageIds: report.visibleImageIds,
        matchedImageIds: report.matchedImageIds,
        metadataSummary: report.metadataSummary,
        facetSummary: report.facetSummary,
        matchedMetadataSummary: report.matchedMetadataSummary,
        matchedFacetSummary: report.matchedFacetSummary,
        totalMatchedCount: report.totalMatchedCount,
        pageInfo: report.pageInfo,
      };
    },

    async listVisibleLibraryAtSelection(snapshotId, filter = {}) {
      const report = await this.listVisibleLibraryAtSelectionReport(snapshotId, filter);
      return report?.entries ?? null;
    },

    async listVisibleLibraryAtSelectionSummary(snapshotId, filter = {}) {
      const report = await this.listVisibleLibraryAtSelectionReport(snapshotId, filter);
      if (!report) return null;
      return {
        operation: report.operation,
        visibleImageIds: report.visibleImageIds,
        matchedImageIds: report.matchedImageIds,
        metadataSummary: report.metadataSummary,
        facetSummary: report.facetSummary,
        matchedMetadataSummary: report.matchedMetadataSummary,
        matchedFacetSummary: report.matchedFacetSummary,
        totalMatchedCount: report.totalMatchedCount,
        pageInfo: report.pageInfo,
      };
    },

    async listVisibleLibraryAtSelectionReport(snapshotId, filter = {}) {
      const snapshot = await workspaceSessionStore.getSnapshot(snapshotId);
      if (!snapshot) return null;

      const selectedImageId = snapshot.selectedImageId ?? null;
      const effectiveFilter = {
        ...buildWorkspaceFilter(snapshot.activeFilter),
        ...filter,
      };
      const limit = typeof effectiveFilter.limit === "number" ? effectiveFilter.limit : null;
      if (!selectedImageId || limit === null || limit <= 0) {
        const passthrough = await this.listVisibleLibraryReport(snapshotId, filter);
        if (!passthrough) return null;
        const selectionAnchorReason = !selectedImageId
          ? "no-selected-image"
          : limit === null
            ? "unpaged"
            : "invalid-limit";
        return {
          ...passthrough,
          operation: {
            ...passthrough.operation,
            kind: "list-visible-library-at-selection",
            requestedOffset: typeof effectiveFilter.offset === "number" ? effectiveFilter.offset : 0,
            selectionAnchorApplied: false,
            selectionAnchorReason,
            selectedPageOffset: passthrough.operation.offset,
            selectedPageIndex: passthrough.operation.currentPageIndex,
            selectedPageNumber: passthrough.operation.currentPageNumber,
            selectedPageStartPosition: passthrough.operation.currentPageStartPosition,
            selectedPageEndPosition: passthrough.operation.currentPageEndPosition,
            selectedPageImageIds: passthrough.visibleImageIds,
            selectedPageCount: passthrough.visibleImageIds.length,
            selectedPageFirstImageId: passthrough.visibleImageIds[0] ?? null,
            selectedPageLastImageId: passthrough.visibleImageIds.at(-1) ?? null,
            selectedImageIndexOnPage: passthrough.operation.selectedImageIndexOnPage,
            selectedImagePositionOnPage: passthrough.operation.selectedImagePositionOnPage,
            selectedImagesBeforeOnPage: passthrough.operation.selectedImagesBeforeOnPage,
            selectedImagesAfterOnPage: passthrough.operation.selectedImagesAfterOnPage,
            selectedImagesBeforeMatched: passthrough.operation.selectedImagesBeforeMatched,
            selectedImagesAfterMatched: passthrough.operation.selectedImagesAfterMatched,
            selectedPreviousImageIdOnPage: passthrough.operation.selectedPreviousImageIdOnPage,
            selectedNextImageIdOnPage: passthrough.operation.selectedNextImageIdOnPage,
            selectedImageExists: passthrough.operation.selectedImageExists,
            selectedImageMatched: passthrough.operation.selectedImageMatched,
            selectedImageVisible: passthrough.operation.selectedImageVisible,
            currentPageContainsSelectedImage: passthrough.operation.currentPageContainsSelectedImage,
            currentPageSelectedImageId: passthrough.operation.currentPageSelectedImageId,
            currentPageSelectedImageIndex: passthrough.operation.currentPageSelectedImageIndex,
            currentPageSelectedImagePosition: passthrough.operation.currentPageSelectedImagePosition,
            currentPageSelectionState: passthrough.operation.currentPageSelectionState,
            currentPageSelection: passthrough.operation.currentPageSelection,
            selectedImageState: passthrough.operation.selectedImageState,
            selectedImageMatchedPosition: passthrough.operation.selectedImageMatchedPosition,
            selectedImagePageStartPosition: passthrough.operation.selectedImagePageStartPosition,
            selectedImagePageEndPosition: passthrough.operation.selectedImagePageEndPosition,
            selectedImagePageCount: passthrough.operation.selectedImagePageCount,
            selectedImagePageFirstImageId: passthrough.operation.selectedImagePageFirstImageId,
            selectedImagePageLastImageId: passthrough.operation.selectedImagePageLastImageId,
            selectedImagePageImageIds: passthrough.operation.selectedImagePageImageIds,
          },
          pageInfo: {
            ...passthrough.pageInfo,
            requestedOffset: typeof effectiveFilter.offset === "number" ? effectiveFilter.offset : 0,
            selectionAnchorApplied: false,
            selectionAnchorReason,
            selectedPageOffset: passthrough.pageInfo.offset,
            selectedPageIndex: passthrough.pageInfo.currentPageIndex,
            selectedPageNumber: passthrough.pageInfo.currentPageNumber,
            selectedPageStartPosition: passthrough.pageInfo.currentPageStartPosition,
            selectedPageEndPosition: passthrough.pageInfo.currentPageEndPosition,
            selectedPageImageIds: passthrough.visibleImageIds,
            selectedPageCount: passthrough.visibleImageIds.length,
            selectedPageFirstImageId: passthrough.visibleImageIds[0] ?? null,
            selectedPageLastImageId: passthrough.visibleImageIds.at(-1) ?? null,
            selectedImageExists: passthrough.pageInfo.selectedImageExists,
            currentPageContainsSelectedImage: passthrough.pageInfo.currentPageContainsSelectedImage,
            currentPageSelectedImageId: passthrough.pageInfo.currentPageSelectedImageId,
            currentPageSelectedImageIndex: passthrough.pageInfo.currentPageSelectedImageIndex,
            currentPageSelectedImagePosition: passthrough.pageInfo.currentPageSelectedImagePosition,
            currentPageSelectionState: passthrough.pageInfo.currentPageSelectionState,
            currentPageSelection: passthrough.pageInfo.currentPageSelection,
            selectedImageState: passthrough.pageInfo.selectedImageState,
            selectedImageMatchedPosition: passthrough.pageInfo.selectedImageMatchedPosition,
            selectedImagePageStartPosition: passthrough.pageInfo.selectedImagePageStartPosition,
            selectedImagePageEndPosition: passthrough.pageInfo.selectedImagePageEndPosition,
            selectedImagePageCount: passthrough.pageInfo.selectedImagePageCount,
            selectedImagePageFirstImageId: passthrough.pageInfo.selectedImagePageFirstImageId,
            selectedImagePageLastImageId: passthrough.pageInfo.selectedImagePageLastImageId,
            selectedImagePageImageIds: passthrough.pageInfo.selectedImagePageImageIds,
            selectedImageIndexOnPage: passthrough.pageInfo.selectedImageIndexOnPage,
            selectedImagePositionOnPage: passthrough.pageInfo.selectedImagePositionOnPage,
            selectedImagesBeforeOnPage: passthrough.pageInfo.selectedImagesBeforeOnPage,
            selectedImagesAfterOnPage: passthrough.pageInfo.selectedImagesAfterOnPage,
            selectedImagesBeforeMatched: passthrough.pageInfo.selectedImagesBeforeMatched,
            selectedImagesAfterMatched: passthrough.pageInfo.selectedImagesAfterMatched,
            selectedPreviousImageIdOnPage: passthrough.pageInfo.selectedPreviousImageIdOnPage,
            selectedNextImageIdOnPage: passthrough.pageInfo.selectedNextImageIdOnPage,
          },
        };
      }

      const matchedEntries = await libraryStore.list({
        ...effectiveFilter,
        offset: undefined,
        limit: undefined,
      });
      const matchedImageIds = matchedEntries.map((entry) => entry.imageId);
      const selectedImageOffset = matchedImageIds.indexOf(selectedImageId);
      const selectedImageMatched = selectedImageOffset >= 0;
      const selectedPageOffset = selectedImageMatched ? Math.floor(selectedImageOffset / limit) * limit : 0;
      const selectedPageIndex = selectedImageMatched ? Math.floor(selectedImageOffset / limit) : 0;
      const report = await this.listVisibleLibraryReport(snapshotId, {
        ...filter,
        offset: selectedPageOffset,
      });
      if (!report) return null;
      const requestedOffset = typeof effectiveFilter.offset === "number" ? effectiveFilter.offset : 0;
      const selectionAnchorApplied = requestedOffset !== selectedPageOffset;
      const selectionAnchorReason = !selectedImageMatched
        ? "selected-not-matched"
        : selectionAnchorApplied
          ? "adjusted-to-selected-page"
          : "already-on-selected-page";
      return {
        ...report,
        operation: {
          ...report.operation,
          kind: "list-visible-library-at-selection",
          requestedOffset,
          selectionAnchorApplied,
          selectionAnchorReason,
          selectedPageOffset,
          selectedPageIndex,
          selectedPageNumber: selectedPageIndex + 1,
          selectedPageStartPosition: report.operation.currentPageStartPosition,
          selectedPageEndPosition: report.operation.currentPageEndPosition,
          selectedPageImageIds: report.visibleImageIds,
          selectedPageCount: report.visibleImageIds.length,
          selectedPageFirstImageId: report.visibleImageIds[0] ?? null,
          selectedPageLastImageId: report.visibleImageIds.at(-1) ?? null,
          selectedImageIndexOnPage: report.operation.selectedImageIndexOnPage,
          selectedImagesBeforeOnPage: report.operation.selectedImagesBeforeOnPage,
          selectedImagesAfterOnPage: report.operation.selectedImagesAfterOnPage,
          selectedImagesBeforeMatched: report.operation.selectedImagesBeforeMatched,
          selectedImagesAfterMatched: report.operation.selectedImagesAfterMatched,
          selectedPreviousImageIdOnPage: report.operation.selectedPreviousImageIdOnPage,
          selectedNextImageIdOnPage: report.operation.selectedNextImageIdOnPage,
          selectedImageExists: report.operation.selectedImageExists,
          selectedImageMatched,
          selectedImageVisible: report.operation.selectedImageVisible,
          currentPageContainsSelectedImage: report.operation.currentPageContainsSelectedImage,
          currentPageSelectedImageId: report.operation.currentPageSelectedImageId,
          currentPageSelectedImageIndex: report.operation.currentPageSelectedImageIndex,
          currentPageSelectedImagePosition: report.operation.currentPageSelectedImagePosition,
          currentPageSelectionState: report.operation.currentPageSelectionState,
          currentPageSelection: report.operation.currentPageSelection,
          selectedImageState: report.operation.selectedImageState,
          selectedImagePageStartPosition: report.operation.selectedImagePageStartPosition,
          selectedImagePageEndPosition: report.operation.selectedImagePageEndPosition,
          selectedImagePageCount: report.operation.selectedImagePageCount,
          selectedImagePageFirstImageId: report.operation.selectedImagePageFirstImageId,
          selectedImagePageLastImageId: report.operation.selectedImagePageLastImageId,
          selectedImagePageImageIds: report.operation.selectedImagePageImageIds,
        },
        pageInfo: {
          ...report.pageInfo,
          requestedOffset,
          selectionAnchorApplied,
          selectionAnchorReason,
          selectedPageOffset,
          selectedPageIndex,
          selectedPageNumber: selectedPageIndex + 1,
          selectedPageStartPosition: report.operation.currentPageStartPosition,
          selectedPageEndPosition: report.operation.currentPageEndPosition,
          selectedPageImageIds: report.visibleImageIds,
          selectedPageCount: report.visibleImageIds.length,
          selectedPageFirstImageId: report.visibleImageIds[0] ?? null,
          selectedPageLastImageId: report.visibleImageIds.at(-1) ?? null,
          selectedImageExists: report.pageInfo.selectedImageExists,
          currentPageContainsSelectedImage: report.pageInfo.currentPageContainsSelectedImage,
          currentPageSelectedImageId: report.pageInfo.currentPageSelectedImageId,
          currentPageSelectedImageIndex: report.pageInfo.currentPageSelectedImageIndex,
          currentPageSelectedImagePosition: report.pageInfo.currentPageSelectedImagePosition,
          currentPageSelectionState: report.pageInfo.currentPageSelectionState,
          currentPageSelection: report.pageInfo.currentPageSelection,
          selectedImageState: report.pageInfo.selectedImageState,
          selectedImagePageStartPosition: report.pageInfo.selectedImagePageStartPosition,
          selectedImagePageEndPosition: report.pageInfo.selectedImagePageEndPosition,
          selectedImagePageCount: report.pageInfo.selectedImagePageCount,
          selectedImagePageFirstImageId: report.pageInfo.selectedImagePageFirstImageId,
          selectedImagePageLastImageId: report.pageInfo.selectedImagePageLastImageId,
          selectedImagePageImageIds: report.pageInfo.selectedImagePageImageIds,
          selectedImageIndexOnPage: report.pageInfo.selectedImageIndexOnPage,
          selectedImagesBeforeOnPage: report.pageInfo.selectedImagesBeforeOnPage,
          selectedImagesAfterOnPage: report.pageInfo.selectedImagesAfterOnPage,
          selectedImagesBeforeMatched: report.pageInfo.selectedImagesBeforeMatched,
          selectedImagesAfterMatched: report.pageInfo.selectedImagesAfterMatched,
          selectedPreviousImageIdOnPage: report.pageInfo.selectedPreviousImageIdOnPage,
          selectedNextImageIdOnPage: report.pageInfo.selectedNextImageIdOnPage,
        },
      };
    },

    async listVisibleLibraryReport(snapshotId, filter = {}) {
      const snapshot = await workspaceSessionStore.getSnapshot(snapshotId);
      if (!snapshot) return null;

      const effectiveFilter = {
        ...buildWorkspaceFilter(snapshot.activeFilter),
        ...filter,
      };
      const [entries, totalMatchedEntries] = await Promise.all([
        libraryStore.list(effectiveFilter),
        libraryStore.list({
          ...effectiveFilter,
          limit: undefined,
          offset: undefined,
        }),
      ]);
      const totalMatchedCount = totalMatchedEntries.length;
      const pageInfo = buildListPageInfo(effectiveFilter, entries, totalMatchedCount);
      const visibleImageIds = entries.map((entry) => entry.imageId);
      const matchedImageIds = totalMatchedEntries.map((entry) => entry.imageId);
      const selectedImageId = snapshot.selectedImageId ?? null;
      const selectedImage = selectedImageId ? await libraryStore.get(selectedImageId) : null;
      const selectedImageExists = Boolean(selectedImage);
      const selectedImageHasGps = typeof selectedImage?.gpsLatitude === "number" && Number.isFinite(selectedImage.gpsLatitude)
        && typeof selectedImage?.gpsLongitude === "number" && Number.isFinite(selectedImage.gpsLongitude);
      const selectedImageHasGpsAltitude = typeof selectedImage?.gpsAltitudeM === "number" && Number.isFinite(selectedImage.gpsAltitudeM);
      const selectedImageHasMeteringMode = Number.isInteger(selectedImage?.meteringMode);
      const selectedImageHasWhiteBalanceMode = Number.isInteger(selectedImage?.whiteBalanceMode);
      const selectedImageHasExposureProgram = Number.isInteger(selectedImage?.exposureProgram);
      const selectedImageVisible = selectedImageId ? visibleImageIds.includes(selectedImageId) : false;
      const currentPageContainsSelectedImage = selectedImageVisible;
      const currentPageSelectedImageId = currentPageContainsSelectedImage ? selectedImageId : null;
      const currentPageSelectedImageIndex = currentPageContainsSelectedImage
        ? visibleImageIds.indexOf(selectedImageId)
        : null;
      const currentPageSelectedImagePosition = currentPageSelectedImageIndex !== null
        ? currentPageSelectedImageIndex + 1
        : null;
      const selectedImageMatched = selectedImageId ? matchedImageIds.includes(selectedImageId) : false;
      const currentPageSelectionState = !selectedImageId
        ? "no-selection"
        : !selectedImageExists
          ? "selection-missing"
          : currentPageContainsSelectedImage
            ? "selected-on-page"
            : selectedImageMatched
              ? "selected-off-page"
              : "selected-filtered-out";
      const selectedImageState = !selectedImageId
        ? "none"
        : !selectedImageExists
          ? "missing"
          : selectedImageVisible
            ? "visible"
            : selectedImageMatched
              ? "matched-not-visible"
              : "filtered-out";
      const selectedImageOffset = selectedImageMatched && selectedImageId ? matchedImageIds.indexOf(selectedImageId) : null;
      const selectedImagePageIndex = selectedImageOffset !== null && pageInfo.limit !== null && pageInfo.limit > 0
        ? Math.floor(selectedImageOffset / pageInfo.limit)
        : selectedImageMatched ? 0 : null;
      const selectedImagePageNumber = selectedImagePageIndex !== null ? selectedImagePageIndex + 1 : null;
      const selectedImagePageStartPosition = selectedImageMatched && pageInfo.limit !== null && pageInfo.limit > 0
        ? (selectedImagePageIndex * pageInfo.limit) + 1
        : selectedImageMatched
          ? 1
          : null;
      const selectedImagePageEndPosition = selectedImageMatched && pageInfo.limit !== null && pageInfo.limit > 0
        ? Math.min(totalMatchedCount, ((selectedImagePageIndex + 1) * pageInfo.limit))
        : selectedImageMatched
          ? totalMatchedCount
          : null;
      const selectedImagePageCount = selectedImagePageStartPosition !== null && selectedImagePageEndPosition !== null
        ? Math.max(0, selectedImagePageEndPosition - selectedImagePageStartPosition + 1)
        : null;
      const selectedImagePageFirstImageId = selectedImageMatched && selectedImagePageStartPosition !== null
        ? matchedImageIds[selectedImagePageStartPosition - 1] ?? null
        : null;
      const selectedImagePageLastImageId = selectedImageMatched && selectedImagePageEndPosition !== null
        ? matchedImageIds[selectedImagePageEndPosition - 1] ?? null
        : null;
      const selectedImagePageImageIds = selectedImageMatched && selectedImagePageStartPosition !== null && selectedImagePageEndPosition !== null
        ? matchedImageIds.slice(selectedImagePageStartPosition - 1, selectedImagePageEndPosition)
        : null;
      const selectedImageIndexOnPage = selectedImageVisible && selectedImageId ? visibleImageIds.indexOf(selectedImageId) : null;
      const selectedImagePositionOnPage = selectedImageIndexOnPage !== null ? selectedImageIndexOnPage + 1 : null;
      const selectedImagesBeforeOnPage = selectedImageIndexOnPage !== null ? selectedImageIndexOnPage : null;
      const selectedImagesAfterOnPage = selectedImageIndexOnPage !== null ? Math.max(0, visibleImageIds.length - selectedImageIndexOnPage - 1) : null;
      const selectedPreviousImageIdOnPage = selectedImageIndexOnPage !== null && selectedImageIndexOnPage > 0
        ? visibleImageIds[selectedImageIndexOnPage - 1]
        : null;
      const selectedNextImageIdOnPage = selectedImageIndexOnPage !== null && selectedImageIndexOnPage < (visibleImageIds.length - 1)
        ? visibleImageIds[selectedImageIndexOnPage + 1]
        : null;
      const selectedImageMatchedPosition = selectedImageOffset !== null ? selectedImageOffset + 1 : null;
      const selectedImagesBeforeMatched = selectedImageOffset !== null ? selectedImageOffset : null;
      const selectedImagesAfterMatched = selectedImageOffset !== null ? Math.max(0, matchedImageIds.length - selectedImageOffset - 1) : null;
      const selectedPreviousImageId = selectedImageOffset !== null && selectedImageOffset > 0
        ? matchedImageIds[selectedImageOffset - 1]
        : null;
      const selectedNextImageId = selectedImageOffset !== null && selectedImageOffset < (matchedImageIds.length - 1)
        ? matchedImageIds[selectedImageOffset + 1]
        : null;
      const currentPageSelection = {
        hasSelection: Boolean(selectedImageId),
        hasMatchedSelection: selectedImageMatched,
        snapshotSelectedImageId: selectedImageId,
        matchedPosition: selectedImageMatchedPosition,
        matchedPageOffset: selectedImageMatched
          ? (pageInfo.limit !== null && pageInfo.limit > 0 ? Math.floor(selectedImageOffset / pageInfo.limit) * pageInfo.limit : 0)
          : null,
        matchedPageLimit: selectedImageMatched ? pageInfo.limit : null,
        matchedPageSize: selectedImageMatched ? selectedImagePageCount : null,
        matchedHasResults: selectedImageMatched ? selectedImagePageCount > 0 : false,
        matchedIsPaged: selectedImageMatched ? pageInfo.limit !== null : false,
        matchedPageIndex: selectedImageMatched ? (pageInfo.limit !== null && pageInfo.limit > 0 ? Math.floor(selectedImageOffset / pageInfo.limit) : 0) : null,
        matchedPageNumber: selectedImagePageNumber,
        matchedTotalPages: selectedImageMatched ? (pageInfo.limit !== null && pageInfo.limit > 0 ? Math.max(1, Math.ceil(matchedImageIds.length / pageInfo.limit)) : 1) : null,
        matchedHasPreviousPage: selectedImageMatched ? selectedImagePageNumber > 1 : false,
        matchedPreviousPageNumber: selectedImageMatched && selectedImagePageNumber > 1 ? selectedImagePageNumber - 1 : null,
        matchedPreviousOffset: selectedImageMatched && selectedImagePageNumber > 1
          ? ((pageInfo.limit !== null && pageInfo.limit > 0)
            ? Math.max(0, (Math.floor(selectedImageOffset / pageInfo.limit) - 1) * pageInfo.limit)
            : 0)
          : null,
        matchedHasNextPage: selectedImageMatched
          ? selectedImagePageNumber < (pageInfo.limit !== null && pageInfo.limit > 0 ? Math.max(1, Math.ceil(matchedImageIds.length / pageInfo.limit)) : 1)
          : false,
        matchedNextPageNumber: selectedImageMatched
          ? (selectedImagePageNumber < (pageInfo.limit !== null && pageInfo.limit > 0 ? Math.max(1, Math.ceil(matchedImageIds.length / pageInfo.limit)) : 1)
            ? selectedImagePageNumber + 1
            : null)
          : null,
        matchedNextOffset: selectedImageMatched
          ? ((pageInfo.limit !== null && pageInfo.limit > 0 && selectedImagePageNumber < Math.max(1, Math.ceil(matchedImageIds.length / pageInfo.limit)))
            ? (Math.floor(selectedImageOffset / pageInfo.limit) + 1) * pageInfo.limit
            : null)
          : null,
        matchedPageStartPosition: selectedImagePageStartPosition,
        matchedPageEndPosition: selectedImagePageEndPosition,
        matchedPageCount: selectedImagePageCount,
        matchedPageHasSingleImage: selectedImagePageCount === 1,
        matchedPageFirstImageId: selectedImagePageFirstImageId,
        matchedPageLastImageId: selectedImagePageLastImageId,
        matchedPageImageIds: selectedImagePageImageIds,
        currentPageOffset: pageInfo.offset,
        currentPageLimit: pageInfo.limit,
        currentPagePageSize: pageInfo.pageSize,
        currentPageIsPaged: pageInfo.limit !== null,
        currentPageIndex: pageInfo.currentPageIndex,
        currentPageNumber: pageInfo.currentPageNumber,
        currentPageTotalPages: pageInfo.totalPages,
        currentPageStartPosition: pageInfo.currentPageStartPosition,
        currentPageEndPosition: pageInfo.currentPageEndPosition,
        currentPageTotalMatchedCount: pageInfo.totalMatchedCount,
        currentPageResultCount: pageInfo.resultCount,
        currentPageHasResults: pageInfo.resultCount > 0,
        currentPageHasPreviousPage: pageInfo.hasPreviousPage,
        currentPagePreviousPageNumber: pageInfo.hasPreviousPage ? Math.max(1, pageInfo.currentPageNumber - 1) : null,
        currentPagePreviousOffset: pageInfo.previousOffset,
        currentPageHasNextPage: pageInfo.hasNextPage,
        currentPageNextPageNumber: pageInfo.hasNextPage ? pageInfo.currentPageNumber + 1 : null,
        currentPageNextOffset: pageInfo.nextOffset,
        currentPageHasSingleImage: pageInfo.resultCount === 1,
        currentPageImageIds: pageInfo.currentPageImageIds,
        currentPageFirstImageId: pageInfo.currentPageFirstImageId,
        currentPageLastImageId: pageInfo.currentPageLastImageId,
        currentPagePreviousImageId: pageInfo.currentPageFirstImageId ?? null,
        currentPageNextImageId: pageInfo.currentPageLastImageId ?? null,
        selectedImageId: currentPageSelectedImageId,
        selectedImageIndex: currentPageSelectedImageIndex,
        selectedImagePosition: currentPageSelectedImagePosition,
        containsSelectedImage: currentPageContainsSelectedImage,
        state: currentPageSelectionState,
      };
      return {
        operation: {
          kind: "list-visible-library",
          snapshotId,
          activeFilter: snapshot.activeFilter,
          selectedImageId,
          selectedImageExists,
          selectedImageHasGps,
          selectedImageHasGpsAltitude,
          selectedImageHasMeteringMode,
          selectedImageHasWhiteBalanceMode,
          selectedImageHasExposureProgram,
          selectedImageVisible,
          currentPageContainsSelectedImage,
          currentPageSelectedImageId,
          currentPageSelectedImageIndex,
          currentPageSelectedImagePosition,
          currentPageSelectionState,
          currentPageSelection,
          selectedImageMatched,
          selectedImageState,
          selectedImageOffset,
          selectedImageMatchedPosition,
          selectedImagePageIndex,
          selectedImagePageNumber,
          selectedImagePageStartPosition,
          selectedImagePageEndPosition,
          selectedImagePageCount,
          selectedImagePageFirstImageId,
          selectedImagePageLastImageId,
          selectedImagePageImageIds,
          selectedImageIndexOnPage,
          selectedImagePositionOnPage,
          selectedImagesBeforeOnPage,
          selectedImagesAfterOnPage,
          selectedImagesBeforeMatched,
          selectedImagesAfterMatched,
          selectedPreviousImageIdOnPage,
          selectedNextImageIdOnPage,
          selectedPreviousImageId,
          selectedNextImageId,
          effectiveFilter,
          ...pageInfo,
          matchedImageIds,
        },
        entries,
        visibleImageIds,
        matchedImageIds,
        metadataSummary: summarizeObservedSourceMetadata(entries),
        facetSummary: summarizeLibraryFacets(entries),
        matchedMetadataSummary: summarizeObservedSourceMetadata(totalMatchedEntries),
        matchedFacetSummary: summarizeLibraryFacets(totalMatchedEntries),
        totalMatchedCount,
        pageInfo: {
          ...pageInfo,
          matchedImageIds,
          selectedImageId,
          selectedImageExists,
          selectedImageHasGps,
          selectedImageHasGpsAltitude,
          selectedImageHasMeteringMode,
          selectedImageHasWhiteBalanceMode,
          selectedImageHasExposureProgram,
          selectedImageVisible,
          currentPageContainsSelectedImage,
          currentPageSelectedImageId,
          currentPageSelectedImageIndex,
          currentPageSelectedImagePosition,
          currentPageSelectionState,
          currentPageSelection,
          selectedImageMatched,
          selectedImageState,
          selectedImageOffset,
          selectedImageMatchedPosition,
          selectedImagePageIndex,
          selectedImagePageNumber,
          selectedImagePageStartPosition,
          selectedImagePageEndPosition,
          selectedImagePageCount,
          selectedImagePageFirstImageId,
          selectedImagePageLastImageId,
          selectedImagePageImageIds,
          selectedImageIndexOnPage,
          selectedImagePositionOnPage,
          selectedImagesBeforeOnPage,
          selectedImagesAfterOnPage,
          selectedImagesBeforeMatched,
          selectedImagesAfterMatched,
          selectedPreviousImageIdOnPage,
          selectedNextImageIdOnPage,
          selectedPreviousImageId,
          selectedNextImageId,
        },
      };
    },

    async summarizeWorkspace(snapshotId, { refreshSourceMetadata = false } = {}) {
      const result = await this.summarizeWorkspaceReport(snapshotId, { refreshSourceMetadata });
      return result?.summary ?? null;
    },



    async refreshWorkspaceSourceMetadata(snapshotId, { imageIds = null } = {}) {
      const result = await this.refreshWorkspaceSourceMetadataReport(snapshotId, { imageIds });
      return result ? {
        metadataSummary: result.metadataSummary,
        summary: result.summary,
      } : null;
    },

    async refreshWorkspaceSourceMetadataReport(snapshotId, { imageIds = null } = {}) {
      if (typeof libraryStore.list !== "function" || typeof libraryStore.refreshSourceMetadata !== "function") {
        throw new TypeError("libraryStore with list() and refreshSourceMetadata() is required for refreshWorkspaceSourceMetadataReport()");
      }
      const snapshot = await workspaceSessionStore.getSnapshot(snapshotId);
      if (!snapshot) return null;

      const filter = buildWorkspaceFilter(snapshot.activeFilter);
      const visibleImages = await libraryStore.list(filter);
      const visibleImageIds = visibleImages.map((image) => image.imageId);
      const requestedImageIds = Array.isArray(imageIds)
        ? [...new Set(imageIds.filter((imageId) => typeof imageId === "string" && imageId))]
        : [...new Set(snapshot.selectedImageId ? [snapshot.selectedImageId, ...visibleImageIds] : visibleImageIds)];
      const refreshedEntries = [];
      const skippedImageIds = [];
      for (const imageId of requestedImageIds) {
        const existing = await libraryStore.get(imageId);
        if (!existing) {
          skippedImageIds.push(imageId);
          continue;
        }
        refreshedEntries.push(await libraryStore.refreshSourceMetadata(imageId));
      }

      const summaryResult = await this.summarizeWorkspaceReport(snapshotId);
      return {
        operation: {
          kind: "refresh-workspace-source-metadata",
          snapshotId,
          requestedImageIds,
          refreshedImageIds: refreshedEntries.map((entry) => entry.imageId),
          skippedImageIds,
          selectedImageId: snapshot.selectedImageId ?? null,
          visibleImageIds,
        },
        refreshedEntries,
        metadataSummary: {
          total: refreshedEntries.length,
          withKnownByteSize: refreshedEntries.filter((entry) => Number.isInteger(entry?.byteSize)).length,
          withKnownModifiedAt: refreshedEntries.filter((entry) => typeof entry?.modifiedAt === "string").length,
          withKnownDimensions: refreshedEntries.filter((entry) => Number.isInteger(entry?.pixelWidth) && Number.isInteger(entry?.pixelHeight)).length,
          withObservedOrientation: refreshedEntries.filter((entry) => Number.isInteger(entry?.orientation)).length,
          withObservedCaptureAt: refreshedEntries.filter((entry) => typeof entry?.observedCaptureAt === "string").length,
          withObservedCamera: refreshedEntries.filter((entry) => typeof entry?.cameraMake === "string" || typeof entry?.cameraModel === "string").length,
          withObservedLens: refreshedEntries.filter((entry) => typeof entry?.lensModel === "string").length,
          withObservedFocalLength: refreshedEntries.filter((entry) => typeof entry?.focalLengthMm === "number" && Number.isFinite(entry.focalLengthMm) && entry.focalLengthMm > 0).length,
          withObservedFNumber: refreshedEntries.filter((entry) => typeof entry?.fNumber === "number" && Number.isFinite(entry.fNumber) && entry.fNumber > 0).length,
          withObservedIsoSpeed: refreshedEntries.filter((entry) => Number.isInteger(entry?.isoSpeed) && entry.isoSpeed > 0).length,
          withObservedExposureTime: refreshedEntries.filter((entry) => typeof entry?.exposureTimeSeconds === "number" && Number.isFinite(entry.exposureTimeSeconds) && entry.exposureTimeSeconds > 0).length,
          withObservedFlash: refreshedEntries.filter((entry) => typeof entry?.flashFired === "boolean").length,
          withObservedExposureBias: refreshedEntries.filter((entry) => typeof entry?.exposureBiasEv === "number" && Number.isFinite(entry.exposureBiasEv)).length,
          latestObservedCaptureAt: refreshedEntries
            .filter((entry) => typeof entry?.observedCaptureAt === "string")
            .map((entry) => entry.observedCaptureAt)
            .sort((a, b) => String(b).localeCompare(String(a)))[0] ?? null,
          observedFormats: refreshedEntries.reduce((summary, entry) => {
            const observedFormat = typeof entry?.observedFormat === "string" ? entry.observedFormat : null;
            if (!observedFormat) return summary;
            summary[observedFormat] = (summary[observedFormat] ?? 0) + 1;
            return summary;
          }, {}),
          observedCameras: refreshedEntries.reduce((summary, entry) => {
            const cameraMake = typeof entry?.cameraMake === "string" ? entry.cameraMake : null;
            const cameraModel = typeof entry?.cameraModel === "string" ? entry.cameraModel : null;
            const label = [cameraMake, cameraModel].filter(Boolean).join(" ") || cameraModel || cameraMake;
            if (!label) return summary;
            summary[label] = (summary[label] ?? 0) + 1;
            return summary;
          }, {}),
          observedLenses: refreshedEntries.reduce((summary, entry) => {
            const lensModel = typeof entry?.lensModel === "string" ? entry.lensModel : null;
            if (!lensModel) return summary;
            summary[lensModel] = (summary[lensModel] ?? 0) + 1;
            return summary;
          }, {}),
          focalLengthMmRange: (() => {
            const focalLengths = refreshedEntries
              .map((entry) => entry?.focalLengthMm)
              .filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
              .sort((a, b) => a - b);
            return focalLengths.length ? { min: focalLengths[0], max: focalLengths[focalLengths.length - 1] } : null;
          })(),
          fNumberRange: (() => {
            const fNumbers = refreshedEntries
              .map((entry) => entry?.fNumber)
              .filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
              .sort((a, b) => a - b);
            return fNumbers.length ? { min: fNumbers[0], max: fNumbers[fNumbers.length - 1] } : null;
          })(),
          isoSpeedRange: (() => {
            const isoSpeeds = refreshedEntries
              .map((entry) => entry?.isoSpeed)
              .filter((value) => Number.isInteger(value) && value > 0)
              .sort((a, b) => a - b);
            return isoSpeeds.length ? { min: isoSpeeds[0], max: isoSpeeds[isoSpeeds.length - 1] } : null;
          })(),
          exposureTimeSecondsRange: (() => {
            const exposureTimes = refreshedEntries
              .map((entry) => entry?.exposureTimeSeconds)
              .filter((value) => typeof value === "number" && Number.isFinite(value) && value > 0)
              .sort((a, b) => a - b);
            return exposureTimes.length ? { min: exposureTimes[0], max: exposureTimes[exposureTimes.length - 1] } : null;
          })(),
          flashUsage: {
            fired: refreshedEntries.filter((entry) => entry?.flashFired === true).length,
            notFired: refreshedEntries.filter((entry) => entry?.flashFired === false).length,
          },
          exposureBiasEvRange: (() => {
            const exposureBiases = refreshedEntries
              .map((entry) => entry?.exposureBiasEv)
              .filter((value) => typeof value === "number" && Number.isFinite(value))
              .sort((a, b) => a - b);
            return exposureBiases.length ? { min: exposureBiases[0], max: exposureBiases[exposureBiases.length - 1] } : null;
          })(),
          latestObservedExposureEntry: [...refreshedEntries]
            .filter((entry) => (typeof entry?.fNumber === "number" && Number.isFinite(entry.fNumber) && entry.fNumber > 0)
              || (Number.isInteger(entry?.isoSpeed) && entry.isoSpeed > 0)
              || (typeof entry?.exposureTimeSeconds === "number" && Number.isFinite(entry.exposureTimeSeconds) && entry.exposureTimeSeconds > 0)
              || typeof entry?.flashFired === "boolean"
              || (typeof entry?.exposureBiasEv === "number" && Number.isFinite(entry.exposureBiasEv)))
            .sort((a, b) => String(b.modifiedAt ?? "").localeCompare(String(a.modifiedAt ?? "")))[0] ?? null,
        },
        summary: summaryResult?.summary ?? null,
      };
    },

    async summarizeWorkspaceReport(snapshotId, { refreshSourceMetadata = false, refreshImageIds = null } = {}) {
      const snapshot = await workspaceSessionStore.getSnapshot(snapshotId);
      if (!snapshot) return null;

      const filter = buildWorkspaceFilter(snapshot.activeFilter);
      let visibleImages = await libraryStore.list(filter);
      const requestedRefreshImageIds = [];
      const refreshedImageIds = [];
      const skippedRefreshImageIds = [];
      if (refreshSourceMetadata === true) {
        if (typeof libraryStore.refreshSourceMetadata !== "function") {
          throw new TypeError("libraryStore with refreshSourceMetadata() is required when refreshSourceMetadata is true");
        }
        const defaultIdsToRefresh = new Set(visibleImages.map((image) => image.imageId));
        if (snapshot.selectedImageId) defaultIdsToRefresh.add(snapshot.selectedImageId);
        const idsToRefresh = Array.isArray(refreshImageIds)
          ? [...new Set(refreshImageIds.filter((imageId) => typeof imageId === "string" && imageId))]
          : [...defaultIdsToRefresh];
        for (const imageId of idsToRefresh) {
          requestedRefreshImageIds.push(imageId);
          const existing = await libraryStore.get(imageId);
          if (!existing) {
            skippedRefreshImageIds.push(imageId);
            continue;
          }
          await libraryStore.refreshSourceMetadata(imageId);
          refreshedImageIds.push(imageId);
        }
        visibleImages = await libraryStore.list(filter);
      }
      const selectedImage = snapshot.selectedImageId ? await libraryStore.get(snapshot.selectedImageId) : null;
      const activePreset = snapshot.activePresetId && presetStore ? await presetStore.getPreset(snapshot.activePresetId) : null;
      const activeBatchSession = snapshot.activeBatchSessionId && batchSessionStore
        ? await batchSessionStore.getSession(snapshot.activeBatchSessionId)
        : null;

      return {
        operation: {
          kind: refreshSourceMetadata ? "refresh-source-metadata-and-summarize-workspace" : "summarize-workspace",
          refreshSourceMetadata,
          snapshotId,
          requestedRefreshImageIds,
          refreshedImageIds,
          skippedRefreshImageIds,
        },
        summary: foundation.summarizeDashboardWorkspace({
          snapshot,
          visibleImages,
          keeperImages: await libraryStore.list({ keepersOnly: true }),
          rejectedImages: await libraryStore.list({ rejected: true }),
          selectedImage,
          activePreset,
          activeBatchSession,
        }),
      };
    },
  };
}
