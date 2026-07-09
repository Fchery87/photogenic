import { GATE_LADDER, evaluateViewportProof } from "./gates.js";

const PASS_LABEL = "PASS";
const FAIL_LABEL = "FAILED";
const NOT_MEASURED_LABEL = "NOT MEASURED";
const INSUFFICIENT_EVIDENCE_LABEL = "INSUFFICIENT EVIDENCE";
const MIN_SUSTAINED_FPS = 60;

function formatNumber(value, fractionDigits = 1, preserveTrailingZeros = false) {
  if (preserveTrailingZeros) {
    return value.toFixed(fractionDigits);
  }
  return Number.isInteger(value) ? String(value) : value.toFixed(fractionDigits);
}

/**
 * @param {import("./gates.js").GateResult | undefined} result
 */
function summarizeMetrics(result) {
  if (!result?.metrics) {
    return null;
  }

  if (
    typeof result.metrics.frameWidth === "number" &&
    typeof result.metrics.frameHeight === "number" &&
    typeof result.metrics.frameHash === "string"
  ) {
    return `Measured native frame: ${formatNumber(result.metrics.frameWidth, 0)}×${formatNumber(result.metrics.frameHeight, 0)} px, hash ${result.metrics.frameHash.slice(0, 12)}.`;
  }

  if (
    typeof result.metrics.physicalWidth === "number" &&
    typeof result.metrics.physicalHeight === "number"
  ) {
    return `Measured surface: ${formatNumber(result.metrics.physicalWidth, 0)}×${formatNumber(result.metrics.physicalHeight, 0)} physical px${typeof result.metrics.scaleFactor === "number" ? ` at ${formatNumber(result.metrics.scaleFactor, 2, true)}× scale` : ""}.`;
  }

  if (
    result.id === "sustained_60fps" &&
    (typeof result.metrics.frameCount === "number" || typeof result.metrics.durationMs === "number")
  ) {
    const fragments = [];
    if (typeof result.metrics.frameCount === "number") {
      fragments.push(`${formatNumber(result.metrics.frameCount, 0)} frame${result.metrics.frameCount === 1 ? "" : "s"}`);
    }
    if (typeof result.metrics.durationMs === "number") {
      fragments.push(`${formatNumber(result.metrics.durationMs, 0)} ms`);
    }
    return `Measured cadence sample: ${fragments.join(" over ")}.`;
  }

  if (
    result.id === "color_managed" &&
    typeof result.metrics.red === "number" &&
    typeof result.metrics.green === "number" &&
    typeof result.metrics.blue === "number" &&
    typeof result.metrics.alpha === "number"
  ) {
    return `Measured color sample: rgba(${formatNumber(result.metrics.red, 0)}, ${formatNumber(result.metrics.green, 0)}, ${formatNumber(result.metrics.blue, 0)}, ${formatNumber(result.metrics.alpha, 0)})${typeof result.metrics.frameHash === "string" ? ` from native frame hash ${result.metrics.frameHash.slice(0, 12)}` : ""}.`;
  }

  return null;
}

/**
 * @param {import("./gates.js").GateResult[]} results
 */
function createResultMap(results) {
  return new Map(results.map((result) => [result.id, result]));
}

/**
 * @param {import("./gates.js").GateResult} result
 */
function isGenuinePass(result) {
  if (!result.passed) return false;
  if (result.id !== "sustained_60fps") return true;
  return typeof result.fps === "number" && result.fps >= MIN_SUSTAINED_FPS;
}

/**
 * @param {import("./gates.js").GateResult | undefined} result
 */
function describeGate(result) {
  if (!result) {
    return {
      label: NOT_MEASURED_LABEL,
      tone: "todo",
      detail: "No shell measurement recorded yet.",
      metricsSummary: null,
      measured: false,
      genuinePass: false,
    };
  }

  const metricsSummary = summarizeMetrics(result);
  if (isGenuinePass(result)) {
    return {
      label: PASS_LABEL,
      tone: "pass",
      detail:
        result.note ??
        (result.id === "sustained_60fps"
          ? `Measured ${result.fps} fps (meets ${MIN_SUSTAINED_FPS} fps floor).`
          : "Measured and passed."),
      metricsSummary,
      measured: true,
      genuinePass: true,
    };
  }
  if (result.passed) {
    return {
      label: INSUFFICIENT_EVIDENCE_LABEL,
      tone: "todo",
      detail:
        result.note ??
        (result.id === "sustained_60fps"
          ? `Measured ${String(result.fps)} fps; needs at least ${MIN_SUSTAINED_FPS} fps.`
          : "Reported passed, but evidence is incomplete."),
      metricsSummary,
      measured: true,
      genuinePass: false,
    };
  }
  return {
    label: FAIL_LABEL,
    tone: "todo",
    detail: result.note ?? "Measured and not yet passing.",
    metricsSummary,
    measured: true,
    genuinePass: false,
  };
}

/**
 * @param {import("./gates.js").GateResult[]} results
 */
function summarizeEvidence(results) {
  if (results.length === 0) {
    return "No measured viewport-proof gate results yet.";
  }
  return `Recorded ${results.length} gate result${results.length === 1 ? "" : "s"}; only genuine passes count toward ADR-0004.`;
}

/**
 * @param {import("./gates.js").GateResult[]} results
 */
function summarizeProgress(results) {
  if (results.length === 0) {
    return "The harness is waiting on real shell measurements before any gate can be counted as passed.";
  }
  return "This harness reports measured evidence separately from the shell-decision verdict so placeholder UI state cannot masquerade as proof.";
}

export function createViewportProofFoundation() {
  return {
    /**
     * @param {import("./gates.js").GateResult[]} results
     * @param {ReturnType<typeof evaluateViewportProof>} [verdict]
     */
    summarizeProof(results, verdict = evaluateViewportProof(results)) {
      const resultMap = createResultMap(results);
      const gates = GATE_LADDER.map((id) => ({
        id,
        ...describeGate(resultMap.get(id)),
      }));

      return {
        verdict,
        headline: verdict.shellDecisionUnlocked ? "UNLOCKED" : "PROVISIONAL",
        status: verdict.shellDecisionUnlocked ? "unlocked" : "provisional",
        measuredGateCount: results.length,
        genuinePassCount: verdict.passedGates.length,
        remainingGateCount: verdict.remainingGates.length,
        evidenceSummary: summarizeEvidence(results),
        progressSummary: summarizeProgress(results),
        gates,
      };
    },
  };
}
