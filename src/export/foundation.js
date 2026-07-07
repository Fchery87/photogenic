import { createHash } from "node:crypto";
import { writeFile, mkdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname } from "node:path";
import { buildRenderArtifact } from "../pipeline/render-artifact.js";
import { readRenderedJpegDescriptor, renderDeterministicSoftwareJpeg } from "../pipeline/software-jpeg-renderer.js";
import { readRenderedPngDescriptor, renderDeterministicSoftwarePng } from "../pipeline/software-png-renderer.js";
import { readRenderedTiffDescriptor, renderDeterministicSoftwareTiff16 } from "../pipeline/software-tiff-renderer.js";
import { normalizeExportOptions } from "./format-options.js";

const PLACEHOLDER_PROOF_NOTE =
  "Placeholder proof output only. This companion file confirms export artifact writing reached disk, but it does not contain final rendered image bytes.";
const MISSING_PROOF_NOTE =
  "Expected placeholder proof output is missing on disk. This seam still does not verify final rendered image bytes.";
const PRESENT_ARTIFACT_SIDECAR_NOTE =
  "Export artifact sidecar JSON is present and parseable. This seam verifies placeholder-proof/export artifact bookkeeping, not final rendered image bytes.";
const MISSING_ARTIFACT_SIDECAR_NOTE =
  "Expected export artifact sidecar JSON is missing on disk. This seam still verifies placeholder-proof/export artifact bookkeeping, not final rendered image bytes.";
const INVALID_ARTIFACT_SIDECAR_NOTE =
  "Export artifact sidecar JSON could not be parsed from disk. This seam still verifies placeholder-proof/export artifact bookkeeping, not final rendered image bytes.";
const STALE_ARTIFACT_SIDECAR_NOTE =
  "Export artifact sidecar JSON is parseable but no longer matches the expected export artifact identity for this output path. This seam still verifies placeholder-proof/export artifact bookkeeping, not final rendered image bytes.";
const MISSING_RENDERED_JPEG_NOTE =
  "Expected rendered JPEG output is missing on disk. This seam verifies deterministic software-rendered JPEG bytes, not the final RAW/GPU pipeline.";
const INVALID_RENDERED_JPEG_NOTE =
  "Rendered JPEG output is present but is not a valid JPEG. This seam verifies deterministic software-rendered JPEG bytes, not the final RAW/GPU pipeline.";
const STALE_RENDERED_JPEG_NOTE =
  "Rendered JPEG output is present but no longer matches the expected deterministic export output for this artifact. This seam verifies deterministic software-rendered JPEG bytes, not the final RAW/GPU pipeline.";
const MISSING_RENDERED_PNG_NOTE =
  "Expected rendered PNG output is missing on disk. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.";
const INVALID_RENDERED_PNG_NOTE =
  "Rendered PNG output is present but is not a valid PNG. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.";
const MISSING_RENDERED_TIFF_NOTE =
  "Expected rendered TIFF-16 output is missing on disk. This seam verifies deterministic software-rendered TIFF-16 bytes, not the final RAW/GPU pipeline.";
const INVALID_RENDERED_TIFF_NOTE =
  "Rendered TIFF-16 output is present but is not a valid TIFF. This seam verifies deterministic software-rendered TIFF-16 bytes, not the final RAW/GPU pipeline.";
const STALE_RENDERED_TIFF_NOTE =
  "Rendered TIFF-16 output is present but no longer matches the expected deterministic export output for this artifact. This seam verifies deterministic software-rendered TIFF-16 bytes, not the final RAW/GPU pipeline.";
const STALE_RENDERED_PNG_NOTE =
  "Rendered PNG output is present but no longer matches the expected deterministic export output for this artifact. This seam verifies deterministic software-rendered PNG bytes, not the final RAW/GPU pipeline.";

function deriveCompanionOutputPath(outputPath) {
  return outputPath.endsWith(".json") ? outputPath.slice(0, -5) : outputPath;
}

function buildProofOutputText(artifact) {
  return [
    "PHOTOGENIC_EXPORT_PROOF_V1",
    `outputName=${artifact.outputName}`,
    `format=${artifact.exportOptions?.format ?? "unknown"}`,
    `behaviorSignature=${artifact.behaviorSignature}`,
    `generatedAt=${artifact.generatedAt}`,
    `imageId=${artifact.imageId}`,
    `note=${PLACEHOLDER_PROOF_NOTE}`,
    "",
  ].join("\n");
}

function resolveRenderedDimensions(source, exportOptions) {
  return {
    width: exportOptions.resize?.width ?? source.width,
    height: exportOptions.resize?.height ?? source.height,
  };
}

async function buildProofCompanionOutput(outputPath) {
  const [file, content] = await Promise.all([stat(outputPath), readFile(outputPath)]);
  return {
    path: outputPath,
    kind: "text/plain",
    status: "placeholder-proof",
    sizeBytes: file.size,
    contentHash: {
      algorithm: "sha256",
      value: createHash("sha256").update(content).digest("hex"),
    },
    note: PLACEHOLDER_PROOF_NOTE,
  };
}

async function buildRenderedJpegCompanionOutput(outputPath) {
  const content = await readFile(outputPath);
  return readRenderedJpegDescriptor(outputPath, content);
}

async function buildRenderedPngCompanionOutput(outputPath) {
  const content = await readFile(outputPath);
  return readRenderedPngDescriptor(outputPath, content);
}

async function buildRenderedTiffCompanionOutput(outputPath) {
  const content = await readFile(outputPath);
  return readRenderedTiffDescriptor(outputPath, content);
}

function detectStaleRenderedImage(descriptor, expectedCompanionOutput = null, staleNote = STALE_RENDERED_PNG_NOTE) {
  if (!expectedCompanionOutput || typeof expectedCompanionOutput !== "object") {
    return descriptor;
  }
  const expectedHash = expectedCompanionOutput.contentHash?.value ?? null;
  const expectedWidth = Number.isInteger(expectedCompanionOutput.width) ? expectedCompanionOutput.width : null;
  const expectedHeight = Number.isInteger(expectedCompanionOutput.height) ? expectedCompanionOutput.height : null;
  if (
    (expectedHash && descriptor.contentHash?.value !== expectedHash) ||
    (expectedWidth && descriptor.width !== expectedWidth) ||
    (expectedHeight && descriptor.height !== expectedHeight)
  ) {
    return {
      path: descriptor.path ?? expectedCompanionOutput.path ?? null,
      kind: descriptor.kind ?? expectedCompanionOutput.kind ?? "image/png",
      status: "stale",
      sizeBytes: descriptor.sizeBytes,
      contentHash: descriptor.contentHash,
      width: descriptor.width,
      height: descriptor.height,
      note: staleNote,
    };
  }
  return descriptor;
}

async function readCompanionOutput(outputPath, format = null, expectedCompanionOutput = null) {
  try {
    if (format === "jpeg") {
      return detectStaleRenderedImage(await buildRenderedJpegCompanionOutput(outputPath), expectedCompanionOutput, STALE_RENDERED_JPEG_NOTE);
    }
    if (format === "png") {
      return detectStaleRenderedImage(await buildRenderedPngCompanionOutput(outputPath), expectedCompanionOutput, STALE_RENDERED_PNG_NOTE);
    }
    if (format === "tiff") {
      return detectStaleRenderedImage(await buildRenderedTiffCompanionOutput(outputPath), expectedCompanionOutput, STALE_RENDERED_TIFF_NOTE);
    }
    return await buildProofCompanionOutput(outputPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        path: outputPath,
        kind: format === "jpeg" ? "image/jpeg" : format === "png" ? "image/png" : format === "tiff" ? "image/tiff" : "text/plain",
        status: "missing",
        sizeBytes: null,
        contentHash: null,
        ...((format === "jpeg" || format === "png" || format === "tiff")
          ? {
            width: null,
            height: null,
            note: format === "jpeg" ? MISSING_RENDERED_JPEG_NOTE : format === "png" ? MISSING_RENDERED_PNG_NOTE : MISSING_RENDERED_TIFF_NOTE,
          }
          : {
            note: MISSING_PROOF_NOTE,
          }),
      };
    }
    if ((format === "jpeg" || format === "png" || format === "tiff") && error instanceof TypeError) {
      return {
        path: outputPath,
        kind: format === "jpeg" ? "image/jpeg" : format === "png" ? "image/png" : "image/tiff",
        status: "invalid",
        sizeBytes: null,
        contentHash: null,
        width: null,
        height: null,
        note: format === "jpeg" ? INVALID_RENDERED_JPEG_NOTE : format === "png" ? INVALID_RENDERED_PNG_NOTE : INVALID_RENDERED_TIFF_NOTE,
      };
    }
    throw error;
  }
}

async function readExportArtifact(outputPath) {
  try {
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

async function buildArtifactSidecar(outputPath) {
  const [file, content] = await Promise.all([stat(outputPath), readFile(outputPath, "utf8")]);
  const artifact = JSON.parse(content);
  const expectedCompanionPath = deriveCompanionOutputPath(outputPath);
  const expectedOutputName = basename(expectedCompanionPath);
  const actualCompanionPath = artifact?.companionOutput?.path ?? null;
  const actualOutputName = typeof artifact?.outputName === "string" ? artifact.outputName : null;
  const isStale = artifact?.mode !== "export" || actualCompanionPath !== expectedCompanionPath || actualOutputName !== expectedOutputName;
  return {
    path: outputPath,
    kind: "application/json",
    status: isStale ? "stale" : "present",
    sizeBytes: file.size,
    note: isStale ? STALE_ARTIFACT_SIDECAR_NOTE : PRESENT_ARTIFACT_SIDECAR_NOTE,
  };
}

async function readArtifactSidecar(outputPath) {
  try {
    return await buildArtifactSidecar(outputPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        path: outputPath,
        kind: "application/json",
        status: "missing",
        sizeBytes: null,
        note: MISSING_ARTIFACT_SIDECAR_NOTE,
      };
    }
    if (error instanceof SyntaxError) {
      return {
        path: outputPath,
        kind: "application/json",
        status: "invalid",
        sizeBytes: null,
        note: INVALID_ARTIFACT_SIDECAR_NOTE,
      };
    }
    throw error;
  }
}

export function createExportFoundation({ clock = () => new Date().toISOString(), nativePipeline = null } = {}) {
  return {
    buildArtifact({ source, recipe, outputName, options = {}, renderedImage = null, generatedAt = clock() }) {
      const exportOptions = normalizeExportOptions(options);
      return buildRenderArtifact({
        mode: "export",
        source,
        recipe,
        outputName,
        exportOptions,
        generatedAt,
        renderedImage,
      });
    },

    async writeArtifact(outputPath, { source, recipe, outputName, options = {} }) {
      const exportOptions = normalizeExportOptions(options);
      const generatedAt = clock();
      const companionOutputPath = deriveCompanionOutputPath(outputPath);
      await mkdir(dirname(outputPath), { recursive: true });

      let companionOutput;
      if (exportOptions.format === "jpeg" || exportOptions.format === "png" || exportOptions.format === "tiff") {
        const dimensions = resolveRenderedDimensions(source, exportOptions);
        const rendered = nativePipeline
          ? await nativePipeline.render({
            mode: "export",
            source,
            recipe,
            ...dimensions,
            format: exportOptions.format,
          })
          : exportOptions.format === "jpeg"
            ? renderDeterministicSoftwareJpeg({
              source,
              recipe,
              ...dimensions,
              quality: exportOptions.quality,
              sharpen: exportOptions.sharpenForOutput,
              embedIcc: exportOptions.embedIcc,
            })
            : exportOptions.format === "png"
              ? renderDeterministicSoftwarePng({
                source,
                recipe,
                ...dimensions,
                sharpen: exportOptions.sharpenForOutput,
                embedIcc: exportOptions.embedIcc,
              })
              : renderDeterministicSoftwareTiff16({
                source,
                recipe,
                ...dimensions,
                sharpen: exportOptions.sharpenForOutput,
                embedIcc: exportOptions.embedIcc,
              });
        await writeFile(companionOutputPath, rendered.bytes);
        companionOutput = {
          path: companionOutputPath,
          ...rendered.descriptor,
        };
      } else {
        const artifact = this.buildArtifact({ source, recipe, outputName, options, generatedAt });
        await writeFile(companionOutputPath, buildProofOutputText(artifact), "utf8");
        companionOutput = await buildProofCompanionOutput(companionOutputPath);
      }

      const writtenArtifact = this.buildArtifact({
        source,
        recipe,
        outputName,
        options,
        renderedImage: (exportOptions.format === "jpeg" || exportOptions.format === "png" || exportOptions.format === "tiff") ? companionOutput : null,
        generatedAt,
      });
      writtenArtifact.companionOutput = companionOutput;
      await writeFile(outputPath, JSON.stringify(writtenArtifact, null, 2) + "\n", "utf8");
      return writtenArtifact;
    },

    async refreshCompanionOutput(outputPath) {
      const artifact = await readExportArtifact(outputPath);
      const ext = extname(deriveCompanionOutputPath(outputPath)).toLowerCase();
      const format = artifact?.exportOptions?.format ?? (ext === ".jpg" || ext === ".jpeg" ? "jpeg" : ext === ".png" ? "png" : ext === ".tiff" ? "tiff" : null);
      return readCompanionOutput(deriveCompanionOutputPath(outputPath), format, artifact?.companionOutput ?? null);
    },

    async refreshArtifactSidecar(outputPath) {
      return readArtifactSidecar(outputPath);
    },
  };
}
