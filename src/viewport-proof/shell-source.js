const COMMAND_NAME = "viewport_proof_results";
const MIN_SUSTAINED_FPS = 60;
const NUMBER_METRIC_KEYS = [
  "physicalWidth",
  "physicalHeight",
  "scaleFactor",
  "frameCount",
  "durationMs",
  "red",
  "green",
  "blue",
  "alpha",
  "frameWidth",
  "frameHeight",
  "renderDurationMs",
];
const STRING_METRIC_KEYS = ["sourceFileId", "recipeFingerprint", "transferMethod", "frameHash"];

function placeholderGradientResult() {
  return [
    {
      id: "gradient",
      passed: false,
      note:
        "2D canvas placeholder drawn; ADR-0004 still requires a real GPU→webview shell measurement before the gradient gate can pass.",
    },
  ];
}

function upsertResult(results, nextResult) {
  return [...results.filter((result) => result.id !== nextResult.id), nextResult];
}

function mergeResults(results, nextResults) {
  return nextResults.reduce((merged, nextResult) => upsertResult(merged, nextResult), results);
}

function sanitizeMetrics(metrics) {
  if (!metrics || typeof metrics !== "object") {
    return undefined;
  }

  const sanitized = Object.fromEntries(
    NUMBER_METRIC_KEYS.flatMap((key) => {
      const value = metrics[key];
      return typeof value === "number" && Number.isFinite(value) ? [[key, value]] : [];
    }),
  );
  for (const key of STRING_METRIC_KEYS) {
    const value = metrics[key];
    if (typeof value === "string" && value.length > 0) {
      sanitized[key] = value;
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

async function measureSustainedResult(measureSustainedFps) {
  if (typeof measureSustainedFps !== "function") {
    return null;
  }

  try {
    const measurement = await measureSustainedFps();
    if (!measurement || typeof measurement.fps !== "number" || !Number.isFinite(measurement.fps)) {
      return {
        id: "sustained_60fps",
        passed: false,
        note:
          "Shell bridge connected, but the webview requestAnimationFrame sample did not produce a usable FPS reading. This cadence check does not substitute for the separate raw-frame, zoom/pan, overlay, or color-management gates.",
      };
    }

    const roundedFps = Math.round(measurement.fps * 10) / 10;
    const roundedDuration = typeof measurement.durationMs === "number" ? Math.round(measurement.durationMs) : undefined;
    const roundedFrameCount =
      typeof measurement.frameCount === "number" ? Math.round(measurement.frameCount) : undefined;
    return {
      id: "sustained_60fps",
      passed: roundedFps >= MIN_SUSTAINED_FPS,
      fps: roundedFps,
      metrics: sanitizeMetrics({
        frameCount: roundedFrameCount,
        durationMs: roundedDuration,
      }),
      note:
        `Measured ${roundedFps} fps from requestAnimationFrame${typeof roundedFrameCount === "number" ? ` across ${roundedFrameCount} frames` : ""}${typeof roundedDuration === "number" ? ` over ${roundedDuration} ms` : ""} in this shell webview. This samples presentation cadence only; the separate raw-frame, zoom/pan, overlay, and color-management gates still require their own measurements.`,
    };
  } catch (error) {
    return {
      id: "sustained_60fps",
      passed: false,
      note: `Shell bridge connected, but the webview FPS sample failed: ${error instanceof Error ? error.message : String(error)}. This cadence check does not substitute for the separate raw-frame, zoom/pan, overlay, or color-management gates.`,
    };
  }
}

function validateResults(results) {
  if (!Array.isArray(results)) {
    throw new TypeError("viewport proof results must be an array");
  }
  return results.map((result) => {
    if (!result || typeof result !== "object") {
      throw new TypeError("viewport proof results must contain objects");
    }
    return {
      id: result.id,
      passed: result.passed,
      fps: result.fps,
      metrics: sanitizeMetrics(result.metrics),
      note: result.note,
    };
  });
}

export async function loadViewportProofResults({ gradientDrawn, invoke, measureSustainedFps, measureWebviewGates } = {}) {
  if (!gradientDrawn) {
    return [];
  }

  if (typeof invoke === "function") {
    try {
      const shellResults = validateResults(await invoke(COMMAND_NAME));
      const webviewResults =
        typeof measureWebviewGates === "function"
          ? validateResults(await measureWebviewGates({ nativeFrame: shellResults.find((result) => result.id === "raw_frame")?.metrics }))
          : [];
      const sustainedResult = await measureSustainedResult(measureSustainedFps);
      const mergedResults = mergeResults(shellResults, webviewResults);
      return sustainedResult ? upsertResult(mergedResults, sustainedResult) : mergedResults;
    } catch (error) {
      return [
        ...placeholderGradientResult(),
        {
          id: "raw_frame",
          passed: false,
          note: `Shell measurement unavailable: ${error instanceof Error ? error.message : String(error)}`,
        },
      ];
    }
  }

  return placeholderGradientResult();
}

export function resolveTauriInvoke(globalObject = globalThis) {
  return globalObject?.__TAURI__?.core?.invoke ?? null;
}
