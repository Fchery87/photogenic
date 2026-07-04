import { buildRenderArtifact } from "../pipeline/render-artifact.js";
import { createProxyDescriptor } from "./proxy.js";

export function createPreviewFoundation({ clock = () => new Date().toISOString() } = {}) {
  let nextId = 1;
  return {
    createRequest({ source, recipe, viewport }) {
      const proxy = createProxyDescriptor({ source, recipe, viewport });
      return {
        requestId: `preview-${nextId++}`,
        status: "queued",
        source,
        recipe,
        viewport,
        proxy,
        createdAt: clock(),
      };
    },

    fulfillRequest(request) {
      if (!request || request.status !== "queued") {
        throw new TypeError("request must be a queued preview request");
      }
      const previewArtifact = buildRenderArtifact({
        mode: "preview",
        source: request.source,
        recipe: request.recipe,
        proxyKey: request.proxy.proxyKey,
        generatedAt: clock(),
      });
      return {
        ...request,
        status: "ready",
        readyAt: clock(),
        previewArtifact,
      };
    },
  };
}
