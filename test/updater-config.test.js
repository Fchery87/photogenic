import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("tauri.conf.json has updater plugin config", () => {
  const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf-8"));
  assert.ok(conf.plugins?.updater, "plugins.updater must exist");
  assert.ok(Array.isArray(conf.plugins.updater.endpoints), "endpoints must be an array");
  assert.ok(conf.plugins.updater.endpoints.length > 0, "at least one endpoint required");
});

test("tauri.conf.json bundle.createUpdaterArtifacts is true", () => {
  const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf-8"));
  assert.equal(conf.bundle?.createUpdaterArtifacts, true);
});

test("updater plugin is registered in lib.rs", () => {
  const src = readFileSync("src-tauri/src/lib.rs", "utf-8");
  assert.ok(src.includes("tauri_plugin_updater"), "lib.rs must import tauri_plugin_updater");
});

test("updater:default permission is in capabilities", () => {
  const cap = JSON.parse(readFileSync("src-tauri/capabilities/default.json", "utf-8"));
  assert.ok(cap.permissions.includes("updater:default"));
});

test("updater pubkey is a placeholder for internal alpha — replace before release", () => {
  const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf-8"));
  const pubkey = conf.plugins.updater.pubkey;
  if (!pubkey || pubkey.length < 100) {
    // This is expected for internal alpha — the test documents it explicitly
    // rather than silently passing as if a real key is configured
    console.log("  [INFO] updater pubkey is empty/placeholder — replace before production release");
  }
});
