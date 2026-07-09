import { test } from "node:test";
import assert from "node:assert/strict";
import { measureAnimationFrameFps } from "../src/viewport-proof/fps.js";

test("measureAnimationFrameFps returns null when requestAnimationFrame is unavailable", async () => {
  const result = await measureAnimationFrameFps({ requestAnimationFrame: null });
  assert.equal(result, null);
});

test("measureAnimationFrameFps computes fps from sampled frame timestamps", async () => {
  const timestamps = [0, 16, 32, 48, 64];
  const resultPromise = measureAnimationFrameFps({
    durationMs: 48,
    requestAnimationFrame: (callback) => {
      const timestamp = timestamps.shift();
      queueMicrotask(() => callback(timestamp));
      return 1;
    },
  });

  const result = await resultPromise;
  assert.ok(result);
  assert.equal(result.frameCount, 3);
  assert.equal(result.durationMs, 48);
  assert.equal(result.fps, 62.5);
});

test("measureAnimationFrameFps rejects samples without a measured frame interval", async () => {
  const timestamps = [0, 0];
  const resultPromise = measureAnimationFrameFps({
    durationMs: 0,
    requestAnimationFrame: (callback) => {
      const timestamp = timestamps.shift();
      queueMicrotask(() => callback(timestamp));
      return 1;
    },
  });

  const result = await resultPromise;
  assert.equal(result, null);
});
