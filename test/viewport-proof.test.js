import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GATE_LADDER,
  evaluateViewportProof,
  mayLockShellDecision,
} from "../src/viewport-proof/gates.js";

// Helper: build a full passing result set.
function allPassing() {
  return GATE_LADDER.map((id) => {
    if (id === "raw_frame") {
      return {
        id,
        passed: true,
        metrics: {
          sourceFileId: "viewport-proof-native-frame",
          recipeFingerprint: "f".repeat(64),
          frameWidth: 2,
          frameHeight: 2,
          transferMethod: "cpu-linear-float32",
          frameHash: "a".repeat(64),
          renderDurationMs: 4,
        },
      };
    }
    return id === "sustained_60fps"
      ? { id, passed: true, fps: 62 }
      : { id, passed: true };
  });
}

test("gate ladder has the ADR-0004 progressive order", () => {
  assert.deepEqual(GATE_LADDER, [
    "gradient",
    "raw_frame",
    "zoom_pan",
    "overlay",
    "color_managed",
    "sustained_60fps",
  ]);
});

test("empty proof: shell decision stays locked, start at gradient", () => {
  const r = evaluateViewportProof([]);
  assert.equal(r.shellDecisionUnlocked, false);
  assert.equal(r.gradientOnly, false);
  assert.deepEqual(r.remainingGates, GATE_LADDER);
});

test("gradient-only pass is NECESSARY BUT NOT SUFFICIENT (ADR-0004)", () => {
  const r = evaluateViewportProof([{ id: "gradient", passed: true }]);
  assert.equal(r.gradientOnly, true);
  assert.equal(r.provisional, true);
  assert.equal(r.shellDecisionUnlocked, false);
  assert.match(r.reason, /not sufficient/i);
  assert.equal(mayLockShellDecision([{ id: "gradient", passed: true }]), false);
});

test("gradientOnly is strict: false once a second gate also passes", () => {
  const r = evaluateViewportProof([
    { id: "gradient", passed: true },
    allPassing().find((result) => result.id === "raw_frame"),
  ]);
  assert.equal(r.gradientOnly, false);
  assert.equal(r.provisional, true);
  assert.equal(r.shellDecisionUnlocked, false);
});

test("raw_frame cannot pass without native pipeline frame provenance", () => {
  const r = evaluateViewportProof([
    { id: "gradient", passed: true },
    { id: "raw_frame", passed: true },
  ]);
  assert.equal(r.shellDecisionUnlocked, false);
  assert.deepEqual(r.passedGates, ["gradient"]);
  assert.deepEqual(r.remainingGates, [
    "raw_frame",
    "zoom_pan",
    "overlay",
    "color_managed",
    "sustained_60fps",
  ]);
});

test("gradient plus unproven raw_frame still cannot unlock the shell decision", () => {
  const results = allPassing().map((result) =>
    result.id === "raw_frame" ? { id: "raw_frame", passed: true, metrics: { frameWidth: 2, frameHeight: 2 } } : result,
  );
  const r = evaluateViewportProof(results);
  assert.equal(r.shellDecisionUnlocked, false);
  assert.deepEqual(r.remainingGates, ["raw_frame"]);
  assert.match(r.reason, /raw-frame provenance/i);
});

test("fps exactly at the 60 floor counts as a genuine pass", () => {
  const results = allPassing().map((r) =>
    r.id === "sustained_60fps" ? { id: r.id, passed: true, fps: 60 } : r,
  );
  assert.equal(mayLockShellDecision(results), true);
});

test("fps NaN does not count as a genuine sustained pass", () => {
  const results = allPassing().map((r) =>
    r.id === "sustained_60fps" ? { id: r.id, passed: true, fps: NaN } : r,
  );
  assert.equal(mayLockShellDecision(results), false);
});

test("non-numeric fps (string) does not genuinely pass", () => {
  const results = allPassing().map((r) =>
    r.id === "sustained_60fps" ? { id: r.id, passed: true, fps: "62" } : r,
  );
  assert.equal(mayLockShellDecision(results), false);
});

test("rejects non-array input", () => {
  assert.throws(() => evaluateViewportProof(null), /must be an array/i);
});

test("rejects null element in results", () => {
  assert.throws(
    () => evaluateViewportProof([null]),
    /must be an object/i,
  );
});

test("all-passed and empty cases have descriptive reasons", () => {
  assert.match(evaluateViewportProof(allPassing()).reason, /locked/i);
  assert.match(evaluateViewportProof([]).reason, /gradient/i);
});

test("all gates passing unlocks the shell decision", () => {
  const results = allPassing();
  const r = evaluateViewportProof(results);
  assert.equal(r.shellDecisionUnlocked, true);
  assert.equal(r.gradientOnly, false);
  assert.deepEqual(r.remainingGates, []);
  assert.equal(mayLockShellDecision(results), true);
});

test("sustained_60fps below floor does NOT count as a genuine pass", () => {
  const results = allPassing().map((r) =>
    r.id === "sustained_60fps" ? { id: r.id, passed: true, fps: 45 } : r,
  );
  const r = evaluateViewportProof(results);
  assert.equal(r.shellDecisionUnlocked, false);
  assert.deepEqual(r.remainingGates, ["sustained_60fps"]);
});

test("sustained_60fps marked passed but missing fps is not genuine", () => {
  const results = allPassing().map((r) =>
    r.id === "sustained_60fps" ? { id: r.id, passed: true } : r,
  );
  assert.equal(mayLockShellDecision(results), false);
});

test("rejects unknown gate id", () => {
  assert.throws(
    () => evaluateViewportProof([{ id: "bogus", passed: true }]),
    /unknown gate id/i,
  );
});

test("rejects duplicate gate results", () => {
  assert.throws(
    () =>
      evaluateViewportProof([
        { id: "gradient", passed: true },
        { id: "gradient", passed: false },
      ]),
    /duplicate gate result/i,
  );
});

test("rejects non-boolean passed", () => {
  assert.throws(
    () => evaluateViewportProof([{ id: "gradient", passed: "yes" }]),
    /must be boolean/i,
  );
});

test("partial-ladder pass reports correct remaining gates", () => {
  const r = evaluateViewportProof([
    { id: "gradient", passed: true },
    allPassing().find((result) => result.id === "raw_frame"),
    { id: "zoom_pan", passed: false },
  ]);
  assert.deepEqual(r.passedGates, ["gradient", "raw_frame"]);
  assert.deepEqual(r.remainingGates, [
    "zoom_pan",
    "overlay",
    "color_managed",
    "sustained_60fps",
  ]);
  assert.equal(r.shellDecisionUnlocked, false);
});

test("missing evidence alone does NOT activate the ADR-0004 fallback ladder", () => {
  const r = evaluateViewportProof([]);
  assert.equal(r.fallbackActivated, false);
  assert.deepEqual(r.measuredGateFailures, []);
});

test("a measured hard-gate failure activates the ADR-0004 fallback ladder", () => {
  const r = evaluateViewportProof([
    { id: "gradient", passed: true },
    allPassing().find((result) => result.id === "raw_frame"),
    { id: "zoom_pan", passed: false, note: "Measured but failed." },
  ]);
  assert.equal(r.shellDecisionUnlocked, false);
  assert.equal(r.fallbackActivated, true);
  assert.deepEqual(r.measuredGateFailures, ["zoom_pan"]);
  assert.match(r.reason, /fallback ladder activated/i);
});

test("placeholder/unavailable sentinels (measured:false) do not activate fallback", () => {
  const r = evaluateViewportProof([
    { id: "gradient", passed: false, measured: false },
    { id: "raw_frame", passed: false, measured: false },
  ]);
  assert.equal(r.fallbackActivated, false);
  assert.deepEqual(r.measuredGateFailures, []);
});

test("insufficient raw-frame provenance is not a measured gate failure", () => {
  const r = evaluateViewportProof([
    { id: "gradient", passed: true },
    { id: "raw_frame", passed: true },
  ]);
  assert.equal(r.fallbackActivated, false);
});

test("a concrete below-floor fps measurement is a measured gate failure", () => {
  const r = evaluateViewportProof([
    { id: "gradient", passed: true },
    allPassing().find((result) => result.id === "raw_frame"),
    { id: "zoom_pan", passed: true },
    { id: "overlay", passed: true },
    { id: "color_managed", passed: true },
    { id: "sustained_60fps", passed: false, fps: 45, note: "Measured 45 fps." },
  ]);
  assert.equal(r.fallbackActivated, true);
  assert.deepEqual(r.measuredGateFailures, ["sustained_60fps"]);
});
