export const PIPELINE_CAPABILITIES_COMMAND = "pipeline_capabilities";

const MODES = new Set(["gpuReady", "cpuFallback"]);

function validatePipelineCapabilities(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("pipeline capabilities must be an object");
  }
  if (!MODES.has(value.mode)) {
    throw new TypeError("pipeline capabilities mode must be gpuReady or cpuFallback");
  }
  if (!Object.hasOwn(value, "adapterName")) {
    throw new TypeError("pipeline capabilities must include adapterName");
  }
  if (!Object.hasOwn(value, "fallbackReason")) {
    throw new TypeError("pipeline capabilities must include fallbackReason");
  }
  if (value.adapterName !== null && typeof value.adapterName !== "string") {
    throw new TypeError("pipeline capabilities adapterName must be a string or null");
  }
  if (value.fallbackReason !== null && typeof value.fallbackReason !== "string") {
    throw new TypeError("pipeline capabilities fallbackReason must be a string or null");
  }
  if (value.mode === "gpuReady" && !value.adapterName) {
    throw new TypeError("gpuReady pipeline capabilities must include adapterName");
  }
  if (value.mode === "cpuFallback" && !value.fallbackReason) {
    throw new TypeError("cpuFallback pipeline capabilities must include fallbackReason");
  }

  return {
    mode: value.mode,
    adapterName: value.adapterName,
    fallbackReason: value.fallbackReason,
  };
}

export async function loadPipelineCapabilities({ invoke } = {}) {
  if (typeof invoke !== "function") {
    throw new TypeError("pipeline capabilities require a Tauri invoke function");
  }

  return validatePipelineCapabilities(await invoke(PIPELINE_CAPABILITIES_COMMAND));
}
