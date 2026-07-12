import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const platform = process.platform;
const reportPath = path.join(root, ".scratch", "photogenic-foundation", "verification", `smoke-${platform}.json`);

test("smoke script runs and produces a valid report with all steps passing", () => {
  // Run the smoke script
  const output = execSync("node scripts/smoke.mjs", {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
  });

  // Verify console output shows all passing
  assert.match(output, /PASS$/m, "smoke script reports PASS overall");

  // Verify report file exists
  assert.ok(existsSync(reportPath), `smoke report written to ${path.relative(root, reportPath)}`);

  // Parse and verify report structure
  const report = JSON.parse(readFileSync(reportPath, "utf8"));

  assert.ok(report.platform, "report has platform");
  assert.ok(report.startedAt, "report has startedAt");
  assert.ok(report.finishedAt, "report has finishedAt");
  assert.equal(report.overall, "pass");
  assert.ok(Array.isArray(report.steps));
  assert.ok(report.steps.length >= 10, "report has at least 10 steps");

  // Every step must be pass
  for (const step of report.steps) {
    assert.equal(step.status, "pass", `step '${step.name}' passed`);
  }

  // Verify summary counts
  assert.equal(report.summary.passed, report.summary.total);
  assert.equal(report.summary.failed, 0);

  // Verify alpha-critical workflows are all present
  const stepNames = report.steps.map((s) => s.name);
  const required = ["tauri-availability", "pipeline-capabilities", "license-activation", "import", "cull", "develop", "preset", "batch-sync", "export", "viewport-proof"];
  for (const name of required) {
    assert.ok(stepNames.includes(name), `report includes '${name}' step`);
  }
});
