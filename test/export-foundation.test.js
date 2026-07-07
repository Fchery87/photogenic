import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRecipe } from "../src/edit-recipe/recipe.js";
import { createExportFoundation } from "../src/export/foundation.js";

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

test("writeArtifact writes a json sidecar plus a rendered PNG companion image for png exports", async () => {
  const foundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-"));
  const artifactPath = path.join(dir, "hero-image.png.json");

  const written = await foundation.writeArtifact(artifactPath, {
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    outputName: "hero-image.png",
    options: { format: "png", quality: 95 },
  });

  const sidecar = JSON.parse(await readFile(artifactPath, "utf8"));
  const proofPath = path.join(dir, "hero-image.png");
  const proofOutput = await readFile(proofPath);
  const proofStats = await stat(proofPath);

  assert.deepEqual(written, sidecar);
  assert.deepEqual(sidecar.companionOutput, {
    path: proofPath,
    kind: "image/png",
    status: "rendered-image",
    sizeBytes: proofStats.size,
    contentHash: {
      algorithm: "sha256",
      value: createHash("sha256").update(proofOutput).digest("hex"),
    },
    width: 6000,
    height: 4000,
    note: "Deterministic software-rendered PNG bytes are present on disk. This seam now writes a real image file, but it does not prove the final RAW/GPU pipeline.",
  });
  assert.deepEqual(proofOutput.subarray(0, 8), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  assert.equal(sidecar.renderedImage.kind, "image/png");
  assert.equal(sidecar.renderedImage.width, 6000);
  assert.equal(sidecar.renderedImage.height, 4000);
  assert.deepEqual(await foundation.refreshArtifactSidecar(artifactPath), {
    path: artifactPath,
    kind: "application/json",
    status: "present",
    sizeBytes: (await stat(artifactPath)).size,
    note: "Export artifact sidecar JSON is present and parseable. This seam verifies placeholder-proof/export artifact bookkeeping, not final rendered image bytes.",
  });
});

test("refreshCompanionOutput re-reads rendered png metadata and reports missing png files honestly", async () => {
  const foundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-refresh-"));
  const artifactPath = path.join(dir, "hero-image.png.json");

  const written = await foundation.writeArtifact(artifactPath, {
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    outputName: "hero-image.png",
    options: { format: "png", quality: 95 },
  });

  const refreshedPresent = await foundation.refreshCompanionOutput(artifactPath);
  assert.deepEqual(refreshedPresent, written.companionOutput);
  assert.deepEqual(await foundation.refreshArtifactSidecar(artifactPath), {
    path: artifactPath,
    kind: "application/json",
    status: "present",
    sizeBytes: (await stat(artifactPath)).size,
    note: "Export artifact sidecar JSON is present and parseable. This seam verifies placeholder-proof/export artifact bookkeeping, not final rendered image bytes.",
  });

  await unlink(path.join(dir, "hero-image.png"));
  const refreshedMissing = await foundation.refreshCompanionOutput(artifactPath);
  assert.deepEqual(refreshedMissing, {
    path: path.join(dir, "hero-image.png"),
    kind: "image/png",
    status: "missing",
    sizeBytes: null,
    contentHash: null,
    width: null,
    height: null,
    note: "Expected rendered PNG output is missing on disk. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.",
  });
});



test("writeArtifact writes a rendered TIFF-16 companion image for tiff exports", async () => {
  const foundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-tiff-"));
  const artifactPath = path.join(dir, "hero-image.tiff.json");

  const written = await foundation.writeArtifact(artifactPath, {
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    outputName: "hero-image.tiff",
    options: { format: "tiff", resize: { width: 120, height: 80 } },
  });

  const sidecar = JSON.parse(await readFile(artifactPath, "utf8"));
  const outputPath = path.join(dir, "hero-image.tiff");
  const output = await readFile(outputPath);
  const outputStats = await stat(outputPath);

  assert.deepEqual(written, sidecar);
  assert.equal(sidecar.companionOutput.kind, "image/tiff");
  assert.equal(sidecar.companionOutput.status, "rendered-image");
  assert.equal(sidecar.companionOutput.width, 120);
  assert.equal(sidecar.companionOutput.height, 80);
  assert.equal(sidecar.companionOutput.sizeBytes, outputStats.size);
  assert.equal(sidecar.companionOutput.contentHash.value, createHash("sha256").update(output).digest("hex"));
  assert.equal(output.subarray(0, 2).toString("ascii"), "II");
  assert.equal(output.readUInt16LE(2), 42);
  assert.equal(sidecar.renderedImage.kind, "image/tiff");
  assert.equal(sidecar.renderedImage.width, 120);
  assert.equal(sidecar.renderedImage.height, 80);
});

test("refreshCompanionOutput reports invalid rendered tiff files honestly", async () => {
  const foundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-invalid-tiff-"));
  const artifactPath = path.join(dir, "hero-image.tiff.json");

  await foundation.writeArtifact(artifactPath, {
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    outputName: "hero-image.tiff",
    options: { format: "tiff" },
  });

  await writeFile(path.join(dir, "hero-image.tiff"), "not-a-tiff\n", "utf8");
  const refreshedInvalid = await foundation.refreshCompanionOutput(artifactPath);
  assert.deepEqual(refreshedInvalid, {
    path: path.join(dir, "hero-image.tiff"),
    kind: "image/tiff",
    status: "invalid",
    sizeBytes: null,
    contentHash: null,
    width: null,
    height: null,
    note: "Rendered TIFF-16 output is present but is not a valid TIFF. This seam verifies deterministic software-rendered TIFF-16 bytes, not the final RAW/GPU pipeline.",
  });
});
test("jpeg exports now write rendered JPEG companions", async () => {
  const foundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-jpeg-"));
  const artifactPath = path.join(dir, "hero-image.jpg.json");

  const written = await foundation.writeArtifact(artifactPath, {
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    outputName: "hero-image.jpg",
    options: { format: "jpeg", quality: 92 },
  });

  const proofOutput = await readFile(path.join(dir, "hero-image.jpg"));
  assert.equal(written.companionOutput.kind, "image/jpeg");
  assert.equal(written.companionOutput.status, "rendered-image");
  assert.equal(written.renderedImage.kind, "image/jpeg");
  assert.equal(proofOutput[0], 0xff);
  assert.equal(proofOutput[1], 0xd8);
});

test("refreshArtifactSidecar reports missing and invalid json sidecars honestly", async () => {
  const foundation = createExportFoundation();
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-artifact-sidecar-"));
  const artifactPath = path.join(dir, "hero-image.png.json");

  assert.deepEqual(await foundation.refreshArtifactSidecar(artifactPath), {
    path: artifactPath,
    kind: "application/json",
    status: "missing",
    sizeBytes: null,
    note: "Expected export artifact sidecar JSON is missing on disk. This seam still verifies placeholder-proof/export artifact bookkeeping, not final rendered image bytes.",
  });

  await writeFile(artifactPath, "{not-json\n", "utf8");
  assert.deepEqual(await foundation.refreshArtifactSidecar(artifactPath), {
    path: artifactPath,
    kind: "application/json",
    status: "invalid",
    sizeBytes: null,
    note: "Export artifact sidecar JSON could not be parsed from disk. This seam still verifies placeholder-proof/export artifact bookkeeping, not final rendered image bytes.",
  });
});


test("refreshCompanionOutput reports invalid rendered png files honestly", async () => {
  const foundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-invalid-png-"));
  const artifactPath = path.join(dir, "hero-image.png.json");

  await foundation.writeArtifact(artifactPath, {
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    outputName: "hero-image.png",
    options: { format: "png", quality: 95 },
  });

  await writeFile(path.join(dir, "hero-image.png"), "not-a-png\n", "utf8");
  const refreshedInvalid = await foundation.refreshCompanionOutput(artifactPath);
  assert.deepEqual(refreshedInvalid, {
    path: path.join(dir, "hero-image.png"),
    kind: "image/png",
    status: "invalid",
    sizeBytes: null,
    contentHash: null,
    width: null,
    height: null,
    note: "Rendered PNG output is present but is not a valid PNG. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.",
  });
});


test("refreshArtifactSidecar reports stale but parseable export json honestly", async () => {
  const foundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-stale-sidecar-"));
  const artifactPath = path.join(dir, "hero-image.png.json");

  await foundation.writeArtifact(artifactPath, {
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    outputName: "hero-image.png",
    options: { format: "png", quality: 95 },
  });

  const staleArtifact = JSON.parse(await readFile(artifactPath, "utf8"));
  staleArtifact.outputName = "swapped-image.png";
  staleArtifact.companionOutput.path = path.join(dir, "swapped-image.png");
  await writeFile(artifactPath, JSON.stringify(staleArtifact, null, 2) + "\n", "utf8");

  assert.deepEqual(await foundation.refreshArtifactSidecar(artifactPath), {
    path: artifactPath,
    kind: "application/json",
    status: "stale",
    sizeBytes: (await stat(artifactPath)).size,
    note: "Export artifact sidecar JSON is parseable but no longer matches the expected export artifact identity for this output path. This seam still verifies placeholder-proof/export artifact bookkeeping, not final rendered image bytes.",
  });
});

test("writeArtifact writes a rendered JPEG companion image for jpeg exports", async () => {
  const foundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-jpeg-rendered-"));
  const artifactPath = path.join(dir, "hero-image.jpg.json");

  const written = await foundation.writeArtifact(artifactPath, {
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    outputName: "hero-image.jpg",
    options: { format: "jpeg", quality: 92, resize: { width: 240, height: 160 } },
  });

  const sidecar = JSON.parse(await readFile(artifactPath, "utf8"));
  const outputPath = path.join(dir, "hero-image.jpg");
  const output = await readFile(outputPath);
  const outputStats = await stat(outputPath);

  assert.deepEqual(written, sidecar);
  assert.equal(sidecar.companionOutput.kind, "image/jpeg");
  assert.equal(sidecar.companionOutput.status, "rendered-image");
  assert.equal(sidecar.companionOutput.width, 240);
  assert.equal(sidecar.companionOutput.height, 160);
  assert.equal(sidecar.companionOutput.sizeBytes, outputStats.size);
  assert.equal(sidecar.companionOutput.contentHash.value, createHash("sha256").update(output).digest("hex"));
  assert.equal(output[0], 0xff);
  assert.equal(output[1], 0xd8);
  assert.equal(sidecar.renderedImage.kind, "image/jpeg");
  assert.equal(sidecar.renderedImage.width, 240);
  assert.equal(sidecar.renderedImage.height, 160);
});

test("refreshCompanionOutput reports invalid rendered jpeg files honestly", async () => {
  const foundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const dir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-invalid-jpeg-"));
  const artifactPath = path.join(dir, "hero-image.jpg.json");

  await foundation.writeArtifact(artifactPath, {
    source: buildSource(),
    recipe: createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] }),
    outputName: "hero-image.jpg",
    options: { format: "jpeg", quality: 92 },
  });

  await writeFile(path.join(dir, "hero-image.jpg"), "not-a-jpeg\n", "utf8");
  const refreshedInvalid = await foundation.refreshCompanionOutput(artifactPath);
  assert.deepEqual(refreshedInvalid, {
    path: path.join(dir, "hero-image.jpg"),
    kind: "image/jpeg",
    status: "invalid",
    sizeBytes: null,
    contentHash: null,
    width: null,
    height: null,
    note: "Rendered JPEG output is present but is not a valid JPEG. This seam verifies deterministic software-rendered JPEG bytes, not the final RAW/GPU pipeline.",
  });
});

test("sharpenForOutput changes rendered export companion hashes for jpeg png and tiff", async () => {
  const foundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const recipe = createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] });

  const jpegDir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-sharpen-jpeg-"));
  const jpegSoft = await foundation.writeArtifact(path.join(jpegDir, "soft.jpg.json"), {
    source: buildSource(),
    recipe,
    outputName: "soft.jpg",
    options: { format: "jpeg", quality: 92, resize: { width: 120, height: 80 }, sharpenForOutput: false },
  });
  const jpegSharp = await foundation.writeArtifact(path.join(jpegDir, "sharp.jpg.json"), {
    source: buildSource(),
    recipe,
    outputName: "sharp.jpg",
    options: { format: "jpeg", quality: 92, resize: { width: 120, height: 80 }, sharpenForOutput: true },
  });
  assert.notEqual(jpegSoft.companionOutput.contentHash.value, jpegSharp.companionOutput.contentHash.value);

  const pngDir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-sharpen-png-"));
  const pngSoft = await foundation.writeArtifact(path.join(pngDir, "soft.png.json"), {
    source: buildSource(),
    recipe,
    outputName: "soft.png",
    options: { format: "png", quality: 95, resize: { width: 120, height: 80 }, sharpenForOutput: false },
  });
  const pngSharp = await foundation.writeArtifact(path.join(pngDir, "sharp.png.json"), {
    source: buildSource(),
    recipe,
    outputName: "sharp.png",
    options: { format: "png", quality: 95, resize: { width: 120, height: 80 }, sharpenForOutput: true },
  });
  assert.notEqual(pngSoft.companionOutput.contentHash.value, pngSharp.companionOutput.contentHash.value);

  const tiffDir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-sharpen-tiff-"));
  const tiffSoft = await foundation.writeArtifact(path.join(tiffDir, "soft.tiff.json"), {
    source: buildSource(),
    recipe,
    outputName: "soft.tiff",
    options: { format: "tiff", resize: { width: 120, height: 80 }, sharpenForOutput: false },
  });
  const tiffSharp = await foundation.writeArtifact(path.join(tiffDir, "sharp.tiff.json"), {
    source: buildSource(),
    recipe,
    outputName: "sharp.tiff",
    options: { format: "tiff", resize: { width: 120, height: 80 }, sharpenForOutput: true },
  });
  assert.notEqual(tiffSoft.companionOutput.contentHash.value, tiffSharp.companionOutput.contentHash.value);
});

test("embedIcc changes rendered export companion hashes for jpeg png and tiff", async () => {
  const foundation = createExportFoundation({ clock: () => "2025-07-05T00:00:00.000Z" });
  const recipe = createRecipe({ operations: [{ type: "exposure", params: { ev: 0.4 } }] });

  const jpegDir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-icc-jpeg-"));
  const jpegWith = await foundation.writeArtifact(path.join(jpegDir, "with.jpg.json"), {
    source: buildSource(), recipe, outputName: "with.jpg",
    options: { format: "jpeg", quality: 92, resize: { width: 120, height: 80 }, embedIcc: true },
  });
  const jpegWithout = await foundation.writeArtifact(path.join(jpegDir, "without.jpg.json"), {
    source: buildSource(), recipe, outputName: "without.jpg",
    options: { format: "jpeg", quality: 92, resize: { width: 120, height: 80 }, embedIcc: false },
  });
  assert.notEqual(jpegWith.companionOutput.contentHash.value, jpegWithout.companionOutput.contentHash.value);

  const pngDir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-icc-png-"));
  const pngWith = await foundation.writeArtifact(path.join(pngDir, "with.png.json"), {
    source: buildSource(), recipe, outputName: "with.png",
    options: { format: "png", quality: 95, resize: { width: 120, height: 80 }, embedIcc: true },
  });
  const pngWithout = await foundation.writeArtifact(path.join(pngDir, "without.png.json"), {
    source: buildSource(), recipe, outputName: "without.png",
    options: { format: "png", quality: 95, resize: { width: 120, height: 80 }, embedIcc: false },
  });
  assert.notEqual(pngWith.companionOutput.contentHash.value, pngWithout.companionOutput.contentHash.value);

  const tiffDir = await mkdtemp(path.join(tmpdir(), "photogenic-export-foundation-icc-tiff-"));
  const tiffWith = await foundation.writeArtifact(path.join(tiffDir, "with.tiff.json"), {
    source: buildSource(), recipe, outputName: "with.tiff",
    options: { format: "tiff", resize: { width: 120, height: 80 }, embedIcc: true },
  });
  const tiffWithout = await foundation.writeArtifact(path.join(tiffDir, "without.tiff.json"), {
    source: buildSource(), recipe, outputName: "without.tiff",
    options: { format: "tiff", resize: { width: 120, height: 80 }, embedIcc: false },
  });
  assert.notEqual(tiffWith.companionOutput.contentHash.value, tiffWithout.companionOutput.contentHash.value);
});
