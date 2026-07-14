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

// ---------------------------------------------------------------------------
// Tauri capabilities file
// ---------------------------------------------------------------------------

const capabilitiesPath = join(__dirname, "..", "src-tauri", "capabilities", "default.json");

test("src-tauri/capabilities/default.json exists and is valid JSON", () => {
  const raw = readFileSync(capabilitiesPath, "utf8");
  const caps = JSON.parse(raw);
  assert.ok(caps.identifier, "capabilities file must have an identifier");
  assert.ok(Array.isArray(caps.windows), "capabilities file must specify windows");
  assert.ok(caps.windows.includes("main"), "capabilities must target the main window");
  assert.ok(Array.isArray(caps.permissions), "capabilities must have a permissions array");
});

test("capabilities file grants core:default for basic window operation", () => {
  const caps = JSON.parse(readFileSync(capabilitiesPath, "utf8"));
  assert.ok(
    caps.permissions.includes("core:default"),
    "capabilities must include core:default",
  );
});

test("capabilities file grants log plugin permission", () => {
  const caps = JSON.parse(readFileSync(capabilitiesPath, "utf8"));
  assert.ok(
    caps.permissions.some((p) => typeof p === "string" && p.startsWith("log:")),
    "capabilities must grant the log plugin (tauri_plugin_log is registered)",
  );
});

test("capabilities file does NOT grant broad fs/shell/dialog permissions", () => {
  const caps = JSON.parse(readFileSync(capabilitiesPath, "utf8"));
  for (const perm of caps.permissions) {
    const ident = typeof perm === "string" ? perm : perm.identifier;
    assert.ok(
      !ident.startsWith("fs:") || ident === "fs:default",
      `unexpected broad fs permission: ${ident}`,
    );
    assert.ok(
      !ident.startsWith("shell:"),
      `unexpected shell permission: ${ident}`,
    );
  }
});
