import { test } from "node:test";
import assert from "node:assert/strict";
import { createViewportProofReport } from "../src/viewport-proof/report.js";

test("report is honest when no measured results exist", () => {
  const report = createViewportProofReport([]);

  assert.equal(report.headline, "PROVISIONAL");
  assert.match(report.evidenceSummary, /no measured/i);
  assert.equal(report.gates[0].id, "gradient");
  assert.equal(report.gates[0].label, "NOT MEASURED");
  assert.match(report.gates[0].detail, /no shell measurement/i);
});

test("report surfaces placeholder gradient evidence without counting it as a pass", () => {
  const report = createViewportProofReport([
    {
      id: "gradient",
      passed: false,
      note: "2D canvas placeholder drawn; real GPU→webview measurement still missing.",
    },
  ]);

  assert.equal(report.headline, "PROVISIONAL");
  assert.equal(report.gates[0].label, "FAILED");
  assert.match(report.gates[0].detail, /placeholder/i);
  assert.equal(report.verdict.shellDecisionUnlocked, false);
});


test("report renders structured color metrics without overclaiming raw-frame proof", () => {
  const report = createViewportProofReport([
    {
      id: "color_managed",
      passed: true,
      metrics: { red: 59, green: 130, blue: 246, alpha: 255 },
      note: "Canvas color sample preserved.",
    },
  ]);

  const color = report.gates.find((gate) => gate.id === "color_managed");
  assert.ok(color);
  assert.equal(color.label, "PASS");
  assert.match(color.metricsSummary, /rgba\(59, 130, 246, 255\)/i);
  assert.equal(report.verdict.shellDecisionUnlocked, false);
});

test("report renders structured raw-frame and sustained-fps metrics without upgrading the verdict", () => {
  const report = createViewportProofReport([
    {
      id: "raw_frame",
      passed: false,
      metrics: { physicalWidth: 1512, physicalHeight: 982, scaleFactor: 2 },
      note: "Raw-frame provenance still unproven.",
    },
    {
      id: "sustained_60fps",
      passed: true,
      fps: 58.4,
      metrics: { frameCount: 35, durationMs: 600 },
    },
  ]);

  const rawFrame = report.gates.find((gate) => gate.id === "raw_frame");
  assert.ok(rawFrame);
  assert.match(rawFrame.metricsSummary, /1512×982 physical px/i);
  assert.match(rawFrame.metricsSummary, /2\.00× scale/i);

  const sustained = report.gates.find((gate) => gate.id === "sustained_60fps");
  assert.ok(sustained);
  assert.equal(sustained.label, "INSUFFICIENT EVIDENCE");
  assert.match(sustained.detail, /58\.4 fps/i);
  assert.match(sustained.metricsSummary, /35 frames over 600 ms/i);
  assert.equal(report.verdict.shellDecisionUnlocked, false);
});

test("report renders native frame provenance metrics for webview gates", () => {
  const report = createViewportProofReport([
    {
      id: "zoom_pan",
      passed: true,
      metrics: { frameWidth: 2, frameHeight: 2, frameHash: "a".repeat(64) },
      note: "Zoom/pan measured over native frame.",
    },
    {
      id: "color_managed",
      passed: true,
      metrics: { red: 51, green: 102, blue: 153, alpha: 255, frameHash: "a".repeat(64) },
      note: "Color matched native frame patch.",
    },
  ]);

  const zoomPan = report.gates.find((gate) => gate.id === "zoom_pan");
  assert.ok(zoomPan);
  assert.match(zoomPan.metricsSummary, /native frame: 2×2/i);
  assert.match(zoomPan.metricsSummary, /aaaaaaaaaaaa/i);

  const color = report.gates.find((gate) => gate.id === "color_managed");
  assert.ok(color);
  assert.match(color.metricsSummary, /rgba\(51, 102, 153, 255\)/i);
  assert.match(color.metricsSummary, /native frame hash aaaaaaaaaaaa/i);
});

test("report marks under-floor sustained fps as insufficient evidence", () => {
  const report = createViewportProofReport([
    { id: "gradient", passed: true },
    { id: "raw_frame", passed: true },
    { id: "zoom_pan", passed: true },
    { id: "overlay", passed: true },
    { id: "color_managed", passed: true },
    { id: "sustained_60fps", passed: true, fps: 45 },
  ]);

  const sustained = report.gates.find((gate) => gate.id === "sustained_60fps");
  assert.ok(sustained);
  assert.equal(sustained.label, "INSUFFICIENT EVIDENCE");
  assert.match(sustained.detail, /45 fps/i);
  assert.equal(report.verdict.shellDecisionUnlocked, false);
});
