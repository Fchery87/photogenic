import { buildRenderArtifact } from "../pipeline/render-artifact.js";
import { createProxyDescriptor } from "./proxy.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createPreviewFoundation({ clock = () => new Date().toISOString() } = {}) {
  let nextId = 1;
  const latestByImageId = new Map();

  function assertQueued(request) {
    if (!request || request.status !== "queued") {
      throw new TypeError("request must be a queued preview request");
    }
  }

  function restoreRequest(request) {
    if (!request || typeof request !== "object") {
      throw new TypeError("request is required");
    }
    const proxy = createProxyDescriptor({ source: request.source, recipe: request.recipe, viewport: request.viewport });
    if (request.proxy?.proxyKey && request.proxy.proxyKey !== proxy.proxyKey) {
      throw new RangeError("request.proxy does not match source/recipe/viewport inputs");
    }
    const restored = {
      ...clone(request),
      proxy,
    };
    const requestNumber = Number.parseInt(String(restored.requestId).replace(/^preview-/, ""), 10);
    if (Number.isInteger(requestNumber)) {
      nextId = Math.max(nextId, requestNumber + 1);
    }
    if (restored.source?.imageId) {
      latestByImageId.set(restored.source.imageId, restored.requestId);
    }
    return restored;
  }

  function summarizeRequest(request, { cacheStatus = null, cacheRecord = null } = {}) {
    const restored = restoreRequest(request);
    return {
      requestId: restored.requestId,
      imageId: restored.source.imageId,
      status: restored.status,
      cacheStatus,
      proxyKey: restored.proxy.proxyKey,
      cacheFilePath: cacheRecord?.filePath ?? restored.previewArtifact?.cacheFilePath ?? null,
      supersedesRequestId: restored.supersedesRequestId ?? null,
      supersededByRequestId: restored.supersededByRequestId ?? null,
      operationCount: Array.isArray(restored.recipe?.operations) ? restored.recipe.operations.length : 0,
      viewport: clone(restored.viewport),
      updatedAt: restored.readyAt ?? restored.cancelledAt ?? restored.supersededAt ?? restored.createdAt,
    };
  }

  return {
    createRequest({ source, recipe, viewport }) {
      const proxy = createProxyDescriptor({ source, recipe, viewport });
      const previousRequestId = latestByImageId.get(source.imageId) ?? null;
      const request = {
        requestId: `preview-${nextId++}`,
        status: "queued",
        source,
        recipe,
        viewport,
        proxy,
        createdAt: clock(),
        supersedesRequestId: previousRequestId,
      };
      latestByImageId.set(source.imageId, request.requestId);
      return request;
    },

    cancelRequest(request, note = "Cancelled before proxy/render completion.") {
      assertQueued(request);
      return {
        ...request,
        status: "cancelled",
        cancelledAt: clock(),
        note,
      };
    },

    supersedeRequest(request, newerRequest, note = "Superseded by a newer preview request for the same image.") {
      assertQueued(request);
      if (!newerRequest || newerRequest.source?.imageId !== request.source.imageId) {
        throw new TypeError("newerRequest must target the same image");
      }
      return {
        ...request,
        status: "superseded",
        supersededAt: clock(),
        supersededByRequestId: newerRequest.requestId,
        note,
      };
    },

    fulfillRequest(request, { renderedImage = null } = {}) {
      assertQueued(request);
      const timestamp = clock();
      const previewArtifact = buildRenderArtifact({
        mode: "preview",
        source: request.source,
        recipe: request.recipe,
        proxyKey: request.proxy.proxyKey,
        generatedAt: timestamp,
        renderedImage,
      });
      return {
        ...request,
        status: "ready",
        readyAt: timestamp,
        previewArtifact,
      };
    },

    restoreRequest,

    summarizeRequest,

    latestRequestIdFor(imageId) {
      return latestByImageId.get(imageId) ?? null;
    },

    snapshot() {
      return clone({ latestByImageId: Object.fromEntries(latestByImageId) });
    },
  };
}
