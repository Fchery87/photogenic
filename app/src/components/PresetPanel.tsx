import React, { useState, useEffect, useCallback } from "react";
import { bridge } from "../bridge.js";

function unwrap<T>(result: { status: string; data?: T }): T | null {
  return result && result.status === "ok" ? (result.data ?? null) : null;
}

export function PresetPanel() {
  const [presets, setPresets] = useState<{ presetId: string; name: string }[]>([]);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [revision, setRevision] = useState("");
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [currentRecipe, setCurrentRecipe] = useState({ version: 1, operations: [] as any[] });

  useEffect(() => {
    const selHandler = (e: Event) => setSelectedImageId((e as CustomEvent).detail?.imageId ?? null);
    const recipeHandler = (e: Event) => setCurrentRecipe((e as CustomEvent).detail?.recipe ?? currentRecipe);
    document.addEventListener("photogenic:select-image", selHandler as EventListener);
    document.addEventListener("photogenic:recipe-changed", recipeHandler as EventListener);
    return () => {
      document.removeEventListener("photogenic:select-image", selHandler as EventListener);
      document.removeEventListener("photogenic:recipe-changed", recipeHandler as EventListener);
    };
  }, [currentRecipe]);

  const refreshPresets = useCallback(async () => {
    if (!bridge.available) return;
    try {
      const result = await bridge.listPresets();
      const list = unwrap(result as any);
      if (list) {
        const normalized = (list as any[]).map((p: any) => ({
          presetId: p.preset_id ?? p.presetId,
          name: p.name,
        }));
        setPresets(normalized);
      }
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { refreshPresets(); }, [refreshPresets]);

  const handleSave = useCallback(async () => {
    if (currentRecipe.operations.length === 0) {
      document.dispatchEvent(new CustomEvent("photogenic:status", { detail: { text: "No operations to save as preset." } }));
      return;
    }
    const name = prompt("Preset name:", "Custom Preset");
    if (!name) return;
    const presetId = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `preset-${Date.now()}`;
    try {
      await bridge.savePreset(presetId, name, currentRecipe as any);
      document.dispatchEvent(new CustomEvent("photogenic:status", { detail: { text: `Saved preset '${name}'.` } }));
      await refreshPresets();
    } catch {
      document.dispatchEvent(new CustomEvent("photogenic:status", { detail: { text: "Preset save failed." } }));
    }
  }, [currentRecipe, refreshPresets]);

  const handleApply = useCallback(async () => {
    if (!selectedPreset) {
      document.dispatchEvent(new CustomEvent("photogenic:status", { detail: { text: "Select a preset to apply." } }));
      return;
    }
    if (!selectedImageId) {
      document.dispatchEvent(new CustomEvent("photogenic:status", { detail: { text: "Select an image before applying a preset." } }));
      return;
    }
    try {
      const result = await bridge.applyPreset(selectedPreset, selectedImageId);
      const data = unwrap(result as any) as any;
      if (data) {
        document.dispatchEvent(new CustomEvent("photogenic:recipe-loaded", { detail: { recipe: data.recipe } }));
        const rev = data.revision ?? data.revision;
        if (rev != null) setRevision(`r${rev}`);
        document.dispatchEvent(new CustomEvent("photogenic:status", { detail: { text: `Applied preset to ${selectedImageId}.` } }));
      }
    } catch {
      document.dispatchEvent(new CustomEvent("photogenic:status", { detail: { text: "Preset rejected." } }));
    }
  }, [selectedPreset, selectedImageId]);

  // Listen for recipe revision updates from main.js
  useEffect(() => {
    const handler = (e: Event) => {
      const rev = (e as CustomEvent).detail?.revision;
      if (rev != null) setRevision(`r${rev}`);
    };
    document.addEventListener("photogenic:recipe-revision", handler as EventListener);
    return () => document.removeEventListener("photogenic:recipe-revision", handler as EventListener);
  }, []);

  return React.createElement(
    "div",
    { className: "control-actions" },
    React.createElement("button", { id: "btn-save-preset", className: "btn btn--small", onClick: handleSave }, "Save as Preset"),
    React.createElement(
      "select",
      {
        id: "preset-select",
        className: "preset-select",
        value: selectedPreset,
        onChange: (e: any) => setSelectedPreset(e.target.value),
      },
      React.createElement("option", { value: "" }, "— Load Preset —"),
      ...presets.map((p) =>
        React.createElement("option", { key: p.presetId, value: p.presetId }, p.name),
      ),
    ),
    React.createElement("button", { id: "btn-apply-preset", className: "btn btn--small", onClick: handleApply }, "Apply"),
    React.createElement("span", { id: "recipe-revision", className: "revision-display" }, revision),
  );
}
