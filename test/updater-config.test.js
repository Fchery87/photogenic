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

test("updater pubkey and endpoints are documented placeholders for internal alpha", () => {
  const conf = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf-8"));
  const pubkey = conf.plugins.updater.pubkey;
  const endpoints = conf.plugins.updater.endpoints;

  // Pubkey must be empty for alpha — a real key would be 100+ chars
  assert.equal(pubkey, "", "pubkey must be empty placeholder for internal alpha (replace before release)");

  // Endpoint must contain the placeholder domain
  assert.ok(
    endpoints.some((url) => url.includes("example.com")),
    "endpoints must use example.com placeholder domain (replace before release)",
  );
});
