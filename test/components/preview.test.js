import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  GATE_ORDER,
  MIN_FPS,
  hasNativeProvenance,
  isGenuinePass,
  evaluateProof,
  mergeResults,
} from "../../app/src/viewport-proof-collector.js";

// ---------------------------------------------------------------------------
// Gate evaluation pure-function tests (must be byte-for-byte equivalent
// with the previous main.js implementation — ADR-0004 honesty guarantee)
// ---------------------------------------------------------------------------

test("GATE_ORDER has the correct 6 gates in order", () => {
  assert.deepEqual(GATE_ORDER, [
    "gradient", "raw_frame", "zoom_pan", "overlay", "color_managed", "sustained_60fps",
  ]);
});

test("MIN_FPS is 60", () => {
  assert.equal(MIN_FPS, 60);
});

// -- hasNativeProvenance -----------------------------------------------------

test("hasNativeProvenance returns false for null/undefined", () => {
  assert.equal(hasNativeProvenance(null), false);
  assert.equal(hasNativeProvenance(undefined), false);
});

test("hasNativeProvenance returns true when all fields present and valid", () => {
  assert.equal(
    hasNativeProvenance({
      sourceFileId: "img-001",
      recipeFingerprint: "a".repeat(64),
      frameWidth: 4000,
      frameHeight: 3000,
      transferMethod: "gpu-texture",
      frameHash: "b".repeat(64),
      renderDurationMs: 5,
    }),
    true,
  );
});

test("hasNativeProvenance returns false when sourceFileId missing", () => {
  assert.equal(
    hasNativeProvenance({
      sourceFileId: "",
      recipeFingerprint: "a".repeat(64),
      frameWidth: 4000,
      frameHeight: 3000,
      transferMethod: "gpu-texture",
      frameHash: "b".repeat(64),
      renderDurationMs: 5,
    }),
    false,
  );
});

test("hasNativeProvenance returns false when fingerprint too short", () => {
  assert.equal(
    hasNativeProvenance({
      sourceFileId: "img-001",
      recipeFingerprint: "a".repeat(63),
      frameWidth: 4000,
      frameHeight: 3000,
      transferMethod: "gpu-texture",
      frameHash: "b".repeat(64),
      renderDurationMs: 5,
    }),
    false,
  );
});

test("hasNativeProvenance returns false when frameHash too short", () => {
  assert.equal(
    hasNativeProvenance({
      sourceFileId: "img-001",
      recipeFingerprint: "a".repeat(64),
      frameWidth: 4000,
      frameHeight: 3000,
      transferMethod: "gpu-texture",
      frameHash: "b".repeat(63),
      renderDurationMs: 5,
    }),
    false,
  );
});

// -- isGenuinePass -----------------------------------------------------------

test("isGenuinePass returns false for null/undefined", () => {
  assert.equal(isGenuinePass(null), false);
  assert.equal(isGenuinePass(undefined), false);
});

test("isGenuinePass returns false when passed !== true", () => {
  assert.equal(isGenuinePass({ id: "gradient", passed: false }), false);
  assert.equal(isGenuinePass({ id: "gradient", passed: undefined }), false);
});

test("isGenuinePass returns true for gradient gate passed", () => {
  assert.equal(isGenuinePass({ id: "gradient", passed: true }), true);
});

test("isGenuinePass returns false for raw_frame without native provenance", () => {
  assert.equal(isGenuinePass({ id: "raw_frame", passed: true, metrics: null }), false);
});

test("isGenuinePass returns true for raw_frame with full native provenance", () => {
  assert.equal(
    isGenuinePass({
      id: "raw_frame",
      passed: true,
      metrics: {
        sourceFileId: "img-001",
        recipeFingerprint: "a".repeat(64),
        frameWidth: 4000,
        frameHeight: 3000,
        transferMethod: "gpu-texture",
        frameHash: "b".repeat(64),
        renderDurationMs: 5,
      },
    }),
    true,
  );
});

test("isGenuinePass returns false for sustained_60fps below floor", () => {
  assert.equal(isGenuinePass({ id: "sustained_60fps", passed: true, fps: 59.9 }), false);
});

test("isGenuinePass returns true for sustained_60fps at exactly MIN_FPS", () => {
  assert.equal(isGenuinePass({ id: "sustained_60fps", passed: true, fps: 60 }), true);
});

test("isGenuinePass returns true for sustained_60fps with NaN fps (matches original main.js behavior)", () => {
  // NaN < 60 is false in JS, so the original isGenuinePass does NOT catch NaN.
  // This is an known edge case preserved for byte-for-byte parity.
  assert.equal(isGenuinePass({ id: "sustained_60fps", passed: true, fps: NaN }), true);
});

test("isGenuinePass returns false for sustained_60fps with non-number fps", () => {
  assert.equal(isGenuinePass({ id: "sustained_60fps", passed: true, fps: "60" }), false);
});

// -- evaluateProof -----------------------------------------------------------

test("all gates passing unlocks shell decision", () => {
  const results = GATE_ORDER.map((id) => {
    if (id === "raw_frame") return { id, passed: true, metrics: { sourceFileId: "x", recipeFingerprint: "a".repeat(64), frameWidth: 1, frameHeight: 1, transferMethod: "t", frameHash: "b".repeat(64), renderDurationMs: 1 } };
    if (id === "sustained_60fps") return { id, passed: true, fps: 60 };
    return { id, passed: true };
  });
  const report = evaluateProof(results);
  assert.equal(report.shellDecisionUnlocked, true);
  assert.equal(report.gradientOnly, false);
  assert.equal(report.remainingGates.length, 0);
});

test("gradient-only pass is NECESSARY BUT NOT SUFFICIENT (ADR-0004)", () => {
  const report = evaluateProof([{ id: "gradient", passed: true }]);
  assert.equal(report.gradientOnly, true);
  assert.equal(report.shellDecisionUnlocked, false);
  assert.ok(report.reason.includes("Gradient passed but later gates are unproven"));
});

test("gradientOnly is strict: false once a second gate also passes", () => {
  const report = evaluateProof([
    { id: "gradient", passed: true },
    { id: "zoom_pan", passed: true },
  ]);
  assert.equal(report.gradientOnly, false);
});

test("raw_frame cannot pass without native pipeline frame provenance", () => {
  const report = evaluateProof([
    { id: "gradient", passed: true },
    { id: "raw_frame", passed: true, metrics: null },
  ]);
  assert.ok(!report.passedGates.includes("raw_frame"));
});

test("partial-ladder pass reports correct remaining gates", () => {
  const report = evaluateProof([
    { id: "gradient", passed: true },
    { id: "raw_frame", passed: true, metrics: { sourceFileId: "x", recipeFingerprint: "a".repeat(64), frameWidth: 1, frameHeight: 1, transferMethod: "t", frameHash: "b".repeat(64), renderDurationMs: 1 } },
  ]);
  assert.deepEqual(report.passedGates, ["gradient", "raw_frame"]);
  assert.deepEqual(report.remainingGates, ["zoom_pan", "overlay", "color_managed", "sustained_60fps"]);
});

test("a measured hard-gate failure activates the ADR-0004 fallback ladder", () => {
  const report = evaluateProof([
    { id: "gradient", passed: true },
    { id: "raw_frame", passed: false, measured: true },
  ]);
  assert.equal(report.fallbackActivated, true);
  assert.ok(report.measuredGateFailures.includes("raw_frame"));
  assert.ok(report.reason.includes("fallback activated"));
});

test("insufficient raw-frame provenance is not a measured gate failure", () => {
  const report = evaluateProof([
    { id: "gradient", passed: true },
    { id: "raw_frame", passed: true, metrics: null },
  ]);
  assert.equal(report.fallbackActivated, false);
});

test("a concrete below-floor fps measurement is a measured gate failure", () => {
  const report = evaluateProof([
    { id: "gradient", passed: true },
    { id: "raw_frame", passed: true, metrics: { sourceFileId: "x", recipeFingerprint: "a".repeat(64), frameWidth: 1, frameHeight: 1, transferMethod: "t", frameHash: "b".repeat(64), renderDurationMs: 1 } },
    { id: "zoom_pan", passed: true },
    { id: "overlay", passed: true },
    { id: "color_managed", passed: true },
    { id: "sustained_60fps", passed: false, fps: 30, measured: true },
  ]);
  assert.equal(report.fallbackActivated, true);
  assert.ok(report.measuredGateFailures.includes("sustained_60fps"));
});

// -- mergeResults ------------------------------------------------------------

test("mergeResults deduplicates by gate id, incoming wins", () => {
  const existing = [{ id: "gradient", passed: false, note: "old" }];
  const incoming = [{ id: "gradient", passed: true, note: "new" }];
  const merged = mergeResults(existing, incoming);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].passed, true);
  assert.equal(merged[0].note, "new");
});

test("mergeResults preserves unique gates from both arrays", () => {
  const existing = [{ id: "gradient", passed: true }];
  const incoming = [{ id: "raw_frame", passed: false }];
  const merged = mergeResults(existing, incoming);
  assert.equal(merged.length, 2);
});
