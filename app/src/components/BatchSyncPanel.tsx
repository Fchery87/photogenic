import React, { useState, useCallback, useEffect } from "react";
import { bridge } from "../bridge.js";

const SYNC_TYPES = [
  { value: "exposure", label: "Exposure", defaultChecked: true },
  { value: "temperature", label: "Temperature", defaultChecked: false },
  { value: "contrast", label: "Contrast", defaultChecked: false },
];

export function BatchSyncPanel() {
  const [checked, setChecked] = useState<Record<string, boolean>>(
    Object.fromEntries(SYNC_TYPES.map((t) => [t.value, t.defaultChecked])),
  );
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      setSelectedImageId((e as CustomEvent).detail?.imageId ?? null);
    };
    document.addEventListener("photogenic:select-image", handler as EventListener);
    return () => document.removeEventListener("photogenic:select-image", handler as EventListener);
  }, []);

  const handleSync = useCallback(async () => {
    if (!selectedImageId) {
      document.dispatchEvent(new CustomEvent("photogenic:status", { detail: { text: "Select a source image first." } }));
      return;
    }
    const types = SYNC_TYPES.filter((t) => checked[t.value]).map((t) => t.value);
    if (types.length === 0) {
      document.dispatchEvent(new CustomEvent("photogenic:status", { detail: { text: "Select at least one operation type to sync." } }));
      return;
    }
    if (!bridge.available) return;
    try {
      const result = await bridge.batchSync(selectedImageId, types);
      const r = result.status === "ok" ? result.data : null;
      document.dispatchEvent(new CustomEvent("photogenic:status", {
        detail: { text: `Batch sync: ${r?.message ?? "done"} (updated: ${r?.updated_count ?? 0}, skipped: ${r?.skipped_count ?? 0}).` },
      }));
      document.dispatchEvent(new CustomEvent("photogenic:refresh-library"));
    } catch {
      document.dispatchEvent(new CustomEvent("photogenic:status", { detail: { text: "Batch sync failed." } }));
    }
  }, [checked, selectedImageId]);

  return React.createElement(
    "section",
    { className: "panel", id: "batch-panel" },
    React.createElement("h2", null, "Batch Sync"),
    React.createElement("p", { className: "hint" }, "Sync selected operations to all visible images."),
    React.createElement(
      "div",
      { className: "sync-types" },
      ...SYNC_TYPES.map((t) =>
        React.createElement(
          "label",
          { key: t.value },
          React.createElement("input", {
            type: "checkbox",
            className: "sync-type",
            value: t.value,
            checked: checked[t.value] ?? false,
            onChange: (e: any) => setChecked((prev) => ({ ...prev, [t.value]: e.target.checked })),
          }),
          ` ${t.label}`,
        ),
      ),
    ),
    React.createElement("button", { id: "btn-batch-sync", className: "btn", onClick: handleSync }, "Apply to All"),
  );
}
