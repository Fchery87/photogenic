// Phase 0 viewport-proof gate ladder (ADR-0004).
//
// The keystone Phase-0 risk is displaying a wgpu-rendered GPU texture inside the
// Tauri webview at production quality. ADR-0004's rule: a trivial gradient passing
// is NECESSARY BUT NOT SUFFICIENT. This module encodes that rule as executable,
// testable logic so the team cannot mistake a gradient pass for "rendering solved".
//
// This is deliberately shell-agnostic: it evaluates gate RESULTS, not GPU internals.
// The actual GPU/webview measurement is provided by whatever shell we prove
// (Tauri-preferred, or a fallback), and fed in as GateResult records.

/**
 * The ordered gate ladder. Each gate must pass before the shell decision may be
 * locked. Order matters: later gates are harder and more production-like.
 * @typedef {"gradient"|"raw_frame"|"zoom_pan"|"overlay"|"color_managed"|"sustained_60fps"} GateId
 */
export const GATE_LADDER = /** @type {const} */ ([
  "gradient",
  "raw_frame",
  "zoom_pan",
  "overlay",
  "color_managed",
  "sustained_60fps",
]);

/**
 * @typedef {Object} GateMetrics
 * @property {number} [physicalWidth]   Measured physical surface width in px.
 * @property {number} [physicalHeight]  Measured physical surface height in px.
 * @property {number} [scaleFactor]     Measured shell/webview scale factor.
 * @property {number} [frameCount]      Count of animation frames sampled.
 * @property {number} [durationMs]      Duration of the FPS sample window in ms.
 * @property {number} [red]             Measured red channel sample.
 * @property {number} [green]           Measured green channel sample.
 * @property {number} [blue]            Measured blue channel sample.
 * @property {number} [alpha]           Measured alpha channel sample.
 */

/**
 * @typedef {Object} GateResult
 * @property {GateId} id
 * @property {boolean} passed
 * @property {number} [fps]      Measured frames/sec, where relevant.
 * @property {GateMetrics} [metrics] Structured shell measurement metadata, where relevant.
 * @property {string} [note]     Optional human-readable detail.
 */

const GATE_SET = new Set(GATE_LADDER);
const MIN_SUSTAINED_FPS = 60;

/**
 * Validate that a set of results references only known gates and has no duplicates.
 * @param {GateResult[]} results
 */
function assertWellFormed(results) {
  if (!Array.isArray(results)) {
    throw new TypeError("results must be an array of GateResult");
  }
  const seen = new Set();
  for (const r of results) {
    if (!r || typeof r !== "object") {
      throw new TypeError("each result must be an object");
    }
    if (!GATE_SET.has(r.id)) {
      throw new RangeError(`unknown gate id: ${String(r.id)}`);
    }
    if (seen.has(r.id)) {
      throw new RangeError(`duplicate gate result: ${r.id}`);
    }
    seen.add(r.id);
    if (typeof r.passed !== "boolean") {
      throw new TypeError(`gate ${r.id}: 'passed' must be boolean`);
    }
  }
}

/**
 * A gate counts as a genuine pass only if it is reported passed AND, for the
 * sustained-fps gate, actually meets the 60fps floor.
 * @param {GateResult} r
 */
function isGenuinePass(r) {
  if (!r.passed) return false;
  if (r.id === "sustained_60fps") {
    return typeof r.fps === "number" && r.fps >= MIN_SUSTAINED_FPS;
  }
  return true;
}

/**
 * Evaluate the viewport proof against ADR-0004.
 *
 * @param {GateResult[]} results
 * @returns {{
 *   gradientOnly: boolean,
 *   provisional: boolean,
 *   shellDecisionUnlocked: boolean,
 *   passedGates: GateId[],
 *   remainingGates: GateId[],
 *   reason: string,
 * }}
 */
export function evaluateViewportProof(results) {
  assertWellFormed(results);

  const byId = new Map(results.map((r) => [r.id, r]));
  /** @type {GateId[]} */
  const passedGates = [];
  for (const id of GATE_LADDER) {
    const r = byId.get(id);
    if (r && isGenuinePass(r)) passedGates.push(id);
  }
  const passedSet = new Set(passedGates);
  const remainingGates = GATE_LADDER.filter((id) => !passedSet.has(id));

  const gradientPassed = passedSet.has("gradient");
  const allPassed = remainingGates.length === 0;

  // ADR-0004: gradient alone is necessary but NOT sufficient.
  // gradientOnly is strict: literally only the gradient gate has passed.
  const gradientOnly = gradientPassed && passedGates.length === 1;
  // provisional: some progress, but the shell decision is not yet unlockable.
  const provisional = passedGates.length > 0 && !allPassed;

  let reason;
  if (allPassed) {
    reason =
      "All viewport gates passed. Shell decision may be locked (ADR-0004).";
  } else if (gradientOnly) {
    reason =
      "Gradient passed but later gates are unproven. Gradient is necessary " +
      "but NOT sufficient (ADR-0004) — shell decision stays provisional.";
  } else if (!gradientPassed) {
    reason =
      "Gradient gate not yet passed — begin the proof at the gradient gate.";
  } else {
    reason = "Viewport proof incomplete.";
  }

  return {
    gradientOnly,
    provisional,
    shellDecisionUnlocked: allPassed,
    passedGates,
    remainingGates,
    reason,
  };
}

/**
 * Convenience: is the shell decision (ADR-0004) allowed to be locked yet?
 * @param {GateResult[]} results
 */
export function mayLockShellDecision(results) {
  return evaluateViewportProof(results).shellDecisionUnlocked;
}
