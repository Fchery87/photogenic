// Minimal, dependency-free Phase 0 build: copy the harness app + its source
// dependency into dist/ and emit a build manifest. Keeps "lightweight" honest
// (no bundler needed yet) while giving us a real, runnable artifact.
import { cp, mkdir, rm, writeFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dist = path.join(root, "dist");

async function main() {
  if (!existsSync(path.join(root, "app", "index.html"))) {
    throw new Error("app/index.html missing — cannot build harness");
  }
  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  // Copy the harness app and the src module it imports (preserving relative path).
  await cp(path.join(root, "app"), path.join(dist, "app"), { recursive: true });
  await cp(path.join(root, "src"), path.join(dist, "src"), { recursive: true });

  const appFiles = await readdir(path.join(dist, "app"));
  const manifest = {
    name: "photogenic-phase0-harness",
    builtAt: new Date().toISOString(),
    entry: "app/index.html",
    files: appFiles.sort(),
    note: "Phase 0 viewport-proof harness (ADR-0004). Gradient gate only.",
  };
  await writeFile(
    path.join(dist, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );

  console.log(`build ok -> dist/ (entry: ${manifest.entry})`);
}

main().catch((err) => {
  console.error("build failed:", err.message);
  process.exit(1);
});
