import { writeFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { buildRenderArtifact } from "../pipeline/render-artifact.js";

export function createExportFoundation({ clock = () => new Date().toISOString() } = {}) {
  return {
    buildArtifact({ source, recipe, outputName }) {
      return buildRenderArtifact({
        mode: "export",
        source,
        recipe,
        outputName,
        generatedAt: clock(),
      });
    },

    async writeArtifact(outputPath, { source, recipe, outputName }) {
      const artifact = this.buildArtifact({ source, recipe, outputName });
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, JSON.stringify(artifact, null, 2) + "\n", "utf8");
      return artifact;
    },
  };
}
