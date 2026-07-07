import { mkdirSync, writeFileSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import { RENDERED_PNG_NOTE, readRenderedPngDescriptor, renderDeterministicSoftwarePng } from "../pipeline/software-png-renderer.js";
import { createPreviewFoundation } from "./foundation.js";
import { createProxyCache } from "./proxy-cache.js";

function defaultCachePathFor(descriptor) {
  return path.join("preview-cache", `${descriptor.proxyKey}.png`);
}


function refreshRenderedImage(filePath, expectedRenderedImage = null) {
  try {
    const descriptor = readRenderedPngDescriptor(filePath, readFileSync(filePath));
    if (
      expectedRenderedImage &&
      ((expectedRenderedImage.contentHash?.value && descriptor.contentHash?.value !== expectedRenderedImage.contentHash.value) ||
        (Number.isInteger(expectedRenderedImage.width) && descriptor.width !== expectedRenderedImage.width) ||
        (Number.isInteger(expectedRenderedImage.height) && descriptor.height !== expectedRenderedImage.height))
    ) {
      return {
        path: filePath,
        kind: "image/png",
        status: "stale",
        sizeBytes: descriptor.sizeBytes,
        contentHash: descriptor.contentHash,
        width: descriptor.width,
        height: descriptor.height,
        note: "Preview cache PNG is present but no longer matches the expected deterministic render output for this request. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.",
      };
    }
    return descriptor;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        path: filePath,
        kind: "image/png",
        status: "missing",
        sizeBytes: null,
        contentHash: null,
        width: null,
        height: null,
        note: "Expected rendered preview PNG cache output is missing on disk. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.",
      };
    }
    if (error instanceof TypeError) {
      return {
        path: filePath,
        kind: "image/png",
        status: "invalid",
        sizeBytes: null,
        contentHash: null,
        width: null,
        height: null,
        note: "Preview cache file is present but is not a valid PNG. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.",
      };
    }
    throw error;
  }
}


export function createPreviewWorkflow({
  previewFoundation = createPreviewFoundation(),
  proxyCache = createProxyCache(),
  cachePathFor = defaultCachePathFor,
} = {}) {
  if (typeof cachePathFor !== "function") {
    throw new TypeError("cachePathFor must be a function");
  }

  return {
    previewFoundation,
    proxyCache,

    requestPreview({ source, recipe, viewport }) {
      const result = this.requestPreviewReport({ source, recipe, viewport });
      return result.preview;
    },

    requestPreviewReport({ source, recipe, viewport }) {
      const request = previewFoundation.createRequest({ source, recipe, viewport });
      const cacheRecord = proxyCache.get(request.proxy.proxyKey);
      if (!cacheRecord) {
        return {
          operation: {
            kind: "request-preview",
            requestId: request.requestId,
            proxyKey: request.proxy.proxyKey,
            cacheStatus: "miss",
          },
          preview: {
            ...request,
            cacheStatus: "miss",
            cacheRecord: null,
          },
        };
      }
      const renderedImage = refreshRenderedImage(cacheRecord.filePath, cacheRecord.renderedImage ?? null);
      if (renderedImage.status !== "rendered-image") {
        proxyCache.invalidateWhere((record) => record.proxyKey === request.proxy.proxyKey);
        return {
          operation: {
            kind: "request-preview",
            requestId: request.requestId,
            proxyKey: request.proxy.proxyKey,
            cacheStatus: "miss",
          },
          preview: {
            ...request,
            cacheStatus: "miss",
            cacheRecord: null,
          },
        };
      }
      const refreshedCacheRecord = proxyCache.put(request.proxy, cacheRecord.filePath, renderedImage);
      const ready = previewFoundation.fulfillRequest(request, {
        renderedImage,
      });
      return {
        operation: {
          kind: "request-preview",
          requestId: request.requestId,
          proxyKey: request.proxy.proxyKey,
          cacheStatus: "hit",
        },
        preview: {
          ...ready,
          cacheStatus: "hit",
          cacheRecord: refreshedCacheRecord,
          previewArtifact: {
            ...ready.previewArtifact,
            cacheFilePath: refreshedCacheRecord.filePath,
            renderedImage,
          },
        },
      };
    },

    fulfillPreview(request, { cacheFilePath = cachePathFor(request?.proxy) } = {}) {
      const result = this.fulfillPreviewReport(request, { cacheFilePath });
      return result.preview;
    },

    fulfillPreviewReport(request, { cacheFilePath = cachePathFor(request?.proxy) } = {}) {
      const rendered = renderDeterministicSoftwarePng({
        source: request?.source,
        recipe: request?.recipe,
        width: request?.viewport?.width,
        height: request?.viewport?.height,
      });
      mkdirSync(path.dirname(cacheFilePath), { recursive: true });
      writeFileSync(cacheFilePath, rendered.bytes);
      const renderedImage = {
        path: cacheFilePath,
        ...rendered.descriptor,
      };
      const ready = previewFoundation.fulfillRequest(request, { renderedImage });
      const cacheRecord = proxyCache.put(request.proxy, cacheFilePath, renderedImage);
      return {
        operation: {
          kind: "fulfill-preview",
          requestId: request?.requestId ?? null,
          proxyKey: request?.proxy?.proxyKey ?? null,
          cacheFilePath: cacheRecord.filePath,
        },
        preview: {
          ...ready,
          cacheStatus: "stored",
          cacheRecord,
          previewArtifact: {
            ...ready.previewArtifact,
            cacheFilePath: cacheRecord.filePath,
            renderedImage,
          },
        },
      };
    },

    cancelPreview(request, note) {
      return previewFoundation.cancelRequest(request, note);
    },

    supersedePreview(request, newerRequest, note) {
      return previewFoundation.supersedeRequest(request, newerRequest, note);
    },

    restorePreview(snapshot) {
      if (!snapshot || typeof snapshot !== "object") {
        throw new TypeError("preview snapshot is required");
      }
      const request = previewFoundation.restoreRequest(snapshot.request ?? snapshot);
      const cacheStatus = snapshot.cacheStatus ?? null;
      const cacheRecord = snapshot.cacheRecord ? proxyCache.restore(snapshot.cacheRecord) : null;
      if (!cacheRecord) {
        return {
          ...request,
          cacheStatus,
          cacheRecord: null,
        };
      }
      return {
        ...request,
        cacheStatus,
        cacheRecord,
        previewArtifact: request.previewArtifact
          ? {
            ...request.previewArtifact,
            cacheFilePath: cacheRecord.filePath,
            renderedImage: cacheRecord.renderedImage ?? request.previewArtifact?.renderedImage ?? null,
          }
          : request.previewArtifact,
      };
    },

    refreshPreview(snapshot) {
      if (!snapshot || typeof snapshot !== "object") {
        throw new TypeError("preview snapshot is required");
      }
      const restored = this.restorePreview(snapshot);
      if (!restored.cacheRecord?.filePath) return restored;
      const renderedImage = refreshRenderedImage(
        restored.cacheRecord.filePath,
        restored.cacheRecord.renderedImage ?? restored.previewArtifact?.renderedImage ?? null,
      );
      const cacheRecord = proxyCache.put(restored.proxy, restored.cacheRecord.filePath, renderedImage);
      return {
        ...restored,
        cacheRecord,
        previewArtifact: restored.previewArtifact
          ? {
            ...restored.previewArtifact,
            cacheFilePath: cacheRecord.filePath,
            renderedImage,
          }
          : restored.previewArtifact,
      };
    },

    rerenderPreview(snapshot, { cacheFilePath = cachePathFor((snapshot?.request ?? snapshot)?.proxy) } = {}) {
      if (!snapshot || typeof snapshot !== "object") {
        throw new TypeError("preview snapshot is required");
      }
      const restored = previewFoundation.restoreRequest(snapshot.request ?? snapshot);
      const rendered = renderDeterministicSoftwarePng({
        source: restored.source,
        recipe: restored.recipe,
        width: restored.viewport?.width,
        height: restored.viewport?.height,
      });
      mkdirSync(path.dirname(cacheFilePath), { recursive: true });
      writeFileSync(cacheFilePath, rendered.bytes);
      const renderedImage = {
        path: cacheFilePath,
        ...rendered.descriptor,
      };
      const ready = previewFoundation.fulfillRequest({ ...restored, status: "queued" }, { renderedImage });
      const cacheRecord = proxyCache.put(restored.proxy, cacheFilePath, renderedImage);
      return {
        ...ready,
        cacheStatus: "stored",
        cacheRecord,
        previewArtifact: {
          ...ready.previewArtifact,
          cacheFilePath: cacheRecord.filePath,
          renderedImage,
        },
      };
    },

    summarizePreview(snapshot) {
      if (!snapshot || typeof snapshot !== "object") {
        throw new TypeError("preview snapshot is required");
      }
      return previewFoundation.summarizeRequest(snapshot.request ?? snapshot, {
        cacheStatus: snapshot.cacheStatus ?? null,
        cacheRecord: snapshot.cacheRecord ?? null,
      });
    },

    latestRequestIdFor(imageId) {
      return previewFoundation.latestRequestIdFor(imageId);
    },
  };
}
