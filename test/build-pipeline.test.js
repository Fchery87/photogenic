import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

test("build output dist/index.html exists (Vite entry point)", () => {
  const htmlPath = join(__dirname, "..", "dist", "index.html");
  assert.ok(existsSync(htmlPath), "dist/index.html must exist after npm run build");
});

test("build output references a bundled JS asset (not raw main.js copy)", () => {
  const htmlPath = join(__dirname, "..", "dist", "index.html");
  if (!existsSync(htmlPath)) {
    assert.fail("dist/index.html not found — run npm run build first");
  }
  const html = readFileSync(htmlPath, "utf8");
  assert.ok(
    /\/assets\/|\/[a-z]+-[A-Za-z0-9_-]+\.js/.test(html),
    "dist/index.html must reference a Vite-bundled JS asset (hashed filename under /assets/), not a raw ./main.js copy",
  );
});

test("tsconfig.json exists with strict mode and react-jsx", () => {
  const tsconfigPath = join(__dirname, "..", "tsconfig.json");
  assert.ok(existsSync(tsconfigPath), "tsconfig.json must exist");
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8"));
  const opts = tsconfig.compilerOptions || {};
  assert.equal(opts.strict, true, "tsconfig must have strict: true");
  assert.equal(opts.jsx, "react-jsx", "tsconfig must have jsx: react-jsx");
});

test("vite.config.ts exists", () => {
  const viteConfigPath = join(__dirname, "..", "vite.config.ts");
  assert.ok(existsSync(viteConfigPath), "vite.config.ts must exist");
});
