// Viewport-proof gate evaluation logic — TypeScript port from app/main.js.
// This module contains the PURE functions that implement ADR-0004's honesty
// guarantees. A silent behavior change here is a regression against ADR-0004,
// not just a UI bug.

export const GATE_ORDER = [
  "gradient",
  "raw_frame",
  "zoom_pan",
  "overlay",
  "color_managed",
  "sustained_60fps",
] as const;

export const MIN_FPS = 60;

export interface ViewportProofMetrics {
  sourceFileId?: string;
  recipeFingerprint?: string;
  frameWidth?: number;
  frameHeight?: number;
  transferMethod?: string;
  frameHash?: string;
  renderDurationMs?: number;
  red?: number;
  green?: number;
  blue?: number;
  alpha?: number;
  physicalWidth?: number;
  physicalHeight?: number;
  scaleFactor?: number;
  frameCount?: number;
  durationMs?: number;
}

export interface GateResult {
  id: string;
  passed: boolean;
  fps?: number;
  metrics?: ViewportProofMetrics | null;
  note?: string;
  measured?: boolean;
}

export interface ProofReport {
  gradientOnly: boolean;
  provisional: boolean;
  shellDecisionUnlocked: boolean;
  fallbackActivated: boolean;
  measuredGateFailures: string[];
  passedGates: string[];
  remainingGates: string[];
  reason: string;
}

export function hasNativeProvenance(metrics: ViewportProofMetrics | null | undefined): boolean {
  if (!metrics) return false;
  return (
    typeof metrics.sourceFileId === "string" && metrics.sourceFileId.length > 0 &&
    typeof metrics.recipeFingerprint === "string" && metrics.recipeFingerprint.length >= 64 &&
    typeof metrics.frameWidth === "number" && metrics.frameWidth > 0 &&
    typeof metrics.frameHeight === "number" && metrics.frameHeight > 0 &&
    typeof metrics.transferMethod === "string" && metrics.transferMethod.length > 0 &&
    typeof metrics.frameHash === "string" && metrics.frameHash.length >= 64 &&
    typeof metrics.renderDurationMs === "number" && metrics.renderDurationMs >= 0
  );
}

export function isGenuinePass(r: GateResult | null | undefined): boolean {
  if (!r || r.passed !== true) return false;
  if (r.id === "raw_frame" && !hasNativeProvenance(r.metrics)) return false;
  if (r.id === "sustained_60fps" && (typeof r.fps !== "number" || r.fps < MIN_FPS)) return false;
  return true;
}

export function evaluateProof(results: GateResult[]): ProofReport {
  const byId: Record<string, GateResult> = {};
  for (const r of results) byId[r.id] = r;
  const passed = GATE_ORDER.filter((id) => byId[id] && isGenuinePass(byId[id]));
  const remaining = GATE_ORDER.filter((id) => !passed.includes(id));
  const allPassed = remaining.length === 0;
  const gradientOnly = passed.length === 1 && passed[0] === "gradient";
  const rawR = byId["raw_frame"];
  const rawMissing = rawR?.passed && !hasNativeProvenance(rawR.metrics);
  const failures = GATE_ORDER.filter((id) => {
    const r = byId[id];
    return r?.passed === false && r.measured !== false;
  });
  let reason: string;
  if (allPassed) reason = "All viewport gates passed. Shell decision may be locked (ADR-0004).";
  else if (gradientOnly) reason = "Gradient passed but later gates are unproven. Shell decision stays provisional (ADR-0004).";
  else if (rawMissing) reason = "Raw-frame provenance missing or incomplete.";
  else if (!passed.includes("gradient")) reason = "Gradient gate not yet passed.";
  else reason = "Viewport proof incomplete.";
  if (failures.length) reason += ` ADR-0004 fallback activated by measured gate failure: ${failures.join(", ")}.`;
  return {
    gradientOnly,
    provisional: passed.length > 0 && !allPassed,
    shellDecisionUnlocked: allPassed,
    fallbackActivated: failures.length > 0,
    measuredGateFailures: failures as string[],
    passedGates: passed as string[],
    remainingGates: remaining as string[],
    reason,
  };
}

export function mergeResults(existing: GateResult[], incoming: GateResult[]): GateResult[] {
  const byId: Record<string, GateResult> = {};
  for (const r of existing) byId[r.id] = r;
  for (const r of incoming) byId[r.id] = r;
  return Object.values(byId);
}
