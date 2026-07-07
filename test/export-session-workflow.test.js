import { mkdtemp, readFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createExportFoundation } from "../src/export/foundation.js";
import { createExportSessionStore } from "../src/export/session-store.js";
import { createExportSessionWorkflow } from "../src/export/session-workflow.js";
import { createExportWorkflow } from "../src/export/workflow.js";

function buildSource() {
  return {
    imageId: "img-001",
    path: "/shoots/day1/hero-image.CR3",
    width: 6000,
    height: 4000,
    revision: "source-v1",
    colorSpace: "scene-linear",
  };
}

function buildRecipe() {
  return createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] });
}

async function makeHarness({ exportFoundation } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-session-workflow-"));
  const clockValues = [
    "2025-07-13T00:00:00.000Z",
    "2025-07-13T00:00:01.000Z",
    "2025-07-13T00:00:02.000Z",
    "2025-07-13T00:00:03.000Z",
    "2025-07-13T00:00:04.000Z",
    "2025-07-13T00:00:05.000Z",
  ];
  let index = 0;
  const storePath = path.join(dir, "export-sessions.json");
  const sessionStore = await createExportSessionStore({
    path: storePath,
    clock: () => clockValues[index++] ?? clockValues.at(-1),
  });
  const workflow = createExportSessionWorkflow({
    sessionStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: exportFoundation ?? createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
    }),
  });
  return { dir, storePath, sessionStore, workflow };
}

test("export session workflow saves queued jobs and reloads them deterministically", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 7 },
    options: { format: "png", quality: 95 },
  });

  const saved = await workflow.loadJob(queued.jobId);
  assert.equal(saved.status, "queued");
  assert.equal(saved.outputName, "hero-image_7.png");
  assert.deepEqual(saved.recipe.operations, [{ type: "exposure", params: { ev: 0.4 } }]);

  const reloadedStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:06.000Z" });
  const reloadedWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
    }),
  });

  const restored = await reloadedWorkflow.reloadJobs();
  assert.equal(restored.length, 1);
  assert.deepEqual(restored[0], queued);
  assert.deepEqual(reloadedWorkflow.exportWorkflow.inspect(queued.jobId), queued);

  const rerun = await reloadedWorkflow.runJob(queued.jobId);
  const written = JSON.parse(await readFile(queued.artifactPath, "utf8"));
  assert.equal(rerun.job.status, "done");
  assert.equal(written.outputName, "hero-image_7.png");
  assert.equal(rerun.session.companionOutput.path, written.companionOutput.path);
  assert.equal(rerun.session.companionOutput.kind, "image/png");
  assert.ok(rerun.session.companionOutput.sizeBytes > 0);
  assert.equal(rerun.session.companionOutput.contentHash.algorithm, "sha256");
  assert.equal(rerun.session.artifactSidecar.path, queued.artifactPath);
  assert.equal(rerun.session.artifactSidecar.kind, "application/json");
  assert.equal(rerun.session.artifactSidecar.status, "present");
  assert.ok(rerun.session.artifactSidecar.sizeBytes > 0);

  const postRunStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:07.000Z" });
  const postRunWorkflow = createExportSessionWorkflow({
    sessionStore: postRunStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
    }),
  });
  const restoredDone = await postRunWorkflow.reloadJobs();
  assert.equal(restoredDone[0].status, "done");
  assert.equal(restoredDone[0].companionOutput.kind, "image/png");
  assert.ok(restoredDone[0].companionOutput.sizeBytes > 0);
  assert.equal(restoredDone[0].artifactSidecar.kind, "application/json");
  assert.equal(restoredDone[0].artifactSidecar.status, "present");
  assert.ok(restoredDone[0].artifactSidecar.sizeBytes > 0);
  assert.equal(postRunWorkflow.exportWorkflow.inspect(queued.jobId).companionOutput.contentHash.algorithm, "sha256");
  assert.equal(postRunWorkflow.exportWorkflow.inspect(queued.jobId).artifactSidecar.status, "present");

  await unlink(path.join(dir, "hero-image_7.png"));
  const missingProofStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:08.000Z" });
  const missingProofWorkflow = createExportSessionWorkflow({
    sessionStore: missingProofStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
    }),
  });
  const restoredMissingProof = await missingProofWorkflow.reloadJobs();
  assert.equal(restoredMissingProof[0].status, "done");
  assert.deepEqual(restoredMissingProof[0].companionOutput, {
    path: path.join(dir, "hero-image_7.png"),
    kind: "image/png",
    status: "missing",
    sizeBytes: null,
    contentHash: null,
    width: null,
    height: null,
    note: "Expected rendered PNG output is missing on disk. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.",
  });
  const updatedMissingProofSession = await missingProofWorkflow.loadJob(queued.jobId);
  assert.equal(updatedMissingProofSession.companionOutput.status, "missing");
  assert.equal(updatedMissingProofSession.artifactSidecar.status, "present");
});



test("export session workflow reloads done TIFF-16 jobs with rendered-image metadata", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 15 },
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await workflow.runJob(queued.jobId);

  const reloadedStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:09.000Z" });
  const reloadedWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
    }),
  });

  const restored = await reloadedWorkflow.reloadJobs();
  assert.equal(restored[0].status, "done");
  assert.equal(restored[0].companionOutput.kind, "image/tiff");
  assert.equal(restored[0].companionOutput.status, "rendered-image");
  assert.equal(restored[0].companionOutput.width, 120);
  assert.equal(restored[0].companionOutput.height, 80);
  assert.equal((await reloadedWorkflow.loadJob(queued.jobId)).companionOutput.kind, "image/tiff");
});
test("export session workflow persists running state and reloads it before completion", async () => {
  let releaseWrite;
  const writeStarted = new Promise((resolve) => {
    releaseWrite = resolve;
  });
  let unblockWrite;
  const writeBlocked = new Promise((resolve) => {
    unblockWrite = resolve;
  });

  const { dir, storePath, workflow } = await makeHarness({
    exportFoundation: {
      async writeArtifact(outputPath, payload) {
        releaseWrite();
        await writeBlocked;
        return createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }).writeArtifact(outputPath, payload);
      },
    },
  });

  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}",
  });

  const runPromise = workflow.runJob(queued.jobId);
  await writeStarted;
  const running = await workflow.loadJob(queued.jobId);
  assert.equal(running.status, "running");
  assert.equal(running.companionOutput, null);
  assert.equal(running.artifactSidecar, null);

  const reloadedStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:06.000Z" });
  const reloadedWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedStore,
    exportWorkflow: createExportWorkflow(),
  });

  await reloadedWorkflow.reloadJobs();
  assert.equal(reloadedWorkflow.exportWorkflow.inspect(queued.jobId).status, "running");

  unblockWrite();
  const result = await runPromise;
  assert.equal(result.job.status, "done");
});

test("export session workflow persists failed jobs and reloads explicit failure state", async () => {
  const { storePath, workflow } = await makeHarness({
    exportFoundation: {
      async writeArtifact() {
        throw new Error("disk offline");
      },
    },
  });

  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: "/exports",
    namingTemplate: "{baseName}",
  });

  const failed = await workflow.runJob(queued.jobId);
  assert.equal(failed.job.status, "failed");
  assert.match(failed.session.error, /disk offline/i);

  const reloadedStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:06.000Z" });
  const reloadedWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedStore,
    exportWorkflow: createExportWorkflow(),
  });

  await reloadedWorkflow.reloadJobs();
  const restored = reloadedWorkflow.exportWorkflow.inspect(queued.jobId);
  assert.equal(restored.status, "failed");
  assert.match(restored.error, /disk offline/i);
});


test("export session workflow reloads invalid rendered png companions honestly", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 9 },
    options: { format: "png", quality: 95 },
  });
  await workflow.runJob(queued.jobId);

  await (await import("node:fs/promises")).writeFile(path.join(dir, "hero-image_9.png"), "not-a-png\n", "utf8");
  const invalidProofStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:08.000Z" });
  const invalidProofWorkflow = createExportSessionWorkflow({
    sessionStore: invalidProofStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
    }),
  });
  const restoredInvalidProof = await invalidProofWorkflow.reloadJobs();
  assert.equal(restoredInvalidProof[0].status, "done");
  assert.deepEqual(restoredInvalidProof[0].companionOutput, {
    path: path.join(dir, "hero-image_9.png"),
    kind: "image/png",
    status: "invalid",
    sizeBytes: null,
    contentHash: null,
    width: null,
    height: null,
    note: "Rendered PNG output is present but is not a valid PNG. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.",
  });
  const updatedInvalidProofSession = await invalidProofWorkflow.loadJob(queued.jobId);
  assert.equal(updatedInvalidProofSession.companionOutput.status, "invalid");
  assert.equal(updatedInvalidProofSession.artifactSidecar.status, "present");
});




test("export session workflow reloads invalid rendered tiff companions honestly", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 16 },
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await workflow.runJob(queued.jobId);

  await (await import("node:fs/promises")).writeFile(path.join(dir, "hero-image_16.tiff"), "not-a-tiff\n", "utf8");
  const invalidProofStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:10.000Z" });
  const invalidProofWorkflow = createExportSessionWorkflow({
    sessionStore: invalidProofStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
    }),
  });
  const restoredInvalidProof = await invalidProofWorkflow.reloadJobs();
  assert.equal(restoredInvalidProof[0].status, "done");
  assert.deepEqual(restoredInvalidProof[0].companionOutput, {
    path: path.join(dir, "hero-image_16.tiff"),
    kind: "image/tiff",
    status: "invalid",
    sizeBytes: null,
    contentHash: null,
    width: null,
    height: null,
    note: "Rendered TIFF-16 output is present but is not a valid TIFF. This seam verifies deterministic software-rendered TIFF-16 bytes, not the final RAW/GPU pipeline.",
  });
  assert.equal((await invalidProofWorkflow.loadJob(queued.jobId)).companionOutput.status, "invalid");
});
test("export session workflow rerunJob repairs broken done png exports and persists healthy metadata", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 11 },
    options: { format: "png", quality: 95 },
  });
  await workflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image_11.png"));
  await (await import("node:fs/promises")).writeFile(path.join(dir, "hero-image_11.png.json"), `not-json
`, "utf8");

  const repairedStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:08.000Z" });
  const repairedWorkflow = createExportSessionWorkflow({
    sessionStore: repairedStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
    }),
  });
  await repairedWorkflow.reloadJobs();
  const broken = await repairedWorkflow.loadJob(queued.jobId);
  assert.equal(broken.companionOutput.status, "missing");
  assert.equal(broken.artifactSidecar.status, "invalid");

  const repaired = await repairedWorkflow.rerunJob(queued.jobId);
  assert.equal(repaired.job.status, "done");
  assert.equal(repaired.session.companionOutput.status, "rendered-image");
  assert.equal(repaired.session.artifactSidecar.status, "present");
  assert.equal((await repairedWorkflow.loadJob(queued.jobId)).companionOutput.status, "rendered-image");
  assert.equal((await repairedWorkflow.loadJob(queued.jobId)).artifactSidecar.status, "present");
});




test("export session workflow rerunJob repairs broken done tiff exports and persists healthy metadata", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 18 },
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await workflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image_18.tiff"));
  await (await import("node:fs/promises")).writeFile(path.join(dir, "hero-image_18.tiff.json"), `not-json
`, "utf8");

  const repairedStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:12.000Z" });
  const repairedWorkflow = createExportSessionWorkflow({
    sessionStore: repairedStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
    }),
  });
  await repairedWorkflow.reloadJobs();
  const broken = await repairedWorkflow.loadJob(queued.jobId);
  assert.equal(broken.companionOutput.kind, "image/tiff");
  assert.equal(broken.companionOutput.status, "missing");
  assert.equal(broken.artifactSidecar.status, "invalid");

  const repaired = await repairedWorkflow.rerunJob(queued.jobId);
  assert.equal(repaired.job.status, "done");
  assert.equal(repaired.session.companionOutput.kind, "image/tiff");
  assert.equal(repaired.session.companionOutput.status, "rendered-image");
  assert.equal(repaired.session.artifactSidecar.status, "present");
  assert.equal((await repairedWorkflow.loadJob(queued.jobId)).companionOutput.status, "rendered-image");
  const output = await readFile(path.join(dir, "hero-image_18.tiff"));
  assert.equal(output.subarray(0, 2).toString("ascii"), "II");
  assert.equal(output.readUInt16LE(2), 42);
});
test("export session workflow reloads stale rendered png companions honestly", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 10 },
    options: { format: "png", quality: 95 },
  });
  await workflow.runJob(queued.jobId);

  const mismatchWorkflow = createExportWorkflow({
    exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
  });
  const mismatchQueued = mismatchWorkflow.queueExport({
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "contrast", params: { amount: 12 } }] }),
    destinationDir: dir,
    namingTemplate: "mismatch-{baseName}",
    options: { format: "png", quality: 95, resize: { width: 1000, height: 700 } },
  });
  await mismatchWorkflow.runJob(mismatchQueued.jobId);
  await (await import("node:fs/promises")).copyFile(path.join(dir, "mismatch-hero-image.png"), path.join(dir, "hero-image_10.png"));

  const staleProofStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:08.000Z" });
  const staleProofWorkflow = createExportSessionWorkflow({
    sessionStore: staleProofStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
    }),
  });
  const restoredStaleProof = await staleProofWorkflow.reloadJobs();
  assert.equal(restoredStaleProof[0].status, "done");
  assert.equal(restoredStaleProof[0].companionOutput.status, "stale");
  assert.equal(restoredStaleProof[0].companionOutput.width, 1000);
  assert.equal(restoredStaleProof[0].companionOutput.height, 700);
  assert.match(restoredStaleProof[0].companionOutput.note, /no longer matches the expected deterministic export output/i);
  const updatedStaleProofSession = await staleProofWorkflow.loadJob(queued.jobId);
  assert.equal(updatedStaleProofSession.companionOutput.status, "stale");
  assert.equal(updatedStaleProofSession.artifactSidecar.status, "present");
});


test("export session workflow reloads stale artifact sidecars honestly", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 12 },
    options: { format: "png", quality: 95 },
  });
  await workflow.runJob(queued.jobId);

  const staleArtifact = JSON.parse(await readFile(queued.artifactPath, "utf8"));
  staleArtifact.outputName = "swapped-image.png";
  staleArtifact.companionOutput.path = path.join(dir, "swapped-image.png");
  await (await import("node:fs/promises")).writeFile(queued.artifactPath, JSON.stringify(staleArtifact, null, 2) + "\n", "utf8");

  const staleSidecarStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:08.000Z" });
  const staleSidecarWorkflow = createExportSessionWorkflow({
    sessionStore: staleSidecarStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }) }),
  });
  const restored = await staleSidecarWorkflow.reloadJobs();
  assert.equal(restored[0].artifactSidecar.status, "stale");
  assert.equal(restored[0].companionOutput.status, "rendered-image");
  assert.match(restored[0].artifactSidecar.note, /no longer matches the expected export artifact identity/i);
  assert.equal((await staleSidecarWorkflow.loadJob(queued.jobId)).artifactSidecar.status, "stale");
});




test("export session workflow reloads stale rendered tiff companions honestly", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 17 },
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await workflow.runJob(queued.jobId);

  const mismatchWorkflow = createExportWorkflow({
    exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
  });
  const mismatchQueued = mismatchWorkflow.queueExport({
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "contrast", params: { amount: 12 } }] }),
    destinationDir: dir,
    namingTemplate: "mismatch-{baseName}",
    options: { format: "tiff", resize: { width: 64, height: 48 } },
  });
  await mismatchWorkflow.runJob(mismatchQueued.jobId);
  await (await import("node:fs/promises")).copyFile(path.join(dir, "mismatch-hero-image.tiff"), path.join(dir, "hero-image_17.tiff"));

  const staleProofStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:11.000Z" });
  const staleProofWorkflow = createExportSessionWorkflow({
    sessionStore: staleProofStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
    }),
  });
  const restored = await staleProofWorkflow.reloadJobs();
  assert.equal(restored[0].companionOutput.kind, "image/tiff");
  assert.equal(restored[0].companionOutput.status, "stale");
  assert.equal(restored[0].companionOutput.width, 64);
  assert.equal(restored[0].companionOutput.height, 48);
  assert.match(restored[0].companionOutput.note, /no longer matches the expected deterministic export output/i);
  assert.equal((await staleProofWorkflow.loadJob(queued.jobId)).companionOutput.status, "stale");
});
test("export session workflow can repair stale or broken done jobs during reload", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 13 },
    options: { format: "png", quality: 95 },
  });
  await workflow.runJob(queued.jobId);

  const staleArtifact = JSON.parse(await readFile(queued.artifactPath, "utf8"));
  staleArtifact.outputName = "swapped-image.png";
  staleArtifact.companionOutput.path = path.join(dir, "swapped-image.png");
  await (await import("node:fs/promises")).writeFile(queued.artifactPath, JSON.stringify(staleArtifact, null, 2) + "\n", "utf8");
  await unlink(path.join(dir, "hero-image_13.png"));

  const repairingStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:08.000Z" });
  const repairingWorkflow = createExportSessionWorkflow({
    sessionStore: repairingStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }) }),
  });

  const repaired = await repairingWorkflow.reloadJobs({ repairDone: true });
  assert.equal(repaired[0].status, "done");
  assert.equal(repaired[0].companionOutput.status, "rendered-image");
  assert.equal(repaired[0].artifactSidecar.status, "present");
  assert.equal((await repairingWorkflow.loadJob(queued.jobId)).companionOutput.status, "rendered-image");
  assert.equal((await repairingWorkflow.loadJob(queued.jobId)).artifactSidecar.status, "present");
});


test("export session workflow summarizes bulk reload repair results", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 14 },
    options: { format: "png", quality: 95 },
  });
  await workflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image_14.png"));

  const reportStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:08.000Z" });
  const reportWorkflow = createExportSessionWorkflow({
    sessionStore: reportStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }) }),
  });

  const report = await reportWorkflow.reloadJobsReport({ repairDone: true });
  assert.deepEqual(report.counts, {
    total: 1,
    queued: 0,
    running: 0,
    done: 1,
    failed: 0,
    repaired: 1,
    withIntegrityIssue: 0,
    withMissingProof: 0,
    withInvalidProof: 0,
    withStaleProof: 0,
    withMissingArtifactSidecar: 0,
    withInvalidArtifactSidecar: 0,
    withStaleArtifactSidecar: 0,
    requested: 1,
    processed: 1,
    skipped: 0,
  });
  assert.deepEqual(report.requestedJobIds, [queued.jobId]);
  assert.deepEqual(report.skippedJobIds, []);
  assert.deepEqual(report.latestJobIds, [queued.jobId]);
  assert.deepEqual(report.requestedJobIds, [queued.jobId]);
  assert.deepEqual(report.skippedJobIds, []);
  assert.deepEqual(report.repairedJobIds, [queued.jobId]);
  assert.deepEqual(report.integrityIssueJobIds, []);
  assert.deepEqual(report.repairedJobIds, [queued.jobId]);
  assert.deepEqual(report.integrityIssueJobIds, []);
  assert.equal(report.latestRepairedJobId, queued.jobId);
  assert.equal(report.latestIntegrityIssueJobId, null);
  assert.equal(report.jobs[0].status, "done");
  assert.equal(report.jobs[0].repairedDuringReload, true);
  assert.equal(report.jobs[0].companionOutput.status, "rendered-image");
  assert.equal(report.jobs[0].artifactSidecar.status, "present");
});


test("export session workflow reload report surfaces remaining integrity issue types", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 15 },
    options: { format: "png", quality: 95 },
  });
  await workflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image_15.png"));
  await (await import("node:fs/promises")).writeFile(queued.artifactPath, `not-json
`, "utf8");

  const reportStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:08.000Z" });
  const reportWorkflow = createExportSessionWorkflow({
    sessionStore: reportStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }) }),
  });

  const report = await reportWorkflow.reloadJobsReport();
  assert.deepEqual(report.counts, {
    total: 1,
    queued: 0,
    running: 0,
    done: 1,
    failed: 0,
    repaired: 0,
    withIntegrityIssue: 1,
    withMissingProof: 1,
    withInvalidProof: 0,
    withStaleProof: 0,
    withMissingArtifactSidecar: 0,
    withInvalidArtifactSidecar: 1,
    withStaleArtifactSidecar: 0,
    requested: 1,
    processed: 1,
    skipped: 0,
  });
  assert.deepEqual(report.requestedJobIds, [queued.jobId]);
  assert.deepEqual(report.skippedJobIds, []);
  assert.deepEqual(report.repairedJobIds, []);
  assert.deepEqual(report.integrityIssueJobIds, [queued.jobId]);
  assert.equal(report.latestRepairedJobId, null);
  assert.equal(report.latestIntegrityIssueJobId, queued.jobId);
  assert.equal(report.jobs[0].repairedDuringReload, false);
  assert.equal(report.jobs[0].companionOutput.status, "missing");
  assert.equal(report.jobs[0].artifactSidecar.status, "invalid");
});


test("export session workflow repairDoneJobs repairs broken saved done jobs and returns a repair report", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 16 },
    options: { format: "png", quality: 95 },
  });
  await workflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image_16.png"));

  const repairingStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:08.000Z" });
  const repairingWorkflow = createExportSessionWorkflow({
    sessionStore: repairingStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }) }),
  });

  const report = await repairingWorkflow.repairDoneJobs();
  assert.deepEqual(report.counts, {
    total: 1,
    queued: 0,
    running: 0,
    done: 1,
    failed: 0,
    repaired: 1,
    withIntegrityIssue: 0,
    withMissingProof: 0,
    withInvalidProof: 0,
    withStaleProof: 0,
    withMissingArtifactSidecar: 0,
    withInvalidArtifactSidecar: 0,
    withStaleArtifactSidecar: 0,
    requested: 1,
    processed: 1,
    skipped: 0,
  });
  assert.equal(report.latestRepairedJobId, queued.jobId);
  assert.equal(report.latestIntegrityIssueJobId, null);
  assert.equal(report.jobs[0].repairedDuringReload, true);
  assert.equal(report.jobs[0].companionOutput.status, "rendered-image");
  assert.equal(report.jobs[0].artifactSidecar.status, "present");
});




test("export session workflow repairDoneJobs repairs broken saved tiff jobs and returns a repair report", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 19 },
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });
  await workflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image_19.tiff"));
  await (await import("node:fs/promises")).writeFile(path.join(dir, "hero-image_19.tiff.json"), `not-json
`, "utf8");

  const reloadedStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:13.000Z" });
  const reloadedWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
    }),
  });
  await reloadedWorkflow.reloadJobs();

  const repairingStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:14.000Z" });
  const repairingWorkflow = createExportSessionWorkflow({
    sessionStore: repairingStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
    }),
  });

  const report = await repairingWorkflow.repairDoneJobs({ jobIds: [queued.jobId] });
  assert.deepEqual(report.repairedJobIds, [queued.jobId]);
  assert.equal(report.counts.repaired, 1);
  assert.equal(report.counts.withIntegrityIssue, 0);
  assert.equal(report.jobs[0].companionOutput.kind, "image/tiff");
  assert.equal(report.jobs[0].companionOutput.status, "rendered-image");
  assert.equal(report.jobs[0].artifactSidecar.status, "present");
  assert.equal((await repairingWorkflow.loadJob(queued.jobId)).companionOutput.status, "rendered-image");
});
test("export session workflow repairDoneJobs can target selected saved jobs", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const first = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 17 },
    options: { format: "png", quality: 95 },
  });
  const second = await workflow.queueExport({
    source: { ...buildSource(), imageId: "img-002", path: "/shoots/day1/alt-image.CR3" },
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 18 },
    options: { format: "png", quality: 95 },
  });
  await workflow.runJob(first.jobId);
  await workflow.runJob(second.jobId);
  await unlink(path.join(dir, "hero-image_17.png"));
  await unlink(path.join(dir, "alt-image_18.png"));

  const repairingStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:08.000Z" });
  const repairingWorkflow = createExportSessionWorkflow({
    sessionStore: repairingStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }) }),
  });

  const report = await repairingWorkflow.repairDoneJobs({ jobIds: [first.jobId] });
  assert.deepEqual(report.latestJobIds, [first.jobId]);
  assert.deepEqual(report.repairedJobIds, [first.jobId]);
  assert.deepEqual(report.integrityIssueJobIds, []);
  assert.equal((await repairingWorkflow.loadJob(first.jobId)).companionOutput.status, "rendered-image");
  assert.equal((await repairingWorkflow.loadJob(second.jobId)).companionOutput.status, "rendered-image");
});


test("export session workflow repairDoneJobs reports skipped unknown selected job ids", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 19 },
    options: { format: "png", quality: 95 },
  });
  await workflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image_19.png"));

  const repairingStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:08.000Z" });
  const repairingWorkflow = createExportSessionWorkflow({
    sessionStore: repairingStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }) }),
  });

  const report = await repairingWorkflow.repairDoneJobs({ jobIds: ["missing-job", queued.jobId] });
  assert.deepEqual(report.requestedJobIds, ["missing-job", queued.jobId]);
  assert.equal(report.counts.requested, 2);
  assert.equal(report.counts.processed, 1);
  assert.equal(report.counts.skipped, 1);
  assert.deepEqual(report.skippedJobIds, ["missing-job"]);
  assert.equal(report.latestSkippedJobId, "missing-job");
  assert.deepEqual(report.latestJobIds, [queued.jobId]);
  assert.deepEqual(report.repairedJobIds, [queued.jobId]);
  assert.equal(report.latestRepairedJobId, queued.jobId);
});

test("export session workflow reloads done JPEG jobs with rendered-image metadata", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 20 },
    options: { format: "jpeg", quality: 92, resize: { width: 240, height: 160 } },
  });
  await workflow.runJob(queued.jobId);

  const reloadedStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:09.000Z" });
  const reloadedWorkflow = createExportSessionWorkflow({
    sessionStore: reloadedStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }) }),
  });

  const restored = await reloadedWorkflow.reloadJobs();
  assert.equal(restored[0].status, "done");
  assert.equal(restored[0].companionOutput.kind, "image/jpeg");
  assert.equal(restored[0].companionOutput.status, "rendered-image");
  assert.equal(restored[0].companionOutput.width, 240);
  assert.equal(restored[0].companionOutput.height, 160);
});

test("export session workflow reloads invalid rendered jpeg companions honestly", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 21 },
    options: { format: "jpeg", quality: 92, resize: { width: 240, height: 160 } },
  });
  await workflow.runJob(queued.jobId);

  await (await import("node:fs/promises")).writeFile(path.join(dir, "hero-image_21.jpg"), "not-a-jpeg\n", "utf8");
  const invalidProofStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:10.000Z" });
  const invalidProofWorkflow = createExportSessionWorkflow({
    sessionStore: invalidProofStore,
    exportWorkflow: createExportWorkflow({
      exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }),
    }),
  });

  const restored = await invalidProofWorkflow.reloadJobs();
  assert.deepEqual(restored[0].companionOutput, {
    path: path.join(dir, "hero-image_21.jpg"),
    kind: "image/jpeg",
    status: "invalid",
    sizeBytes: null,
    contentHash: null,
    width: null,
    height: null,
    note: "Rendered JPEG output is present but is not a valid JPEG. This seam verifies deterministic software-rendered JPEG bytes, not the final RAW/GPU pipeline.",
  });
});

test("export session workflow rerunJob repairs broken done jpeg exports and persists healthy metadata", async () => {
  const { dir, storePath, workflow } = await makeHarness();
  const queued = await workflow.queueExport({
    source: buildSource(),
    recipe: buildRecipe(),
    destinationDir: dir,
    namingTemplate: "{baseName}_{sequence}",
    naming: { sequence: 22 },
    options: { format: "jpeg", quality: 92, resize: { width: 240, height: 160 } },
  });
  await workflow.runJob(queued.jobId);
  await unlink(path.join(dir, "hero-image_22.jpg"));
  await (await import("node:fs/promises")).writeFile(queued.artifactPath, `not-json\n`, "utf8");

  const repairingStore = await createExportSessionStore({ path: storePath, clock: () => "2025-07-13T00:00:11.000Z" });
  const repairingWorkflow = createExportSessionWorkflow({
    sessionStore: repairingStore,
    exportWorkflow: createExportWorkflow({ exportFoundation: createExportFoundation({ clock: () => "2025-07-13T10:00:00.000Z" }) }),
  });
  await repairingWorkflow.reloadJobs();

  const repaired = await repairingWorkflow.rerunJob(queued.jobId);
  assert.equal(repaired.job.status, "done");
  assert.equal(repaired.job.companionOutput.kind, "image/jpeg");
  assert.equal(repaired.job.companionOutput.status, "rendered-image");
  assert.equal(repaired.job.artifactSidecar.status, "present");
  assert.equal((await readFile(path.join(dir, "hero-image_22.jpg")))[0], 0xff);
  assert.equal((await repairingWorkflow.loadJob(queued.jobId)).companionOutput.status, "rendered-image");
});
