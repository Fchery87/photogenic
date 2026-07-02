// Minimal dependency-free lint: enforce a few basic hygiene rules across our
// source so the scaffold stays clean until a real linter (biome/eslint) is added.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const roots = ["src", "app", "scripts", "test"];
const exts = new Set([".js", ".mjs"]);

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (exts.has(path.extname(e.name))) yield full;
  }
}

const errors = [];

for (const r of roots) {
  for await (const file of walk(path.join(root, r))) {
    const text = await readFile(file, "utf8");
    const rel = path.relative(root, file);
    text.split("\n").forEach((line, i) => {
      if (line.includes("\t")) {
        errors.push(`${rel}:${i + 1}: tab character (use spaces)`);
      }
      if (/[ \t]+$/.test(line)) {
        errors.push(`${rel}:${i + 1}: trailing whitespace`);
      }
    });
    if (text.length && !text.endsWith("\n")) {
      errors.push(`${rel}: missing final newline`);
    }
  }
}

if (errors.length) {
  console.error("lint failed:");
  for (const e of errors) console.error("  " + e);
  process.exit(1);
}
console.log("lint ok");
