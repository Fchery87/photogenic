import { renderDeterministicSoftwarePng } from "./software-png-renderer.js";

export const NATIVE_RENDER_COMMAND = "render_pipeline";

export class NativePipelineUnavailableError extends Error {
  constructor(message = "native pipeline invoke function is unavailable") {
    super(message);
    this.name = "NativePipelineUnavailableError";
    this.code = "native-unavailable";
  }
}

function resolveTauriInvoke(globalObject = globalThis) {
  return globalObject?.__TAURI__?.core?.invoke ?? null;
}

function normalizeDimension(value, label) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive integer`);
  }
  return value;
}

function sourceIdentity(source) {
  return {
    imageId: source?.imageId ?? null,
    path: source?.path ?? null,
    revision: source?.revision ?? null,
  };
}

function buildRequest({ mode, source, recipe, width, height, format }) {
  if (mode !== "preview" && mode !== "export") {
    throw new RangeError(`unsupported native render mode: ${String(mode)}`);
  }
  if (!source || typeof source !== "object") throw new TypeError("source is required");
  return {
    mode,
    source: {
      imageId: source.imageId,
      path: source.path ?? null,
      revision: source.revision ?? null,
      width: source.width,
      height: source.height,
    },
    recipe,
    output: {
      width: normalizeDimension(width, "width"),
      height: normalizeDimension(height, "height"),
      format: format ?? "png",
    },
  };
}

function normalizeNativeResult(result, request) {
  if (!result || typeof result !== "object") {
    throw new TypeError("native render result must be an object");
  }
  if (result.mode !== request.mode) {
    throw new TypeError("native render result mode does not match request");
  }
  if (typeof result.bytesBase64 !== "string" || !result.bytesBase64) {
    throw new TypeError("native render result must include bytesBase64");
  }
  const bytes = Buffer.from(result.bytesBase64, "base64");
  const descriptor = {
    kind: result.kind ?? (request.output.format === "png" ? "image/png" : `image/${request.output.format}`),
    status: result.status ?? "rendered-image",
    sizeBytes: Number.isInteger(result.sizeBytes) ? result.sizeBytes : bytes.length,
    contentHash: result.contentHash,
    pixelHash: result.pixelHash ?? result.contentHash,
    width: result.width,
    height: result.height,
    note: result.note ?? "Native Pipeline-rendered image bytes are present on disk.",
    pipelineCommand: NATIVE_RENDER_COMMAND,
    pipelineMode: request.mode,
    sourceIdentity: result.sourceIdentity ?? sourceIdentity(request.source),
    recipeFingerprint: result.recipeFingerprint ?? null,
  };
  return { bytes, descriptor };
}

function renderSoftwareTestFallback(request) {
  if (request.output.format !== "png") {
    throw new NativePipelineUnavailableError("software test fallback only supports png render requests");
  }
  const rendered = renderDeterministicSoftwarePng({
    source: request.source,
    recipe: request.recipe,
    width: request.output.width,
    height: request.output.height,
  });
  return {
    bytes: rendered.bytes,
    descriptor: {
      ...rendered.descriptor,
      pipelineCommand: NATIVE_RENDER_COMMAND,
      pipelineMode: request.mode,
      pipelineFallback: "deterministic-software-test-mode",
      pixelHash: rendered.descriptor.contentHash,
      sourceIdentity: sourceIdentity(request.source),
      recipeFingerprint: null,
    },
  };
}

export function createNativePipelineAdapter({
  invoke = resolveTauriInvoke(),
  testMode = false,
} = {}) {
  return {
    async render(input) {
      const request = buildRequest(input);
      if (typeof invoke === "function") {
        return normalizeNativeResult(await invoke(NATIVE_RENDER_COMMAND, request), request);
      }
      if (testMode) {
        return renderSoftwareTestFallback(request);
      }
      throw new NativePipelineUnavailableError();
    },
  };
}
