import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateViewportProof } from "../src/viewport-proof/gates.js";
import { createViewportProofFoundation } from "../src/viewport-proof/foundation.js";

test("viewport proof foundation extracts deterministic summary metadata from results", () => {
  const foundation = createViewportProofFoundation();
  const summary = foundation.summarizeProof([
    { id: "gradient", passed: true, note: "Measured in shell." },
    { id: "raw_frame", passed: true, note: "Raw frame proven." },
    { id: "sustained_60fps", passed: true, fps: 45 },
  ]);

  assert.equal(summary.headline, "PROVISIONAL");
  assert.equal(summary.status, "provisional");
  assert.equal(summary.measuredGateCount, 3);
  assert.equal(summary.genuinePassCount, 2);
  assert.equal(summary.remainingGateCount, 4);
  assert.match(summary.evidenceSummary, /recorded 3 gate results/i);

  const sustained = summary.gates.find((gate) => gate.id === "sustained_60fps");
  assert.ok(sustained);
  assert.equal(sustained.label, "INSUFFICIENT EVIDENCE");
  assert.equal(sustained.measured, true);
  assert.equal(sustained.genuinePass, false);
});

test("viewport proof foundation can reuse a precomputed verdict without changing metadata", () => {
  const foundation = createViewportProofFoundation();
  const results = [
    { id: "gradient", passed: true },
    { id: "raw_frame", passed: true },
  ];
  const verdict = evaluateViewportProof(results);

  assert.deepEqual(foundation.summarizeProof(results, verdict), foundation.summarizeProof(results));
});
