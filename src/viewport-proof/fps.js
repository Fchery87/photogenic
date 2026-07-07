const DEFAULT_SAMPLE_DURATION_MS = 500;

/**
 * Sample requestAnimationFrame cadence for a short browser/webview interval.
 * This measures presentation cadence only; it does not prove raw-frame,
 * zoom/pan, overlay, or color-management correctness.
 *
 * @param {{
 *   durationMs?: number,
 *   requestAnimationFrame?: ((callback: FrameRequestCallback) => number) | null,
 * }} [options]
 */
export async function measureAnimationFrameFps(options = {}) {
  const durationMs = options.durationMs ?? DEFAULT_SAMPLE_DURATION_MS;
  const requestFrame = options.requestAnimationFrame ?? globalThis.requestAnimationFrame ?? null;

  if (typeof requestFrame !== "function") {
    return null;
  }

  return new Promise((resolve) => {
    let startTime = null;
    let lastTime = null;
    let frameCount = 0;

    const step = (timestamp) => {
      if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
        resolve(null);
        return;
      }

      if (startTime === null) {
        startTime = timestamp;
      } else {
        frameCount += 1;
      }
      lastTime = timestamp;

      if (lastTime - startTime >= durationMs) {
        const elapsedMs = lastTime - startTime;
        resolve({
          fps: elapsedMs > 0 ? (frameCount * 1000) / elapsedMs : 0,
          frameCount,
          durationMs: elapsedMs,
        });
        return;
      }

      requestFrame(step);
    };

    requestFrame(step);
  });
}
