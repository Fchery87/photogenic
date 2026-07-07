import { test } from "node:test";
import assert from "node:assert/strict";
import { createViewportProofDashboardFoundation } from "../src/viewport-proof/dashboard-foundation.js";

test("viewport dashboard foundation summarizes deterministic proof session metadata", () => {
  const foundation = createViewportProofDashboardFoundation();
  const sessions = [
    {
      sessionId: "browser-fallback",
      shell: "browser",
      updatedAt: "2025-07-18T00:00:00.000Z",
      results: [{ id: "gradient", passed: false, note: "Placeholder only." }],
      verdict: {
        shellDecisionUnlocked: false,
        passedGates: [],
        remainingGates: ["gradient", "raw_frame", "zoom_pan", "overlay", "color_managed", "sustained_60fps"],
      },
    },
    {
      sessionId: "tauri-dev",
      shell: "tauri-dev",
      updatedAt: "2025-07-18T00:00:01.000Z",
      results: [
        { id: "gradient", passed: true, note: "Measured in shell." },
        { id: "raw_frame", passed: true, note: "Raw frame proven." },
        { id: "zoom_pan", passed: true, note: "Zoom/pan proven." },
        { id: "overlay", passed: true, note: "Overlay proven." },
        { id: "color_managed", passed: true, note: "Color management proven." },
        { id: "sustained_60fps", passed: true, fps: 62, note: "Sustained frame rate proven." },
      ],
      verdict: {
        shellDecisionUnlocked: true,
        passedGates: ["gradient", "raw_frame", "zoom_pan", "overlay", "color_managed", "sustained_60fps"],
        remainingGates: [],
      },
    },
  ];

  const summary = foundation.summarizeSessions(sessions);

  assert.deepEqual(summary, {
    counts: {
      total: 2,
      unlocked: 1,
      provisional: 1,
      proofIssues: 1,
      measuredRuns: 2,
      measuredProofIssues: 1,
      unmeasuredRuns: 0,
      browserShells: 1,
      nonBrowserShells: 1,
    },
    latestSessionIds: ["tauri-dev", "browser-fallback"],
    latestBrowserShell: {
      sessionId: "browser-fallback",
      shell: "browser",
      updatedAt: "2025-07-18T00:00:00.000Z",
      status: "provisional",
    },
    latestMeasuredRun: {
      sessionId: "tauri-dev",
      shell: "tauri-dev",
      updatedAt: "2025-07-18T00:00:01.000Z",
      status: "unlocked",
      measuredGateCount: 6,
    },
    latestMeasuredProofIssue: {
      sessionId: "browser-fallback",
      shell: "browser",
      updatedAt: "2025-07-18T00:00:00.000Z",
      status: "provisional",
      measuredGateCount: 1,
      remainingGateCount: 6,
    },
    latestProofIssue: {
      sessionId: "browser-fallback",
      shell: "browser",
      updatedAt: "2025-07-18T00:00:00.000Z",
      status: "provisional",
      remainingGateCount: 6,
    },
    latestUnmeasuredRun: null,
    latestNonBrowserShell: {
      sessionId: "tauri-dev",
      shell: "tauri-dev",
      updatedAt: "2025-07-18T00:00:01.000Z",
      status: "unlocked",
    },
    latestUnlocked: {
      sessionId: "tauri-dev",
      shell: "tauri-dev",
      updatedAt: "2025-07-18T00:00:01.000Z",
      passedGates: ["gradient", "raw_frame", "zoom_pan", "overlay", "color_managed", "sustained_60fps"],
    },
    latestProvisional: {
      sessionId: "browser-fallback",
      shell: "browser",
      updatedAt: "2025-07-18T00:00:00.000Z",
      remainingGates: ["gradient", "raw_frame", "zoom_pan", "overlay", "color_managed", "sustained_60fps"],
    },
    bestProgress: {
      sessionId: "tauri-dev",
      shell: "tauri-dev",
      updatedAt: "2025-07-18T00:00:01.000Z",
      status: "unlocked",
      genuinePassCount: 6,
      measuredGateCount: 6,
      remainingGateCount: 0,
    },
  });

  sessions[1].verdict.passedGates.push("mutated");
  assert.equal(summary.latestUnlocked.passedGates.includes("mutated"), false);
});

test("viewport dashboard foundation handles empty session history", () => {
  const foundation = createViewportProofDashboardFoundation();
  const summary = foundation.summarizeSessions();

  assert.deepEqual(summary, {
    counts: {
      total: 0,
      unlocked: 0,
      provisional: 0,
      proofIssues: 0,
      measuredRuns: 0,
      measuredProofIssues: 0,
      unmeasuredRuns: 0,
      browserShells: 0,
      nonBrowserShells: 0,
    },
    latestSessionIds: [],
    latestBrowserShell: null,
    latestMeasuredRun: null,
    latestMeasuredProofIssue: null,
    latestProofIssue: null,
    latestUnmeasuredRun: null,
    latestNonBrowserShell: null,
    latestUnlocked: null,
    latestProvisional: null,
    bestProgress: null,
  });
});
