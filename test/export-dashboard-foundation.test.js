import { test } from "node:test";
import assert from "node:assert/strict";
import { createExportDashboardFoundation } from "../src/export/dashboard-foundation.js";

test("export dashboard foundation summarizes deterministic export session metadata", () => {
  const foundation = createExportDashboardFoundation();
  const sessions = [
    {
      sessionId: "export-1",
      imageId: "img-001",
      outputName: "hero-1.jpg",
      status: "queued",
      updatedAt: "2025-07-17T00:00:00.000Z",
    },
    {
      sessionId: "export-2",
      imageId: "img-002",
      outputName: "hero-2.jpg",
      status: "done",
      companionOutput: {
        path: "/exports/hero-2.jpg",
            status: "placeholder-proof",
        sizeBytes: 128,
        contentHash: { algorithm: "sha256", value: "abc" },
        note: "Placeholder proof output only.",
      },
      artifactSidecar: {
        path: "/exports/hero-2.jpg.json",
        kind: "application/json",
        status: "present",
        sizeBytes: 256,
        note: "Export artifact sidecar JSON is present and parseable.",
      },
      updatedAt: "2025-07-17T00:00:01.000Z",
    },
    {
      sessionId: "export-3",
      imageId: "img-003",
      outputName: "hero-3.jpg",
      status: "failed",
      error: "disk full",
      updatedAt: "2025-07-17T00:00:02.000Z",
    },
    {
      sessionId: "export-4",
      imageId: "img-004",
      outputName: "hero-4.jpg",
      status: "running",
      updatedAt: "2025-07-17T00:00:03.000Z",
    },
  ];

  const summary = foundation.summarizeSessions(sessions);

  assert.deepEqual(summary, {
    counts: {
      total: 4,
      queued: 1,
      running: 1,
      done: 1,
      doneWithProofPresent: 1,
      doneWithProofMissing: 0,
      doneWithProofInvalid: 0,
      doneWithProofStale: 0,
      doneWithProofIssue: 0,
      doneWithArtifactSidecarPresent: 1,
      doneWithArtifactSidecarMissing: 0,
      doneWithArtifactSidecarInvalid: 0,
      doneWithArtifactSidecarStale: 0,
      doneWithArtifactSidecarIssue: 0,
      doneWithIntegrityIssue: 0,
      failed: 1,
    },
    latestSessionIds: ["export-4", "export-3", "export-2", "export-1"],
    latestQueued: {
      sessionId: "export-1",
      imageId: "img-001",
      outputName: "hero-1.jpg",
      status: "queued",
      updatedAt: "2025-07-17T00:00:00.000Z",
      companionProof: null,
      artifactSidecar: null,
    },
    latestRunning: {
      sessionId: "export-4",
      imageId: "img-004",
      outputName: "hero-4.jpg",
      status: "running",
      updatedAt: "2025-07-17T00:00:03.000Z",
      companionProof: null,
      artifactSidecar: null,
    },
    latestDone: {
      sessionId: "export-2",
      imageId: "img-002",
      outputName: "hero-2.jpg",
      status: "done",
      updatedAt: "2025-07-17T00:00:01.000Z",
      companionProof: {
        status: "present",
        path: "/exports/hero-2.jpg",
        refreshedStatus: "placeholder-proof",
        note: "Placeholder proof output only.",
      },
      artifactSidecar: {
        status: "present",
        path: "/exports/hero-2.jpg.json",
        refreshedStatus: "present",
        note: "Export artifact sidecar JSON is present and parseable.",
      },
    },
    latestFailed: {
      sessionId: "export-3",
      imageId: "img-003",
      outputName: "hero-3.jpg",
      status: "failed",
      updatedAt: "2025-07-17T00:00:02.000Z",
      companionProof: null,
      artifactSidecar: null,
    },
    latestSessions: [
      {
        sessionId: "export-4",
        imageId: "img-004",
        outputName: "hero-4.jpg",
        status: "running",
        updatedAt: "2025-07-17T00:00:03.000Z",
        companionProof: null,
        artifactSidecar: null,
      },
      {
        sessionId: "export-3",
        imageId: "img-003",
        outputName: "hero-3.jpg",
        status: "failed",
        updatedAt: "2025-07-17T00:00:02.000Z",
        companionProof: null,
        artifactSidecar: null,
      },
      {
        sessionId: "export-2",
        imageId: "img-002",
        outputName: "hero-2.jpg",
        status: "done",
        updatedAt: "2025-07-17T00:00:01.000Z",
        companionProof: {
          status: "present",
          path: "/exports/hero-2.jpg",
          refreshedStatus: "placeholder-proof",
          note: "Placeholder proof output only.",
        },
        artifactSidecar: {
          status: "present",
          path: "/exports/hero-2.jpg.json",
          refreshedStatus: "present",
          note: "Export artifact sidecar JSON is present and parseable.",
        },
      },
      {
        sessionId: "export-1",
        imageId: "img-001",
        outputName: "hero-1.jpg",
        status: "queued",
        updatedAt: "2025-07-17T00:00:00.000Z",
        companionProof: null,
        artifactSidecar: null,
      },
    ],
    latestProofPresent: {
      sessionId: "export-2",
      imageId: "img-002",
      outputName: "hero-2.jpg",
      status: "done",
      updatedAt: "2025-07-17T00:00:01.000Z",
      companionProof: {
        status: "present",
        path: "/exports/hero-2.jpg",
        refreshedStatus: "placeholder-proof",
        note: "Placeholder proof output only.",
      },
      artifactSidecar: {
        status: "present",
        path: "/exports/hero-2.jpg.json",
        refreshedStatus: "present",
        note: "Export artifact sidecar JSON is present and parseable.",
      },
    },
    latestProofIssue: null,
    latestProofMissing: null,
    latestProofInvalid: null,
    latestProofStale: null,
    latestArtifactSidecarPresent: {
      sessionId: "export-2",
      imageId: "img-002",
      outputName: "hero-2.jpg",
      status: "done",
      updatedAt: "2025-07-17T00:00:01.000Z",
      companionProof: {
        status: "present",
        path: "/exports/hero-2.jpg",
        refreshedStatus: "placeholder-proof",
        note: "Placeholder proof output only.",
      },
      artifactSidecar: {
        status: "present",
        path: "/exports/hero-2.jpg.json",
        refreshedStatus: "present",
        note: "Export artifact sidecar JSON is present and parseable.",
      },
    },
    latestIntegrityIssue: null,
    latestArtifactSidecarIssue: null,
    latestArtifactSidecarMissing: null,
    latestArtifactSidecarInvalid: null,
    latestArtifactSidecarStale: null,
    recentFailures: [
      {
        sessionId: "export-3",
        imageId: "img-003",
        outputName: "hero-3.jpg",
        error: "disk full",
        updatedAt: "2025-07-17T00:00:02.000Z",
      },
    ],
  });

  sessions[2].error = "mutated";
  assert.equal(summary.recentFailures[0].error, "disk full");
});

test("export dashboard foundation limits recent failures to the five latest failed sessions", () => {
  const foundation = createExportDashboardFoundation();
  const sessions = Array.from({ length: 7 }, (_, index) => ({
    sessionId: `export-${index + 1}`,
    imageId: `img-00${index + 1}`,
    outputName: `hero-${index + 1}.jpg`,
    status: "failed",
    error: `failure-${index + 1}`,
    updatedAt: `2025-07-17T00:00:0${index}.000Z`,
  }));

  const summary = foundation.summarizeSessions(sessions);

  assert.deepEqual(
    summary.recentFailures.map((failure) => failure.sessionId),
    ["export-7", "export-6", "export-5", "export-4", "export-3"],
  );
});

test("export dashboard foundation surfaces missing refreshed companion proof state for done sessions", () => {
  const foundation = createExportDashboardFoundation();
  const summary = foundation.summarizeSessions([
    {
      sessionId: "export-5",
      imageId: "img-005",
      outputName: "hero-5.jpg",
      status: "done",
      companionOutput: {
        path: "/exports/hero-5.jpg",
            status: "missing",
        sizeBytes: null,
        contentHash: null,
        note: "Expected placeholder proof output is missing on disk.",
      },
      artifactSidecar: {
        path: "/exports/hero-5.jpg.json",
        kind: "application/json",
        status: "invalid",
        sizeBytes: null,
        note: "Export artifact sidecar JSON could not be parsed from disk.",
      },
      updatedAt: "2025-07-17T00:00:04.000Z",
    },
  ]);

  assert.equal(summary.counts.doneWithProofPresent, 0);
  assert.equal(summary.counts.doneWithProofMissing, 1);
  assert.equal(summary.counts.doneWithProofIssue, 1);
  assert.equal(summary.latestQueued, null);
  assert.equal(summary.latestRunning, null);
  assert.equal(summary.latestDone.sessionId, "export-5");
  assert.equal(summary.latestFailed, null);
  assert.equal(summary.counts.doneWithProofInvalid, 0);
  assert.equal(summary.counts.doneWithProofStale, 0);
  assert.equal(summary.counts.doneWithProofStale, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarPresent, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarMissing, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarInvalid, 1);
  assert.equal(summary.counts.doneWithArtifactSidecarStale, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarIssue, 1);
  assert.equal(summary.latestProofPresent, null);
  assert.equal(summary.latestProofIssue.sessionId, "export-5");
  assert.equal(summary.latestProofMissing.sessionId, "export-5");
  assert.equal(summary.latestProofInvalid, null);
  assert.equal(summary.latestProofStale, null);
  assert.equal(summary.latestArtifactSidecarPresent, null);
  assert.equal(summary.latestIntegrityIssue.sessionId, "export-5");
  assert.equal(summary.latestArtifactSidecarIssue.sessionId, "export-5");
  assert.equal(summary.latestArtifactSidecarMissing, null);
  assert.equal(summary.latestArtifactSidecarInvalid.sessionId, "export-5");
  assert.equal(summary.latestArtifactSidecarStale, null);
  assert.deepEqual(summary.latestSessions, [
    {
      sessionId: "export-5",
      imageId: "img-005",
      outputName: "hero-5.jpg",
      status: "done",
      updatedAt: "2025-07-17T00:00:04.000Z",
      companionProof: {
        status: "missing",
        path: "/exports/hero-5.jpg",
        refreshedStatus: "missing",
        note: "Expected placeholder proof output is missing on disk.",
      },
      artifactSidecar: {
        status: "invalid",
        path: "/exports/hero-5.jpg.json",
        refreshedStatus: "invalid",
        note: "Export artifact sidecar JSON could not be parsed from disk.",
      },
    },
  ]);
});


test("export dashboard foundation surfaces invalid refreshed artifact sidecar state for done sessions", () => {
  const foundation = createExportDashboardFoundation();
  const summary = foundation.summarizeSessions([
    {
      sessionId: "export-6",
      imageId: "img-006",
      outputName: "hero-6.jpg",
      outputPath: "/exports/hero-6.jpg.json",
      status: "done",
      artifactSidecar: {
        path: "/exports/hero-6.jpg.json",
        kind: "application/json",
        status: "invalid",
        sizeBytes: null,
        note: "Export artifact sidecar JSON could not be parsed from disk.",
      },
      updatedAt: "2025-07-17T00:00:05.000Z",
    },
  ]);

  assert.equal(summary.counts.doneWithArtifactSidecarPresent, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarMissing, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarInvalid, 1);
  assert.equal(summary.counts.doneWithArtifactSidecarStale, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarIssue, 1);
  assert.equal(summary.latestArtifactSidecarPresent, null);
  assert.equal(summary.latestArtifactSidecarMissing, null);
  assert.equal(summary.latestArtifactSidecarInvalid.sessionId, "export-6");
  assert.deepEqual(summary.latestSessions[0].artifactSidecar, {
    status: "invalid",
    path: "/exports/hero-6.jpg.json",
    refreshedStatus: "invalid",
    note: "Export artifact sidecar JSON could not be parsed from disk.",
  });
});


test("export dashboard foundation treats rendered png companions as present proof state", () => {
  const foundation = createExportDashboardFoundation();
  const summary = foundation.summarizeSessions([
    {
      sessionId: "export-png",
      imageId: "img-200",
      outputName: "hero.png",
      outputPath: "/exports/hero.png.json",
      status: "done",
      updatedAt: "2025-07-18T00:00:00.000Z",
      companionOutput: {
        path: "/exports/hero.png",
            status: "rendered-image",
        sizeBytes: 2048,
        contentHash: { algorithm: "sha256", value: "abc" },
        width: 1200,
        height: 800,
        note: "Deterministic software-rendered PNG bytes are present on disk.",
      },
      artifactSidecar: {
        path: "/exports/hero.png.json",
        kind: "application/json",
        status: "present",
        sizeBytes: 512,
        note: "Export artifact sidecar JSON is present and parseable.",
      },
    },
  ]);

  assert.equal(summary.counts.doneWithProofPresent, 1);
  assert.equal(summary.counts.doneWithProofMissing, 0);
  assert.equal(summary.latestQueued, null);
  assert.equal(summary.latestRunning, null);
  assert.equal(summary.latestDone.sessionId, "export-png");
  assert.equal(summary.latestFailed, null);
  assert.equal(summary.counts.doneWithProofInvalid, 0);
  assert.equal(summary.latestProofPresent.sessionId, "export-png");
  assert.equal(summary.latestProofMissing, null);
  assert.equal(summary.latestProofInvalid, null);
  assert.deepEqual(summary.latestSessions[0].companionProof, {
    status: "present",
    path: "/exports/hero.png",
    refreshedStatus: "rendered-image",
    note: "Deterministic software-rendered PNG bytes are present on disk.",
  });
});




test("export dashboard foundation treats rendered TIFF-16 companions as present proof state", () => {
  const foundation = createExportDashboardFoundation();
  const summary = foundation.summarizeSessions([
    {
      sessionId: "export-tiff",
      imageId: "img-202",
      outputName: "hero.tiff",
      outputPath: "/exports/hero.tiff.json",
      status: "done",
      updatedAt: "2025-07-18T00:00:02.000Z",
      companionOutput: {
        path: "/exports/hero.tiff",
            status: "rendered-image",
        sizeBytes: 4096,
        contentHash: { algorithm: "sha256", value: "def" },
        width: 1200,
        height: 800,
        note: "Deterministic software-rendered TIFF-16 bytes are present on disk.",
      },
      artifactSidecar: {
        path: "/exports/hero.tiff.json",
        kind: "application/json",
        status: "present",
        sizeBytes: 512,
        note: "Export artifact sidecar JSON is present and parseable.",
      },
    },
  ]);

  assert.equal(summary.counts.doneWithProofPresent, 1);
  assert.equal(summary.latestDone.sessionId, "export-tiff");
  assert.equal(summary.latestProofPresent.sessionId, "export-tiff");
  assert.deepEqual(summary.latestSessions[0].companionProof, {
    status: "present",
    path: "/exports/hero.tiff",
    refreshedStatus: "rendered-image",
    note: "Deterministic software-rendered TIFF-16 bytes are present on disk.",
  });
});
test("export dashboard foundation surfaces invalid rendered png companion state for done sessions", () => {
  const foundation = createExportDashboardFoundation();
  const summary = foundation.summarizeSessions([
    {
      sessionId: "export-invalid-png",
      imageId: "img-201",
      outputName: "hero-invalid.png",
      outputPath: "/exports/hero-invalid.png.json",
      status: "done",
      updatedAt: "2025-07-18T00:00:01.000Z",
      companionOutput: {
        path: "/exports/hero-invalid.png",
            status: "invalid",
        sizeBytes: null,
        contentHash: null,
        width: null,
        height: null,
        note: "Rendered PNG output is present but is not a valid PNG. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.",
      },
    },
  ]);

  assert.equal(summary.counts.doneWithProofPresent, 0);
  assert.equal(summary.counts.doneWithProofMissing, 0);
  assert.equal(summary.latestQueued, null);
  assert.equal(summary.latestRunning, null);
  assert.equal(summary.latestDone.sessionId, "export-invalid-png");
  assert.equal(summary.latestFailed, null);
  assert.equal(summary.counts.doneWithProofInvalid, 1);
  assert.equal(summary.latestProofPresent, null);
  assert.equal(summary.latestProofMissing, null);
  assert.equal(summary.latestProofInvalid.sessionId, "export-invalid-png");
  assert.deepEqual(summary.latestSessions[0].companionProof, {
    status: "invalid",
    path: "/exports/hero-invalid.png",
    refreshedStatus: "invalid",
    note: "Rendered PNG output is present but is not a valid PNG. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.",
  });
});




test("export dashboard foundation surfaces invalid rendered tiff companion state for done sessions", () => {
  const foundation = createExportDashboardFoundation();
  const summary = foundation.summarizeSessions([
    {
      sessionId: "export-invalid-tiff",
      imageId: "img-203",
      outputName: "hero-invalid.tiff",
      outputPath: "/exports/hero-invalid.tiff.json",
      status: "done",
      updatedAt: "2025-07-18T00:00:03.000Z",
      companionOutput: {
        path: "/exports/hero-invalid.tiff",
            status: "invalid",
        sizeBytes: null,
        contentHash: null,
        width: null,
        height: null,
        note: "Rendered TIFF-16 output is present but is not a valid TIFF. This seam verifies deterministic software-rendered TIFF-16 bytes, not the final RAW/GPU pipeline.",
      },
    },
  ]);

  assert.equal(summary.counts.doneWithProofPresent, 0);
  assert.equal(summary.counts.doneWithProofInvalid, 1);
  assert.equal(summary.latestDone.sessionId, "export-invalid-tiff");
  assert.equal(summary.latestProofInvalid.sessionId, "export-invalid-tiff");
  assert.deepEqual(summary.latestSessions[0].companionProof, {
    status: "invalid",
    path: "/exports/hero-invalid.tiff",
    refreshedStatus: "invalid",
    note: "Rendered TIFF-16 output is present but is not a valid TIFF. This seam verifies deterministic software-rendered TIFF-16 bytes, not the final RAW/GPU pipeline.",
  });
});
test("export dashboard foundation surfaces stale rendered png companion state for done sessions", () => {
  const foundation = createExportDashboardFoundation();
  const summary = foundation.summarizeSessions([
    {
      sessionId: "export-stale",
      imageId: "img-201",
      outputName: "hero-stale.png",
      status: "done",
      companionOutput: {
        path: "/exports/hero-stale.png",
            status: "stale",
        sizeBytes: 1234,
        contentHash: { algorithm: "sha256", value: "stale-hash" },
        width: 1000,
        height: 700,
        note: "Rendered PNG output is present but no longer matches the expected deterministic export output for this artifact.",
      },
      artifactSidecar: {
        path: "/exports/hero-stale.png.json",
        kind: "application/json",
        status: "present",
        sizeBytes: 456,
        note: "Export artifact sidecar JSON is present and parseable.",
      },
      updatedAt: "2025-07-17T00:00:08.000Z",
    },
  ]);

  assert.equal(summary.counts.doneWithProofPresent, 0);
  assert.equal(summary.counts.doneWithProofMissing, 0);
  assert.equal(summary.counts.doneWithProofInvalid, 0);
  assert.equal(summary.counts.doneWithProofStale, 1);
  assert.equal(summary.counts.doneWithProofIssue, 1);
  assert.equal(summary.counts.doneWithIntegrityIssue, 1);
  assert.equal(summary.latestProofPresent, null);
  assert.equal(summary.latestProofIssue.sessionId, "export-stale");
  assert.equal(summary.latestProofMissing, null);
  assert.equal(summary.latestProofInvalid, null);
  assert.equal(summary.latestProofStale.sessionId, "export-stale");
  assert.equal(summary.latestIntegrityIssue.sessionId, "export-stale");
  assert.deepEqual(summary.latestSessions[0].companionProof, {
    status: "stale",
    path: "/exports/hero-stale.png",
    refreshedStatus: "stale",
    note: "Rendered PNG output is present but no longer matches the expected deterministic export output for this artifact.",
  });
});




test("export dashboard foundation surfaces stale rendered tiff companion state for done sessions", () => {
  const foundation = createExportDashboardFoundation();
  const summary = foundation.summarizeSessions([
    {
      sessionId: "export-stale-tiff",
      imageId: "img-204",
      outputName: "hero-stale.tiff",
      status: "done",
      companionOutput: {
        path: "/exports/hero-stale.tiff",
            status: "stale",
        sizeBytes: 1234,
        contentHash: { algorithm: "sha256", value: "stale-hash" },
        width: 64,
        height: 48,
        note: "Rendered TIFF-16 output is present but no longer matches the expected deterministic export output for this artifact. This seam verifies deterministic software-rendered TIFF-16 bytes, not the final RAW/GPU pipeline.",
      },
      artifactSidecar: {
        path: "/exports/hero-stale.tiff.json",
        kind: "application/json",
        status: "present",
        sizeBytes: 456,
        note: "Export artifact sidecar JSON is present and parseable.",
      },
      updatedAt: "2025-07-18T00:00:04.000Z",
    },
  ]);

  assert.equal(summary.counts.doneWithProofStale, 1);
  assert.equal(summary.counts.doneWithProofIssue, 1);
  assert.equal(summary.counts.doneWithIntegrityIssue, 1);
  assert.equal(summary.latestProofStale.sessionId, "export-stale-tiff");
  assert.equal(summary.latestProofIssue.sessionId, "export-stale-tiff");
  assert.equal(summary.latestIntegrityIssue.sessionId, "export-stale-tiff");
  assert.deepEqual(summary.latestSessions[0].companionProof, {
    status: "stale",
    path: "/exports/hero-stale.tiff",
    refreshedStatus: "stale",
    note: "Rendered TIFF-16 output is present but no longer matches the expected deterministic export output for this artifact. This seam verifies deterministic software-rendered TIFF-16 bytes, not the final RAW/GPU pipeline.",
  });
});
test("export dashboard foundation surfaces stale artifact sidecar state for done sessions", () => {
  const foundation = createExportDashboardFoundation();
  const summary = foundation.summarizeSessions([
    {
      sessionId: "export-sidecar-stale",
      imageId: "img-300",
      outputName: "hero-sidecar-stale.png",
      status: "done",
      companionOutput: {
        path: "/exports/hero-sidecar-stale.png",
            status: "rendered-image",
        sizeBytes: 1024,
        contentHash: { algorithm: "sha256", value: "ok" },
        width: 1200,
        height: 800,
        note: "Deterministic software-rendered PNG bytes are present on disk.",
      },
      artifactSidecar: {
        path: "/exports/hero-sidecar-stale.png.json",
        kind: "application/json",
        status: "stale",
        sizeBytes: 256,
        note: "Export artifact sidecar JSON is parseable but no longer matches the expected export artifact identity for this output path.",
      },
      updatedAt: "2025-07-17T00:00:09.000Z",
    },
  ]);

  assert.equal(summary.counts.doneWithArtifactSidecarPresent, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarMissing, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarInvalid, 0);
  assert.equal(summary.counts.doneWithArtifactSidecarStale, 1);
  assert.equal(summary.counts.doneWithArtifactSidecarIssue, 1);
  assert.equal(summary.counts.doneWithIntegrityIssue, 1);
  assert.equal(summary.latestArtifactSidecarPresent, null);
  assert.equal(summary.latestArtifactSidecarMissing, null);
  assert.equal(summary.latestArtifactSidecarInvalid, null);
  assert.equal(summary.latestArtifactSidecarStale.sessionId, "export-sidecar-stale");
  assert.equal(summary.latestArtifactSidecarIssue.sessionId, "export-sidecar-stale");
  assert.equal(summary.latestIntegrityIssue.sessionId, "export-sidecar-stale");
  assert.deepEqual(summary.latestSessions[0].artifactSidecar, {
    status: "stale",
    path: "/exports/hero-sidecar-stale.png.json",
    refreshedStatus: "stale",
    note: "Export artifact sidecar JSON is parseable but no longer matches the expected export artifact identity for this output path.",
  });
});

test("export dashboard foundation treats rendered JPEG companions as present proof state", () => {
  const foundation = createExportDashboardFoundation();
  const summary = foundation.summarizeSessions([
    {
      sessionId: "export-jpeg",
      imageId: "img-401",
      outputName: "hero.jpg",
      status: "done",
      companionOutput: {
        path: "/exports/hero.jpg",
        kind: "image/jpeg",
        status: "rendered-image",
        sizeBytes: 2048,
        contentHash: { algorithm: "sha256", value: "jpeg-ok" },
        width: 2400,
        height: 1600,
        note: "Deterministic software-rendered JPEG bytes are present on disk.",
      },
      artifactSidecar: {
        path: "/exports/hero.jpg.json",
        kind: "application/json",
        status: "present",
        sizeBytes: 256,
        note: "Export artifact sidecar JSON is present and parseable.",
      },
      updatedAt: "2025-07-25T00:00:00.000Z",
    },
  ]);

  assert.equal(summary.counts.doneWithProofPresent, 1);
  assert.equal(summary.counts.doneWithProofIssue, 0);
  assert.equal(summary.latestProofPresent.sessionId, "export-jpeg");
  assert.deepEqual(summary.latestSessions[0].companionProof, {
    status: "present",
    path: "/exports/hero.jpg",
    refreshedStatus: "rendered-image",
    note: "Deterministic software-rendered JPEG bytes are present on disk.",
  });
});
