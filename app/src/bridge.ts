import { commands } from "../bindings";

function isTauriAvailable(): boolean {
  if (typeof globalThis !== "undefined") {
    const t = (globalThis as any).__TAURI__;
    if (t) return true;
    const internals = (globalThis as any).__TAURI_INTERNALS__;
    if (internals && typeof internals.invoke === "function") return true;
  }
  return false;
}

export const bridge = {
  get available() {
    return isTauriAvailable();
  },
  ...commands,
};
