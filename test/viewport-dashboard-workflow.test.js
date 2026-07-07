import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createViewportProofSessionStore } from "../src/viewport-proof/session-store.js";
import { createViewportProofDashboardWorkflow } from "../src/viewport-proof/dashboard-workflow.js";

async function makeHarness() {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-viewport-dashboard-"));
  let tick = 0;
  const clock = () => `2025-07-18T00:00:0${Math.min(tick++, 9)}.000Z`;
  const sessionStore = await createViewportProofSessionStore({
    path: path.join(dir, "viewport-sessions.json"),
    clock,
  });

  await sessionStore.saveSession("browser-fallback", {
    shell: "browser",
    results: [
      { id: "gradient", passed: false, note: "Placeholder only." },
    ],
  });

  await sessionStore.saveSession("tauri-dev", {
    shell: "tauri-dev",
    results: [
      { id: "gradient", passed: true, note: "Measured in shell." },
      { id: "raw_frame", passed: true, note: "Raw frame proven." },
      { id: "zoom_pan", passed: true, note: "Zoom/pan proven." },
      { id: "overlay", passed: true, note: "Overlay proven." },
      { id: "color_managed", passed: true, note: "Color management proven." },
      { id: "sustained_60fps", passed: true, fps: 62, note: "Sustained frame rate proven." },
    ],
  });

  return createViewportProofDashboardWorkflow({ sessionStore });
}

test("viewport dashboard workflow summarizes unlocked and provisional proof runs", async () => {
  const workflow = await makeHarness();
  const summary = await workflow.summarizeSessions();

  assert.deepEqual(summary.counts, {
    total: 2,
    unlocked: 1,
    provisional: 1,
    proofIssues: 1,
    measuredRuns: 2,
    measuredProofIssues: 1,
    unmeasuredRuns: 0,
    browserShells: 1,
    nonBrowserShells: 1,
  });
  assert.deepEqual(summary.latestSessionIds, ["tauri-dev", "browser-fallback"]);
  assert.deepEqual(summary.latestBrowserShell, {
    sessionId: "browser-fallback",
    shell: "browser",
    updatedAt: "2025-07-18T00:00:00.000Z",
    status: "provisional",
  });
  assert.deepEqual(summary.latestMeasuredRun, {
    sessionId: "tauri-dev",
    shell: "tauri-dev",
    updatedAt: "2025-07-18T00:00:01.000Z",
    status: "unlocked",
    measuredGateCount: 6,
  });
  assert.deepEqual(summary.latestMeasuredProofIssue, {
    sessionId: "browser-fallback",
    shell: "browser",
    updatedAt: "2025-07-18T00:00:00.000Z",
    status: "provisional",
    measuredGateCount: 1,
    remainingGateCount: 6,
  });
  assert.deepEqual(summary.latestProofIssue, {
    sessionId: "browser-fallback",
    shell: "browser",
    updatedAt: "2025-07-18T00:00:00.000Z",
    status: "provisional",
    remainingGateCount: 6,
  });
  assert.equal(summary.latestUnmeasuredRun, null);
  assert.deepEqual(summary.latestNonBrowserShell, {
    sessionId: "tauri-dev",
    shell: "tauri-dev",
    updatedAt: "2025-07-18T00:00:01.000Z",
    status: "unlocked",
  });
  assert.deepEqual(summary.latestUnlocked, {
    sessionId: "tauri-dev",
    shell: "tauri-dev",
    updatedAt: "2025-07-18T00:00:01.000Z",
    passedGates: ["gradient", "raw_frame", "zoom_pan", "overlay", "color_managed", "sustained_60fps"],
  });
  assert.deepEqual(summary.latestProvisional, {
    sessionId: "browser-fallback",
    shell: "browser",
    updatedAt: "2025-07-18T00:00:00.000Z",
    remainingGates: ["gradient", "raw_frame", "zoom_pan", "overlay", "color_managed", "sustained_60fps"],
  });
  assert.deepEqual(summary.bestProgress, {
    sessionId: "tauri-dev",
    shell: "tauri-dev",
    updatedAt: "2025-07-18T00:00:01.000Z",
    status: "unlocked",
    genuinePassCount: 6,
    measuredGateCount: 6,
    remainingGateCount: 0,
  });
});

test("viewport dashboard workflow handles an empty session history", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-viewport-dashboard-empty-"));
  const sessionStore = await createViewportProofSessionStore({
    path: path.join(dir, "viewport-sessions.json"),
    clock: () => "2025-07-18T00:00:00.000Z",
  });
  const workflow = createViewportProofDashboardWorkflow({ sessionStore });
  const summary = await workflow.summarizeSessions();

  assert.deepEqual(summary.counts, {
    total: 0,
    unlocked: 0,
    provisional: 0,
    proofIssues: 0,
    measuredRuns: 0,
    measuredProofIssues: 0,
    unmeasuredRuns: 0,
    browserShells: 0,
    nonBrowserShells: 0,
  });
  assert.deepEqual(summary.latestSessionIds, []);
  assert.equal(summary.latestBrowserShell, null);
  assert.equal(summary.latestMeasuredRun, null);
  assert.equal(summary.latestMeasuredProofIssue, null);
  assert.equal(summary.latestProofIssue, null);
  assert.equal(summary.latestUnmeasuredRun, null);
  assert.equal(summary.latestNonBrowserShell, null);
  assert.equal(summary.latestUnlocked, null);
  assert.equal(summary.latestProvisional, null);
  assert.equal(summary.bestProgress, null);
});

test("viewport dashboard workflow delegates summary shaping to the dashboard foundation", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-viewport-dashboard-delegation-"));
  const sessionStore = await createViewportProofSessionStore({
    path: path.join(dir, "viewport-sessions.json"),
    clock: () => "2025-07-18T00:00:00.000Z",
  });
  await sessionStore.saveSession("browser-fallback", {
    shell: "browser",
    results: [{ id: "gradient", passed: false, note: "Placeholder only." }],
  });

  const calls = [];
  const dashboardFoundation = {
    summarizeSessions(sessions) {
      calls.push(sessions);
      return {
        counts: { total: sessions.length },
        latestSessionIds: ["delegated"],
        latestBrowserShell: null,
        latestMeasuredRun: null,
        latestMeasuredProofIssue: null,
        latestProofIssue: null,
        latestUnmeasuredRun: null,
        latestNonBrowserShell: null,
        latestUnlocked: null,
        latestProvisional: null,
        bestProgress: null,
      };
    },
  };

  const workflow = createViewportProofDashboardWorkflow({ sessionStore, dashboardFoundation });
  const summary = await workflow.summarizeSessions();

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].sessionId, "browser-fallback");
  assert.deepEqual(summary, {
    counts: { total: 1 },
    latestSessionIds: ["delegated"],
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


test("viewport dashboard workflow summarizeSessionsReport returns operation metadata with summary", async () => {
  const workflow = await makeHarness();
  const result = await workflow.summarizeSessionsReport();

  assert.deepEqual(result.operation, {
    kind: "summarize-viewport-proof-sessions",
    requestedSessionIds: ["browser-fallback", "tauri-dev"],
    processedSessionIds: ["browser-fallback", "tauri-dev"],
    skippedSessionIds: [],
  });
  assert.equal(result.summary.counts.total, 2);
  assert.equal(result.summary.counts.proofIssues, 1);
});

test("viewport dashboard workflow summarizeSessionsReport tracks skipped missing session ids", async () => {
  const workflow = createViewportProofDashboardWorkflow({
    sessionStore: {
      async listSessionIds() {
        return ["browser-fallback", "missing-session", "tauri-dev"];
      },
      async getSession(sessionId) {
        if (sessionId === "missing-session") return null;
        return {
          sessionId,
          updatedAt: sessionId === "browser-fallback" ? "2025-07-18T00:00:00.000Z" : "2025-07-18T00:00:01.000Z",
          shell: sessionId === "browser-fallback" ? "browser" : "tauri-dev",
          results: sessionId === "browser-fallback"
            ? [{ id: "gradient", passed: false, note: "Placeholder only." }]
            : [
              { id: "gradient", passed: true, note: "Measured in shell." },
              { id: "raw_frame", passed: true, note: "Raw frame proven." },
              { id: "zoom_pan", passed: true, note: "Zoom/pan proven." },
              { id: "overlay", passed: true, note: "Overlay proven." },
              { id: "color_managed", passed: true, note: "Color management proven." },
              { id: "sustained_60fps", passed: true, fps: 62, note: "Sustained frame rate proven." },
            ],
        };
      },
    },
  });

  const result = await workflow.summarizeSessionsReport();
  assert.deepEqual(result.operation, {
    kind: "summarize-viewport-proof-sessions",
    requestedSessionIds: ["browser-fallback", "missing-session", "tauri-dev"],
    processedSessionIds: ["browser-fallback", "tauri-dev"],
    skippedSessionIds: ["missing-session"],
  });
  assert.equal(result.summary.counts.total, 2);
});
