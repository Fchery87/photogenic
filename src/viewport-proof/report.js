import { createViewportProofFoundation } from "./foundation.js";

const viewportProofFoundation = createViewportProofFoundation();

/**
 * Build a readable, honest viewport-proof report for the harness UI.
 * @param {import("./gates.js").GateResult[]} results
 */
export function createViewportProofReport(results) {
  return viewportProofFoundation.summarizeProof(results);
}
