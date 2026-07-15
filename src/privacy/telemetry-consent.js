import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

const CONSENT_VERSION = 1;

function defaultState() {
  return { version: CONSENT_VERSION, enabled: false, timestamp: null };
}

export function createTelemetryConsentStore(consentPath) {
  const crashLogPath = join(dirname(consentPath), "crash-log.jsonl");

  async function readConsent() {
    try {
      const raw = await readFile(consentPath, "utf-8");
      const data = JSON.parse(raw);
      return {
        version: CONSENT_VERSION,
        enabled: Boolean(data.enabled),
        timestamp: data.timestamp ?? null,
      };
    } catch {
      return defaultState();
    }
  }

  async function writeConsent(state) {
    await mkdir(dirname(consentPath), { recursive: true });
    await writeFile(consentPath, JSON.stringify(state, null, 2), "utf-8");
  }

  return {
    async getState() {
      return readConsent();
    },

    async grantConsent() {
      const state = { version: CONSENT_VERSION, enabled: true, timestamp: new Date().toISOString() };
      await writeConsent(state);
    },

    async revokeConsent() {
      const state = { version: CONSENT_VERSION, enabled: false, timestamp: new Date().toISOString() };
      await writeConsent(state);
    },

    async recordCrash(errorInfo) {
      const consent = await readConsent();
      if (!consent.enabled) return;

      const entry = {
        timestamp: new Date().toISOString(),
        message: errorInfo.message ?? String(errorInfo),
        stack: errorInfo.stack ?? null,
      };
      await mkdir(dirname(crashLogPath), { recursive: true });
      await appendFile(crashLogPath, JSON.stringify(entry) + "\n", "utf-8");
    },
  };
}
