import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { rmSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createTelemetryConsentStore } from "../src/privacy/telemetry-consent.js";

const tmpDir = join(import.meta.dirname, ".tmp-telemetry-test");
const consentPath = join(tmpDir, "telemetry-consent.json");

beforeEach(() => {
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

test("consent is disabled by default", async () => {
  const store = createTelemetryConsentStore(consentPath);
  const state = await store.getState();
  assert.equal(state.enabled, false);
  assert.equal(state.timestamp, null);
});

test("grantConsent sets enabled=true with a timestamp", async () => {
  const store = createTelemetryConsentStore(consentPath);
  await store.grantConsent();
  const state = await store.getState();
  assert.equal(state.enabled, true);
  assert.ok(state.timestamp, "timestamp must be set");
});

test("revokeConsent sets enabled=false", async () => {
  const store = createTelemetryConsentStore(consentPath);
  await store.grantConsent();
  await store.revokeConsent();
  const state = await store.getState();
  assert.equal(state.enabled, false);
});

test("consent state persists across store instances", async () => {
  const store1 = createTelemetryConsentStore(consentPath);
  await store1.grantConsent();

  const store2 = createTelemetryConsentStore(consentPath);
  const state = await store2.getState();
  assert.equal(state.enabled, true);
});

test("getState returns disabled when consent file does not exist", async () => {
  const store = createTelemetryConsentStore(join(tmpDir, "nonexistent.json"));
  const state = await store.getState();
  assert.equal(state.enabled, false);
  assert.equal(state.timestamp, null);
});

test("recordCrash writes crash log only when consent is enabled", async () => {
  const store = createTelemetryConsentStore(consentPath);

  await store.recordCrash({ message: "test error", stack: "at test" });
  assert.ok(!existsSync(join(tmpDir, "crash-log.jsonl")), "crash log must not be written without consent");

  await store.grantConsent();
  await store.recordCrash({ message: "test error", stack: "at test" });
  assert.ok(existsSync(join(tmpDir, "crash-log.jsonl")), "crash log must exist after consent + crash");

  const log = readFileSync(join(tmpDir, "crash-log.jsonl"), "utf-8").trim();
  const entry = JSON.parse(log);
  assert.equal(entry.message, "test error");
  assert.ok(entry.timestamp, "crash entry must have timestamp");
});
