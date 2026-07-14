import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tauriConf = JSON.parse(
  readFileSync(join(__dirname, "..", "src-tauri", "tauri.conf.json"), "utf8"),
);

test("tauri.conf.json has an explicit (non-null) content-security-policy", () => {
  const csp = tauriConf.app?.security?.csp;
  assert.notEqual(csp, null, "app.security.csp must not be null — set an explicit policy");
  assert.equal(typeof csp, "string", "app.security.csp must be a string policy directive");
  assert.ok(csp.length > 0, "app.security.csp must be a non-empty string");
});

test("CSP policy includes a default-src directive", () => {
  const csp = tauriConf.app?.security?.csp;
  assert.ok(
    typeof csp === "string" && /default-src/.test(csp),
    "CSP must include a default-src directive",
  );
});

test("CSP policy allows data: img-src for canvas pixel display", () => {
  const csp = tauriConf.app?.security?.csp;
  assert.ok(
    typeof csp === "string" && /img-src[^;]*data:/.test(csp),
    "CSP must allow data: in img-src for canvas pixel display",
  );
});
